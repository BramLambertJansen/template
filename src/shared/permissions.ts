import { definePermissions } from '#core/shared/can.ts';

// Permissietabel van de app (spec accountbeheer). Core voegt 'app.use' toe en eist MFA voor elke permissie van een admin.
// Een nieuwe permissie krijgt een test per verboden rol (src/shared/permissions.test.ts doet dat voor de hele tabel).
export const permissions = definePermissions({
  'me:read': { roles: ['user', 'admin'] },
  'accounts:read': { roles: ['admin'] },
  'accounts:invite': { roles: ['admin'] },
});

export type Permission = (typeof permissions.names)[number];
export const { can, check } = permissions;
