import { describe, expect, test, vi } from 'vitest';
import type { Tx, WithUser } from '#core/api/db/types.ts';
import { unsafeCast } from '#core/shared/unsafe-cast.ts';
import { createLoginPolicy } from './login-policy.ts';

// Het inlogbeleid (spec rollenregister, AC-6): inloggen eist MFA voor elke beheerrol van het register van de app, niet
// alleen voor `admin`. Hier met het testregister van de spec; withUser is nagebootst (de rol komt uit user_roles).
vi.mock('#shared/roles.ts', async () => {
  const { defineRoles } = await import('#core/shared/roles.ts');
  return { roles: defineRoles({ planner: { beheer: false }, eigenaar: { beheer: true }, toezicht: { beheer: true } }) };
});

function withRole(role: string | null): { withUser: WithUser; calls: { strength: string; readOnly: boolean }[] } {
  const calls: { strength: string; readOnly: boolean }[] = [];
  const withUser: WithUser = (actor, work, options) => {
    calls.push({ strength: actor.sessionStrength, readOnly: options.readOnly === true });
    return work(unsafeCast<Tx>({}, 'test: het beleid gebruikt tx niet'), { role });
  };
  return { withUser, calls };
}

async function requiresMfa(role: string | null): Promise<boolean> {
  return createLoginPolicy(withRole(role).withUser)('u1');
}

describe('createLoginPolicy', () => {
  test('rollenregister/AC-6: inloggen als eigenaar, toezicht of admin eist MFA', async () => {
    expect(await Promise.all(['eigenaar', 'toezicht', 'admin'].map(requiresMfa))).toStrictEqual([true, true, true]);
  });

  test('rollenregister/AC-6: inloggen als planner, user, een rol buiten het register of zonder rol eist geen MFA', async () => {
    const outcomes = await Promise.all(['planner', 'user', 'spook', null].map(requiresMfa));

    expect(outcomes.filter(Boolean)).toStrictEqual([]);
    expect(outcomes).toHaveLength(4);
  });

  test('rollenregister/AC-6: het beleid leest de rol als password-sessie, read only, voor de gegeven gebruiker', async () => {
    const { withUser, calls } = withRole('eigenaar');
    await createLoginPolicy(withUser)('u1');

    expect(calls).toStrictEqual([{ strength: 'password', readOnly: true }]);
  });
});
