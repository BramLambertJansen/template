import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test, vi } from 'vitest';
import type { FileLimits } from '../../shared/limits.ts';
import { defineRoles, type RoleOf } from '../../shared/roles.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { Auth, CreateAuthConfig } from '../auth/index.ts';
import type { Tx, WithUser } from '../db/types.ts';
import type { SeedAccounts } from '../dev/seed-accounts.ts';
import type { Env } from '../env.ts';
import { createApp, type App } from '../http/create-app.ts';
import { parseErrorBody } from '../http/error-body.test-helper.ts';
import type { RunningServer, ServeOptions } from '../http/serve.ts';
import type { Mail, SendMail } from '../mail/smtp.ts';
import { composeServer, type ServerAppDeps } from './compose.ts';

// Spec files, AC-2: /api/dev/files/<token> bestaat alleen bij APP_ENV=local of test; bij staging en production 404 (NOT_FOUND).
// Dezelfde opzet als create-server/AC-2 in compose.test.ts: composeServer met nagebootste parts, geen database, geen open poort.
// Keuze volgens de koppelnotitie: ServerConfig.files = { limits, storage?, localDir? }; zonder storage en met local of test maakt
// composeServer de lokale adapter op localDir met de dev-route; buildApp geeft deps.files door aan createApp.

interface Fetchable {
  readonly fetch: (request: Request) => Response | Promise<Response>;
}

const roles = defineRoles({ planner: { beheer: false } });
const seedAccounts = {
  user: { email: 'gebruiker@files.test', name: 'Gebruiker' },
  admin: { email: 'beheer@files.test', name: 'Beheerder' },
  planner: { email: 'planner@files.test', name: 'Planner' },
} satisfies SeedAccounts<RoleOf<typeof roles>>;

const ENV: Env = {
  appEnv: 'local',
  appOrigin: 'https://app.example.test:8443',
  apiHost: '127.0.0.9',
  apiPort: 18_787,
  shutdownTimeoutMs: 4321,
  databaseUrl: 'postgres://api@db.example.test/app',
  authDatabaseUrl: 'postgres://auth@db.example.test/app',
  authBaseUrl: 'https://auth.example.test',
  authSecret: 'auth-geheim-voor-de-test-0123456789',
  smtpUrl: 'smtp://mail.example.test:2525',
  clientIpHeader: 'x-client-ip-van-de-test',
  webDir: undefined,
};

const LIMITS: FileLimits = {
  maxBytes: 1024,
  allowedTypes: ['application/pdf'],
  uploadUrlTtlSeconds: 300,
  downloadUrlTtlSeconds: 60,
  pendingTtlSeconds: 86_400,
  maxPerUser: 100,
  pageSize: 25,
};

const dir = mkdtempSync(path.join(tmpdir(), 'compose-files-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function harness(appEnv: Env['appEnv']): Fetchable {
  const auth = unsafeCast<Auth>(
    {
      api: { signInEmail: vi.fn(), getSession: vi.fn() },
      handler: vi.fn<(request: Request) => Promise<Response>>(() =>
        Promise.resolve(new Response(null, { status: 204 })),
      ),
      closePool: vi.fn(() => Promise.resolve()),
    },
    'test: alleen de onderdelen die de koppeling aanroept, geen echte Better Auth en geen pool',
  );
  const mailer = vi.fn<SendMail>(() => Promise.resolve());
  const fakeTx = unsafeCast<Tx>({}, 'test: de nagebootste withUser gebruikt de transactie niet');
  const parts = {
    withUser: vi.fn<WithUser>(async (_actor, work) => work(fakeTx, { role: null })),
    pingDatabase: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    closeDatabase: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    createAuth: vi.fn<(config: CreateAuthConfig) => Auth>(() => auth),
    createMailer: vi.fn<(smtpUrl: string, from: string) => SendMail>(() => mailer),
    startServer: vi.fn<(app: Fetchable, options: ServeOptions) => Promise<RunningServer>>(() =>
      Promise.resolve({ port: 0, stop: () => Promise.resolve() }),
    ),
  };
  const config = {
    appName: 'Testapp',
    devLogin: { roles, seedAccounts },
    invitationMail: (): Mail => ({ to: 'x@files.test', subject: 'x', text: 'x' }),
    loginRequiresMfa: () => () => Promise.resolve(true),
    createServices: () => ({}),
    buildApp: (deps: ServerAppDeps<object>): App => createApp<object>({ ...deps, roles }),
    files: { limits: LIMITS, localDir: dir },
  };
  return composeServer(config, { ...ENV, appEnv }, parts).app;
}

// Een token dat niet klopt: waar de route bestaat, geeft dat 403 (FORBIDDEN); waar hij niet bestaat, 404 (NOT_FOUND).
const PATH = '/api/dev/files/onbekend-token';

async function status(app: Fetchable, method: 'GET' | 'PUT'): Promise<[number, string]> {
  const response = await app.fetch(
    // Met een geldige Origin en application/json (de CSRF-eisen, ADR 0041; zoals de dev-login-test in compose.test.ts): buiten local en test hoort de route niet te bestaan,
    // dus het antwoord is 404 en niet eerst CSRF_REJECTED.
    new Request(`http://localhost${PATH}`, {
      method,
      headers: { origin: ENV.appOrigin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
      body: method === 'PUT' ? 'x' : null,
    }),
  );
  return [response.status, parseErrorBody(await response.json()).code];
}

describe('files/AC-2: de dev-route bestaat alleen bij APP_ENV=local of test', () => {
  test.each(['staging', 'production'] as const)(
    'files/AC-2: %s geeft 404 NOT_FOUND op GET en PUT /api/dev/files/<token>',
    async (appEnv) => {
      const app = harness(appEnv);

      expect(await status(app, 'GET')).toStrictEqual([404, 'NOT_FOUND']);
      expect(await status(app, 'PUT')).toStrictEqual([404, 'NOT_FOUND']);
    },
  );

  test.each(['local', 'test'] as const)(
    'files/AC-2: %s heeft de route (een ongeldig token geeft 403 FORBIDDEN, geen 404)',
    async (appEnv) => {
      const app = harness(appEnv);

      expect(await status(app, 'GET')).toStrictEqual([403, 'FORBIDDEN']);
      expect(await status(app, 'PUT')).toStrictEqual([403, 'FORBIDDEN']);
    },
  );
});
