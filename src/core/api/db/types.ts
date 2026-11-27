import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { UserId } from '../../shared/ids.ts';

// Alleen types (geen pool, geen verbinding): route-code en createApp typen hiermee zonder index.ts te laden.

// Drizzle over de verbinding van één transactie (ADR 0042); de handler ziet nooit de pool. Tabellen en views voor queries op
// `tx`: `src/api/db/schema.ts` in de app (gegenereerd met `pnpm db:generate`); core importeert dat schema niet.
export type Tx = NodePgDatabase;

export type SessionStrength = 'password' | 'mfa';

// userId is een branded UserId (framework §4, ADR 0042): dezelfde brand als de kolommen in het Drizzle-schema.
export interface Actor {
  readonly userId: UserId;
  readonly sessionStrength: SessionStrength;
}

// Rate limit (spec rate-limit): één telling per request in een eigen korte transactie vóór die van de route, zodat een
// read-only GET ook telt en een route die faalt en terugrolt toch meetelt. De sleutel is bucket + de actor, nooit gekozen
// door de aanroeper. Boven max: AppError RATE_LIMITED met retryAfter in seconden.
export interface RateLimit {
  readonly bucket: string;
  readonly windowSeconds: number;
  readonly max: number;
}

export type TransactionOutcome = 'committed' | 'rolledBack' | 'unknown';

export interface WithUserOptions {
  // De server-gegenereerde requestId (ADR 0051): komt als `app.request_id` in de transactie, voor de auditregels.
  readonly requestId: string;
  // GET-routes: de transactie is read only (framework §6).
  readonly readOnly?: boolean;
  readonly rateLimit?: RateLimit;
  // Na vrijgeven van de verbinding; alleen een bevestigde rollback staat destructieve compensatie toe.
  readonly onTransactionOutcome?: (outcome: TransactionOutcome) => void;
}

// Wat withUser binnen de transactie al weet: de rol uit user_roles (framework §6: per request uit de database), of null.
// Een naam uit app.roles; of het register van de app hem kent, beslist can() (spec rollenregister).
export interface ActorRole {
  readonly role: string | null;
}

export type WithUser = <T>(
  actor: Actor,
  work: (tx: Tx, actorRole: ActorRole) => Promise<T>,
  options: WithUserOptions,
) => Promise<T>;

// Achtergrondtaken (ADR 0050 punt 1–2): een taak heeft een naam (voor de log) en een vast nummer, de tweede sleutel van de
// advisory lock. Overslaan (lock bezet, try-variant) is zichtbaar als { ran: false }, niet als exception.
export interface JobRef {
  readonly name: string;
  readonly key: number;
}

export interface WithJobOptions {
  // Wachten op de lock (pg_advisory_xact_lock) in plaats van overslaan; begrensd door de statement_timeout van app_jobs.
  readonly wait?: boolean;
}

export type JobResult<T> = { readonly ran: false } | { readonly ran: true; readonly value: T };

export type WithJob = <T>(job: JobRef, work: (tx: Tx) => Promise<T>, options?: WithJobOptions) => Promise<JobResult<T>>;
