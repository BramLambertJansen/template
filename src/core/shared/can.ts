import { baseRoles, type BaseRole, type Roles } from './roles.ts';

// Rechten (framework §6, ADR 0040): één functie voor API en frontend; de API blijft de echte controle, RLS de tweede laag.
// De app levert het rollenregister (src/shared/roles.ts) en de tabel (src/shared/permissions.ts). Core voegt 'app.use' toe
// (elke rol uit het register) en leidt de MFA-eis af uit het register: elke permissie die een beheerrol heeft, eist voor die
// rol een MFA-sessie. De app kan dat niet uitzetten; de RLS-helper app.is_mfa_admin() hanteert dezelfde regel. Een rol buiten
// het register (alleen in de database) is FORBIDDEN op elke permissie.
export type SessionStrength = 'password' | 'mfa';

// TIJDELIJK (rollenregister fase 2): weg zodra de bestaande tests zijn omgezet. De rollen van een app staan in haar register
// (`Role` uit src/shared/roles.ts); dit is alleen het standaardregister.
export type Role = BaseRole;

export interface CanActor {
  // De rol zoals de database hem geeft; het register beslist of hij bestaat.
  readonly role: string;
  readonly sessionStrength: SessionStrength;
}

export interface PermissionRule {
  // Namen uit het register; een naam daarbuiten weigert definePermissions bij het laden.
  readonly roles: readonly string[];
}

export type Decision =
  { readonly ok: true } | { readonly ok: false; readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'MFA_REQUIRED' };

const CORE_PERMISSION = 'app.use';
type CorePermission = typeof CORE_PERMISSION;

export interface Permissions<Permission extends string> {
  readonly names: readonly Permission[];
  // Het register waarmee de tabel gemaakt is; de routekit en de app lezen het hier.
  readonly roles: Roles;
  readonly check: (actor: CanActor | null, permission: Permission) => Decision;
  readonly can: (actor: CanActor | null, permission: Permission) => boolean;
}

type Table = Record<string, PermissionRule>;

function isRoles(value: object): value is Roles {
  return 'isBeheer' in value && typeof value.isBeheer === 'function' && 'names' in value && Array.isArray(value.names);
}

function assertTable(roles: Roles, appTable: Table): void {
  for (const [name, rule] of Object.entries(appTable)) {
    if (name === CORE_PERMISSION) throw new Error(`Permissie '${name}' bestaat al in core`);
    const unknown = rule.roles.filter((role) => roles.parse(role) === null);
    if (unknown.length > 0) {
      throw new Error(`Permissie '${name}' noemt een rol buiten het register: ${unknown.join(', ')}`);
    }
  }
}

function build(roles: Roles, appTable: Table): Permissions<string> {
  assertTable(roles, appTable);
  const table: Readonly<Record<string, PermissionRule>> = { [CORE_PERMISSION]: { roles: roles.names }, ...appTable };
  const check = (actor: CanActor | null, permission: string): Decision => {
    if (actor === null) return { ok: false, code: 'UNAUTHENTICATED' };
    const rule = Object.hasOwn(table, permission) ? table[permission] : undefined;
    if (rule === undefined || roles.parse(actor.role) === null || !rule.roles.includes(actor.role)) {
      return { ok: false, code: 'FORBIDDEN' };
    }
    if (roles.isBeheer(actor.role) && actor.sessionStrength !== 'mfa') return { ok: false, code: 'MFA_REQUIRED' };
    return { ok: true };
  };
  return { names: Object.keys(table), roles, check, can: (actor, permission) => check(actor, permission).ok };
}

export function definePermissions<const T extends Table>(
  roles: Roles,
  appTable: T,
): Permissions<CorePermission | (keyof T & string)>;
// TIJDELIJK (rollenregister fase 2): weg zodra de bestaande tests zijn omgezet. De oude vorm zonder register gebruikt het
// standaardregister (user, admin).
export function definePermissions<const T extends Table>(appTable: T): Permissions<CorePermission | (keyof T & string)>;
export function definePermissions(first: Roles | Table, appTable?: Table): Permissions<string> {
  if (isRoles(first)) return build(first, appTable ?? {});
  return build(baseRoles, first);
}
