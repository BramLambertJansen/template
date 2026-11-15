import { defineRoles, type RoleOf } from '#core/shared/roles.ts';

// Het rollenregister van de app (spec rollenregister, ADR 0040). Core levert `user` en `admin` (beheer); een rol van de app komt
// hier bij, bijvoorbeeld `defineRoles({ planner: { beheer: false } })`. `beheer` eist een MFA-sessie voor elke permissie van de
// rol en telt mee voor de laatste-beheerder-regel. De database houdt hetzelfde register bij in app.roles
// (test/auth/roles-register.int.test.ts); alle stappen: docs/gouden-pad.md, "Een rol toevoegen of weghalen".
export const roles = defineRoles({});

// De namen als type, voor `Record<Role, …>` (seed-accounts, roleLabels); van tekst naar Role: `roles.parse`.
export type Role = RoleOf<typeof roles>;
