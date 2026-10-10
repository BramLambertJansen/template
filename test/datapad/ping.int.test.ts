import { afterAll, describe, expect, test } from 'vitest';
import { createPing, type Ping } from '../../src/core/api/db/testing.ts';

// Readiness (ADR 0018): de ping van GET /api/ready slaagt als api_user, direct én via PgBouncer (transaction mode), en
// faalt bij een geweigerde login. Draait alleen via `pnpm test:db` in de runner (ADR 0009).
const TIMEOUT_MS = 1500;

function url(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} ontbreekt: draai via pnpm test:db`);
  return value;
}

const pings: Ping[] = [];
function ping(connectionString: string): Ping {
  const created = createPing(connectionString, TIMEOUT_MS);
  pings.push(created);
  return created;
}

afterAll(async () => {
  await Promise.all(pings.map(async (created) => created.end()));
});

describe.each([
  { name: 'direct', variable: 'DATABASE_URL' },
  { name: 'via PgBouncer (transaction mode)', variable: 'POOLER_DATABASE_URL' },
])('ping $name', ({ variable }) => {
  test('slaagt als api_user zonder withUser(), ook herhaald op dezelfde verbinding', async () => {
    const { ping: run } = ping(url(variable));
    await expect(run()).resolves.toBeUndefined();
    await expect(run()).resolves.toBeUndefined();
  });

  test('faalt bij een geweigerde login', async () => {
    const bad = new URL(url(variable));
    // Het juiste wachtwoord met één teken erbij: dezelfde rol, maar Postgres weigert de login (scram).
    bad.password += 'x';
    await expect(ping(bad.toString()).ping()).rejects.toThrow();
  });
});
