import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { afterAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { MAX_BODY_BYTES } from '../../shared/limits.ts';
import { appWith, defineContract, defineRoute } from '../route/fixture.test-helper.ts';
import type { App } from './create-app.ts';
import { csrf } from './csrf.ts';
import { parseErrorBody } from './error-body.test-helper.ts';
import { request } from './request.test-helper.ts';
import { contentSecurityPolicy } from './security-headers.ts';
import { createWebApp } from './web.ts';

// Regressie voor hono 4.13.12 (GHSA-h7mg-cq63-vhpq): de standaardrouter sloeg wildcard-middleware over bij sommige
// routesets en bij een pad met een gecodeerd regeleinde. De template hangt middleware aan elk pad (createApp: requestId,
// X-Request-Id, secureHeaders, CSRF, bodyLimit; createWebApp: isServable, SPA-headers). Hier gaat elke middleware
// opnieuw langs paden met varianten (%0a, %0d, U+2028, dubbele slash, trailing slash); slaat een toekomstige hono-versie
// of een andere volgorde van middleware er een over, dan wordt een rij rood.
// Elke groep bewijst zichzelf met een controle-app zonder precies die middleware: dezelfde assertie moet daar falen.

const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
type WriteMethod = (typeof METHODS)[number];

// Een variant is één regel: voeg een rij toe en elke middleware-groep loopt er ook langs. `path` is wat de client stuurt.
const API_VARIANTS: readonly (readonly [string, string])[] = [
  ['gewoon pad', '/api/notes/n1'],
  ['achtervoegsel %0a', '/api/notes/n1%0a'],
  ['achtervoegsel %0A', '/api/notes/n1%0A'],
  ['achtervoegsel %0d', '/api/notes/n1%0d'],
  ['achtervoegsel %0d%0a', '/api/notes/n1%0d%0a'],
  ['achtervoegsel U+2028', '/api/notes/n1%E2%80%A8'],
  ['%0a midden in het segment', '/api/notes/n%0a1'],
  ['%0a voor het segment', '/api/notes/%0an1'],
  ['%0a als apart segment', '/api/notes/%0a/n1'],
  ['%0a met trailing slash', '/api/notes/n1%0a/'],
  ['dubbele slash', '/api/notes//n1'],
  ['trailing slash', '/api/notes/n1/'],
  ['%00 achter het segment', '/api/notes/n1%00'],
];

const CLIENT_REQUEST_ID = 'door-de-client-gekozen';
const WRITE_HEADERS = { 'content-type': 'application/json' };
// Wat csrf.ts als cross-site ziet: een vreemde Origin, of geen Origin en geen Sec-Fetch-Site.
const ATTACKERS: readonly (readonly [string, Record<string, string>])[] = [
  ['vreemde Origin', { ...WRITE_HEADERS, 'sec-fetch-site': 'cross-site', origin: 'http://evil.test' }],
  ['zonder Origin en Sec-Fetch-Site', { ...WRITE_HEADERS }],
];
const SAME_ORIGIN = { ...WRITE_HEADERS, 'sec-fetch-site': 'same-origin' };

interface Target {
  readonly app: App;
  /** Hoe vaak een verzoek de route of de database bereikte (handler of withUser). */
  readonly reached: () => number;
}

const NOTE_OUTPUT = z.object({ id: z.string() }).strict();
function noteContract(method: WriteMethod) {
  return defineContract({
    method,
    path: '/notes/:id',
    input: z.object({ id: z.string() }).strict(),
    output: NOTE_OUTPUT,
    permission: 'notes:read',
  });
}

// De echte app: createApp met een bestaande route per schrijvende methode op /api/notes/:id.
function realTarget(): Target {
  const counter = { handled: 0 };
  const routes = METHODS.map((method) =>
    defineRoute(noteContract(method), ({ input }) => {
      counter.handled += 1;
      return { id: input.id };
    }),
  );
  const { app, deps } = appWith({ role: 'user', sessionStrength: 'password' }, routes);
  return { app, reached: () => counter.handled + deps.calls.length };
}

type Missing = 'requestId' | 'xRequestId' | 'secureHeaders' | 'csrf' | 'bodyLimit';

// De controle-app: dezelfde middleware in dezelfde volgorde als createApp, maar zonder één ervan.
function controlTarget(omit: Missing): Target {
  const counter = { handled: 0 };
  const app = new Hono().basePath('/api');
  if (omit !== 'requestId') app.use(requestId({ headerName: '' }));
  if (omit !== 'xRequestId') {
    app.use(async (c, next) => {
      c.header('X-Request-Id', c.get('requestId'));
      await next();
    });
  }
  if (omit !== 'secureHeaders') app.use(secureHeaders());
  if (omit !== 'csrf') app.use(csrf('http://localhost:5173'));
  if (omit !== 'bodyLimit') {
    app.use(
      bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: (c) => c.json({ code: 'PAYLOAD_TOO_LARGE', requestId: c.get('requestId') }, 413),
      }),
    );
  }
  app.notFound((c) => c.json({ code: 'NOT_FOUND', requestId: c.get('requestId') }, 404));
  app.on([...METHODS], '/notes/:id', (c) => {
    counter.handled += 1;
    return c.json({ id: c.req.param('id') });
  });
  return { app: { fetch: async (incoming) => app.fetch(incoming) }, reached: () => counter.handled };
}

// Eén verzoek: welke app, welke methode, welk pad.
interface Probe {
  readonly target: Target;
  readonly method: WriteMethod;
  readonly path: string;
}

// Elk verzoek draagt een eigen X-Request-Id en een body: bodyLimit moet ook bij DELETE kunnen ingrijpen.
function send({ target, method, path: urlPath }: Probe, headers: Record<string, string>, body = '{}') {
  return request(target.app, urlPath, {
    method,
    headers: { ...headers, 'x-request-id': CLIENT_REQUEST_ID },
    body,
  });
}

const CROSS_SITE = { ...WRITE_HEADERS, 'sec-fetch-site': 'cross-site', origin: 'http://evil.test' };

// ---- assertiegroepen: elk loopt zowel tegen de echte app als tegen een controle-app zonder die middleware ----

// CSRF: een cross-site schrijfverzoek wordt geweigerd en bereikt de route niet, ook niet met een variant in het pad.
async function expectCsrfRefused(probe: Probe, attacker: Record<string, string>) {
  const before = probe.target.reached();
  const response = await send(probe, attacker);
  expect(response.status).toBe(403);
  expect(probe.target.reached()).toBe(before);
  expect(parseErrorBody(await response.json()).code).toBe('CSRF_REJECTED');
}

// secureHeaders: elk antwoord, ook de weigering, draagt de headers die secureHeaders() zet.
async function expectSecureHeaders(probe: Probe) {
  const response = await send(probe, CROSS_SITE);
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  expect(response.headers.get('strict-transport-security')).toMatch(/^max-age=\d+/);
}

// requestId en X-Request-Id: de server kiest de ID zelf (nooit die van de client) en header en body komen overeen.
async function expectRequestId(probe: Probe) {
  const response = await send(probe, CROSS_SITE);
  const header = response.headers.get('x-request-id');
  expect(header).not.toBeNull();
  expect(header).not.toBe(CLIENT_REQUEST_ID);
  expect(parseErrorBody(await response.json()).requestId).toBe(header);
}

// bodyLimit: een te grote body met geldige CSRF-headers wordt geweigerd en bereikt de route niet.
async function expectPayloadTooLarge(probe: Probe) {
  const before = probe.target.reached();
  const response = await send(probe, SAME_ORIGIN, 'x'.repeat(MAX_BODY_BYTES + 1));
  expect(response.status).toBe(413);
  expect(parseErrorBody(await response.json()).code).toBe('PAYLOAD_TOO_LARGE');
  expect(probe.target.reached()).toBe(before);
}

const CASES = API_VARIANTS.flatMap(([label, urlPath]) => METHODS.map((method) => ({ label, urlPath, method })));
const CONTROL_PROBE = (omit: Missing): Probe => ({
  target: controlTarget(omit),
  method: 'POST',
  path: '/api/notes/n1',
});

describe('API-app: basis (de bestaande route is bereikbaar)', () => {
  test.each(METHODS)('%s op het gewone pad met same-origin bereikt de handler', async (method) => {
    const probe = { target: realTarget(), method, path: '/api/notes/n1' };
    const response = await send(probe, SAME_ORIGIN);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'n1' });
    expect(probe.target.reached()).toBe(2);
  });
});

describe('API-app: CSRF op elk pad', () => {
  test.each(CASES.flatMap((c) => ATTACKERS.map(([who, headers]) => ({ ...c, who, headers }))))(
    '$method $label ($who) wordt geweigerd zonder de route te bereiken',
    async ({ method, urlPath, headers }) => {
      await expectCsrfRefused({ target: realTarget(), method, path: urlPath }, headers);
    },
  );

  test('controle: zonder CSRF-middleware bereikt een cross-site verzoek de handler', async () => {
    await expect(expectCsrfRefused(CONTROL_PROBE('csrf'), CROSS_SITE)).rejects.toThrow();
  });
});

describe('API-app: secureHeaders op elk pad', () => {
  test.each(CASES)('$method $label draagt de beveiligingsheaders', async ({ method, urlPath }) => {
    await expectSecureHeaders({ target: realTarget(), method, path: urlPath });
  });

  test('controle: zonder secureHeaders ontbreken de headers', async () => {
    await expect(expectSecureHeaders(CONTROL_PROBE('secureHeaders'))).rejects.toThrow();
  });
});

describe('API-app: requestId en X-Request-Id op elk pad', () => {
  test.each(CASES)('$method $label krijgt een door de server gekozen X-Request-Id', async ({ method, urlPath }) => {
    await expectRequestId({ target: realTarget(), method, path: urlPath });
  });

  test('controle: zonder X-Request-Id-middleware ontbreekt de header', async () => {
    await expect(expectRequestId(CONTROL_PROBE('xRequestId'))).rejects.toThrow();
  });

  test('controle: zonder requestId-middleware kiest de server geen ID', async () => {
    await expect(expectRequestId(CONTROL_PROBE('requestId'))).rejects.toThrow();
  });
});

describe('API-app: bodyLimit op elk pad', () => {
  test.each(CASES)('$method $label weigert een te grote body met PAYLOAD_TOO_LARGE', async ({ method, urlPath }) => {
    await expectPayloadTooLarge({ target: realTarget(), method, path: urlPath });
  });

  test('controle: zonder bodyLimit komt een te grote body door', async () => {
    await expect(expectPayloadTooLarge(CONTROL_PROBE('bodyLimit'))).rejects.toThrow();
  });
});

// Een %0a in het basispad (/api\n/…) valt buiten basePath('/api'): de middleware van de API geldt daar niet, maar de
// route mag er ook niet bereikbaar zijn. In de productieserver gaat zo'n pad naar de SPA (zie SERVABLE hieronder).
describe('API-app: variant in het basispad zelf', () => {
  test.each(METHODS)('%s /api%0a/notes/n1 bereikt de route niet en geeft 404', async (method) => {
    const probe = { target: realTarget(), method, path: '/api%0a/notes/n1' };
    const response = await send(probe, SAME_ORIGIN);
    expect(response.status).toBe(404);
    expect(probe.target.reached()).toBe(0);
  });
});

// ---- web-app ----

const dir = mkdtempSync(path.join(tmpdir(), 'wildcard-web-'));
mkdirSync(path.join(dir, 'assets'));
writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>app</title>');
writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *');
writeFileSync(path.join(dir, '.env'), 'GEHEIM=1');
mkdirSync(path.join(dir, '.well-known'));
writeFileSync(path.join(dir, '.well-known', 'security.txt'), 'Contact: mailto:security@example.test');
const outside = mkdtempSync(path.join(tmpdir(), 'wildcard-buiten-'));
writeFileSync(path.join(outside, 'geheim.txt'), 'buiten de build');
symlinkSync(path.join(outside, 'geheim.txt'), path.join(dir, 'link.txt'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

const api: App = { fetch: () => Promise.resolve(Response.json({ api: true })) };
const web = createWebApp(api, dir);

// Controle-web-app: dezelfde statische routes, maar zonder `isServable` (of zonder de headers).
function controlWeb(omit: 'isServable' | 'headers'): App {
  const app = new Hono();
  app.use('*', async (c, next) => {
    await next();
    if (omit !== 'headers') c.header('Content-Security-Policy', contentSecurityPolicy());
  });
  app.get('*', serveStatic({ root: dir }));
  app.get('*', (c) => c.notFound());
  return { fetch: async (incoming) => app.fetch(incoming) };
}

// Paden die wel geserveerd mogen worden (of netjes 404 geven) en dan de headers van de SPA moeten dragen.
const SERVABLE: readonly (readonly [string, string])[] = [
  ['/ met %0a', '/%0a'],
  ['schermroute met %0a', '/admin%0a'],
  ['schermroute met %0d%0a', '/admin/accounts%0d%0a'],
  ['schermroute met U+2028', '/admin%E2%80%A8'],
  ['schermroute met %0a midden', '/ad%0amin'],
  ['bestand met %0a', '/robots.txt%0a'],
  ['bestand met %0d', '/robots.txt%0d'],
  ['asset met %0a', '/assets/index-abc123.js%0a'],
  ['asset met %0d%0a', '/assets/index-abc123.js%0d%0a'],
  ['dubbele slash', '//robots.txt'],
  ['trailing slash', '/admin/'],
  ['/.well-known/ zelf', '/.well-known/security.txt'],
  ['%0a in het basispad van de API', '/api%0a/notes/n1'],
];

// Paden die `isServable` moet weigeren, met of zonder variant: verborgen bestanden en een symlink naar buiten de build.
const FORBIDDEN: readonly (readonly [string, string, string])[] = [
  ['verborgen bestand', '/.env', 'GEHEIM'],
  ['verborgen bestand met %0a', '/.env%0a', 'GEHEIM'],
  ['verborgen bestand met %0d%0a', '/.env%0d%0a', 'GEHEIM'],
  ['verborgen bestand met U+2028', '/.env%E2%80%A8', 'GEHEIM'],
  ['verborgen bestand met gecodeerde punt', '/%2eenv', 'GEHEIM'],
  ['verborgen bestand met dubbele slash', '//.env', 'GEHEIM'],
  ['verborgen bestand met trailing slash', '/.env/', 'GEHEIM'],
  ['verborgen bestand na een %0a-segment', '/%0a/.env', 'GEHEIM'],
  ['verborgen map met %0a achter .well-known', '/.well-known%0a/security.txt', 'Contact'],
  ['symlink naar buiten de build', '/link.txt', 'buiten de build'],
  ['symlink met dubbele slash', '//link.txt', 'buiten de build'],
  ['symlink met %0a', '/link.txt%0a', 'buiten de build'],
  ['pad omhoog met %0a', '/%2e%2e%0a/package.json', '"name"'],
];

async function expectSpaHeaders(app: App, urlPath: string) {
  const response = await request(app, urlPath);
  expect(response.status).not.toBe(500);
  expect(response.headers.get('content-security-policy')).toBe(contentSecurityPolicy());
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('strict-transport-security')).toMatch(/^max-age=\d+/);
  expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
}

async function expectNotServed(app: App, urlPath: string, secret: string) {
  const response = await request(app, urlPath);
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain(secret);
}

describe('web-app: middleware op elk pad', () => {
  test.each(SERVABLE)('%s krijgt de beveiligingsheaders van de SPA', async (_label, urlPath) => {
    await expectSpaHeaders(web, urlPath);
  });

  test('controle: zonder de header-middleware ontbreken de headers', async () => {
    await expect(expectSpaHeaders(controlWeb('headers'), '/admin%0a')).rejects.toThrow();
  });

  test.each(FORBIDDEN)('%s wordt niet geserveerd', async (_label, urlPath, secret) => {
    await expectNotServed(web, urlPath, secret);
  });

  test('controle: zonder isServable wordt het verborgen bestand wel geserveerd', async () => {
    await expect(expectNotServed(controlWeb('isServable'), '/.env', 'GEHEIM')).rejects.toThrow();
    await expect(expectNotServed(controlWeb('isServable'), '/link.txt', 'buiten de build')).rejects.toThrow();
  });
});
