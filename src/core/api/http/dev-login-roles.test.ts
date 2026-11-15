import { afterEach, describe, expect, test, vi } from 'vitest';
import { defineRoles } from '../../shared/roles.ts';
import { createApp, type DevLogin } from './create-app.ts';
import { parseErrorBody } from './error-body.test-helper.ts';
import { request } from './request.test-helper.ts';

// POST /api/dev/login-as met een register van de app (spec rollenregister, AC-15): elke rol uit het register kan, een rol
// buiten het register is 400 VALIDATION, en een mislukte dev-login (seed niet gedraaid) is een gewone INTERNAL_ERROR.
const ORIGIN = 'http://localhost:5173';
const roles = defineRoles({ planner: { beheer: false }, eigenaar: { beheer: true }, toezicht: { beheer: true } });

afterEach(() => {
  vi.restoreAllMocks();
});

function post(body: string) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body,
  };
}

describe('/api/dev/login-as met een rollenregister', () => {
  test('rollenregister/AC-15: elke rol uit het register geeft 204 en de sessiecookie van die rol', async () => {
    const seen: string[] = [];
    const devLogin: DevLogin = (role) => {
      seen.push(role);
      return Promise.resolve([`__Host-auth.session_token=${role}; Path=/; Secure; HttpOnly`]);
    };
    const app = createApp({ appOrigin: ORIGIN, roles, devLogin });

    for (const role of roles.names) {
      const response = await request(app, '/api/dev/login-as', post(JSON.stringify({ rol: role })));

      expect(response.status, role).toBe(204);
      expect(response.headers.getSetCookie(), role).toStrictEqual([
        `__Host-auth.session_token=${role}; Path=/; Secure; HttpOnly`,
      ]);
    }
    expect(seen).toStrictEqual([...roles.names]);
  });

  test('rollenregister/AC-15: een rol buiten het register of een andere schrijfwijze is 400 VALIDATION, devLogin niet aangeroepen', async () => {
    const devLogin = vi.fn<DevLogin>(() => Promise.resolve([]));
    const app = createApp({ appOrigin: ORIGIN, roles, devLogin });

    for (const body of [
      '{"rol":"baas"}',
      '{"rol":"Eigenaar"}',
      '{"rol":""}',
      '{"rol":"constructor"}',
      '{"rol":1}',
      '{}',
    ]) {
      const response = await request(app, '/api/dev/login-as', post(body));

      expect([response.status, parseErrorBody(await response.json()).code], body).toStrictEqual([400, 'VALIDATION']);
    }
    expect(devLogin).not.toHaveBeenCalled();
  });

  test('rollenregister/AC-15: een extra veld of een kapotte body is 400 VALIDATION (.strict())', async () => {
    const app = createApp({ appOrigin: ORIGIN, roles, devLogin: () => Promise.resolve([]) });

    for (const body of ['{"rol":"planner","x":1}', 'kapot']) {
      const response = await request(app, '/api/dev/login-as', post(body));

      expect([response.status, parseErrorBody(await response.json()).code], body).toStrictEqual([400, 'VALIDATION']);
    }
  });

  test('rollenregister/AC-15: een dev-login die faalt (rol zonder seed-account) geeft 500 INTERNAL_ERROR zonder details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const devLogin: DevLogin = () => Promise.reject(new Error('dev-login: /sign-in/email mislukte (draait de seed?)'));
    const app = createApp({ appOrigin: ORIGIN, roles, devLogin });

    const response = await request(app, '/api/dev/login-as', post('{"rol":"planner"}'));
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(parseErrorBody(JSON.parse(text)).code).toBe('INTERNAL_ERROR');
    expect(text).not.toContain('seed');
  });

  test('rollenregister/AC-15: zonder devLogin (buiten local) bestaat de route niet, ook met een register', async () => {
    const response = await request(
      createApp({ appOrigin: ORIGIN, roles }),
      '/api/dev/login-as',
      post('{"rol":"planner"}'),
    );

    expect(response.status).toBe(404);
  });
});
