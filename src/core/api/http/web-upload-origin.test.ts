import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import type { App } from './create-app.ts';
import { request } from './request.test-helper.ts';
import { createWebApp } from './web.ts';

// Spec files, AC-5: createWebApp(api, webDir, { uploadOrigin }) zet die origin naast 'self' in connect-src van de SPA-headers;
// met null, zonder waarde en zonder opties is connect-src precies 'self'. De API-responses blijven ongemoeid.

const dir = mkdtempSync(path.join(tmpdir(), 'web-upload-'));
writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>app</title>');
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const ORIGIN = 'https://opslag.example.test';
const api: App = {
  fetch: () =>
    Promise.resolve(Response.json({ ok: true }, { headers: { 'Content-Security-Policy': "default-src 'none'" } })),
};

async function connectSrc(web: App, requestPath = '/'): Promise<string[]> {
  const response = await request(web, requestPath);
  const policy = response.headers.get('content-security-policy') ?? '';
  const found = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('connect-src '));
  if (found === undefined) throw new Error(`connect-src ontbreekt in: ${policy}`);
  return found.split(/\s+/).slice(1);
}

describe('files/AC-5: createWebApp en connect-src', () => {
  test("files/AC-5: met uploadOrigin O bevat connect-src precies 'self' en O, op de SPA en op een schermroute", async () => {
    const web = createWebApp(api, dir, { uploadOrigin: ORIGIN });

    expect(await connectSrc(web, '/')).toStrictEqual(["'self'", ORIGIN]);
    expect(await connectSrc(web, '/bestanden')).toStrictEqual(["'self'", ORIGIN]);
  });

  test('files/AC-5: ook een geweigerd pad (404) draagt dezelfde CSP met O', async () => {
    const web = createWebApp(api, dir, { uploadOrigin: ORIGIN });

    const response = await request(web, '/.env');

    expect(response.status).toBe(404);
    expect(response.headers.get('content-security-policy')).toContain(`connect-src 'self' ${ORIGIN}`);
  });

  test.each([
    ['uploadOrigin null', () => createWebApp(api, dir, { uploadOrigin: null })],
    ['opties zonder uploadOrigin', () => createWebApp(api, dir, {})],
    ['zonder opties (zonder adapter)', () => createWebApp(api, dir)],
  ])("files/AC-5: %s geeft connect-src precies 'self'", async (_, build) => {
    expect(await connectSrc(build())).toStrictEqual(["'self'"]);
  });

  test('files/AC-5: de CSP van de API-response blijft die van de API, ook met uploadOrigin', async () => {
    const web = createWebApp(api, dir, { uploadOrigin: ORIGIN });

    const response = await request(web, '/api/health');

    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'");
  });
});
