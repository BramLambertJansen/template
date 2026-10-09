import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Alleen types (geen pool, geen verbinding): route-code en createApp typen hiermee zonder index.ts te laden.

// Drizzle over de verbinding van één transactie (ADR 0012); de handler ziet nooit de pool. Het schema komt uit de
// introspectie (stuk 5c); tot dan queries via sql``.
export type Tx = NodePgDatabase;

export type SessionStrength = 'password' | 'mfa';

// userId wordt een branded UserId uit src/core/shared/ids.ts zodra het Drizzle-schema er is (stuk 5c, ADR 0012).
export interface Actor {
  readonly userId: string;
  readonly sessionStrength: SessionStrength;
}

export interface WithUserOptions {
  // GET-routes: de transactie is read only (framework §6).
  readonly readOnly?: boolean;
}

// Wat withUser binnen de transactie al weet: de rol uit user_roles (framework §6: per request uit de database), of null.
export interface ActorRole {
  readonly role: 'user' | 'admin' | null;
}

export type WithUser = <T>(
  actor: Actor,
  work: (tx: Tx, actorRole: ActorRole) => Promise<T>,
  options?: WithUserOptions,
) => Promise<T>;
