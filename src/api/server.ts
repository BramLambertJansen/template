import { authGateway, createAuth } from '#core/api/auth/index.ts';
import { closeDatabase, withUser } from '#core/api/db/index.ts';
import { env } from '#core/api/env.ts';
import { startServer } from '#core/api/http/serve.ts';
import { createSmtpMailer } from '#core/api/mail/smtp.ts';
import { createDevLogin, devAuthSteps } from '#core/api/dev/login-as.ts';
import { buildApp } from './app.ts';
import { invitationMail } from './mail/invitation.ts';
import { createServices } from './services.ts';

// env() controleert de hele omgeving bij opstart (framework §6) en faalt met alle fouten tegelijk.
const config = env();
const sendMail = createSmtpMailer(config.smtpUrl, `no-reply@${new URL(config.appOrigin).hostname}`);
const auth = createAuth({
  origin: config.authBaseUrl,
  secret: config.authSecret,
  databaseUrl: config.authDatabaseUrl,
  clientIpHeader: config.clientIpHeader,
  sendInvitation: (invitation) => sendMail(invitationMail(invitation)),
});

const gateway = authGateway(auth);

await startServer(
  buildApp({
    appOrigin: config.appOrigin,
    auth: gateway,
    withUser,
    services: createServices(auth),
    // Dev-login alleen lokaal (ADR 0014); in elke andere omgeving bestaat de route niet.
    ...(config.appEnv === 'local' ? { devLogin: createDevLogin(devAuthSteps(auth)) } : {}),
  }),
  {
    host: config.apiHost,
    port: config.apiPort,
    shutdownTimeoutMs: config.shutdownTimeoutMs,
    onStopped: async () => {
      await Promise.all([closeDatabase(), auth.closePool()]);
    },
  },
);
