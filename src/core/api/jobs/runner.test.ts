import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from 'vitest';
import { JOBS_INTERVAL_SECONDS } from '../../shared/limits.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { Tx, WithJob } from '../db/types.ts';
import { CORE_JOB_KEYS, runJobsOnce, startJobs, validateJobs, type JobDefinition, type JobsConfig } from './index.ts';

// Spec achtergrondtaken (namespace jobs), deel C: register en nummerbereik (jobs/AC-24), de lus met eerste ronde direct en
// geen overlap (jobs/AC-25), foutlog zonder bericht en zonder unhandled rejection (jobs/AC-26) en runJobsOnce (jobs/AC-28).
// Zonder database: een nagebootste withJob en nagebootste timers (vi.useFakeTimers).

const fakeTx = unsafeCast<Tx>({}, 'test: de nagebootste withJob gebruikt de transactie niet');
const withJob: WithJob = async (_job, work) => ({ ran: true, value: await work(fakeTx) });

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Run = JobDefinition['run'];
// De runner geeft elke ronde { withJob, signal } mee.
function expectDeps(run: Mock<Run>): void {
  const deps = run.mock.calls[0]?.[0];
  expect(deps?.withJob).toBeTypeOf('function');
  expect(deps?.signal).toBeInstanceOf(AbortSignal);
}
const job = ([name, key]: readonly [string, number], run: Run, intervalSeconds?: number): JobDefinition => ({
  name,
  key,
  run,
  ...(intervalSeconds === undefined ? {} : { intervalSeconds }),
});
const idle: Run = () => Promise.resolve();

type LogLine = Record<string, unknown>;
function config(parts: Partial<JobsConfig> & { log?: (line: LogLine) => void } = {}) {
  return { core: [], app: [], withJob, ...parts } satisfies JobsConfig;
}

// Laat lopende microtaken en timers van 0 ms draaien.
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('register en nummerbereik', () => {
  test('jobs/AC-24: CORE_JOB_KEYS heeft purgeAuth 1 en purge 2', () => {
    expect(CORE_JOB_KEYS).toStrictEqual({ purgeAuth: 1, purge: 2 });
  });

  test('jobs/AC-24: een geldig register (core 1 t/m 99, app vanaf 100) gooit niet', () => {
    expect(() => {
      validateJobs({
        core: [job(['core.a', 1], idle), job(['core.b', 99], idle)],
        app: [job(['app.a', 100], idle), job(['app.max', 2_147_483_647], idle)],
      });
    }).not.toThrow();
  });

  test.each([
    ['dubbel nummer binnen core', [job(['core.a', 5], idle), job(['core.b', 5], idle)], []],
    ['dubbel nummer binnen app', [], [job(['app.a', 100], idle), job(['app.b', 100], idle)]],
    ['core-taak 100 (≥ 100)', [job(['core.a', 100], idle)], []],
    ['core-taak 0 (< 1)', [job(['core.a', 0], idle)], []],
    ['app-taak 99 (< 100)', [], [job(['app.a', 99], idle)]],
    ['app-taak 1 (botst met core-bereik)', [], [job(['app.a', 1], idle)]],
    ['app-taak boven int4 (2147483648)', [], [job(['app.a', 2_147_483_648], idle)]],
    ['niet-geheel nummer', [], [job(['app.a', 100.5], idle)]],
    ['NaN als nummer', [], [job(['app.a', Number.NaN], idle)]],
  ])('jobs/AC-24: validateJobs gooit bij %s', (_label, core, app) => {
    expect(() => {
      validateJobs({ core, app });
    }).toThrow();
  });

  test('jobs/AC-24: startJobs gooit bij opstart bij een dubbel nummer, en er draait geen taak', async () => {
    const run = vi.fn<Run>(idle);

    expect(() =>
      startJobs(config({ core: [job(['core.a', 1], run)], app: [job(['app.a', 100], run), job(['app.b', 100], run)] })),
    ).toThrow();
    await vi.advanceTimersByTimeAsync(JOBS_INTERVAL_SECONDS * 1000);

    expect(run).not.toHaveBeenCalled();
  });

  test('jobs/AC-24: startJobs gooit bij een core-taak met nummer ≥ 100', () => {
    expect(() => startJobs(config({ core: [job(['core.a', 100], idle)] }))).toThrow();
  });

  test('jobs/AC-24: startJobs gooit bij een app-taak met nummer < 100', () => {
    expect(() => startJobs(config({ app: [job(['app.a', 99], idle)] }))).toThrow();
  });
});

describe('startJobs: eerste ronde direct, interval na het einde, geen overlap', () => {
  test('jobs/AC-25: de eerste ronde start direct, met de deps van de config', async () => {
    const run = vi.fn<Run>(idle);
    const jobs = startJobs(config({ app: [job(['app.a', 100], run)] }));

    await settle();

    expect(run).toHaveBeenCalledTimes(1);
    expectDeps(run);
    await jobs.stop();
  });

  test('jobs/AC-25: zonder intervalSeconds geldt JOBS_INTERVAL_SECONDS, geteld vanaf het einde van de vorige ronde', async () => {
    const run = vi.fn<Run>(idle);
    const jobs = startJobs(config({ app: [job(['app.a', 100], run)] }));
    await settle();

    await vi.advanceTimersByTimeAsync(JOBS_INTERVAL_SECONDS * 1000 - 1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(JOBS_INTERVAL_SECONDS * 1000);
    expect(run).toHaveBeenCalledTimes(3);
    await jobs.stop();
  });

  test('jobs/AC-25: een eigen intervalSeconds wordt gebruikt', async () => {
    const run = vi.fn<Run>(idle);
    const jobs = startJobs(config({ app: [job(['app.a', 100], run, 5)] }));
    await settle();

    await vi.advanceTimersByTimeAsync(4999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await jobs.stop();
  });

  test('jobs/AC-25: een taak die langer duurt dan het interval start niet opnieuw voordat hij klaar is', async () => {
    const pending = deferred();
    const run = vi.fn<Run>(() => pending.promise);
    const jobs = startJobs(config({ app: [job(['app.a', 100], run, 10)] }));
    await settle();

    await vi.advanceTimersByTimeAsync(35_000);
    expect(run).toHaveBeenCalledTimes(1);

    pending.resolve();
    await settle();
    // Het interval telt vanaf het einde van de ronde, niet vanaf het begin.
    await vi.advanceTimersByTimeAsync(9999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await jobs.stop();
  });

  test('jobs/AC-25: taken lopen elk in een eigen lus, ook als een andere taak blijft hangen', async () => {
    const stuck = deferred();
    const slow = vi.fn<Run>(() => stuck.promise);
    const fast = vi.fn<Run>(idle);
    const jobs = startJobs(
      config({ core: [job(['core.slow', 1], slow, 10)], app: [job(['app.fast', 100], fast, 10)] }),
    );
    await settle();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(slow).toHaveBeenCalledTimes(1);
    expect(fast).toHaveBeenCalledTimes(4);
    stuck.resolve();
    await jobs.stop();
  });
});

describe('startJobs: fout in een taak', () => {
  test('jobs/AC-26: een taak die gooit geeft één logregel met taaknaam, uitkomst, duur en klasse, zonder bericht of adres', async () => {
    const log = vi.fn<(line: LogLine) => void>();
    const secretMessage = 'connect ECONNREFUSED postgres://app_jobs:geheimwoord@db.intern.example:5432/app';
    const jobs = startJobs(
      config({
        log,
        app: [
          job(['app.kapot', 100], () => {
            vi.advanceTimersByTime(7);
            return Promise.reject(new Error(secretMessage));
          }),
        ],
      }),
    );
    await settle();

    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0]?.[0];
    expect(line).toMatchObject({ job: 'app.kapot', outcome: 'error', errorClass: 'Error' });
    expect(typeof line?.['durationMs']).toBe('number');
    const text = JSON.stringify(line);
    for (const verboden of ['ECONNREFUSED', 'geheimwoord', 'db.intern.example', 'postgres://', 'message']) {
      expect(text).not.toContain(verboden);
    }
    await jobs.stop();
  });

  test('jobs/AC-26: een pg-fout met code wordt DatabaseError:<sqlstate>, nooit het bericht', async () => {
    class DatabaseError extends Error {
      readonly code = '57014';
    }
    const log = vi.fn<(line: LogLine) => void>();
    const jobs = startJobs(
      config({
        log,
        app: [job(['app.timeout', 100], () => Promise.reject(new DatabaseError('canceling statement: select secret')))],
      }),
    );
    await settle();

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'app.timeout', outcome: 'error', errorClass: 'DatabaseError:57014' }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('select secret');
    await jobs.stop();
  });

  // Review #1032: Drizzle verpakt de pg-fout in een DrizzleQueryError met de driverfout in `cause`; de SQLSTATE moet
  // ook dan in de log staan, zonder de melding van een van beide.
  test('jobs/AC-26: een verpakte pg-fout (cause) logt de klasse en SQLSTATE van de driverfout, nooit een bericht', async () => {
    class DatabaseError extends Error {
      readonly code = '42883';
    }
    class DrizzleQueryError extends Error {}
    const wrapped = new DrizzleQueryError('Failed query: select app.purge_expired(secret)', {
      cause: new DatabaseError('function app.purge_expired does not exist'),
    });
    const log = vi.fn<(line: LogLine) => void>();
    const jobs = startJobs(config({ log, app: [job(['app.wrapped', 100], () => Promise.reject(wrapped))] }));
    await settle();

    expect(log).toHaveBeenCalledWith(expect.objectContaining({ errorClass: 'DatabaseError:42883' }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(log.mock.calls)).not.toContain('does not exist');
    await jobs.stop();
  });

  test('jobs/AC-26: een fout zonder pg-code logt de naam van de constructor', async () => {
    class VerbindingFout extends Error {}
    const log = vi.fn<(line: LogLine) => void>();
    const jobs = startJobs(config({ log, app: [job(['app.a', 100], () => Promise.reject(new VerbindingFout('x')))] }));
    await settle();

    expect(log).toHaveBeenCalledWith(expect.objectContaining({ errorClass: 'VerbindingFout' }));
    await jobs.stop();
  });

  test('jobs/AC-26: een geslaagde ronde logt niets', async () => {
    const log = vi.fn<(line: LogLine) => void>();
    const jobs = startJobs(config({ log, app: [job(['app.a', 100], idle, 1)] }));

    await vi.advanceTimersByTimeAsync(3000);

    expect(log).not.toHaveBeenCalled();
    await jobs.stop();
  });

  test('jobs/AC-26: na een fout draait de volgende ronde, en een geslaagde ronde daarna logt niets', async () => {
    const log = vi.fn<(line: LogLine) => void>();
    const run = vi.fn<Run>().mockRejectedValueOnce(new Error('eerste ronde faalt')).mockResolvedValue(undefined);
    const jobs = startJobs(config({ log, app: [job(['app.a', 100], run, 10)] }));
    await settle();
    expect(log).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(run).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
    await jobs.stop();
  });

  // Vitest laat de run falen bij een unhandled rejection; deze test hoeft daarom alleen een falende taak te laten lopen en te stoppen.
  test('jobs/AC-26: geen unhandled rejection bij een falende taak (ook niet bij het stoppen)', async () => {
    const jobs = startJobs(
      config({ log: () => undefined, app: [job(['app.a', 100], () => Promise.reject(new Error('x')), 1)] }),
    );
    await vi.advanceTimersByTimeAsync(3000);
    await expect(jobs.stop()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(0);
  });

  test('jobs/AC-26: zonder eigen log schrijft de standaardlog een JSON-regel zonder het bericht', async () => {
    const write = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const jobs = startJobs({
      core: [],
      app: [job(['app.standaard', 100], () => Promise.reject(new Error('ECONNREFUSED db.intern.example')))],
      withJob,
    });
    await settle();

    expect(write).toHaveBeenCalledTimes(1);
    const text = String(write.mock.calls[0]?.[0]);
    expect(JSON.parse(text)).toMatchObject({ job: 'app.standaard', outcome: 'error', errorClass: 'Error' });
    expect(text).not.toContain('ECONNREFUSED');
    expect(text).not.toContain('db.intern.example');
    await jobs.stop();
  });
});

describe('startJobs: stoppen', () => {
  test('jobs/AC-25: stop() wacht op een lopende ronde en start daarna geen nieuwe ronde', async () => {
    const pending = deferred();
    const run = vi.fn<Run>(() => pending.promise);
    const jobs = startJobs(config({ app: [job(['app.a', 100], run, 5)] }));
    await settle();

    let stopped = false;
    const stopping = jobs.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(stopped).toBe(false);

    pending.resolve();
    await stopping;
    await vi.advanceTimersByTimeAsync(60_000);

    expect(stopped).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('jobs/AC-27: stop() breekt het signaal van een lopende run af en wacht tot die klaar is', async () => {
    const pending = deferred();
    let signal: AbortSignal | undefined;
    const run = vi.fn<Run>((jobDeps) => {
      signal = jobDeps.signal;
      return pending.promise;
    });
    const jobs = startJobs(config({ app: [job(['app.a', 100], run, 5)] }));
    await settle();
    expect(signal?.aborted).toBe(false);

    const stopping = jobs.stop();
    await settle();

    expect(signal?.aborted).toBe(true);
    pending.resolve();
    await stopping;
  });

  test('jobs/AC-25: stop() zonder lopende ronde lost op en daarna start er niets meer', async () => {
    const run = vi.fn<Run>(idle);
    const jobs = startJobs(config({ app: [job(['app.a', 100], run, 5)] }));
    await settle();

    await jobs.stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('runJobsOnce', () => {
  test('jobs/AC-28: draait elke taak (core en app) precies één ronde, met de deps', async () => {
    const core = vi.fn<Run>(idle);
    const app = vi.fn<Run>(idle);

    await runJobsOnce(config({ core: [job(['core.a', 1], core, 5)], app: [job(['app.a', 100], app, 5)] }));
    await vi.advanceTimersByTimeAsync(120_000);

    expect(core).toHaveBeenCalledTimes(1);
    expectDeps(core);
    expect(app).toHaveBeenCalledTimes(1);
    expectDeps(app);
  });

  test('jobs/AC-28: draait de taken parallel en wacht tot alle klaar zijn', async () => {
    const first = deferred();
    const second = deferred();
    const a = vi.fn<Run>(() => first.promise);
    const b = vi.fn<Run>(() => second.promise);
    let done = false;

    const once = runJobsOnce(config({ core: [job(['core.a', 1], a)], app: [job(['app.b', 100], b)] })).then(() => {
      done = true;
    });
    await settle();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    first.resolve();
    await settle();
    expect(done).toBe(false);

    second.resolve();
    await once;
    expect(done).toBe(true);
  });

  test('jobs/AC-28: een falende taak wordt gelogd als in de lus; de andere taak draait en runJobsOnce gooit niet', async () => {
    const log = vi.fn<(line: LogLine) => void>();
    const other = vi.fn<Run>(idle);

    await runJobsOnce(
      config({
        log,
        core: [job(['core.kapot', 1], () => Promise.reject(new Error('geheime melding')))],
        app: [job(['app.a', 100], other)],
      }),
    );

    expect(other).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'core.kapot', outcome: 'error', errorClass: 'Error' }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('geheime melding');
  });
});
