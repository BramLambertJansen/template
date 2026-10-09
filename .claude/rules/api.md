---
paths:
  - "src/api/**"
  - "src/core/api/**"
  - "deploy/**"
---

# Regels voor `src/api` en `src/core/api`

- `src/core/api` is van de template (ADR 0008): in een app niet wijzigen. Uitbreiden via `src/api/app.ts`, `src/api/kit.ts`,
  `src/shared/permissions.ts`, `src/shared/errors.ts` en `src/shared/limits.ts`.
- Nieuwe route: in `src/api/routes/<resource>.ts`, één bestand per resource, alleen via `defineRoute()` uit `src/api/kit.ts`.
  `input` en `output` zijn zod-schema's uit `src/shared`; `input` is `.strict()`; `permission` is een sleutel uit `src/shared/permissions.ts`.
- De handler krijgt `ctx.actor` en een `tx` via `withUser()`. Geen eigen query buiten `tx`, geen tweede verbinding.
- GET-routes draaien read only. Geen opeenvolgende queries per request als één query volstaat.
- Postgres-fouten worden in `withUser()` vertaald (23505 → `ALREADY_EXISTS`, 23503 → `NOT_FOUND`, 42501 → `FORBIDDEN`).
  Een route vangt ze nooit zelf af. Nieuwe foutcode: `src/shared/errors.ts`, tekst in `src/web/copy/errors.ts`.
- Pure logica in `src/api/domain` (unit-testbaar, geen I/O). Handlers zijn dun.
- `process.env` alleen in `src/core/api/env.ts`; app-variabelen als schema in `src/api/env.ts`. Logging alleen via `src/core/api/obs` met `requestId`.
- `src/core/api/auth`: Better Auth op `/api/auth/*`, eigen verbinding als `auth_service`, alleen schema `better_auth`. Sessie per request uit
  de database (`cookieCache` uit); rollen uit `user_roles`, nooit uit de sessie. Alleen plugins two-factor en magic link;
  een andere plugin vraagt een ADR. Sessiebeleid en MFA: ADR 0003.
- CSRF-middleware vóór alle routes; geen `cors()`. `bodyLimit` op de app; paginagrootte uit `limits.ts`.
- `deploy/<host>/` bevat alleen een adapter die de Hono-app exporteert. Geen logica.
- Tests per route: één per verboden rol (verwacht `FORBIDDEN`), één voor ongeldige input, de acceptatiecriteria.
- Uniekheidsregel of geld: racetest met twee gelijktijdige requests; precies één slaagt.

## Besloten, nog niet gebouwd

Gebouwd: `withUser()` (zonder foutvertaling), `createApp` met CSRF, `bodyLimit`, `secureHeaders()` en `onError`, en het env-schema
(`env()`, `readEnv()`). Nog niet: `createRouteKit`/`defineRoute`, de foutvertaling, het foutcoderegister met app-uitbreiding, `src/api/kit.ts`,
Better Auth en logging via `src/core/api/obs` (roadmap fase 1, stuk 2 en 3a). Bouw er niet op vooruit en maak geen eigen variant; staat iets wat je nodig hebt niet in `node scripts/kit/feiten.mjs`, vraag het.
