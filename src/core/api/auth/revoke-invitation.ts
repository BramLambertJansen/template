import { APIError } from 'better-auth/api';
import type { Pool, PoolClient } from 'pg';

// Uitnodiging intrekken (spec accountbeheer-uitbreiding, accounts/AC-15): één transactie op de pool van auth_service, dezelfde
// uitzondering als Better Auth zelf. De user-rij gaat op slot (for update), open reset-links weg; heeft hij inmiddels een
// credential, dan 'active' en blijft alles staan (rollback); anders verdwijnt de user (cascade op user_roles).
export type RevokeOutcome = 'revoked' | 'not-found' | 'active';

async function revokeLocked(client: PoolClient, userId: string): Promise<RevokeOutcome> {
  const user = await client.query('select 1 from better_auth."user" where id = $1 for update', [userId]);
  if (user.rowCount === 0) return 'not-found';
  await client.query(`delete from better_auth.verification where value = $1 and identifier like 'reset-password:%'`, [
    userId,
  ]);
  const credential = await client.query(
    `select 1 from better_auth.account where "userId" = $1 and "providerId" = 'credential'`,
    [userId],
  );
  if ((credential.rowCount ?? 0) > 0) return 'active';
  await client.query('delete from better_auth."user" where id = $1', [userId]);
  return 'revoked';
}

export function createRevokeInvitation(database: Pool): (userId: string) => Promise<RevokeOutcome> {
  return async (userId) => {
    const client = await database.connect();
    let broken: Error | undefined;
    try {
      await client.query('begin');
      const outcome = await revokeLocked(client, userId);
      await client.query(outcome === 'revoked' ? 'commit' : 'rollback');
      return outcome;
    } catch (error) {
      await client.query('rollback').catch((rollbackError: unknown) => {
        broken = rollbackError instanceof Error ? rollbackError : new Error('rollback mislukt');
      });
      throw error;
    } finally {
      // Een verbinding waarop zelfs de rollback faalde, gaat niet terug in de pool.
      client.release(broken);
    }
  };
}

// databaseHooks.account.create.before (alleen een credential): wacht op een open intrekking (for key share botst met
// for update) en weigert als de user daarna weg is, ook als het intrekken begon terwijl het wachtwoord gehasht werd.
// Zonder deze read gaf de insert een 23503 (500). Rest-venster: een intrekking die tussen deze read en de insert lockt
// én commit (aanvaard in de spec).
export function createInviteeGuard(database: Pool) {
  return async (account: { readonly providerId: string; readonly userId: string }): Promise<void> => {
    if (account.providerId !== 'credential') return;
    const found = await database.query('select 1 from better_auth."user" where id = $1 for key share', [
      account.userId,
    ]);
    if (found.rowCount === 0) {
      throw new APIError('BAD_REQUEST', { code: 'INVALID_TOKEN', message: 'Invalid token' });
    }
  };
}
