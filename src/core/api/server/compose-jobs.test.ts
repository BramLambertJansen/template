import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { defineRoles, type RoleOf } from '../../shared/roles.ts';
import type { Auth, CreateAuthConfig, Invitation } from '../auth/index.ts';
import type { Tx, WithJob, WithUser } from '../db/types.ts';
import type { Env } from '../env.ts';
import { createApp, type App } from '../http/create-app.ts';
import type { RunningServer, ServeOptions } from '../http/serve.ts';
import { coreJobs, runJobsOnce, startJobs, type JobDefinition } from '../jobs/index.ts';
import type { Mail, SendMail } from '../mail/smtp.ts';
import { composeServer, type ServerConfig } from './compose.ts';

// Spec achtergrondtaken (namespace jobs): een fixture-app registreert een eigen taak zonder src/core te wijzigen
// (jobs/AC-29) en de opstartcontrole loopt vóór startServer, met de stopvolgorde jobs eerst (jobs/AC-44).
// Patroon van compose.test.ts: nagebootste parts, geen database, geen poort.

interface Services {
  readonly tag: 'services-van-de-test';
}
const roles = defineRoles({ planner: { beheer: false } });
const ENV: Env = {
  appEnv: 'test',
  appOrigin: 'https://app.example.test:8443',
  apiHost: '127.0.0.9',
  apiPort: 18_787,
  shutdownTimeoutMs: 4321,
  databaseUrl: 'postgres://api@db.example.test/app',
  authDatabaseUrl: 'postgres://auth@db.example.test/app',
  jobsDatabaseUrl: 'postgres://jobs@db.example.test/app',
  authBaseUrl: 'https://auth.example.test',
  authSecret: 'auth-geheim-voor-de-test-0123456789',
  smtpUrl: 'smtp://mail.example.test:2525',
  clientIpHeader: 'x-client-ip-van-de-test',
  webDir: undefined,
};

const settle = () => vi.advanceTimersByTimeAsync(0);

function harness(appJobs?: readonly JobDefinition[]) {
  const events: string[] = [];
  const closePool = vi.fn(() => {
    events.push('closePool');
    return Promise.resolve();
  });
  const purgeExpired = vi.fn<(signal?: AbortSignal) => Promise<unknown>>(() =>
    Promise.resolve({ session: 0, verification: 0, rateLimit: 0 }),
  );
  const auth = unsafeCast<Auth>(
    { api: {}, handler: () => Promise.resolve(new Response(null, { status: 204 })), closePool, purgeExpired },
    'test: alleen de onderdelen die de koppeling aanroept, geen echte Better Auth en geen pool',
  );
  const fakeTx = unsafeCast<Tx>({}, 'test: de nagebootste withUser en withJob gebruiken de transactie niet');
  const mailer = vi.fn<SendMail>(() => Promise.resolve());
  const parts = {
    withUser: vi.fn<WithUser>(async (_actor, work) => work(fakeTx, { role: null })),
    withJob: vi.fn<WithJob>(() => Promise.resolve({ ran: false })),
    pingDatabase: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    purgeAppTables: vi.fn<(withJob: WithJob, signal?: AbortSignal) => Promise<unknown>>(() => Promise.resolve()),
    checkJobsDatabase: vi.fn<() => Promise<void>>(() => {
      events.push('checkJobsDatabase');
      return Promise.resolve();
    }),
    closeDatabase: vi.fn<() => Promise<void>>(() => {
      events.push('closeDatabase');
      return Promise.resolve();
    }),
    createAuth: vi.fn<(config: CreateAuthConfig) => Auth>(() => auth),
    createMailer: vi.fn<(smtpUrl: string, from: string) => SendMail>(() => mailer),
    startServer: vi.fn<(app: unknown, options: ServeOptions) => Promise<RunningServer>>(() => {
      events.push('startServer');
      return Promise.resolve({ port: 0, stop: () => Promise.resolve() });
    }),
  };
  const config = {
    appName: 'Testapp',
    devLogin: {
      roles,
      seedAccounts: {
        user: { email: 'gebruiker@jobs.test', name: 'Gebruiker' },
        admin: { email: 'beheer@jobs.test', name: 'Beheerder' },
        planner: { email: 'planner@jobs.test', name: 'Planner' },
      },
    },
    invitationMail: (invitation: Invitation): Mail => ({ to: invitation.email, subject: 's', text: invitation.url }),
    loginRequiresMfa: () => () => Promise.resolve(false),
    createServices: (): Services => ({ tag: 'services-van-de-test' }),
    buildApp: (deps): App => createApp<Services>({ ...deps, roles }),
    ...(appJobs === undefined ? {} : { jobs: appJobs }),
  } satisfies ServerConfig<Services, RoleOf<typeof roles>>;
  const server = composeServer(config, ENV, parts);
  return { server, parts, auth, purgeExpired, closePool, events };
}

function appJob(run: JobDefinition['run']): JobDefinition {
  return { name: 'app.fixture', key: 100, intervalSeconds: 30, run };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('jobs/AC-29: een fixture-app registreert een eigen taak', () => {
  test('jobs/AC-29: via startJobs draait de app-taak (nummer ≥ 100) naast de kerntaken', async () => {
    const run = vi.fn<JobDefinition['run']>(() => Promise.resolve());
    const purgeExpired = vi.fn<(signal?: AbortSignal) => Promise<unknown>>(() => Promise.resolve());
    const withJob: WithJob = () => Promise.resolve({ ran: false });

    const jobs = startJobs({
      core: coreJobs({ purgeExpired, purgeAppTables: () => Promise.resolve() }),
      app: [appJob(run)],
      withJob,
    });
    await settle();

    const deps = run.mock.calls[0]?.[0];
    expect(deps?.withJob).toBe(withJob);
    expect(deps?.signal).toBeInstanceOf(AbortSignal);
    expect(purgeExpired).toHaveBeenCalledTimes(1);
    expect(purgeExpired).toHaveBeenCalledWith(expect.any(AbortSignal));
    await jobs.stop();
  });

  test('jobs/AC-29: via runJobsOnce draait de app-taak één ronde', async () => {
    const run = vi.fn<JobDefinition['run']>(() => Promise.resolve());
    const purgeExpired = vi.fn(() => Promise.resolve());
    const withJob: WithJob = () => Promise.resolve({ ran: false });

    await runJobsOnce({
      core: coreJobs({ purgeExpired, purgeAppTables: () => Promise.resolve() }),
      app: [appJob(run)],
      withJob,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(purgeExpired).toHaveBeenCalledTimes(1);
  });

  test('jobs/AC-29: coreJobs geeft core.purge_auth (1) en core.purge (2)', () => {
    const jobs = coreJobs({ purgeExpired: () => Promise.resolve(), purgeAppTables: () => Promise.resolve() });

    expect(jobs.map(({ name, key }) => ({ name, key }))).toStrictEqual([
      { name: 'core.purge_auth', key: 1 },
      { name: 'core.purge', key: 2 },
    ]);
  });

  test('jobs/AC-29: ServerConfig.jobs: composeServer start de app-taak met de withJob van parts, na startServer', async () => {
    const seen: string[] = [];
    const run = vi.fn<JobDefinition['run']>(async ({ withJob }) => {
      seen.push(withApp.events.join(','));
      await withJob({ name: 'app.fixture', key: 100 }, () => Promise.resolve(1));
    });
    const withApp = harness([appJob(run)]);

    await withApp.server.start();
    await settle();

    expect(run).toHaveBeenCalledTimes(1);
    expect(withApp.parts.withJob).toHaveBeenCalledWith({ name: 'app.fixture', key: 100 }, expect.any(Function));
    expect(seen[0]).toBe('checkJobsDatabase,startServer');
    await withApp.parts.startServer.mock.calls[0]?.[1].onStopped();
  });

  test('jobs/AC-29: composeServer start ook de kerntaak core.purge_auth met auth.purgeExpired', async () => {
    const h = harness();

    await h.server.start();
    await settle();

    expect(h.purgeExpired).toHaveBeenCalledTimes(1);
    await h.parts.startServer.mock.calls[0]?.[1].onStopped();
  });

  test('jobs/AC-29: zonder ServerConfig.jobs start composeServer alleen de kerntaken', async () => {
    const h = harness();

    await expect(h.server.start()).resolves.toBeDefined();
    await h.parts.startServer.mock.calls[0]?.[1].onStopped();
  });
});

describe('jobs/AC-44: opstartcontrole en stopvolgorde', () => {
  test('jobs/AC-44: composeServer roept checkJobsDatabase niet aan bij het bouwen, wel bij start() en vóór startServer', async () => {
    const h = harness();
    expect(h.parts.checkJobsDatabase).not.toHaveBeenCalled();

    await h.server.start();

    expect(h.parts.checkJobsDatabase).toHaveBeenCalledTimes(1);
    expect(h.events.slice(0, 2)).toStrictEqual(['checkJobsDatabase', 'startServer']);
    await h.parts.startServer.mock.calls[0]?.[1].onStopped();
  });

  test('jobs/AC-44: faalt checkJobsDatabase, dan geeft start() de fout terug en start de server niet', async () => {
    const run = vi.fn<JobDefinition['run']>(() => Promise.resolve());
    const h = harness([appJob(run)]);
    h.parts.checkJobsDatabase.mockRejectedValue(new Error('jobs-verbinding geweigerd'));

    // De stopmelding noemt de opstartcontrole en de foutklasse, niet de melding van pg (die host of poort kan bevatten).
    const failure = h.server.start();
    await expect(failure).rejects.toThrow(/^opstartcontrole: geen verbinding als app_jobs \(Error\)/);
    await expect(failure).rejects.not.toThrow('jobs-verbinding geweigerd');
    await vi.advanceTimersByTimeAsync(120_000);

    expect(h.parts.startServer).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(h.purgeExpired).not.toHaveBeenCalled();
  });

  test('jobs/AC-44: readiness blijft één ping als api_user: checkJobsDatabase hoort niet bij pingDatabase', async () => {
    const h = harness();
    await h.server.start();

    expect(h.parts.pingDatabase).not.toHaveBeenCalled();
    await h.parts.startServer.mock.calls[0]?.[1].onStopped();
  });

  test('jobs/AC-44: onStopped wacht eerst op de lopende taak (jobs.stop) en sluit dan pas de pools', async () => {
    let finish: () => void = () => undefined;
    const running = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const slow = harness([
      appJob(async () => {
        slow.events.push('job-start');
        await running;
        slow.events.push('job-klaar');
      }),
    ]);
    await slow.server.start();
    await settle();
    const options = slow.parts.startServer.mock.calls[0]?.[1];
    if (options === undefined) throw new Error('startServer niet aangeroepen');

    const stopped = options.onStopped();
    await vi.advanceTimersByTimeAsync(1000);
    expect(slow.events).not.toContain('closeDatabase');
    expect(slow.events).not.toContain('closePool');

    finish();
    await stopped;

    const after = slow.events.slice(slow.events.indexOf('job-klaar'));
    expect(after[0]).toBe('job-klaar');
    expect(after.slice(1).sort()).toStrictEqual(['closeDatabase', 'closePool']);
  });

  test('jobs/AC-44: na onStopped start er geen nieuwe ronde meer', async () => {
    const run = vi.fn<JobDefinition['run']>(() => Promise.resolve());
    const h = harness([appJob(run)]);
    await h.server.start();
    await settle();
    await h.parts.startServer.mock.calls[0]?.[1].onStopped();

    await vi.advanceTimersByTimeAsync(300_000);

    expect(run).toHaveBeenCalledTimes(1);
  });
});
