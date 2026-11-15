import { expect, test, vi } from 'vitest';
import type { AuthGateway } from '#core/api/auth/index.ts';
import { TEMPLATE_VERSION } from '#core/shared/template-version.ts';
import { unsafeCast } from '#core/shared/unsafe-cast.ts';
import { buildApp, type BuildAppConfig } from './app.ts';
import type { AppServices } from './services.ts';

// Spec release-versie (docs/template/specs/release-versie.md), AC-8, het deel van de app: buildApp geeft `build` uit zijn
// config door aan createApp, zodat GET /api/health hem toont. Health raakt auth, database en services niet; de nagebootste
// onderdelen bewijzen dat.
function config(): BuildAppConfig {
  const getSession = vi.fn<AuthGateway['getSession']>(() => Promise.reject(new Error('health vraagt geen sessie')));
  const handler = vi.fn<AuthGateway['handler']>(() => Promise.reject(new Error('health raakt auth niet')));
  return {
    appOrigin: 'https://app.example.test',
    auth: { getSession, handler },
    withUser: () => Promise.reject(new Error('health raakt de database niet')),
    services: unsafeCast<AppServices>({}, 'test: health gebruikt geen services'),
  };
}

async function health(app: ReturnType<typeof buildApp>): Promise<unknown> {
  const response = await app.fetch(new Request('http://localhost/api/health'));
  expect(response.status).toBe(200);
  return response.json();
}

test('release-versie/AC-8: buildApp met build geeft hem door: /api/health toont version en build', async () => {
  const app = buildApp({ ...config(), build: 'abc1234' });

  expect(await health(app)).toStrictEqual({ ok: true, version: TEMPLATE_VERSION, build: 'abc1234' });
});

test('release-versie/AC-8: buildApp zonder build: /api/health toont alleen ok en version', async () => {
  const app = buildApp(config());

  expect(await health(app)).toStrictEqual({ ok: true, version: TEMPLATE_VERSION });
});
