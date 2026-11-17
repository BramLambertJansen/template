import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import type { App } from './create-app.ts';
import { request } from './request.test-helper.ts';
import { securityHeaders } from './security-headers.ts';
import { createWebApp } from './web.ts';

// Elke response van de web-app buiten /api draagt de beveiligingsheaders van de SPA, ook de 404 die `isServable` geeft
// voor een verborgen bestand of een symlink naar buiten de build. Die 404 lekt geen inhoud en is nooit `immutable`.

const dir = mkdtempSync(path.join(tmpdir(), 'weigering-web-'));
mkdirSync(path.join(dir, 'assets'));
writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>app</title>');
writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
writeFileSync(path.join(dir, '.env'), 'GEHEIM=1');
const outside = mkdtempSync(path.join(tmpdir(), 'weigering-buiten-'));
writeFileSync(path.join(outside, 'geheim.txt'), 'buiten de build');
symlinkSync(path.join(outside, 'geheim.txt'), path.join(dir, 'link.txt'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

const api: App = { fetch: () => Promise.resolve(Response.json({ api: true })) };
const web = createWebApp(api, dir);

// Paden die `isServable` weigert, met het geheim dat nooit in de body mag staan.
const REFUSED: readonly (readonly [string, string, string])[] = [
  ['verborgen bestand', '/.env', 'GEHEIM'],
  ['verborgen bestand met %0a', '/.env%0a', 'GEHEIM'],
  ['symlink naar buiten de build', '/link.txt', 'buiten de build'],
  ['verborgen bestand met dubbele slash', '//.env', 'GEHEIM'],
];

const EXPECTED_HEADERS = Object.entries(securityHeaders());

describe('web-app: geweigerde paden (isServable) krijgen de beveiligingsheaders', () => {
  test('de verwachte set bevat alle vier de headers van securityHeaders()', () => {
    expect(EXPECTED_HEADERS.map(([name]) => name.toLowerCase()).sort()).toEqual([
      'content-security-policy',
      'referrer-policy',
      'strict-transport-security',
      'x-content-type-options',
    ]);
  });

  test.each(REFUSED)('%s: 404 zonder inhoud', async (_label, urlPath, secret) => {
    const response = await request(web, urlPath);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(secret);
  });

  test.each(REFUSED)('%s: 404 draagt alle headers van securityHeaders()', async (_label, urlPath) => {
    const response = await request(web, urlPath);
    expect(response.status).toBe(404);
    for (const [name, value] of EXPECTED_HEADERS) {
      expect(response.headers.get(name), name).toBe(value);
    }
  });

  test.each(REFUSED)('%s: 404 krijgt geen immutable cache', async (_label, urlPath) => {
    const response = await request(web, urlPath);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control') ?? '').not.toContain('immutable');
  });

  test('een weigering onder /assets/ krijgt ook geen immutable cache', async () => {
    const response = await request(web, '/assets/.env');
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control') ?? '').not.toContain('immutable');
    expect(response.headers.get('content-security-policy')).toBe(securityHeaders()['Content-Security-Policy']);
  });

  test('controle: een gewone 404 (ontbrekend bestand) draagt dezelfde headers', async () => {
    const response = await request(web, '/oud.js');
    expect(response.status).toBe(404);
    for (const [name, value] of EXPECTED_HEADERS) {
      expect(response.headers.get(name), name).toBe(value);
    }
  });

  test('controle: een geserveerd bestand behoudt zijn cache en headers', async () => {
    const response = await request(web, '/assets/index-abc123.js');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    for (const [name, value] of EXPECTED_HEADERS) {
      expect(response.headers.get(name), name).toBe(value);
    }
  });
});
