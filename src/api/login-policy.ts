import type { WithUser } from '#core/api/db/types.ts';
import { UserId } from '#core/shared/ids.ts';
import { roles } from '#shared/roles.ts';

// Inloggen eist MFA voor elke beheerrol van het register (spec rollenregister, AC-6); een rol buiten het register of geen rol
// niet (die komt daarna nergens binnen: can() weigert hem).
export function createLoginPolicy(withUser: WithUser) {
  return (userId: string) =>
    withUser(
      { userId: UserId.parse(userId), sessionStrength: 'password' },
      (_tx, actorRole) => Promise.resolve(roles.isBeheer(actorRole.role)),
      { requestId: crypto.randomUUID(), readOnly: true },
    );
}
