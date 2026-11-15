import { expect, test, vi } from 'vitest';
import { TEMPLATE_VERSION } from '../../shared/template-version.ts';
import type { AuthGateway } from '../auth/auth.ts';
import type { WithUser } from '../db/types.ts';
import { createApp } from './create-app.ts';
import { request } from './request.test-helper.ts';

// Spec release-versie (docs/template/specs/release-versie.md), AC-6: GET /api/health toont de templateversie en, als de
// config `build` heeft, de build-SHA. Zonder sessie, zonder database; GET /api/ready blijft { ok }.
test('release-versie/AC-6: zonder build geeft GET /api/health 200 met ok en version, zonder sleutel build', async () => {
  const response = await request(createApp(), '/api/health');

  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  expect(body).toStrictEqual({ ok: true, version: TEMPLATE_VERSION });
  expect(body).not.toHaveProperty('build');
});

test('release-versie/AC-6: met build geeft GET /api/health ook build', async () => {
  const response = await request(createApp({ build: 'abc1234' }), '/api/health');

  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ ok: true, version: TEMPLATE_VERSION, build: 'abc1234' });
});

test('release-versie/AC-1: TEMPLATE_VERSION is een semver-tekst', () => {
  expect(TEMPLATE_VERSION).toMatch(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
});

test('release-versie/AC-6: health vraagt geen sessie, geen database en geen readiness', async () => {
  const handler = vi.fn<AuthGateway['handler']>(() => Promise.resolve(new Response(null, { status: 204 })));
  const getSession = vi.fn<AuthGateway['getSession']>(() => Promise.resolve({ session: null, setCookie: [] }));
  const auth: AuthGateway = { handler, getSession };
  const withUserCalls = vi.fn();
  const withUser: WithUser = () => {
    withUserCalls();
    return Promise.reject(new Error('health raakt de database niet'));
  };
  const ready = vi.fn(() => Promise.resolve(true));
  const app = createApp({ auth, withUser, ready, build: 'abc1234' });

  const response = await request(app, '/api/health');

  expect([response.status, await response.json()]).toStrictEqual([
    200,
    { ok: true, version: TEMPLATE_VERSION, build: 'abc1234' },
  ]);
  expect(getSession).not.toHaveBeenCalled();
  expect(handler).not.toHaveBeenCalled();
  expect(withUserCalls).not.toHaveBeenCalled();
  expect(ready).not.toHaveBeenCalled();
});

test.each([
  [true, 200],
  [false, 503],
])('release-versie/AC-6: GET /api/ready blijft alleen { ok: %s }, ook met build', async (ok, status) => {
  const response = await request(createApp({ ready: () => Promise.resolve(ok), build: 'abc1234' }), '/api/ready');

  expect([response.status, await response.json()]).toStrictEqual([status, { ok }]);
});
