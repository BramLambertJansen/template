import { runServer } from '#core/api/server.ts';
import { APP_NAME } from '#shared/app.ts';
import { FILE_LIMITS } from '#shared/limits.ts';
import { roles } from '#shared/roles.ts';
import { buildApp } from './app.ts';
import { appEnv } from './env.ts';
import { SEED_ACCOUNTS } from './dev/seed-accounts.ts';
import { createLoginPolicy } from './login-policy.ts';
import { invitationMail } from './mail/invitation.ts';
import { createServices } from './services.ts';

// De ingang van de app (spec create-server, ADR 0040): alleen wat van de app is. De koppeling tussen de core-onderdelen
// (omgeving, mail, auth, readiness, dev-login, de SPA, starten en stoppen) doet runServer in core.
// Bestanden (spec bestandsopslag): zonder storage gebruikt APP_ENV=local of test de lokale adapter op FILES_LOCAL_DIR; een
// productieadapter (defineFileStorage, per app een ADR) komt hier als `storage`.
const { FILES_LOCAL_DIR } = appEnv();
await runServer({
  appName: APP_NAME,
  devLogin: { roles, seedAccounts: SEED_ACCOUNTS },
  invitationMail,
  loginRequiresMfa: createLoginPolicy,
  createServices,
  buildApp,
  files: { limits: FILE_LIMITS, ...(FILES_LOCAL_DIR === undefined ? {} : { localDir: FILES_LOCAL_DIR }) },
});
