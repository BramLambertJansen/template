import type { WithJob } from '../db/types.ts';
import { JOBS_INTERVAL_SECONDS } from '../../shared/limits.ts';
import { MAX_CORE_JOB_KEY, MAX_JOB_KEY, MIN_APP_JOB_KEY } from './lock.ts';

// Wat een taak per ronde krijgt: withJob voor elke batch, en een signaal dat stop() afbreekt. Een taak met meer batches start
// na de abort geen nieuwe batch (drainBatches doet dat al); de lopende batch maakt zijn transactie af.
export interface JobDeps {
  readonly withJob: WithJob;
  readonly signal: AbortSignal;
}

export interface JobDefinition {
  // Voor de log (bijv. 'core.purge' of 'app.reminders'); geen gegevens.
  readonly name: string;
  // Het taaknummer, de tweede sleutel van de advisory lock: 1–99 core, vanaf 100 de app.
  readonly key: number;
  // Tijd tussen het einde van een ronde en het begin van de volgende; standaard JOBS_INTERVAL_SECONDS.
  readonly intervalSeconds?: number;
  readonly run: (deps: JobDeps) => Promise<void>;
}

export type JobLog = (line: Readonly<Record<string, unknown>>) => void;

export interface JobsConfig {
  readonly core: readonly JobDefinition[];
  readonly app: readonly JobDefinition[];
  readonly withJob: WithJob;
  readonly log?: JobLog;
}

export interface JobsRunner {
  // Geen nieuwe ronde of batch meer; resolve't als elke lopende ronde klaar is.
  readonly stop: () => Promise<void>;
}

// Eén JSON-regel op stdout, net als de request-log (src/core/api/obs/request-log.ts).
const writeJobLine: JobLog = (line) => {
  console.log(JSON.stringify(line));
};

interface KeyRange {
  readonly min: number;
  readonly max: number;
  readonly zone: 'core' | 'app';
}

function checkKey(job: JobDefinition, { min, max, zone }: KeyRange): void {
  if (!Number.isInteger(job.key) || job.key < min || job.key > max) {
    throw new Error(
      `Achtergrondtaak ${job.name}: nummer ${String(job.key)} ligt niet in ${String(min)}–${String(max)} (${zone})`,
    );
  }
}

// Bij opstart (spec achtergrondtaken, OV-C2): elk nummer uniek, core 1–99, app vanaf 100 en binnen int4.
export function validateJobs(config: Pick<JobsConfig, 'core' | 'app'>): void {
  for (const job of config.core) checkKey(job, { min: 1, max: MAX_CORE_JOB_KEY, zone: 'core' });
  for (const job of config.app) checkKey(job, { min: MIN_APP_JOB_KEY, max: MAX_JOB_KEY, zone: 'app' });
  const seen = new Set<number>();
  for (const job of [...config.core, ...config.app]) {
    if (seen.has(job.key)) throw new Error(`Achtergrondtaak ${job.name}: nummer ${String(job.key)} is al in gebruik`);
    seen.add(job.key);
  }
  for (const job of [...config.core, ...config.app]) {
    const interval = job.intervalSeconds;
    if (interval !== undefined && !(Number.isFinite(interval) && interval > 0)) {
      throw new Error(`Achtergrondtaak ${job.name}: interval moet een positief aantal seconden zijn`);
    }
  }
}

// De foutklasse zonder melding (R-SEC-02): de naam van de klasse, en voor een databasefout de SQLSTATE. Nooit message, SQL of
// adres.
export function errorClass(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const name = error.constructor.name || 'Error';
  const code: unknown = Reflect.get(error, 'code');
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? `${name}:${code}` : name;
}

// Eén ronde van één taak; gooit nooit. Een fout wordt gelogd en stopt het proces niet (spec achtergrondtaken, AC-26).
async function runRound(job: JobDefinition, deps: JobDeps, log: JobLog): Promise<void> {
  const started = performance.now();
  try {
    await job.run(deps);
  } catch (error) {
    log({
      time: new Date().toISOString(),
      job: job.name,
      outcome: 'error',
      durationMs: Math.round(performance.now() - started),
      errorClass: errorClass(error),
    });
  }
}

// Wacht ms, of korter als het signaal afbreekt.
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

// Per taak een eigen lus: eerst direct een ronde, dan het interval ná het einde van die ronde. Zo draait een taak in dit proces
// nooit twee keer tegelijk (AC-25); over instanties heen bewaakt de advisory lock dat.
async function loop(job: JobDefinition, deps: JobDeps, log: JobLog): Promise<void> {
  const intervalMs = (job.intervalSeconds ?? JOBS_INTERVAL_SECONDS) * 1000;
  while (!deps.signal.aborted) {
    await runRound(job, deps, log);
    await pause(intervalMs, deps.signal);
  }
}

// De runner in het API-proces (ADR 0050 punt 1). Maakt zelf geen verbinding: withJob komt van runServer.
export function startJobs(config: JobsConfig): JobsRunner {
  validateJobs(config);
  const controller = new AbortController();
  const deps: JobDeps = { withJob: config.withJob, signal: controller.signal };
  const log = config.log ?? writeJobLine;
  const loops = [...config.core, ...config.app].map((job) => loop(job, deps, log));
  return {
    stop: async () => {
      controller.abort();
      await Promise.all(loops);
    },
  };
}

// Eén ronde van elke taak, parallel, en wachten tot alle klaar zijn: voor een adapter van een host die naar nul schaalt
// (ADR 0050 punt 7; de template levert geen adapter).
export async function runJobsOnce(config: JobsConfig): Promise<void> {
  validateJobs(config);
  const deps: JobDeps = { withJob: config.withJob, signal: new AbortController().signal };
  const log = config.log ?? writeJobLine;
  await Promise.all([...config.core, ...config.app].map((job) => runRound(job, deps, log)));
}
