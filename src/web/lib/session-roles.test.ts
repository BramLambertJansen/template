import { isRedirect } from '@tanstack/react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ForbiddenError } from '#core/web/lib/guard.ts';
import { createQueryClient } from '#core/web/lib/query.ts';
import { actorFromMe, guard, homeFor } from './session.ts';

// Spec rollenregister (ST-16, AC-6): actorFromMe, homeFor en de guard lezen het register en de tabel van de app. Hier met het
// testregister van de spec (planner, eigenaar, toezicht) en de testtabel: eigenaar heeft accounts:read en accounts:manage,
// toezicht en planner me:read. De bestaande session.test.ts dekt het standaardregister (user, admin).
vi.mock('#shared/roles.ts', async () => {
  const { defineRoles } = await import('#core/shared/roles.ts');
  return { roles: defineRoles({ planner: { beheer: false }, eigenaar: { beheer: true }, toezicht: { beheer: true } }) };
});
vi.mock('#shared/permissions.ts', async () => {
  const { definePermissions } = await import('#core/shared/can.ts');
  const { roles } = await import('#shared/roles.ts');
  const permissions = definePermissions(roles, {
    'me:read': { roles: ['planner', 'toezicht'] },
    'accounts:read': { roles: ['eigenaar'] },
    'accounts:manage': { roles: ['eigenaar'] },
  });
  return { permissions, can: permissions.can, check: permissions.check };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function serverSays(status: number, body: unknown) {
  const server = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal('fetch', server);
  return server;
}

const location = { href: '/admin/accounts' };
const me = (rol: string) => ({ id: 'u1', naam: 'Anna', email: 'anna@example.test', rol });

async function outcome(permission: 'accounts:read' | 'me:read'): Promise<unknown> {
  try {
    await guard(permission)({ context: { queryClient: createQueryClient() }, location });
    return 'ok';
  } catch (error) {
    return isRedirect(error) ? error.options.href : error;
  }
}

describe('actorFromMe met een rollenregister', () => {
  test('rollenregister/AC-6: een beheerrol (admin, eigenaar, toezicht) krijgt mfa, een andere rol password', () => {
    expect(['admin', 'eigenaar', 'toezicht', 'planner', 'user'].map((rol) => actorFromMe({ rol }))).toStrictEqual([
      { role: 'admin', sessionStrength: 'mfa' },
      { role: 'eigenaar', sessionStrength: 'mfa' },
      { role: 'toezicht', sessionStrength: 'mfa' },
      { role: 'planner', sessionStrength: 'password' },
      { role: 'user', sessionStrength: 'password' },
    ]);
  });
});

describe('homeFor met een rollenregister', () => {
  test('rollenregister/AC-6: eigenaar (accounts:read) gaat naar /admin', () => {
    expect(homeFor(actorFromMe({ rol: 'eigenaar' }))).toBe('/admin');
  });

  test('rollenregister/AC-6: toezicht (beheer, zonder accounts:read) en planner gaan naar /', () => {
    expect(['toezicht', 'planner', 'user'].map((rol) => homeFor(actorFromMe({ rol })))).toStrictEqual(['/', '/', '/']);
  });
});

describe('guard met een rollenregister', () => {
  test('rollenregister/AC-6: de guard van /admin (accounts:read) laat eigenaar door', async () => {
    serverSays(200, me('eigenaar'));

    expect(await outcome('accounts:read')).toBe('ok');
  });

  test('rollenregister/AC-6: toezicht en planner krijgen een ForbiddenError op accounts:read', async () => {
    serverSays(200, me('toezicht'));
    expect(await outcome('accounts:read')).toBeInstanceOf(ForbiddenError);

    serverSays(200, me('planner'));
    expect(await outcome('accounts:read')).toBeInstanceOf(ForbiddenError);
  });

  test('rollenregister/AC-6: toezicht en planner mogen me:read', async () => {
    serverSays(200, me('toezicht'));
    expect(await outcome('me:read')).toBe('ok');

    serverSays(200, me('planner'));
    expect(await outcome('me:read')).toBe('ok');
  });

  test('rollenregister/AC-12: een rol die niet in het register staat, kan nergens door (ForbiddenError)', async () => {
    serverSays(200, me('spook'));

    expect(await outcome('me:read')).toBeInstanceOf(ForbiddenError);
  });
});
