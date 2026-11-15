import { ROLE_NAME_MAX_LENGTH } from './limits.ts';

// Het rollenregister (spec rollenregister, ADR 0040): core levert de basisrollen `user` en `admin` (beheer), de app voegt de
// rest toe in src/shared/roles.ts met defineRoles. Core krijgt het register altijd als argument (R-LAAG-02): geen globale
// registratie. `beheer` bepaalt de MFA-eis (can(), app.is_mfa_admin(), login-policy) en de laatste-beheerder-regel. De
// database houdt hetzelfde register bij in app.roles; test/auth/roles-register.int.test.ts houdt ze gelijk.
export interface RoleRule {
  readonly beheer: boolean;
}

export type BaseRole = 'user' | 'admin';

// `names` is bewust breed getypt (elke naam is een string, de basisrollen staan vooraan): een rol komt als tekst uit de
// database en uit /api/me, en `z.enum(roles.names)` neemt precies de namen van het register aan. De namen als type (voor
// `Record<Role, …>`: seed-accounts, roleLabels) geeft `RoleOf<typeof roles>`; van tekst naar dat type gaat via `parse`.
export interface Roles<Name extends string = string> {
  readonly names: readonly [BaseRole, BaseRole, ...string[]];
  // Een onbekende naam (ook een rol die alleen in de database staat) is geen beheerder.
  readonly isBeheer: (name: unknown) => boolean;
  // De rol als hij in het register staat, anders null.
  readonly parse: (name: unknown) => Name | null;
}

export type RoleOf<R extends Roles> = R extends Roles<infer Name> ? Name : never;

const BASE_ROLES = { user: { beheer: false }, admin: { beheer: true } } as const satisfies Record<BaseRole, RoleRule>;
// Dezelfde vorm als de CHECK op app.roles.name.
const ROLE_NAME = /^[a-z][a-z0-9_]*$/;

function assertRoleName(name: string): void {
  if (Object.hasOwn(BASE_ROLES, name)) throw new Error(`defineRoles: '${name}' is een basisrol van core`);
  if (!ROLE_NAME.test(name))
    throw new Error(`defineRoles: rolnaam ${JSON.stringify(name)} past niet op ^[a-z][a-z0-9_]*$`);
  if (name.length > ROLE_NAME_MAX_LENGTH) {
    throw new Error(`defineRoles: rolnaam '${name}' is langer dan ${String(ROLE_NAME_MAX_LENGTH)} tekens`);
  }
}

export function defineRoles<const Extra extends Record<string, RoleRule>>(
  extra: Extra,
): Roles<BaseRole | (keyof Extra & string)> {
  const beheer = new Map<string, boolean>([
    ['user', BASE_ROLES.user.beheer],
    ['admin', BASE_ROLES.admin.beheer],
  ]);
  for (const [name, rule] of Object.entries(extra)) {
    assertRoleName(name);
    beheer.set(name, rule.beheer);
  }
  const known = (name: unknown): name is BaseRole | (keyof Extra & string) =>
    typeof name === 'string' && beheer.has(name);
  return {
    names: ['user', 'admin', ...Object.keys(extra)],
    isBeheer: (name) => known(name) && beheer.get(name) === true,
    parse: (name) => (known(name) ? name : null),
  };
}

// Het standaardregister: alleen de basisrollen. Voor core-code en tests die geen register van een app hebben.
export const baseRoles = defineRoles({});

export interface RoleRow {
  readonly name: string;
  readonly beheer: boolean;
}

export interface RoleDifferences {
  // In het register van de code, niet in app.roles: toekennen faalt op de foreign key.
  readonly onlyInRegister: readonly string[];
  // In app.roles, niet in het register: de rol is FORBIDDEN op elke route.
  readonly onlyInRows: readonly string[];
  // In beide, met een andere beheervlag.
  readonly beheerDiffers: readonly string[];
}

// Vergelijkt het register van de code met de rijen van app.roles (spec rollenregister, AC-13); alles leeg = gelijk.
export function compareRoles(roles: Roles, rows: readonly RoleRow[]): RoleDifferences {
  const inRows = new Set(rows.map((row) => row.name));
  return {
    onlyInRegister: roles.names.filter((name) => !inRows.has(name)).sort(),
    onlyInRows: rows
      .map((row) => row.name)
      .filter((name) => roles.parse(name) === null)
      .sort(),
    beheerDiffers: rows
      .filter((row) => roles.parse(row.name) !== null && roles.isBeheer(row.name) !== row.beheer)
      .map((row) => row.name)
      .sort(),
  };
}
