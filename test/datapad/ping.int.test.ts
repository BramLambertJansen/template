import { afterAll, expect, test } from 'vitest';
import { createPing, createPool } from '../../src/core/api/db/testing.ts';

// Readiness (roadmap stuk 7): de ping van GET /api/ready slaagt tegen de echte database en faalt bij een geweigerde login.
// Draait alleen via `pnpm test:db` in de runner (ADR 0009).
function databaseUrl(): string {
  const value = process.env['DATABASE_URL'];
  if (value === undefined || value === '') throw new Error('DATABASE_URL ontbreekt: draai via pnpm test:db');
  return value;
}

const pool = createPool(databaseUrl());
const badUrl = new URL(databaseUrl());
// Het juiste wachtwoord met één teken erbij: dezelfde rol, maar Postgres weigert de login (scram).
badUrl.password += 'x';
const badPool = createPool(badUrl.toString());

afterAll(async () => {
  await Promise.all([pool.end(), badPool.end()]);
});

test('ping als api_user slaagt zonder withUser()', async () => {
  await expect(createPing(pool)()).resolves.toBeUndefined();
});

test('ping met een geweigerde login faalt', async () => {
  await expect(createPing(badPool)()).rejects.toThrow();
});
