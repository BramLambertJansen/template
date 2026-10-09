---
paths:
  - "src/api/**"
  - "deploy/**"
---

# Regels voor `src/api`

- Nieuwe route: in `src/api/routes/<resource>.ts`, één bestand per resource, alleen via `defineRoute()`.
  `input` en `output` zijn zod-schema's uit `src/shared`; `input` is `.strict()`; `permission` is een sleutel uit `can()`.
- De handler krijgt `ctx.actor` en een `tx` via `withUser()`. Geen eigen query buiten `tx`, geen tweede verbinding.
- GET-routes draaien read only. Geen opeenvolgende queries per request als één query volstaat.
- Postgres-fouten worden in `withUser()` vertaald (23505 → `ALREADY_EXISTS`, 23503 → `NOT_FOUND`, 42501 → `FORBIDDEN`).
  Een route vangt ze nooit zelf af. Nieuwe foutcode: register in `src/shared`, tekst in `src/web/copy/errors.ts`.
- Pure logica in `src/api/domain` (unit-testbaar, geen I/O). Handlers zijn dun.
- `process.env` alleen in `env.ts`. Logging alleen via `src/api/obs` met `requestId`.
- `src/api/auth`: Better Auth op `/api/auth/*`, eigen verbinding als `auth_service`, alleen schema `auth`. Sessie per request uit
  de database (`cookieCache` uit); rollen uit `user_roles`, nooit uit de sessie. Alleen plugins two-factor en magic link;
  een andere plugin vraagt een ADR. Sessiebeleid en MFA: ADR 0003.
- CSRF-middleware vóór alle routes; geen `cors()`. `bodyLimit` op de app; paginagrootte uit `limits.ts`.
- `deploy/<host>/` bevat alleen een adapter die de Hono-app exporteert. Geen logica.
- Tests per route: één per verboden rol (verwacht `FORBIDDEN`), één voor ongeldige input, de acceptatiecriteria.
- Uniekheidsregel of geld: racetest met twee gelijktijdige requests; precies één slaagt.
