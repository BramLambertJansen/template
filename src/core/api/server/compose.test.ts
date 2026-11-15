import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import { UserId } from '../../shared/ids.ts';
import { defineRoles, type RoleOf } from '../../shared/roles.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { Auth, CreateAuthConfig, Invitation } from '../auth/index.ts';
import type { Tx, WithUser } from '../db/types.ts';
import type { SeedAccounts } from '../dev/seed-accounts.ts';
import type { Env } from '../env.ts';
import { createApp, type App } from '../http/create-app.ts';
import { parseErrorBody } from '../http/error-body.test-helper.ts';
import type { RunningServer, ServeOptions } from '../http/serve.ts';
import type { Mail, SendMail } from '../mail/smtp.ts';
import { writeJsonLine } from '../obs/request-log.ts';
import { outboundForbidden } from '../outbound/marker.ts';
import { composeServer, type ServerAppDeps } from './compose.ts';

// Spec create-server (docs/template/specs/create-server.md), AC-2 t/m AC-8: composeServer(config, env, parts) met
// nagebootste parts, een env-object en een buildApp die een core-createApp gebruikt. Geen database, geen open poort, geen
// import uit de app. AC-1 en AC-9 staan in test/rails/, AC-11 in test/rails/eslint-server-db.test.ts; AC-10 (bestaande tests
// blijven groen, e2e bewijst de echte bedrading in runServer) krijgt bewust geen eigen test.
//
// Keuzes waar de spec geen naam vastlegt (de developer volgt ze):
// - config = { appName, devLogin: { roles, seedAccounts }, invitationMail, loginRequiresMfa, createServices, buildApp };
// - composeServer is synchroon en bouwt alles (ook buildApp) bij de aanroep; het resultaat is { app, start };
// - ServerAppDeps<Services> wordt geëxporteerd uit ./compose.ts;
// - start() roept parts.startServer(app, options) aan met de signatuur van startServer uit http/serve.ts: app is een
//   object met fetch, options = { host, port, shutdownTimeoutMs, onStopped }; start() heeft verder geen vaste returnwaarde;
// - parts.createMailer(smtpUrl, from) heeft de signatuur van createSmtpMailer; parts.createAuth(config) die van createAuth;
// - { app } uit het resultaat wordt alleen zonder WEB_DIR gebruikt; met WEB_DIR toetst AC-7 de app die start() doorgeeft.

interface Services {
  readonly tag: 'services-van-de-test';
}
interface Fetchable {
  readonly fetch: (request: Request) => Response | Promise<Response>;
}

const roles = defineRoles({ planner: { beheer: false } });
const seedAccounts = {
  user: { email: 'gebruiker@compose.test', name: 'Gebruiker' },
  admin: { email: 'beheer@compose.test', name: 'Beheerder' },
  planner: { email: 'planner@compose.test', name: 'Planner' },
} satisfies SeedAccounts<RoleOf<typeof roles>>;

// Elke waarde verschilt van de andere (ook AUTH_BASE_URL van APP_ORIGIN en de twee database-URL's), zodat een
// verwisseling in de koppeling opvalt.
const ENV: Env = {
  appEnv: 'local',
  appOrigin: 'https://app.example.test:8443',
  apiHost: '127.0.0.9',
  apiPort: 18_787,
  shutdownTimeoutMs: 4321,
  databaseUrl: 'postgres://api@db.example.test/app',
  authDatabaseUrl: 'postgres://auth@db.example.test/app',
  authBaseUrl: 'https://auth.example.test',
  authSecret: 'auth-geheim-voor-de-test-0123456789',
  smtpUrl: 'smtp://mail.example.test:2525',
  clientIpHeader: 'x-client-ip-van-de-test',
  webDir: undefined,
};
const envWith = (overrides: Partial<Env>): Env => ({ ...ENV, ...overrides });

const ACTOR = { userId: UserId.parse('u-compose'), sessionStrength: 'password' } as const;
const INVITATION: Invitation = {
  email: 'nieuw@compose.test',
  name: 'Nieuw',
  url: 'https://app.example.test/uitnodiging?token=t',
};
const INVITATION_MAIL: Mail = { to: INVITATION.email, subject: 'Uitnodiging van de test', text: INVITATION.url };
const LOGIN = {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
  body: JSON.stringify({ rol: 'planner' }),
};

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  const [item] = items;
  if (item === undefined) throw new Error('only: lege lijst');
  return item;
}

async function call(app: Fetchable, requestPath: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`http://localhost${requestPath}`, init));
}

// Een nagebootste Better Auth met alleen wat de koppeling aanroept: sessie (gateway), inloggen (dev-login) en sluiten.
function fakeAuth() {
  const signInEmail = vi.fn<(options: unknown) => Promise<{ headers: Headers }>>(() =>
    Promise.resolve({ headers: new Headers([['set-cookie', 'sessie=planner; Path=/']]) }),
  );
  const getSession = vi.fn<(options: unknown) => Promise<{ headers: Headers; response: null }>>(() =>
    Promise.resolve({ headers: new Headers(), response: null }),
  );
  const closePool = vi.fn(() => Promise.resolve());
  const handler = vi.fn<(request: Request) => Promise<Response>>(() =>
    Promise.resolve(new Response(null, { status: 204 })),
  );
  const auth = unsafeCast<Auth>(
    { api: { signInEmail, getSession }, handler, closePool },
    'test: alleen de onderdelen die de koppeling aanroept, geen echte Better Auth en geen pool',
  );
  return { auth, signInEmail, getSession, closePool };
}

function fakeParts(fake: ReturnType<typeof fakeAuth>) {
  const mailer = vi.fn<SendMail>(() => Promise.resolve());
  const fakeTx = unsafeCast<Tx>({}, 'test: de nagebootste withUser gebruikt de transactie niet');
  const parts = {
    withUser: vi.fn<WithUser>(async (_actor, work) => work(fakeTx, { role: null })),
    pingDatabase: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    closeDatabase: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    createAuth: vi.fn<(config: CreateAuthConfig) => Auth>(() => fake.auth),
    createMailer: vi.fn<(smtpUrl: string, from: string) => SendMail>(() => mailer),
    startServer: vi.fn<(app: Fetchable, options: ServeOptions) => Promise<RunningServer>>(() =>
      Promise.resolve({ port: 0, stop: () => Promise.resolve() }),
    ),
  };
  return { parts, mailer };
}

// Stelt de koppeling samen met nagebootste parts; `received` zijn de deps die buildApp krijgt.
function harness(env: Env = ENV) {
  const fake = fakeAuth();
  const { parts, mailer } = fakeParts(fake);
  const received: ServerAppDeps<Services>[] = [];
  const services: Services = { tag: 'services-van-de-test' };
  const policy = vi.fn<(userId: string) => Promise<boolean>>(() => Promise.resolve(true));
  const config = {
    appName: 'Testapp',
    devLogin: { roles, seedAccounts },
    invitationMail: vi.fn<(invitation: Invitation) => Mail>(() => INVITATION_MAIL),
    loginRequiresMfa: vi.fn<(withUser: WithUser) => typeof policy>(() => policy),
    createServices: vi.fn<(auth: Auth) => Services>(() => services),
    buildApp: (deps: ServerAppDeps<Services>): App => {
      received.push(deps);
      return createApp<Services>({ ...deps, roles });
    },
  };
  const server = composeServer(config, env, parts);
  return { server, parts, mailer, fake, config, services, policy, received };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('create-server/AC-2: de dev-login bestaat alleen met APP_ENV=local', () => {
  test('create-server/AC-2: local geeft buildApp een devLogin en POST /api/dev/login-as is geen 404', async () => {
    const h = harness(envWith({ appEnv: 'local' }));

    expect(Object.hasOwn(only(h.received), 'devLogin')).toBe(true);
    const response = await call(h.server.app, '/api/dev/login-as', LOGIN);

    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie()).toStrictEqual(['sessie=planner; Path=/']);
  });

  test.each(['test', 'staging', 'production'] as const)(
    'create-server/AC-2: %s laat de sleutel devLogin weg uit deps en de route geeft 404',
    async (appEnv) => {
      const h = harness(envWith({ appEnv }));

      const deps = only(h.received);
      expect(deps).not.toHaveProperty('devLogin');
      expect(Object.keys(deps)).not.toContain('devLogin');
      const response = await call(h.server.app, '/api/dev/login-as', LOGIN);

      expect([response.status, parseErrorBody(await response.json()).code]).toStrictEqual([404, 'NOT_FOUND']);
      expect(h.fake.signInEmail).not.toHaveBeenCalled();
    },
  );
});

describe('create-server/AC-3: wat buildApp krijgt', () => {
  test('create-server/AC-3: appOrigin = APP_ORIGIN, log = writeJsonLine, services van createServices, ready is er', () => {
    const h = harness();
    const deps = only(h.received);

    expect(deps.appOrigin).toBe(ENV.appOrigin);
    expect(deps.log).toBe(writeJsonLine);
    expect(deps.services).toBe(h.services);
    expect(typeof deps.ready).toBe('function');
  });

  test('create-server/AC-3: withUser weigert een uitgaande aanroep binnen de transactie en geeft de aanroep door aan parts.withUser', async () => {
    const h = harness();
    const { withUser } = only(h.received);
    const options = { requestId: 'r-compose' };

    expect(outboundForbidden()).toBe(false);
    const insideTransaction = await withUser(ACTOR, () => Promise.resolve(outboundForbidden()), options);

    expect(insideTransaction).toBe(true);
    expect(outboundForbidden()).toBe(false);
    expect(h.parts.withUser).toHaveBeenCalledTimes(1);
    expect(h.parts.withUser).toHaveBeenCalledWith(ACTOR, expect.any(Function), options);
  });

  test('create-server/AC-3: GET /api/ready geeft 200 als parts.pingDatabase slaagt', async () => {
    const h = harness();

    const response = await call(h.server.app, '/api/ready');

    expect([response.status, await response.json()]).toStrictEqual([200, { ok: true }]);
    expect(h.parts.pingDatabase).toHaveBeenCalledTimes(1);
  });

  test('create-server/AC-3: GET /api/ready geeft 503 als parts.pingDatabase faalt', async () => {
    const h = harness();
    h.parts.pingDatabase.mockRejectedValue(new Error('database onbereikbaar'));

    const response = await call(h.server.app, '/api/ready');

    expect([response.status, await response.json()]).toStrictEqual([503, { ok: false }]);
  });

  test('create-server/AC-3: de vaste waarden van readiness blijven: een uitkomst 1 s bewaard, een probe hooguit 2 s', async () => {
    const cached = harness();
    await call(cached.server.app, '/api/ready');
    await call(cached.server.app, '/api/ready');
    expect(cached.parts.pingDatabase).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    const hanging = harness();
    hanging.parts.pingDatabase.mockImplementation(() => new Promise<void>(() => undefined));
    let status: number | undefined;
    void call(hanging.server.app, '/api/ready').then((response) => {
      status = response.status;
    });
    await vi.advanceTimersByTimeAsync(1999);
    expect(status).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(status).toBe(503);
  });
});

describe('create-server/AC-4: wat createAuth krijgt', () => {
  test('create-server/AC-4: precies origin, secret, databaseUrl, clientIpHeader, appName, loginRequiresMfa, sendMail en sendInvitation', () => {
    const h = harness();

    const [authConfig] = only(h.parts.createAuth.mock.calls);
    const { sendInvitation, ...rest } = authConfig;

    expect(rest).toStrictEqual({
      origin: ENV.authBaseUrl,
      secret: ENV.authSecret,
      databaseUrl: ENV.authDatabaseUrl,
      clientIpHeader: ENV.clientIpHeader,
      appName: 'Testapp',
      loginRequiresMfa: h.policy,
      sendMail: h.mailer,
    });
    expect(typeof sendInvitation).toBe('function');
  });

  test('create-server/AC-4: loginRequiresMfa van de app krijgt de bewaakte withUser', async () => {
    const h = harness();

    const [guardedWithUser] = only(h.config.loginRequiresMfa.mock.calls);
    const insideTransaction = await guardedWithUser(ACTOR, () => Promise.resolve(outboundForbidden()), {
      requestId: 'r-policy',
    });

    expect(insideTransaction).toBe(true);
    expect(h.parts.withUser).toHaveBeenCalledTimes(1);
  });

  test('create-server/AC-4: sendInvitation stuurt invitationMail(invitation) naar dezelfde mailer', async () => {
    const h = harness();
    const [{ sendInvitation }] = only(h.parts.createAuth.mock.calls);

    await sendInvitation(INVITATION);

    expect(h.config.invitationMail).toHaveBeenCalledExactlyOnceWith(INVITATION);
    expect(h.mailer).toHaveBeenCalledExactlyOnceWith(INVITATION_MAIL);
  });
});

describe('create-server/AC-5: de mailer', () => {
  test.each([
    ['https://app.example.test:8443', 'no-reply@app.example.test'],
    ['http://localhost:5173', 'no-reply@localhost'],
  ])('create-server/AC-5: createMailer krijgt SMTP_URL en het afzenderadres bij APP_ORIGIN %s', (appOrigin, from) => {
    const h = harness(envWith({ appOrigin }));

    expect(h.parts.createMailer).toHaveBeenCalledExactlyOnceWith(ENV.smtpUrl, from);
  });
});

describe('create-server/AC-6: één auth-instantie', () => {
  test('create-server/AC-6: createServices, de gateway, de dev-login en het sluiten gebruiken de auth die createAuth gaf', async () => {
    const h = harness();
    const deps = only(h.received);
    expect(h.parts.createAuth).toHaveBeenCalledTimes(1);

    expect(only(h.config.createServices.mock.calls)[0]).toBe(h.fake.auth);

    await expect(deps.auth.getSession(new Headers())).resolves.toStrictEqual({ session: null, setCookie: [] });
    expect(h.fake.getSession).toHaveBeenCalledTimes(1);

    await call(h.server.app, '/api/dev/login-as', LOGIN);
    const [signIn] = only(h.fake.signInEmail.mock.calls);
    expect(signIn).toMatchObject({ body: { email: seedAccounts.planner.email } });

    await h.server.start();
    const [, options] = only(h.parts.startServer.mock.calls);
    await options.onStopped();
    expect(h.fake.closePool).toHaveBeenCalledTimes(1);
  });
});

describe('create-server/AC-7: de SPA via WEB_DIR', () => {
  const webDir = mkdtempSync(path.join(tmpdir(), 'compose-web-'));
  writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>compose</title>');
  writeFileSync(path.join(webDir, 'robots.txt'), 'User-agent: compose-test');
  afterAll(() => {
    rmSync(webDir, { recursive: true, force: true });
  });

  async function startedApp(env: Env): Promise<Fetchable> {
    const h = harness(env);
    await h.server.start();
    const [app] = only(h.parts.startServer.mock.calls);
    return app;
  }

  test('create-server/AC-7: zonder WEB_DIR is de app die start() doorgeeft de API', async () => {
    const app = await startedApp(envWith({ webDir: undefined }));

    expect([(await call(app, '/api/health')).status, await (await call(app, '/api/health')).json()]).toStrictEqual([
      200,
      { ok: true },
    ]);
    expect((await call(app, '/robots.txt')).status).toBe(404);
  });

  test('create-server/AC-7: met WEB_DIR serveert hij een bestand uit de map en blijft /api/health de API', async () => {
    const app = await startedApp(envWith({ webDir }));

    const file = await call(app, '/robots.txt');
    expect([file.status, await file.text()]).toStrictEqual([200, 'User-agent: compose-test']);
    const health = await call(app, '/api/health');
    expect([health.status, await health.json()]).toStrictEqual([200, { ok: true }]);
    const unknown = await call(app, '/api/bestaat-niet');
    expect([unknown.status, parseErrorBody(await unknown.json()).code]).toStrictEqual([404, 'NOT_FOUND']);
  });
});

describe('create-server/AC-8: starten en stoppen', () => {
  test('create-server/AC-8: composeServer luistert niet; start() roept parts.startServer aan met API_HOST, API_PORT en SHUTDOWN_TIMEOUT_MS', async () => {
    const h = harness();
    expect(h.parts.startServer).not.toHaveBeenCalled();

    await h.server.start();

    const [, options] = only(h.parts.startServer.mock.calls);
    expect(options).toMatchObject({ host: ENV.apiHost, port: ENV.apiPort, shutdownTimeoutMs: ENV.shutdownTimeoutMs });
    expect(typeof options.onStopped).toBe('function');
  });

  test('create-server/AC-8: onStopped() sluit parts.closeDatabase en auth.closePool, en niets eerder', async () => {
    const h = harness();
    await h.server.start();
    const [, options] = only(h.parts.startServer.mock.calls);
    expect(h.parts.closeDatabase).not.toHaveBeenCalled();
    expect(h.fake.closePool).not.toHaveBeenCalled();

    await options.onStopped();

    expect(h.parts.closeDatabase).toHaveBeenCalledTimes(1);
    expect(h.fake.closePool).toHaveBeenCalledTimes(1);
  });

  test('create-server/AC-8: faalt closeDatabase, dan wordt auth.closePool toch aangeroepen en de fout niet ingeslikt', async () => {
    const h = harness();
    h.parts.closeDatabase.mockRejectedValue(new Error('pool sluiten mislukt'));
    await h.server.start();
    const [, options] = only(h.parts.startServer.mock.calls);

    await expect(options.onStopped()).rejects.toThrow('pool sluiten mislukt');

    expect(h.fake.closePool).toHaveBeenCalledTimes(1);
  });
});
