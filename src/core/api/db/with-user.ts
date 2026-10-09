import type { Pool, PoolClient } from 'pg';

export type SessionStrength = 'password' | 'mfa';

// userId wordt in stuk 3a een branded UserId uit src/core/shared/ids.ts (ADR 0012).
export interface Actor {
  readonly userId: string;
  readonly sessionStrength: SessionStrength;
}

// Vanaf stuk 3a een Drizzle-transactie over dezelfde verbinding (ADR 0012); de handler ziet nooit de pool.
export type Tx = PoolClient;

export interface WithUserOptions {
  // GET-routes: de transactie is read only (framework §6).
  readonly readOnly?: boolean;
}

export type WithUser = <T>(actor: Actor, work: (tx: Tx) => Promise<T>, options?: WithUserOptions) => Promise<T>;

const STRENGTHS: ReadonlySet<string> = new Set(['password', 'mfa']);

// De types dekken dit al; de controle blijft omdat een actor uiteindelijk uit een sessie in de database komt.
export function checkActor(actor: { readonly userId: string; readonly sessionStrength: string }): void {
  if (actor.userId === '') throw new Error('withUser: lege userId');
  if (!STRENGTHS.has(actor.sessionStrength)) {
    throw new Error(`withUser: ongeldige sessiesterkte '${actor.sessionStrength}' (alleen password of mfa)`);
  }
}

class LeakedConnectionError extends Error {
  constructor() {
    super('withUser: verbinding begon niet als session_user; weggegooid');
  }
}

async function begin(client: PoolClient, actor: Actor, readOnly: boolean): Promise<void> {
  await client.query(readOnly ? 'begin read only' : 'begin');
  // Een verbinding met een andere rol dan waarmee hij inlogde, lekt van een vorige gebruiker: weigeren en weggooien.
  const { rows } = await client.query<{ clean: boolean }>('select current_user = session_user as clean');
  if (rows[0]?.clean !== true) throw new LeakedConnectionError();
  await client.query('set local role app_authenticated');
  // is_local = true: de waarden verdwijnen bij commit of rollback, ook achter een pooler in transaction mode.
  await client.query("select set_config('app.user_id', $1, true), set_config('app.session_strength', $2, true)", [
    actor.userId,
    actor.sessionStrength,
  ]);
}

// Eén transactie per request met rol app_authenticated, app.user_id en app.session_strength (framework §6).
// Foutvertaling (23505, 23503, 42501) volgt in stuk 3a.
export function createWithUser(pool: Pool): WithUser {
  return async (actor, work, options = {}) => {
    checkActor(actor);
    const client = await pool.connect();
    let destroy = false;
    try {
      await begin(client, actor, options.readOnly ?? false);
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      destroy = error instanceof LeakedConnectionError;
      await client.query('rollback').catch(() => {
        destroy = true;
      });
      throw error;
    } finally {
      client.release(destroy);
    }
  };
}
