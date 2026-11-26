import { type SQL, and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { containsPattern, decodeListCursor } from '#core/api/route/list-query.ts';
import {
  ACCOUNT_SORTS,
  accountsListContract,
  accountsSearch,
  activateContract,
  blockContract,
  deactivateContract,
  inviteContract,
  reinviteContract,
  resetLinkContract,
  revokeInvitationContract,
  unblockContract,
} from '#shared/contracts/accounts.ts';
import { ACCOUNTS_PAGE_SIZE } from '#shared/limits.ts';
import { roles } from '#shared/roles.ts';
import { AppError } from '#core/api/errors.ts';
import { appAccounts } from '../db/schema.ts';
import { defineRoute } from '../kit.ts';

// Accountbeheer (spec accountbeheer). app.accounts toont alleen iets aan een admin met MFA (view, pgTAP); can() eist
// hetzelfde vooraf. Zoeken, filteren en sorteren volgens spec lijstpagina; de cursor is [sort, sleutel, id] van de laatste rij.

// Kolommen van een view zijn voor de catalogus altijd nullable: parse op de grens; een null is een bug (INTERNAL_ERROR).
const accountRow = z.object({
  id: z.string(),
  naam: z.string(),
  email: z.string(),
  rol: z.enum(roles.names),
  status: z.enum(['active', 'invited', 'blocked', 'deactivated']),
  aangemaakt: z.string(),
  naamKey: z.string(),
  laatstIngelogd: z.string().nullable(),
  gedeactiveerd: z.boolean(),
  geblokkeerd: z.boolean(),
});

type Sort = (typeof ACCOUNT_SORTS)[number];

// De cursor hoort bij één sortering: [sort, sleutel, id]; de helper levert sleutel en id, een vreemde cursor geeft VALIDATION.
function keyParts(sort: Sort): readonly [z.ZodType<string>, z.ZodType<string>] {
  return [sort === 'nieuwste' || sort === 'oudste' ? z.iso.datetime({ offset: true }) : z.string(), z.string()];
}

const STATUS_COLUMN = {
  actief: sql`${appAccounts.status} = 'active'`,
  uitgenodigd: sql`${appAccounts.status} = 'invited'`,
  geblokkeerd: sql`${appAccounts.blockedAt} is not null`,
  gedeactiveerd: sql`${appAccounts.deactivatedAt} is not null`,
};

const STATUS_LABEL = {
  active: 'actief',
  invited: 'uitgenodigd',
  blocked: 'geblokkeerd',
  deactivated: 'gedeactiveerd',
} as const;

const naamKey = sql<string>`lower(${appAccounts.name})`;
const aangemaaktKey = sql<string>`to_json(${appAccounts.createdAt}) #>> '{}'`;

export const accountsListRoute = defineRoute(accountsListContract, async ({ input, tx }) => {
  const { sort, q, rol, status } = input;
  const byName = sort === 'naam-az' || sort === 'naam-za';
  const descending = sort === 'nieuwste' || sort === 'naam-za';
  const from = decodeListCursor(accountsSearch, input, keyParts(sort));
  const keyColumn = byName ? sql`lower(${appAccounts.name})` : sql`${appAccounts.createdAt}`;
  const keyCast = byName ? sql`` : sql`::timestamptz`;
  const conditions: SQL[] = [];
  if (q !== undefined) {
    const pattern = containsPattern(q);
    conditions.push(sql`(${appAccounts.name} ilike ${pattern} or ${appAccounts.email} ilike ${pattern})`);
  }
  if (rol !== undefined) conditions.push(eq(appAccounts.role, rol));
  if (status !== undefined) conditions.push(STATUS_COLUMN[status]);
  if (from !== null) {
    const operator = descending ? sql`<` : sql`>`;
    conditions.push(sql`(${keyColumn}, ${appAccounts.id}) ${operator} (${from[0]}${keyCast}, ${from[1]})`);
  }
  const order = descending ? desc : asc;
  const rows = await tx
    .select({
      id: appAccounts.id,
      naam: appAccounts.name,
      email: appAccounts.email,
      rol: appAccounts.role,
      status: appAccounts.status,
      // ISO 8601 met microseconden: dezelfde waarde gaat ongewijzigd terug in de cursor.
      aangemaakt: aangemaaktKey,
      naamKey,
      laatstIngelogd: sql<string | null>`to_json(${appAccounts.lastLoginAt}) #>> '{}'`,
      gedeactiveerd: sql<boolean>`${appAccounts.deactivatedAt} is not null`,
      geblokkeerd: sql<boolean>`${appAccounts.blockedAt} is not null`,
    })
    .from(appAccounts)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(order(byName ? naamKey : appAccounts.createdAt), order(appAccounts.id))
    .limit(ACCOUNTS_PAGE_SIZE + 1);

  const page = rows.slice(0, ACCOUNTS_PAGE_SIZE).map((row) => accountRow.parse(row));
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      id: row.id,
      naam: row.naam,
      email: row.email,
      rol: row.rol,
      aangemaakt: row.aangemaakt,
      status: STATUS_LABEL[row.status],
      laatstIngelogd: row.laatstIngelogd,
      gedeactiveerd: row.gedeactiveerd,
      geblokkeerd: row.geblokkeerd,
    })),
    nextCursor:
      rows.length > ACCOUNTS_PAGE_SIZE && last !== undefined
        ? accountsSearch.encodeCursor(sort, [byName ? last.naamKey : last.aangemaakt, last.id])
        : null,
  };
});

// De rol en de auditregel gaan in de transactie van de admin (app.assign_role en app.audit_account_action eisen een admin met
// MFA); mail pas na commit, een half auth-account opruimen pas na rollback (spec audit-log, OV-C2).
export const inviteRoute = defineRoute(inviteContract, async ({ input, tx, services, afterCommit, afterRollback }) => {
  const { userId } = await services.invitations.invite(
    { name: input.naam, email: input.email },
    async (id) => {
      await tx.execute(sql`select app.assign_role(${id}, ${input.rol})`);
      await tx.execute(sql`select app.audit_account_action('core.account.invite', ${id})`);
    },
    { afterCommit, afterRollback },
  );
  return { id: userId };
});

// De regel staat vóór de service: NOT_FOUND of ALREADY_ACTIVE rolt de transactie terug, dus ook de regel.
export const reinviteRoute = defineRoute(reinviteContract, async ({ input, tx, services, afterCommit }) => {
  await tx.execute(sql`select app.audit_account_action('core.account.reinvite', ${input.id})`);
  await services.invitations.reinvite(input.id, { afterCommit });
  return null;
});

// Uitnodiging intrekken (spec accountbeheer-uitbreiding, RLS-vangnet): de service draait als auth_service buiten RLS, dus eerst
// de rij uit app.accounts in de transactie van de admin met MFA (geen rij: NOT_FOUND). Alleen 'invited' gaat naar de service,
// die onder slot opnieuw op een credential toetst. De auditregel staat vóór de service, zoals bij reinviteRoute: een fout rolt
// hem terug. Faalt de route-commit na de service, dan is het account weg zonder regel (bekend gat, ADR 0051, R-DB-15).
export const revokeInvitationRoute = defineRoute(revokeInvitationContract, async ({ input, tx, services }) => {
  const [row] = await tx
    .select({ status: appAccounts.status })
    .from(appAccounts)
    .where(sql`${appAccounts.id} = ${input.id}`)
    .limit(1);
  if (row === undefined) throw new AppError('NOT_FOUND');
  if (row.status !== 'invited') throw new AppError('ALREADY_ACTIVE');
  await tx.execute(sql`select app.audit_account_action('core.account.revoke', ${input.id})`);
  await services.invitations.revoke(input.id);
  return null;
});

// Resetlink sturen (spec accountbeheer-uitbreiding, RLS-vangnet): de service draait als auth_service buiten RLS, dus eerst de rij
// uit app.accounts in de transactie van de admin met MFA. Alleen 'active' gaat door; de auditregel staat vóór de service, zoals
// bij reinviteRoute. Tokens weg, aanmaken en mail pas na commit (afterCommit).
const RESET_REFUSAL = {
  invited: 'ACCOUNT_INVITED',
  blocked: 'ACCOUNT_BLOCKED',
  deactivated: 'ACCOUNT_DEACTIVATED',
} as const;

export const resetLinkRoute = defineRoute(resetLinkContract, async ({ input, tx, services, afterCommit }) => {
  const [row] = await tx
    .select({ status: appAccounts.status })
    .from(appAccounts)
    .where(sql`${appAccounts.id} = ${input.id}`)
    .limit(1);
  if (row === undefined) throw new AppError('NOT_FOUND');
  const status = accountRow.shape.status.parse(row.status);
  if (status !== 'active') throw new AppError(RESET_REFUSAL[status]);
  await tx.execute(sql`select app.audit_account_action('core.account.reset_link', ${input.id})`);
  await services.invitations.sendResetLink(input.id, { afterCommit });
  return null;
});

// Blokkeren (ADR 0043 punt 18): de functie in de transactie van de admin (NOT_FOUND, OWN_ACCOUNT, ACCOUNT_INVITED en
// LAST_ADMIN komen als P0001 uit de database), sessies opruimen na commit. Een opruimfout draait de blokkade niet terug.
export const blockRoute = defineRoute(blockContract, async ({ input, tx, services, afterCommit }) => {
  await tx.execute(sql`select app.set_account_blocked(${input.id}, true)`);
  afterCommit(() => services.sessions.revokeAll(input.id));
  return null;
});

export const unblockRoute = defineRoute(unblockContract, async ({ input, tx }) => {
  await tx.execute(sql`select app.set_account_blocked(${input.id}, false)`);
  return null;
});

export const deactivateRoute = defineRoute(deactivateContract, async ({ input, tx }) => {
  await tx.execute(sql`select app.set_account_deactivated(${input.id}, true)`);
  return null;
});

export const activateRoute = defineRoute(activateContract, async ({ input, tx }) => {
  await tx.execute(sql`select app.set_account_deactivated(${input.id}, false)`);
  return null;
});
