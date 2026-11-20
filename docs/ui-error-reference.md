# Foutreferentie

Bij een onverwachte serverfout (status ≥ 500) toont de kit onder de foutzin "Referentie: <id>" met de knop
**Referentie kopiëren**. De id is de `requestId` uit de foutbody `{ code, requestId }` (R-SEC-02); support zoekt er de regel
mee op in de request-log (R-SEC-08). Spec: [foutreferentie](template/specs/foutreferentie.md). Geen dependency, route,
permissie of migratie.

## Waar hij verschijnt

- `RouteError`: na de foutzin, vóór **Opnieuw proberen**; nooit bij "geen toegang".
- `AsyncView`: binnen de bestaande `role="alert"`-container, ook in de verouderd-melding van `refresh`.
- `Form`: direct na de formuliermelding; niet bij een fout die via `fieldForCode` naar een veld gaat.
- Eigen foutweergave in een app: `<ErrorReference error={error} />` uit `src/web/ui/index.ts`. Het component rendert niets
  als er geen referentie is, dus geen lege regel.

## Wanneer wel en niet

- `ApiError.requestId` (`src/core/web/lib/api-client.ts`) is alleen gevuld als de body een string van 1 tot
  `MAX_REQUEST_ID_LENGTH` (64, `src/core/shared/limits.ts`) tekens uit `[A-Za-z0-9_-]` bevat (`safeRequestId`,
  `src/core/shared/request-id.ts`); anders `null`. Ook `new ApiError(code, status, id)` valideert.
- `supportReference(error)` is de enige beslisregel: een `ApiError` met `status >= 500` en `requestId !== null`. Bij 4xx,
  netwerkfouten, `ForbiddenError` of een andere fout geen referentie.
- Code, status, `message`, stacktrace en andere velden uit de body komen nooit op het scherm. Teksten staan in
  `src/core/web/copy/ui.ts` (`errorReference`, `copyErrorReference`, `errorReferenceCopied`); kopiëren gebruikt `CopyButton`.

## Acceptatiebewijs

| Criterium | Tests |
| --- | --- |
| AC-1, AC-2, AC-3, AC-5, AC-6 client en beslisregel | src/core/web/lib/api-client-request-id.test.ts |
| AC-4 vorm van de id | src/core/shared/request-id.test.ts |
| AC-7, AC-8 RouteError | src/core/web/ui/route-error-reference.test.tsx |
| AC-9, AC-15 kopiëren, niets anders in de DOM | src/core/web/ui/error-reference.test.tsx |
| AC-10, AC-11 AsyncView | src/core/web/ui/async-view-reference.test.tsx |
| AC-12, AC-13, AC-14 Form | src/core/web/ui/form-reference.test.tsx |
| AC-16 vorm van de server-id | src/core/api/http/request-id-shape.test.ts |
| AC-17 barrel en catalogus | check:catalogus, ui:check (CI) |
| AC-18 bestaande tests ongewijzigd | gate:fast |
