import { APIError } from 'better-auth/api';
import { TOTP_REUSE_BLOCK_SECONDS } from '../../shared/limits.ts';
import { backupCodeKey, type ClaimOnce } from './one-time-use.ts';
import { attemptUserId, codeFrom, type HookContext } from './totp-claim.ts';

// Een herstelcode werkt één keer, ook bij twee gelijktijdige verzoeken (ADR 0113 punt 4, spec accountbeheer-uitbreiding,
// AC-25). De blijvende eenmaligheid komt van de plugin (compare-and-swap op backupCodes); deze claim beslist alleen de race,
// vóór de controle door de plugin en ook bij een foute code, met TTL TOTP_REUSE_BLOCK_SECONDS.

export async function claimBackupCode(ctx: HookContext, claim: ClaimOnce): Promise<void> {
  if (ctx.path !== '/two-factor/verify-backup-code') return;
  // Alleen bij een HTTP-verzoek: een interne aanroep (auth.api.verifyBackupCode) bestaat niet.
  if (ctx.request === undefined) return;
  // De hooks weigeren een volledige sessie al eerder; hier telt dus alleen de two_factor-challenge.
  const userId = await attemptUserId(ctx);
  if (userId === null) return;
  const key = backupCodeKey(userId, codeFrom(ctx.body));
  if (key === null) return;
  // Zelfde antwoord als een foute code van de plugin: geen orakel "deze code is al gebruikt".
  if (!(await claim(key, TOTP_REUSE_BLOCK_SECONDS)))
    throw new APIError('UNAUTHORIZED', { code: 'INVALID_BACKUP_CODE', message: 'Invalid backup code' });
}
