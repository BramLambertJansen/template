import { runServer } from '#core/api/server.ts';
import { APP_NAME } from '#shared/app.ts';
import { roles } from '#shared/roles.ts';
import { buildApp } from './app.ts';
import { SEED_ACCOUNTS } from './dev/seed-accounts.ts';
import { createLoginPolicy } from './login-policy.ts';
import { invitationMail } from './mail/invitation.ts';
import { createServices } from './services.ts';

// De ingang van de app (spec create-server, ADR 0040): alleen wat van de app is. De koppeling tussen de core-onderdelen
// (omgeving, mail, auth, readiness, dev-login, de SPA, starten en stoppen) doet runServer in core.
await runServer({
  appName: APP_NAME,
  devLogin: { roles, seedAccounts: SEED_ACCOUNTS },
  invitationMail,
  loginRequiresMfa: createLoginPolicy,
  createServices,
  buildApp,
});
