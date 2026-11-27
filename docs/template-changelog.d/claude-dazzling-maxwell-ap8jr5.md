---
soort: toegevoegd
---

- Bestandsopslag, deel A (spec `docs/template/specs/bestandsopslag.md`, ADR 0060): de poort `FileStorage` met
  `defineFileStorage` en `createFileService` (enige bron van `STORAGE_UNAVAILABLE`) in `src/core/api/storage/`, de lokale
  adapter achter `/api/dev/files/:token` (alleen `APP_ENV=local` of `test`), de contracttestsuite `fileStorageContract`
  en `pnpm check:storage-adapters` in `gate:fast`. De route kit krijgt een optionele `prepare`-stap (`ctx.prepared()`),
  `createApp` een optie `files` met opstartcontroles op `FileLimits`, de CSP een optionele upload-origin, `format.bytes`
  en `uploadFile` in de API-client. Nog geen tabel, routes of scherm (deel B); bestanden niet in productie tot deel C
  (R-OPSL-04).

### Bij een update

- Draai `pnpm check:storage-adapters`. Een eigen opslagadapter via `defineFileStorage` faalt zonder testbestand dat
  `fileStorageContract` (uit `src/core/api/storage/testing.ts`) op die adapter draait; het runbook staat in
  `docs/operations/opslag-adapter.md`.
- `src/shared/limits.ts` heeft `FILE_LIMITS`; `createApp` weigert bij opstart een waarde boven de harde grenzen uit core.
- Nieuw optioneel env `FILES_LOCAL_DIR` (in `src/api/env.ts`), alleen gelezen bij `APP_ENV=local` of `test`.
