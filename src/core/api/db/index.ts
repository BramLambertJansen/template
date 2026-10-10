import { env } from '../env.ts';
import { createPing, createPool } from './pool.ts';
import { createWithUser } from './with-user.ts';

const pool = createPool(env().databaseUrl);

// De enige ingang naar de database (framework §1, §6): de rest van de module is intern.
export const withUser = createWithUser(pool);

// Alleen voor readiness (GET /api/ready, src/core/api/http/readiness.ts): leest niets, zet geen gebruiker.
export const pingDatabase = createPing(pool);

// Alleen bij het stoppen van het proces (startServer, onStopped): daarna faalt elke withUser().
export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export type { Actor, SessionStrength, Tx, WithUserOptions } from './with-user.ts';
