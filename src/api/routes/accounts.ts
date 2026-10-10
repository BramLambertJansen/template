import { desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AppError } from '#core/api/errors.ts';
import { ROLES } from '#core/shared/can.ts';
import { decodeCursor, encodeCursor } from '#core/shared/cursor.ts';
import { accountsListContract, inviteContract, reinviteContract } from '#shared/contracts/accounts.ts';
import { ACCOUNTS_PAGE_SIZE } from '#shared/limits.ts';
import { appAccounts } from '../db/schema.ts';
import { defineRoute } from '../kit.ts';

// Accountbeheer (spec accountbeheer). app.accounts toont alleen iets aan een admin met MFA (view, pgTAP); can() eist
// hetzelfde vooraf. Nieuwste eerst; de cursor is (aangemaakt, id) van de laatste rij.

// Kolommen van een view zijn voor de catalogus altijd nullable: parse op de grens; een null is een bug (INTERNAL_ERROR).
const accountRow = z.object({
  id: z.string(),
  naam: z.string(),
  email: z.string(),
  rol: z.enum(ROLES),
  status: z.enum(['active', 'invited']),
  aangemaakt: z.string(),
});

const cursorKey = z.tuple([z.string(), z.string()]);

function after(cursor: string | undefined): z.infer<typeof cursorKey> | null {
  if (cursor === undefined) return null;
  // decodeCursor gooit een ZodError bij een gemanipuleerde cursor: dat is invoer van de client, dus VALIDATION.
  try {
    return decodeCursor(cursor, cursorKey);
  } catch {
    throw new AppError('VALIDATION');
  }
}

export const accountsListRoute = defineRoute(accountsListContract, async ({ input, tx }) => {
  const from = after(input.cursor);
  const rows = await tx
    .select({
      id: appAccounts.id,
      naam: appAccounts.name,
      email: appAccounts.email,
      rol: appAccounts.role,
      status: appAccounts.status,
      // ISO 8601 met microseconden: dezelfde waarde gaat ongewijzigd terug in de cursor.
      aangemaakt: sql<string>`to_json(${appAccounts.createdAt}) #>> '{}'`,
    })
    .from(appAccounts)
    .where(
      from === null
        ? undefined
        : sql`(${appAccounts.createdAt}, ${appAccounts.id}) < (${from[0]}::timestamptz, ${from[1]})`,
    )
    .orderBy(desc(appAccounts.createdAt), desc(appAccounts.id))
    .limit(ACCOUNTS_PAGE_SIZE + 1);

  const page = rows.slice(0, ACCOUNTS_PAGE_SIZE).map((row) => accountRow.parse(row));
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      ...row,
      status: row.status === 'active' ? ('actief' as const) : ('uitgenodigd' as const),
    })),
    nextCursor:
      rows.length > ACCOUNTS_PAGE_SIZE && last !== undefined ? encodeCursor([last.aangemaakt, last.id]) : null,
  };
});

// De rol gaat in de transactie van de admin (app.assign_role eist een admin met MFA); pas daarna gaat de mail weg.
export const inviteRoute = defineRoute(inviteContract, async ({ input, tx, services }) => {
  const { userId } = await services.invitations.invite({ name: input.naam, email: input.email }, async (id) => {
    await tx.execute(sql`select app.assign_role(${id}, ${input.rol})`);
  });
  return { id: userId };
});

export const reinviteRoute = defineRoute(reinviteContract, async ({ input, services }) => {
  await services.invitations.reinvite(input.id);
  return null;
});
