# Opslagadapter voor een app

Runbook bij [bestandsopslag](../template/specs/bestandsopslag.md) en [ADR 0060](../template/adr/0060-bestandsopslag-als-poort.md).
De template levert geen productieadapter; een app kiest een provider in een eigen ADR (`docs/adr/`) en bouwt de adapter zelf.

## Vorm

- Eén bestand in de app, bijvoorbeeld `src/api/storage/<provider>.ts`, met de adapter als benoemde top-level declaratie via
  `defineFileStorage({...})` uit `src/core/api/storage/port.ts`. De poort staat in `src/core/api/storage/port.ts` (`FileStorage`).
- Een testbestand dat `fileStorageContract('<naam>', setup)` uit `src/core/api/storage/testing.ts` op precies die adapter draait,
  met een echte bucket voor tests en `globalThis.fetch` als `fetch` in de setup. Zonder faalt `pnpm check:storage-adapters`
  (`scripts/kit/check-storage-adapters.mjs`).
- Aansluiten in `src/api/server.ts`: `files: { limits: FILE_LIMITS, storage: <adapter> }`. `runServer` geeft de service aan
  `buildApp` en de `uploadOrigin` aan `connect-src` van de SPA (`src/core/api/server/compose.ts`).
- `createUploadUrl` en `createDownloadUrl` zijn synchroon: lokaal ondertekenen (presigned URL), geen netwerkaanroep. Een provider
  die voor een URL een aanroep nodig heeft, past niet op de poort.

## Bij de provider instellen

- **CORS** op de bucket: alleen `APP_ORIGIN` als origin, methode `PUT`, headers `Content-Type` (en wat de adapter in
  `SignedUpload.headers` zet). Geen `GET` via CORS: de download is een navigatie, geen `fetch`.
- **Conditionele writes**: de upload-URL schrijft alleen als het object nog niet bestaat (bijv. `If-None-Match: *` in de
  ondertekende headers). De contracttest weigert een adapter die een tweede upload op dezelfde sleutel toelaat (files/AC-1).
- **Download-headers**: de ondertekende GET zet `Content-Disposition: attachment` met `filename*` (RFC 6266),
  `Content-Type: application/octet-stream` en waar het kan `X-Content-Type-Options: nosniff` (response-header-overrides).
- **Levenscyclus**: geen eigen verloopregel die objecten met een rij weghaalt; opruimen loopt via de wachtrij
  `app.file_deletions` (deel C van de spec). Een regel voor onvoltooide multipart-uploads mag wel.
- **Regio**: dezelfde regio als API en database (R-ARCH-06); vastleggen in de app-ADR.
- **Toegang**: bucket privé, geen listing, geen publieke objecten, geen Storage-policies voor de browser (R-PROV-02). De
  smoketest bewijst dat een browsersessie zonder signed URL niets leest of schrijft.
- **Sleutels**: alleen `files/<uuid>`; `createFileService` (`src/core/api/storage/service.ts`) weigert elke andere sleutel vóór
  de adapter. Geheimen van de provider via `readEnv((ctx) => …)` met `secret(ctx, …)` in `src/api/env.ts`.

## Lokaal

Zonder `storage` gebruikt `APP_ENV=local` of `test` de lokale adapter (`src/core/api/storage/local.ts`) op `FILES_LOCAL_DIR`
(standaard `<os.tmpdir()>/app-files-local`), met de dev-route `/api/dev/files/:token`. Elders is er dan geen adapter en geven de
bestandsroutes `STORAGE_UNAVAILABLE`.
