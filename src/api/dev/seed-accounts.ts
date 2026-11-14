import type { SeedAccounts } from '#core/api/dev/seed-accounts.ts';
import type { Role } from '#shared/roles.ts';

// De vaste lokale accounts van de app (spec accountbeheer, spec rollenregister): één per rol van het register. SeedAccounts<Role>:
// een nieuwe rol in src/shared/roles.ts zonder seed-account is een typefout, zodat de dev-rolwisselaar elke rol kan tonen.
// Wachtwoord en TOTP-sleutel staan in core (src/core/api/dev/seed-accounts.ts); alleen voor APP_ENV=local.
export const SEED_ACCOUNTS = {
  user: { email: 'gebruiker@template.test', name: 'Lokale Gebruiker' },
  admin: { email: 'admin@template.test', name: 'Lokale Beheerder' },
} as const satisfies SeedAccounts<Role>;
