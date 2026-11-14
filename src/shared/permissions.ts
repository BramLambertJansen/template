import { definePermissions } from '#core/shared/can.ts';
// TIJDELIJK (rollenregister fase 2): via de alias en niet './roles.ts', zolang test/rails/new-resource-lijst.test.ts dit
// bestand zonder src/shared/roles.ts naar een tijdelijke map kopieert; daarna een relatieve import.
import { roles } from '#shared/roles.ts';

// Permissietabel van de app (spec accountbeheer) over het rollenregister van de app (src/shared/roles.ts). Core voegt 'app.use'
// toe en eist MFA voor elke permissie van een beheerrol.
// Een nieuwe permissie krijgt een test per verboden rol (src/shared/permissions.test.ts doet dat voor de hele tabel).
export const permissions = definePermissions(roles, {
  'me:read': { roles: ['user', 'admin'] },
  // Spec eigen-account: het eigen account (naam, sessies, e-mailbevestiging); altijd het account uit de sessie.
  'me:update': { roles: ['user', 'admin'] },
  'accounts:read': { roles: ['admin'] },
  'accounts:invite': { roles: ['admin'] },
  // Spec accountbeheer-uitbreiding (OV-2, ADR 0043): blokkeren en deblokkeren.
  'accounts:manage': { roles: ['admin'] },
  // Spec design-system (OV-1): de catalogus, ook in productie; de guard verbergt hem, hij beschermt geen geheim.
  'design-system:read': { roles: ['admin'] },
});

export type Permission = (typeof permissions.names)[number];
export const { can, check } = permissions;
