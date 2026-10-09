import { authGateway, createAuth } from '#core/api/auth/index.ts';
import { withUser } from '#core/api/db/index.ts';
import { env } from '#core/api/env.ts';
import { startServer } from '#core/api/http/serve.ts';
import { createSmtpMailer } from '#core/api/mail/smtp.ts';
import { buildApp } from './app.ts';
import { invitationMail } from './mail/invitation.ts';

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

startServer(buildApp({ appOrigin: config.appOrigin, auth: authGateway(auth), withUser }), config.apiPort);
