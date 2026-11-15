import { expect, test, vi } from 'vitest';
import { defineRoles } from '../../shared/roles.ts';
import { TEMPLATE_VERSION } from '../../shared/template-version.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { Auth, CreateAuthConfig } from '../auth/index.ts';
import type { Tx, WithUser } from '../db/types.ts';
import type { Env } from '../env.ts';
import { createApp, type App } from '../http/create-app.ts';
import type { RunningServer, ServeOptions } from '../http/serve.ts';
import type { Mail, SendMail } from '../mail/smtp.ts';
import { composeServer, type ServerAppDeps } from './compose.ts';

// Spec release-versie (docs/template/specs/release-versie.md), AC-8, het deel van core: composeServer geeft `build` in de
// deps aan buildApp als env.buildSha gezet is, en laat de sleutel anders weg. Nagebootste parts, geen database en geen
// open poort (de vorm van compose.test.ts).
interface Services {
  readonly tag: 'services-van-de-test';
}
interface Fetchable {
  readonly fetch: (request: Request) => Response | Promise<Response>;
}

const roles = defineRoles({});
const seedAccounts = {
  user: { email: 'gebruiker@compose.test', name: 'Gebruiker' },
  admin: { email: 'beheer@compose.test', name: 'Beheerder' },
};

// appEnv 'test': zonder dev-login, zodat alleen `build` het verschil tussen de gevallen is.
const ENV: Env = {
  appEnv: 'test',
  appOrigin: 'https://app.example.test:8443',
  apiHost: '127.0.0.9',
  apiPort: 18_787,
  shutdownTimeoutMs: 4321,
  databaseUrl: 'postgres://db.example.test/app',
  authDatabaseUrl: 'postgres://db.example.test/auth',
  authBaseUrl: 'https://auth.example.test',
  authSecret: 'ab12'.repeat(10),
  smtpUrl: 'smtp://mail.example.test:2525',
  clientIpHeader: 'x-client-ip-van-de-test',
  webDir: undefined,
};

function fakeParts() {
  const auth = unsafeCast<Auth>(
    {
      api: { getSession: () => Promise.resolve({ headers: new Headers(), response: null }) },
      handler: () => Promise.resolve(new Response(null, { status: 204 })),
      closePool: () => Promise.resolve(),
    },
    'test: alleen de onderdelen die de koppeling aanroept, geen echte Better Auth en geen pool',
  );
  const fakeTx = unsafeCast<Tx>({}, 'test: de nagebootste withUser gebruikt de transactie niet');
  return {
    withUser: vi.fn<WithUser>(async (_actor, work) => work(fakeTx, { role: null })),
    pingDatabase: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    closeDatabase: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    createAuth: vi.fn<(config: CreateAuthConfig) => Auth>(() => auth),
    createMailer: vi.fn<(smtpUrl: string, from: string) => SendMail>(() => () => Promise.resolve()),
    startServer: vi.fn<(app: Fetchable, options: ServeOptions) => Promise<RunningServer>>(() =>
      Promise.resolve({ port: 0, stop: () => Promise.resolve() }),
    ),
  };
}

// Stelt de koppeling samen; `received` zijn de deps die buildApp krijgt.
function harness(env: Env) {
  const received: ServerAppDeps<Services>[] = [];
  const services: Services = { tag: 'services-van-de-test' };
  const mail: Mail = { to: 'nieuw@compose.test', subject: 'Uitnodiging van de test', text: 'tekst' };
  const server = composeServer(
    {
      appName: 'Testapp',
      devLogin: { roles, seedAccounts },
      invitationMail: () => mail,
      loginRequiresMfa: () => () => Promise.resolve(true),
      createServices: () => services,
      buildApp: (deps: ServerAppDeps<Services>): App => {
        received.push(deps);
        return createApp<Services>({ ...deps, roles });
      },
    },
    env,
    fakeParts(),
  );
  const [deps] = received;
  if (deps === undefined || received.length !== 1) throw new Error('buildApp is niet precies één keer aangeroepen');
  return { server, deps };
}

async function health(app: Fetchable): Promise<unknown> {
  const response = await app.fetch(new Request('http://localhost/api/health'));
  expect(response.status).toBe(200);
  return response.json();
}

test('release-versie/AC-8: met env.buildSha krijgt buildApp `build` in de deps en toont /api/health hem', async () => {
  const h = harness({ ...ENV, buildSha: 'abc1234' });

  expect(h.deps.build).toBe('abc1234');
  expect(await health(h.server.app)).toStrictEqual({ ok: true, version: TEMPLATE_VERSION, build: 'abc1234' });
});

test.each([
  ['zonder het veld buildSha', ENV],
  ['met buildSha undefined', { ...ENV, buildSha: undefined }],
])('release-versie/AC-8: %s ontbreekt de sleutel build in de deps en in /api/health', async (_case, env) => {
  const h = harness(env);

  expect(Object.keys(h.deps)).not.toContain('build');
  expect(await health(h.server.app)).toStrictEqual({ ok: true, version: TEMPLATE_VERSION });
});

test('release-versie/AC-8: de volledige veertig tekens komen ongewijzigd door', async () => {
  const sha = '0123456789abcdef'.repeat(2) + '01234567';
  const h = harness({ ...ENV, buildSha: sha });

  expect(h.deps.build).toBe(sha);
  expect(await health(h.server.app)).toMatchObject({ build: sha });
});
