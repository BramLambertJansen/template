import type { WithJob } from '../db/types.ts';
import { CORE_JOB_KEYS } from './lock.ts';
import type { JobDefinition } from './runner.ts';

export interface CoreJobDeps {
  // purgeExpired van Better Auth (src/core/api/auth/purge.ts), als auth_service op de pool van Better Auth.
  readonly purgeExpired: (signal?: AbortSignal) => Promise<unknown>;
  // purgeAppTables uit src/core/api/db (app.retention_targets en app.purge_expired via de withJob van de taak).
  readonly purgeAppTables: (withJob: WithJob, signal?: AbortSignal) => Promise<unknown>;
}

// De taken van de template (spec achtergrondtaken, deel D): opruimen van better_auth en van de app-tabellen met een termijn.
export function coreJobs(deps: CoreJobDeps): JobDefinition[] {
  return [
    {
      name: 'core.purge_auth',
      key: CORE_JOB_KEYS.purgeAuth,
      run: async ({ signal }) => {
        await deps.purgeExpired(signal);
      },
    },
    {
      name: 'core.purge',
      key: CORE_JOB_KEYS.purge,
      run: async ({ withJob, signal }) => {
        await deps.purgeAppTables(withJob, signal);
      },
    },
  ];
}
