import { authGateway, type Auth, type AuthGateway, type CreateAuthConfig, type Invitation } from '../auth/index.ts';
import type { WithUser } from '../db/types.ts';
import { createDevLogin, devAuthSteps, type DevLoginConfig } from '../dev/login-as.ts';
import type { Env } from '../env.ts';
import type { App, DevLogin } from '../http/create-app.ts';
import { createReadiness, type Readiness } from '../http/readiness.ts';
import type { RunningServer, ServeOptions } from '../http/serve.ts';
import { createWebApp } from '../http/web.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { Mail, SendMail } from '../mail/smtp.ts';
import { writeJsonLine, type RequestLog } from '../obs/request-log.ts';
import { guardWithUser } from '../outbound/index.ts';

// De koppeling tussen de core-onderdelen van de server (spec create-server, ADR 0040): omgeving, mail, auth, readiness,
// dev-login, de SPA, starten en stoppen. De app geeft alleen mee wat van haar is (ServerConfig); de onderdelen met een
// databaseverbinding of een poort komen als parts binnen (runServer in ../server.ts vult ze), zodat deze module zonder
// omgeving en zonder database te testen is. Importeert daarom de databasemodule niet, alleen haar typen.

// Readiness (GET /api/ready): een probe wacht hooguit 2 s; binnen 1 s krijgt de volgende probe dezelfde uitkomst.
const READY_TIMEOUT_MS = 2000;
const READY_CACHE_MS = 1000;

// Wat buildApp van de app krijgt.
export interface ServerAppDeps<Services> {
  readonly appOrigin: string;
  readonly auth: AuthGateway;
  // Bewaakt (guardWithUser): de uitgaande client weigert binnen de transactie, ook buiten een route.
  readonly withUser: WithUser;
  readonly services: Services;
  readonly log: RequestLog;
  readonly ready: Readiness;
  // Alleen bij APP_ENV=local (ADR 0043); in elke andere omgeving ontbreekt de sleutel en bestaat de route niet.
  readonly devLogin?: DevLogin;
  // De build-SHA uit BUILD_SHA (spec release-versie); zonder die variabele ontbreekt de sleutel.
  readonly build?: string;
}

// Wat van de app is (R-LAAG-02: als argument, core importeert niets uit de app).
export interface ServerConfig<Services, Name extends string> {
  readonly appName: string;
  // Eén veld, zodat TypeScript afdwingt dat elke rol van het register een seed-account heeft.
  readonly devLogin: DevLoginConfig<Name>;
  readonly invitationMail: (invitation: Invitation) => Mail;
  // De login-policy van de app; krijgt de bewaakte withUser.
  readonly loginRequiresMfa: (withUser: WithUser) => (userId: string) => Promise<boolean>;
  readonly createServices: (auth: Auth) => Services;
  readonly buildApp: (deps: ServerAppDeps<Services>) => App;
}

// De onderdelen met een verbinding of een poort; een test bootst ze na.
export interface ServerParts {
  // De signatuur van WithUser zonder de generieke T (de uitkomst van work is hier unknown): zo past ook een nagebootste
  // withUser (vi.fn<WithUser>), die de T niet kan dragen. composeServer zet het type terug.
  readonly withUser: (...args: Parameters<WithUser>) => ReturnType<WithUser>;
  readonly pingDatabase: () => Promise<void>;
  readonly closeDatabase: () => Promise<void>;
  readonly createAuth: (config: CreateAuthConfig) => Auth;
  readonly createMailer: (smtpUrl: string, from: string) => SendMail;
  readonly startServer: (app: App, options: ServeOptions) => Promise<RunningServer>;
}

export interface ComposedServer {
  // De API zonder de SPA; start() zet er met WEB_DIR de SPA voor.
  readonly app: App;
  readonly start: () => Promise<RunningServer>;
}

export function composeServer<Services, Name extends string>(
  config: ServerConfig<Services, Name>,
  env: Env,
  parts: ServerParts,
): ComposedServer {
  // Ook buiten een route (de login-policy) weigert de uitgaande client binnen withUser (spec uitgaande-client).
  const withUser = guardWithUser(
    unsafeCast<WithUser>(
      parts.withUser,
      'withUser geeft terug wat work teruggeeft; het type van parts mist alleen de generieke T',
    ),
  );
  const sendMail = parts.createMailer(env.smtpUrl, `no-reply@${new URL(env.appOrigin).hostname}`);
  // Eén instantie voor services, gateway, dev-login en het sluiten van de pool.
  const auth = parts.createAuth({
    origin: env.authBaseUrl,
    secret: env.authSecret,
    databaseUrl: env.authDatabaseUrl,
    clientIpHeader: env.clientIpHeader,
    sendInvitation: (invitation) => sendMail(config.invitationMail(invitation)),
    // De mails van een e-mailwijziging (spec eigen-account).
    sendMail,
    appName: config.appName,
    loginRequiresMfa: config.loginRequiresMfa(withUser),
  });

  const app = config.buildApp({
    appOrigin: env.appOrigin,
    auth: authGateway(auth),
    withUser,
    services: config.createServices(auth),
    log: writeJsonLine,
    ready: createReadiness(parts.pingDatabase, { timeoutMs: READY_TIMEOUT_MS, cacheMs: READY_CACHE_MS }),
    // Dev-login alleen lokaal (ADR 0043); in elke andere omgeving bestaat de route niet.
    ...(env.appEnv === 'local' ? { devLogin: createDevLogin(devAuthSteps(auth), config.devLogin) } : {}),
    // GET /api/health toont de build alleen als de image hem meekreeg (spec release-versie).
    ...(env.buildSha === undefined ? {} : { build: env.buildSha }),
  });

  // Met WEB_DIR (de containerimage) serveert dezelfde server de SPA op dezelfde origin (ADR 0049); lokaal doet Vite dat.
  const start = () =>
    parts.startServer(env.webDir === undefined ? app : createWebApp(app, env.webDir), {
      host: env.apiHost,
      port: env.apiPort,
      shutdownTimeoutMs: env.shutdownTimeoutMs,
      onStopped: async () => {
        await Promise.all([parts.closeDatabase(), auth.closePool()]);
      },
    });
  return { app, start };
}
