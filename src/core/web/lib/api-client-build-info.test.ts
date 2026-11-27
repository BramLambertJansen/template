import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApiClient } from './api-client.ts';

// Spec release-versie, addendum: buildInfo() leest versie en build uit GET /api/health en gooit nooit.

afterEach(() => vi.unstubAllGlobals());

const client = createApiClient<readonly []>();

function respond(response: Response | Promise<Response>) {
  const transport = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal('fetch', transport);
  return transport;
}

describe('release-versie/AC-12: buildInfo() van de API-client', () => {
  test('release-versie/AC-12: 200 met version en build geeft beide terug, same-origin naar /api/health', async () => {
    const transport = respond(Response.json({ ok: true, version: '0.2.0', build: 'abc1234' }));
    await expect(client.buildInfo()).resolves.toEqual({ version: '0.2.0', build: 'abc1234' });
    expect(transport).toHaveBeenCalledWith('/api/health', { credentials: 'same-origin' });
  });

  test('release-versie/AC-12: 200 zonder build geeft alleen version, zonder sleutel build', async () => {
    respond(Response.json({ ok: true, version: '0.2.0' }));
    const info = await client.buildInfo();
    expect(info).toEqual({ version: '0.2.0' });
    expect(info).not.toHaveProperty('build');
  });

  test('release-versie/AC-12: een status buiten 2xx geeft null', async () => {
    respond(Response.json({ ok: true, version: '0.2.0' }, { status: 503 }));
    await expect(client.buildInfo()).resolves.toBeNull();
  });

  test('release-versie/AC-12: een netwerkfout geeft null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(client.buildInfo()).resolves.toBeNull();
  });

  test('release-versie/AC-12: een antwoord dat geen JSON is geeft null', async () => {
    respond(new Response('<html>proxy</html>', { status: 200 }));
    await expect(client.buildInfo()).resolves.toBeNull();
  });

  test.each([
    ['ontbrekende version', { ok: true }],
    ['version als getal', { ok: true, version: 2 }],
    ['lege version', { ok: true, version: '' }],
    ['geen object', ['0.2.0']],
    ['null', null],
  ])('release-versie/AC-12: %s geeft null', async (_naam, body) => {
    respond(Response.json(body));
    await expect(client.buildInfo()).resolves.toBeNull();
  });

  test('release-versie/AC-12: een build die geen tekst is valt weg, de versie blijft', async () => {
    respond(Response.json({ ok: true, version: '0.2.0', build: 42 }));
    await expect(client.buildInfo()).resolves.toEqual({ version: '0.2.0' });
  });
});
