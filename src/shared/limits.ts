import {
  DEFAULT_PAGE_SIZE,
  MAX_EMAIL_LENGTH,
  MAX_PAGE_SIZE,
  type FileLimits,
  type RateLimits,
} from '#core/shared/limits.ts';

// Grenzen van de app (ADR 0040); nooit boven een harde grens uit core (test in limits.test.ts).
export const ACCOUNTS_PAGE_SIZE = 25;
export const APP_LIMITS = { ACCOUNTS_PAGE_SIZE } as const;
export { MAX_EMAIL_LENGTH, MAX_PAGE_SIZE };

// Accounts (spec accountbeheer): naam bij het uitnodigen; het e-mailadres heeft de harde grens uit core (spec e-maillengte).
export const MAX_NAME_LENGTH = 100;

// Rate limit per gebruiker per venster van 60 s (spec rate-limit, OV-1); per categorie hooguit de harde grens uit core.
export const RATE_LIMITS: RateLimits = { lezen: 300, schrijven: 60, duur: 10 };

// Bestandsopslag (spec bestandsopslag, "Grenzen"): de waarden van de app, nooit boven de harde grenzen uit core (createApp
// weigert dan bij opstart, AC-6). allowedTypes is één voorbeeld dat een app aanpast (OV-16).
export const FILE_LIMITS: FileLimits = {
  maxBytes: 10_485_760,
  allowedTypes: ['application/pdf'],
  uploadUrlTtlSeconds: 300,
  downloadUrlTtlSeconds: 60,
  pendingTtlSeconds: 86_400,
  maxPerUser: 100,
  pageSize: DEFAULT_PAGE_SIZE,
};
