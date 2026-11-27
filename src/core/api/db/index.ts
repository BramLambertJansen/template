import { env } from '../env.ts';
import { createPing, createPool } from './pool.ts';
import { createJobsCheck, createWithJob } from './with-job.ts';
export { purgeAppTables } from './purge-app.ts';
import { createWithUser } from './with-user.ts';

const { databaseUrl, jobsDatabaseUrl } = env();
const pool = createPool(databaseUrl);
// Achtergrondtaken als app_jobs (ADR 0050 punt 2): een eigen, kleinere pool; verbindt pas bij de eerste taak of de
// opstartcontrole. Twee plekken: een lopende batch en de opstartcontrole of een tweede taak tegelijk.
const JOBS_POOL_SIZE = 2;
const jobsPool = createPool(jobsDatabaseUrl, { applicationName: 'jobs', max: JOBS_POOL_SIZE });
// Verbinden en query elk hooguit 900 ms: samen korter dan de timeout van readiness (2 s, src/core/api/server/compose.ts), zodat de
// ping altijd vóór de volgende controle zelf eindigt.
const PING_TIMEOUT_MS = 900;
const ping = createPing(databaseUrl, PING_TIMEOUT_MS);

// De enige ingang naar de database (framework §1, §6): de rest van de module is intern.
export const withUser = createWithUser(pool);

// Eén batch van een achtergrondtaak als app_jobs met een advisory lock (ADR 0050 punt 1–2); alleen voor de runner, die hem
// meekrijgt van runServer (src/core/api/server.ts).
export const withJob = createWithJob(jobsPool);

// De opstartcontrole vóór startServer (ADR 0049 punt 3): kan de server als app_jobs verbinden? Faalt → de server start niet.
export const checkJobsDatabase = createJobsCheck(jobsPool);

// Alleen voor readiness (GET /api/ready, ADR 0049): leest niets, zet geen gebruiker, eigen verbinding.
export const pingDatabase = ping.ping;

// Alleen bij het stoppen van het proces (startServer, onStopped), na het stoppen van de runner: daarna faalt elke withUser()
// en elke withJob().
export async function closeDatabase(): Promise<void> {
  await Promise.all([pool.end(), ping.end(), jobsPool.end()]);
}

// De schakelaar van een koppeling (spec koppelingsregister); het register leest hem via readSwitch.
export { readIntegrationSwitch } from './integration-switch.ts';

export type { Actor, SessionStrength, Tx, WithUserOptions } from './with-user.ts';
export type { JobRef, JobResult, WithJob, WithJobOptions } from './types.ts';
