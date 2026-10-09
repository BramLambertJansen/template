import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import { translateDatabaseError } from '../errors.ts';

import type { Actor, ActorRole, WithUser } from './types.ts';

export type { Actor, ActorRole, SessionStrength, Tx, WithUser, WithUserOptions } from './types.ts';

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

// De actor-stap binnen een open transactie; ook gebruikt door de testkit (testing.ts), daar binnen een savepoint.
export async function enterActor(client: PoolClient, actor: Actor): Promise<ActorRole> {
  // Een verbinding met een andere rol dan waarmee hij inlogde, lekt van een vorige gebruiker: weigeren en weggooien.
  const { rows } = await client.query<{ clean: boolean }>('select current_user = session_user as clean');
  if (rows[0]?.clean !== true) throw new LeakedConnectionError();
  await client.query('set local role app_authenticated');
  // is_local = true: de waarden verdwijnen bij commit of rollback, ook achter een pooler in transaction mode.
  await client.query("select set_config('app.user_id', $1, true), set_config('app.session_strength', $2, true)", [
    actor.userId,
    actor.sessionStrength,
  ]);
  // De rol hoort bij elke request (framework §6); de policy user_roles_select_own laat alleen de eigen rij zien.
  const { rows: roles } = await client.query<{ role: string }>(
    'select role from public.user_roles where user_id = $1',
    [actor.userId],
  );
  const role = roles[0]?.role;
  return { role: role === 'user' || role === 'admin' ? role : null };
}

// Eén transactie per request met rol app_authenticated, app.user_id en app.session_strength (framework §6).
// Databasefouten worden vertaald naar AppError (src/core/api/errors.ts).
export function createWithUser(pool: Pool): WithUser {
  return async (actor, work, options = {}) => {
    checkActor(actor);
    const client = await pool.connect();
    let destroy = false;
    try {
      await client.query(options.readOnly === true ? 'begin read only' : 'begin');
      const actorRole = await enterActor(client, actor);
      const result = await work(drizzle({ client }), actorRole);
      await client.query('commit');
      return result;
    } catch (error) {
      destroy = error instanceof LeakedConnectionError;
      await client.query('rollback').catch(() => {
        destroy = true;
      });
      throw translateDatabaseError(error);
    } finally {
      client.release(destroy);
    }
  };
}
