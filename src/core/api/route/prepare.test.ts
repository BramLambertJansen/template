import { EventEmitter } from 'node:events';
import { describe, expect, test } from 'vitest';
import type { SessionStrength } from '../../shared/can.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { createWithUser } from '../db/testing.ts';
import { AppError } from '../errors.ts';
import { createApp } from '../http/create-app.ts';
import { parseErrorBody } from '../http/error-body.test-helper.ts';
import { request } from '../http/request.test-helper.ts';
import { defineRoute, errors, fakeDeps, notesContract } from './fixture.test-helper.ts';

// Spec files, AC-30: de route kit in twee fasen (`defineRoute(contract, handler, { prepare })`). De echte createWithUser draait
// over een geïnstrumenteerde pool op de drivergrens (zoals src/core/api/db/with-user-outcome.test.ts), niet over de testkit
// beginTestDb (één vaste verbinding met savepoints, daar is "uitgegeven verbindingen" niet te meten). De pool telt connect en
// release, volgt begin/commit/rollback en telt de aanroepen van app.consume_rate_limit; de rol uit user_roles stelt de test in.

interface PoolState {
  readonly outstanding: number;
  readonly transactionOpen: boolean;
  readonly connects: number;
  readonly rateLimitCalls: number;
}

function instrumentedPool(role: string | null, retryAfter: number) {
  const counters = { outstanding: 0, transactionOpen: false, connects: 0, rateLimitCalls: 0 };
  const connect = () => {
    counters.connects += 1;
    counters.outstanding += 1;
    const client = Object.assign(new EventEmitter(), {
      query: (text: string) => {
        if (text.startsWith('begin')) counters.transactionOpen = true;
        if (text === 'commit' || text === 'rollback') counters.transactionOpen = false;
        if (text.includes('consume_rate_limit')) counters.rateLimitCalls += 1;
        let rows: unknown[] = [];
        if (text.includes('current_user')) rows = [{ clean: true }];
        else if (text.startsWith('select role')) rows = role === null ? [] : [{ role }];
        else if (text.includes('consume_rate_limit')) rows = [{ retry_after: retryAfter }];
        return Promise.resolve({ rows });
      },
      release: () => {
        counters.outstanding -= 1;
      },
    });
    return Promise.resolve(client);
  };
  const pool = unsafeCast<Parameters<typeof createWithUser>[0]>(
    { connect },
    'test: pg-drivergrens die connect en release telt',
  );
  return { pool, state: (): PoolState => ({ ...counters }) };
}

interface Seen {
  prepareCalls: number;
  handlerCalls: number;
  atPrepare: PoolState | undefined;
  prepareCtx: unknown;
}

interface Options {
  readonly role: string | null;
  readonly sessionStrength?: SessionStrength;
  readonly retryAfter?: number;
  // Wat prepare doet: slagen met een waarde of falen met STORAGE_UNAVAILABLE.
  readonly prepare?: 'slaagt' | 'faalt';
  // Of de handler ctx.prepared() aanroept.
  readonly usesPrepared?: boolean;
}

function scenario({
  role,
  sessionStrength = 'password',
  retryAfter = 0,
  prepare = 'slaagt',
  usesPrepared = true,
}: Options) {
  const db = instrumentedPool(role, retryAfter);
  const seen: Seen = { prepareCalls: 0, handlerCalls: 0, atPrepare: undefined, prepareCtx: undefined };
  const route = defineRoute(
    notesContract,
    async (ctx) => {
      seen.handlerCalls += 1;
      const prepared: unknown = usesPrepared ? await ctx.prepared() : 'niet gevraagd';
      return { id: ctx.input.id, by: typeof prepared === 'string' ? prepared : 'onbekend' };
    },
    {
      prepare: (ctx) => {
        seen.prepareCalls += 1;
        seen.atPrepare = db.state();
        seen.prepareCtx = ctx;
        return prepare === 'faalt'
          ? Promise.reject(new AppError('STORAGE_UNAVAILABLE'))
          : Promise.resolve('uit-prepare');
      },
    },
  );
  const deps = fakeDeps({ role: 'user', sessionStrength });
  const app = createApp({
    appOrigin: 'http://localhost:5173',
    auth: deps.auth,
    withUser: createWithUser(db.pool),
    routes: [route],
    errors,
  });
  return { app, db, seen };
}

async function outcome(response: Response): Promise<[number, string]> {
  const body: unknown = await response.json();
  return [response.status, response.ok ? 'ok' : parseErrorBody(body).code];
}

describe('files/AC-30: een route met prepare', () => {
  test('files/AC-30: tijdens prepare is er geen open transactie en houdt het request geen verbinding uit de pool vast', async () => {
    const t = scenario({ role: 'user' });

    const response = await request(t.app, '/api/notes/n1');

    expect(await response.json()).toStrictEqual({ id: 'n1', by: 'uit-prepare' });
    expect(t.seen.prepareCalls).toBe(1);
    expect(t.seen.atPrepare).toMatchObject({ outstanding: 0, transactionOpen: false });
    // De eerste withUser (alleen de rate limit) is af en de tweede nog niet begonnen.
    expect(t.seen.atPrepare?.connects).toBe(1);
  });

  test('files/AC-30: na het request zijn alle verbindingen vrijgegeven na precies twee withUser-aanroepen', async () => {
    const t = scenario({ role: 'user' });

    await request(t.app, '/api/notes/n1');

    expect(t.db.state()).toStrictEqual({ outstanding: 0, transactionOpen: false, connects: 2, rateLimitCalls: 1 });
  });

  test('files/AC-30: de rate limit telt precies één keer per request, ook als prepare faalt of de rol ontbreekt', async () => {
    const lopend = scenario({ role: 'user' });
    const falend = scenario({ role: 'user', prepare: 'faalt' });
    const zonderRol = scenario({ role: null, prepare: 'faalt' });

    for (const t of [lopend, falend, zonderRol]) await request(t.app, '/api/notes/n1');

    expect(lopend.db.state().rateLimitCalls).toBe(1);
    expect(falend.db.state().rateLimitCalls).toBe(1);
    expect(zonderRol.db.state().rateLimitCalls).toBe(1);
  });

  test('files/AC-30: een geblokkeerde rate limit geeft RATE_LIMITED vóór prepare en zonder tweede verbinding', async () => {
    const t = scenario({ role: 'user', retryAfter: 7 });

    const response = await request(t.app, '/api/notes/n1');

    expect(await outcome(response)).toStrictEqual([429, 'RATE_LIMITED']);
    expect(t.seen.prepareCalls).toBe(0);
    expect(t.seen.handlerCalls).toBe(0);
    expect(t.db.state().connects).toBe(1);
  });

  test('files/AC-30: ongeldige input geeft VALIDATION vóór prepare', async () => {
    const t = scenario({ role: 'user' });

    const response = await request(t.app, '/api/notes/n1?extra=1');

    expect(await outcome(response)).toStrictEqual([400, 'VALIDATION']);
    expect(t.seen.prepareCalls).toBe(0);
    expect(t.seen.handlerCalls).toBe(0);
    // De rate limit telde wel (spec rate-limit: ook een ongeldig verzoek telt mee).
    expect(t.db.state().rateLimitCalls).toBe(1);
  });

  test('files/AC-30: prepare krijgt input, actor zonder rol en services, en niets van de transactie', async () => {
    const t = scenario({ role: 'user' });

    await request(t.app, '/api/notes/n1');

    expect(t.seen.prepareCtx).toMatchObject({
      input: { id: 'n1' },
      actor: { userId: 'u1', sessionStrength: 'password' },
    });
    expect(t.seen.prepareCtx).toHaveProperty('services');
    expect(t.seen.prepareCtx).not.toHaveProperty('tx');
    expect(t.seen.prepareCtx).not.toHaveProperty('actor.role');
  });

  test('files/AC-30: een gebruiker zonder rol krijgt FORBIDDEN en niet STORAGE_UNAVAILABLE, ook als prepare faalt', async () => {
    const t = scenario({ role: null, prepare: 'faalt' });

    const response = await request(t.app, '/api/notes/n1');

    expect(await outcome(response)).toStrictEqual([403, 'FORBIDDEN']);
    expect(t.seen.prepareCalls).toBe(1);
    expect(t.seen.handlerCalls).toBe(0);
  });

  test('files/AC-30: een admin zonder MFA krijgt MFA_REQUIRED en niet STORAGE_UNAVAILABLE, ook als prepare faalt', async () => {
    const t = scenario({ role: 'admin', sessionStrength: 'password', prepare: 'faalt' });

    const response = await request(t.app, '/api/notes/n1');

    expect(await outcome(response)).toStrictEqual([403, 'MFA_REQUIRED']);
    expect(t.seen.prepareCalls).toBe(1);
    expect(t.seen.handlerCalls).toBe(0);
  });

  test('files/AC-30: een admin met MFA en een falende prepare krijgt pas STORAGE_UNAVAILABLE als de handler ctx.prepared() aanroept', async () => {
    const t = scenario({ role: 'admin', sessionStrength: 'mfa', prepare: 'faalt' });

    const response = await request(t.app, '/api/notes/n1');

    expect(await outcome(response)).toStrictEqual([503, 'STORAGE_UNAVAILABLE']);
    expect(t.seen.handlerCalls).toBe(1);
  });

  test('files/AC-30: een fout uit prepare komt niet in het antwoord als de handler ctx.prepared() niet aanroept', async () => {
    const t = scenario({ role: 'user', prepare: 'faalt', usesPrepared: false });

    const response = await request(t.app, '/api/notes/n1');

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ id: 'n1', by: 'niet gevraagd' });
    expect(t.seen.prepareCalls).toBe(1);
  });

  test('files/AC-30: de foutbody van een falende prepare is alleen { code, requestId }', async () => {
    const t = scenario({ role: 'user', prepare: 'faalt' });

    const response = await request(t.app, '/api/notes/n1');

    // parseErrorBody is strikt: een extra veld of een lege requestId laat hem falen.
    const body = parseErrorBody(await response.json());
    expect(body.code).toBe('STORAGE_UNAVAILABLE');
    expect(Object.keys(body).toSorted()).toStrictEqual(['code', 'requestId']);
  });
});

describe('files/AC-30: een route zonder prepare gedraagt zich als voorheen', () => {
  test('files/AC-30: één withUser-aanroep met de rate limit erin, en ctx.prepared bestaat niet', async () => {
    const db = instrumentedPool('user', 0);
    let keys: string[] = [];
    const route = defineRoute(notesContract, (ctx) => {
      keys = Object.keys(ctx);
      return { id: ctx.input.id, by: ctx.actor.name };
    });
    const deps = fakeDeps({ role: 'user', sessionStrength: 'password' });
    const app = createApp({
      appOrigin: 'http://localhost:5173',
      auth: deps.auth,
      withUser: createWithUser(db.pool),
      routes: [route],
      errors,
    });

    const response = await request(app, '/api/notes/n1');

    expect(await response.json()).toStrictEqual({ id: 'n1', by: 'Test' });
    expect(db.state()).toStrictEqual({ outstanding: 0, transactionOpen: false, connects: 1, rateLimitCalls: 1 });
    expect(keys).not.toContain('prepared');
  });
});
