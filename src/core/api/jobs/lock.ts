// De advisory lock van een achtergrondtaak (ADR 0050 punt 1): twee-sleutelvorm (namespace, taaknummer). Die lockruimte botst
// niet met de één-sleutelvorm van hashtext(…)-locks (zoals de laatste-admin-lock). Gelezen door withJob
// (src/core/api/db/with-job.ts) en purgeExpired (src/core/api/auth/purge.ts); geen import van pg.

// Een vaste int4 ('jobs' als ASCII: 0x6a6f6273). Wijzigen laat een oude en een nieuwe versie tijdens een uitrol naast elkaar
// dezelfde taak draaien: alleen met een ADR.
export const JOB_LOCK_NAMESPACE = 0x6a_6f_62_73;

// Taaknummers: 1–99 voor core, vanaf 100 voor de app (spec achtergrondtaken, OV-C2).
export const CORE_JOB_KEYS = { purgeAuth: 1, purge: 2 } as const;
export const MAX_CORE_JOB_KEY = 99;
export const MIN_APP_JOB_KEY = 100;
// De tweede sleutel van pg_try_advisory_xact_lock(int4, int4).
export const MAX_JOB_KEY = 2_147_483_647;
