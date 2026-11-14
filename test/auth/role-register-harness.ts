import pg from 'pg';
import { required } from './harness.ts';

// Hulp voor de integratietests van spec rollenregister (ST-16): testrollen die ECHT gecommit worden (de testkit en de
// racetests zien ze alleen zo), en het idempotent opruimen ervan. Een achtergebleven beheerrol zou de vier bestaande
// racetests breken (die rekenen met `admin` als enige beheerrol), dus elk bestand ruimt op in `beforeAll` en in `finally`.
//
// Testregister van de spec: planner (geen beheer), eigenaar (beheer), toezicht (beheer).
export const TEST_ROLES = ['planner', 'eigenaar', 'toezicht'] as const;
export const TEST_BEHEER: Readonly<Record<(typeof TEST_ROLES)[number], boolean>> = {
  planner: false,
  eigenaar: true,
  toezicht: true,
};

// Een vaste, telbare admin: zolang hij er is, kan elke testrol met dragers terug naar `user` zonder LAST_ADMIN.
const KEEPER = 'roles-keeper';

export function migratorPool(max = 4): pg.Pool {
  return new pg.Pool({ connectionString: required('MIGRATOR_DATABASE_URL'), max });
}

export interface AccountOptions {
  // Weglaten: geen rol (zoals een gebruiker zonder rij in user_roles).
  readonly role?: string;
  // Standaard met credential-account (telbaar); false = uitgenodigd, telt niet mee voor de laatste-beheerder-regel.
  readonly credential?: boolean;
  readonly blocked?: boolean;
  readonly deactivated?: boolean;
}

// Een account direct in better_auth (de test is app_migrator, eigenaar van die tabellen), idempotent op id.
export async function addAccount(pool: pg.Pool, id: string, options: AccountOptions = {}): Promise<void> {
  await pool.query(
    `insert into better_auth."user" (id, name, email, "emailVerified") values ($1, $1, $2, true)
     on conflict (id) do nothing`,
    [id, `${id}@roles.test`],
  );
  if (options.credential !== false) {
    await pool.query(
      `insert into better_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       values ($1, $2, 'credential', $2, 'hash', now(), now()) on conflict (id) do nothing`,
      [`${id}-credential`, id],
    );
  }
  if (options.role !== undefined) await pool.query('select app.assign_role($1, $2)', [id, options.role]);
  if (options.blocked === true)
    await pool.query('update better_auth."user" set blocked_at = now() where id = $1', [id]);
  if (options.deactivated === true) {
    await pool.query('update better_auth."user" set deactivated_at = now() where id = $1', [id]);
  }
}

export async function registerTestRoles(pool: pg.Pool): Promise<void> {
  for (const name of TEST_ROLES) await pool.query('select app.register_role($1, $2)', [name, TEST_BEHEER[name]]);
}

// Idempotent: zet eerst een telbare admin neer, brengt de dragers van de rollen terug naar `user` en haalt de rollen uit
// het register. Rollen die niet (meer) bestaan, worden overgeslagen.
export async function cleanupTestRoles(pool: pg.Pool, names: readonly string[] = TEST_ROLES): Promise<void> {
  await addAccount(pool, KEEPER, { role: 'admin' });
  const list = [...names];
  const { rows } = await pool.query<{ user_id: string }>('select user_id from public.user_roles where role = any($1)', [
    list,
  ]);
  for (const row of rows) await pool.query("select app.assign_role($1, 'user')", [row.user_id]);
  await pool.query('select app.unregister_role(name) from app.roles where name = any($1)', [list]);
}

// Alle andere dragers van een beheerrol terug naar `user`: wat overblijft aan beheerders is precies `keep` (andere
// integratietests committen ook admins). `keep` moet telbaar zijn, anders weigert de database dit met LAST_ADMIN.
export async function onlyCountedBeheer(pool: pg.Pool, keep: readonly string[]): Promise<void> {
  const { rows } = await pool.query<{ user_id: string }>(
    `select ur.user_id from public.user_roles ur join app.roles r on r.name = ur.role
     where r.beheer and ur.user_id <> all($1)`,
    [[...keep]],
  );
  for (const row of rows) await pool.query("select app.assign_role($1, 'user')", [row.user_id]);
}

export async function hasCountedBeheer(pool: pg.Pool): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>('select app.has_counted_beheer() as ok');
  return rows[0]?.ok === true;
}

let counter = 0;
export function uniqueId(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(Date.now())}-${String(counter)}`;
}

// De foutmelding of -code van een afgewezen belofte: een pg-fout, een AppError of iets anders.
export function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function codeOf(reason: unknown): string | undefined {
  if (typeof reason === 'object' && reason !== null && 'code' in reason && typeof reason.code === 'string') {
    return reason.code;
  }
  return undefined;
}

// De reden van een afgewezen belofte, of undefined als hij slaagde (voor Promise.allSettled).
export function reasonOf(result: PromiseSettledResult<unknown>): unknown {
  return result.status === 'rejected' ? result.reason : undefined;
}

export function isLastAdmin(reason: unknown): boolean {
  return messageOf(reason) === 'LAST_ADMIN' || codeOf(reason) === 'LAST_ADMIN';
}
