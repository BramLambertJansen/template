import type { createAuthMiddleware } from 'better-auth/api';
import type { Pool } from 'pg';
import { z } from 'zod';
import { RESET_LINK_TTL_SECONDS } from '../../shared/limits.ts';
import type { Mailing } from './mailing.ts';

// Resetlink van een beheerder (spec accountbeheer-uitbreiding, accounts/AC-16; ADR 0043). Uitnodigen en resetten delen de
// reset-flow van Better Auth; een account met een credential krijgt de resetmail met een korte TTL, een uitgenodigd account
// (nog geen credential) de uitnodiging van 7 dagen. Queries op de pool van auth_service (R-LAAG-05), zoals revoke-invitation.ts.

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

interface ResetUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface ResetMailDeps {
  readonly database: Pool;
  readonly mailing: Mailing | null;
  // Bouwt de link naar het scherm in de SPA; soort 'reset' voegt `&soort=reset` toe.
  readonly linkFor: (token: string, soort: 'uitnodiging' | 'reset') => string;
  readonly sendInvitation: (invitation: { email: string; name: string; url: string }) => Promise<void>;
}

async function hasCredential(database: Pool, userId: string): Promise<boolean> {
  const found = await database.query(
    `select 1 from better_auth.account where "userId" = $1 and "providerId" = 'credential'`,
    [userId],
  );
  return (found.rowCount ?? 0) > 0;
}

// Better Auth maakt de tokenrij met INVITATION_TTL_SECONDS en wacht op sendResetPassword vóór het antwoord: hier gaat de rij
// terug naar hooguit RESET_LINK_TTL_SECONDS, vóór de mail. Geen rij of geen mailer: een fout en geen mail (fail-closed), en
// nooit een terugval op de uitnodiging.
export function createSendResetPassword(deps: ResetMailDeps) {
  const { database, mailing, linkFor, sendInvitation } = deps;
  return async ({ user, token }: { readonly user: ResetUser; readonly token: string }): Promise<void> => {
    if (!(await hasCredential(database, user.id))) {
      await sendInvitation({ email: user.email, name: user.name, url: linkFor(token, 'uitnodiging') });
      return;
    }
    const shortened = await database.query(
      `update better_auth.verification
         set "expiresAt" = least("expiresAt", now() + make_interval(secs => $2))
         where identifier = $1`,
      [`reset-password:${token}`, RESET_LINK_TTL_SECONDS],
    );
    if (shortened.rowCount !== 1) throw new Error('resetlink: tokenrij niet gevonden, geen mail');
    if (mailing === null) throw new Error('resetlink: geen mailer (sendMail) geconfigureerd, geen mail');
    await mailing.resetPassword(user, linkFor(token, 'reset'));
  };
}

const resetBody = z.object({ token: z.string().min(1) });
const resetSucceeded = z.object({ status: z.literal(true) });

// Na een reset van een account dat al een credential had, gaat session_version omhoog (eigenaar, 26 november 2026): een
// inlogpoging die met het oude wachtwoord begon (snapshot van ADR 0052), vervalt. De before-hook leest of er een credential
// was (daarna bestaat de tokenrij niet meer); de after-hook hoogt alleen na een gelukte reset op.
export function createResetSessionBump(database: Pool) {
  const pending = new WeakMap<object, string>();
  return {
    before: async (ctx: HookContext): Promise<void> => {
      if (ctx.path !== '/reset-password') return;
      const body = resetBody.safeParse(ctx.body);
      if (!body.success) return;
      const found = await database.query<{ value: string }>(
        `select v.value from better_auth.verification v
           where v.identifier = $1
             and exists (select 1 from better_auth.account a where a."userId" = v.value and a."providerId" = 'credential')`,
        [`reset-password:${body.data.token}`],
      );
      const userId = found.rows[0]?.value;
      if (userId !== undefined) pending.set(ctx.context, userId);
    },
    after: async (ctx: HookContext): Promise<void> => {
      if (ctx.path !== '/reset-password') return;
      const userId = pending.get(ctx.context);
      pending.delete(ctx.context);
      if (userId === undefined || !resetSucceeded.safeParse(ctx.context.returned).success) return;
      await database.query('update better_auth."user" set session_version = session_version + 1 where id = $1', [
        userId,
      ]);
    },
  };
}

export type ResetSessionBump = ReturnType<typeof createResetSessionBump>;
