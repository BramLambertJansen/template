import { createAuth } from './auth/index.ts';
import { checkJobsDatabase, closeDatabase, pingDatabase, purgeAppTables, withJob, withUser } from './db/index.ts';
import { env } from './env.ts';
import { startServer } from './http/serve.ts';
import { createSmtpMailer } from './mail/smtp.ts';
import { composeServer, type ServerConfig } from './server/compose.ts';

export type { ServerAppDeps, ServerConfig } from './server/compose.ts';

// De ingang van de server (spec create-server, ADR 0040): de app roept runServer aan vanuit src/api/server.ts met wat van
// haar is; de koppeling zelf staat in server/compose.ts. Dit is de enige plek buiten src/core/api/db die pingDatabase en
// closeDatabase (en withJob en checkJobsDatabase) gebruikt (R-LAAG-06).
export async function runServer<Services, Name extends string>(config: ServerConfig<Services, Name>): Promise<void> {
  // env() controleert de hele omgeving bij opstart (framework §6) en faalt met alle fouten tegelijk.
  const server = composeServer(config, env(), {
    withUser,
    pingDatabase,
    closeDatabase,
    withJob,
    checkJobsDatabase,
    purgeAppTables,
    createAuth,
    createMailer: createSmtpMailer,
    startServer,
  });
  await server.start();
}
