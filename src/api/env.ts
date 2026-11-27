import { z } from 'zod';
import { readEnv } from '#core/api/env.ts';

// Omgeving van de app (ADR 0040, R-LAAG-08): alleen via readEnv uit core. FILES_LOCAL_DIR is de map van de lokale
// opslagadapter (spec bestandsopslag, OV-8); optioneel, alleen gebruikt bij APP_ENV=local of test, nooit een map in src/.
const appEnvSchema = z.object({
  FILES_LOCAL_DIR: z.string().min(1).optional(),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function appEnv(): AppEnv {
  return readEnv(appEnvSchema);
}
