// Harde grenzen van de template (framework §6). App-grenzen staan in src/shared/limits.ts (ADR 0040).
export const MAX_BODY_BYTES = 100 * 1024;

// Accounts en sessies (ADR 0041, ADR 0043, spec accountbeheer).
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;
// E-mailadres (RFC 5321); ook de grens van /change-email in de before-hook (spec e-maillengte).
export const MAX_EMAIL_LENGTH = 254;
export const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;
// Resetlink van een beheerder voor een actief account (spec accountbeheer-uitbreiding, OV-4): 1 uur; sendResetPassword verkort
// de tokenrij (Better Auth maakt hem met INVITATION_TTL_SECONDS) vóór de mail.
export const RESET_LINK_TTL_SECONDS = 60 * 60;
export const SESSION_IDLE_SECONDS = 12 * 60 * 60;
export const SESSION_REFRESH_SECONDS = 60 * 60;
export const SESSION_ABSOLUTE_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_FRESH_SECONDS = 10 * 60;
// Geldigheid van de twee links van een e-mailwijziging (spec eigen-account, OV-5): stateless JWT's, dus kort.
export const EMAIL_CHANGE_TTL_SECONDS = 60 * 60;
// Hoe lang een gebruikte TOTP-code geweigerd blijft (ADR 0075): Better Auth accepteert een code in een venster van ±1 stap van
// 30 s, dus ongeveer 90 s; met marge 120 s.
export const TOTP_REUSE_BLOCK_SECONDS = 120;

// Audit log (ADR 0051, spec audit-log): dezelfde waarden als de CHECK's op `app.audit_log` (pgTAP test dat ze gelijk zijn).
export const MAX_AUDIT_DETAILS_BYTES = 2048;
export const MAX_AUDIT_TARGET_ID_LENGTH = 128;

// Paginering (framework §5): een app mag kleiner, nooit groter dan MAX_PAGE_SIZE.
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
// Een cursor is nooit langer (spec lijstpagina, cursorbudget, leerpunt #411): de invoer weigert een langere en `encodeCursor` eist
// hem bij emissie. Ruim boven elke sleutel van de template, ver onder de headergrens van Node (16 KiB).
export const MAX_CURSOR_LENGTH = 4096;

// Branded IDs (`brandedId`) en id-velden in contracten; ook een sleuteldeel van een cursor.
export const MAX_ID_LENGTH = 200;

// De requestId uit een foutbody die de web-client toont (spec foutreferentie, `safeRequestId`); de server geeft een UUID (36).
export const MAX_REQUEST_ID_LENGTH = 64;

// Een tijdstip als sleuteldeel van een cursor: de ISO-tekst van een `timestamptz` uit Postgres (`to_json(…) #>> '{}'`). Slechtste geval
// ~40 tekens (6-cijferig jaar, microseconden, offset met seconden, " BC"); 48 met marge (spec lijstpagina, leerpunt #444).
export const MAX_TIMESTAMP_LENGTH = 48;

// Rate limit van app-routes (spec rate-limit, framework §6 Verharding): vast venster per gebruiker per categorie. Een app
// kiest per contract een categorie (`rateLimit` in defineContract; zonder: GET → lezen, anders schrijven) en mag de
// maxima in src/shared/limits.ts lager zetten, nooit hoger (createApp weigert dan bij opstart; test in limits.test.ts).
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_CATEGORIES = ['lezen', 'schrijven', 'duur'] as const;
export type RateLimitCategory = (typeof RATE_LIMIT_CATEGORIES)[number];
export type RateLimits = Readonly<Record<RateLimitCategory, number>>;
export const RATE_LIMIT_MAX: RateLimits = { lezen: 300, schrijven: 60, duur: 10 };

// De categorieën waarvan het maximum geen geheel getal ≥ 1 is of boven de harde grens ligt; leeg = in orde.
export function invalidRateLimits(limits: RateLimits): RateLimitCategory[] {
  return RATE_LIMIT_CATEGORIES.filter((category) => {
    const max = limits[category];
    return !Number.isInteger(max) || max < 1 || max > RATE_LIMIT_MAX[category];
  });
}

// Zoeken in lijstpagina's (spec lijstpagina).
export const MAX_SEARCH_LENGTH = 100;

// Uitgaande client (spec uitgaande-client, ADR 0077): standaard en harde grens. Een app mag per client lager, nooit hoger
// (createOutboundClient weigert dan bij opstart). Backoff en antwoordgrootte zijn vast.
export const OUTBOUND_TIMEOUT_MS = 3000;
export const OUTBOUND_TIMEOUT_MAX_MS = 10_000;
export const OUTBOUND_BUDGET_MS = 8000;
export const OUTBOUND_BUDGET_MAX_MS = 20_000;
export const OUTBOUND_MAX_ATTEMPTS = 3;
export const OUTBOUND_MAX_ATTEMPTS_MAX = 5;
export const OUTBOUND_BACKOFF_BASE_MS = 200;
export const OUTBOUND_BACKOFF_MAX_MS = 2000;
// Geteld op gedecodeerde bytes; ook de harde grens.
export const OUTBOUND_MAX_RESPONSE_BYTES = 1_048_576;

// Koppelingsregister (spec koppelingsregister): de naam van een koppeling, gelijk aan de CHECK op
// app.integration_switches.name (test in src/core/api/integrations/register.test.ts), en hoe lang een lezing van de
// schakelaar geldt (OV-3: langer dan één aanroep, OUTBOUND_BUDGET_MAX_MS).
export const INTEGRATION_NAME_MAX_LENGTH = 63;
export const INTEGRATION_SWITCH_MAX_AGE_MS = 30_000;

// Rollenregister (spec rollenregister): de naam van een rol, gelijk aan de CHECK op app.roles.name (test in
// test/auth/role-name-limit.test.ts).
export const ROLE_NAME_MAX_LENGTH = 32;

// Achtergrondtaken (ADR 0050, spec achtergrondtaken): standaardinterval per taak, en opruimen in begrensde batches. De
// batchgrens is ook de grens in app.purge_expired (gelijkheidstest in test/jobs/purge.int.test.ts).
export const JOBS_INTERVAL_SECONDS = 60;
export const MAX_PURGE_BATCH = 1000;
export const MAX_PURGE_BATCHES_PER_ROUND = 100;
// Better Auth 1.7.7 (spec achtergrondtaken, OV-A4): het standaardvenster van de rate limit, expliciet gezet in
// src/core/api/auth/options.ts, en de opruimtermijn van better_auth."rateLimit" = het langste vaste venster van Better Auth
// (60 s voor /forget-password* en /email-otp/*). Gelijk aan de rij in app.retention (test/datapad/retention-limits.int.test.ts).
export const AUTH_RATE_LIMIT_WINDOW_SECONDS = 10;
export const AUTH_RATE_LIMIT_KEEP_SECONDS = 60;
// Bestandsopslag (spec bestandsopslag, ADR 0060): harde grenzen. Dezelfde waarden als de CHECK's op public.files (deel B).
// Een app kiest haar waarden in FILE_LIMITS (src/shared/limits.ts); createApp weigert er een boven deze grenzen.
export const MAX_FILE_BYTES = 26_214_400;
export const MAX_FILE_URL_TTL_SECONDS = 900;
export const MAX_FILENAME_LENGTH = 255;
// Time-out op stat in createFileService (OV-22): daarna STORAGE_UNAVAILABLE.
export const STORAGE_CALL_TIMEOUT_MS = 5000;

export interface FileLimits {
  readonly maxBytes: number;
  readonly allowedTypes: readonly string[];
  readonly uploadUrlTtlSeconds: number;
  readonly downloadUrlTtlSeconds: number;
  // Hoe lang een onvoltooide upload blijft staan; altijd langer dan uploadUrlTtlSeconds.
  readonly pendingTtlSeconds: number;
  readonly maxPerUser: number;
  readonly pageSize: number;
}

const positiveUpTo = (value: number, max: number) => Number.isInteger(value) && value >= 1 && value <= max;

// De namen van de foute sleutels (leeg = in orde): boven een harde grens, geen positief geheel getal, pendingTtlSeconds
// niet groter dan uploadUrlTtlSeconds, of een lege allowedTypes bij een geconfigureerde adapter.
export function invalidFileLimits(limits: FileLimits, options: { readonly hasStorage: boolean }): string[] {
  const checks: readonly (readonly [keyof FileLimits, boolean])[] = [
    ['maxBytes', positiveUpTo(limits.maxBytes, MAX_FILE_BYTES)],
    ['allowedTypes', !options.hasStorage || limits.allowedTypes.length > 0],
    ['uploadUrlTtlSeconds', positiveUpTo(limits.uploadUrlTtlSeconds, MAX_FILE_URL_TTL_SECONDS)],
    ['downloadUrlTtlSeconds', positiveUpTo(limits.downloadUrlTtlSeconds, MAX_FILE_URL_TTL_SECONDS)],
    [
      'pendingTtlSeconds',
      positiveUpTo(limits.pendingTtlSeconds, Number.MAX_SAFE_INTEGER) &&
        limits.pendingTtlSeconds > limits.uploadUrlTtlSeconds,
    ],
    ['maxPerUser', positiveUpTo(limits.maxPerUser, Number.MAX_SAFE_INTEGER)],
    ['pageSize', positiveUpTo(limits.pageSize, MAX_PAGE_SIZE)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}
