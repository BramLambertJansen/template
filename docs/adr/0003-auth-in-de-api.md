# 0003 — Auth draait in de API, op de eigen Postgres

Status: geaccepteerd (2026-10-09) — besloten door de agent op verzoek van de eigenaar; herzien via een nieuwe ADR.

## Context

Een app heeft alleen frontend-hosting en een Postgres-backend nodig (ADR 0002). Een externe identity provider
is een derde dienst: lokaal een extra container (Keycloak ~1 GB RAM), in productie een extra account en kostenpost.
Het plan wilde ook direct intrekken van rollen, sessiecontrole voor admin en MFA.

## Besluit

- Auth is een library in de API: **Better Auth** (1.x, versie gepind), in `src/api/auth`, gemount op `/api/auth/*`.
- Gegevens in een eigen schema `auth` in dezelfde Postgres, beheerd door de rol `auth_service` (alleen rechten op `auth`).
  `src/api/auth` is de enige plek naast `src/api/db` met een eigen verbinding; dependency-cruiser bewaakt dat.
- Sessie als `httpOnly`, `Secure`, `SameSite=Lax`-cookie, same-origin. Geen token in `localStorage`, geen JWKS nodig.
- Elke muterende request controleert `Origin` (CSRF). Wachtwoordreset en magic links via SMTP (lokaal Mailpit).
- MFA via de two-factor-plugin; de sessie draagt `session_strength` (`password` | `mfa`), `withUser()` zet die door.
- Rollen blijven in `public.user_roles`; nooit uit de sessie of gebruikersmetadata.

## Alternatieven

- Externe OIDC-provider (Keycloak, Zitadel, Auth0, Supabase Auth): sterker gescheiden, maar een derde dienst per app.
- Supabase GoTrue los op Postgres: licht, maar bindt aan Supabase en zijn `auth`-schema.
- Zelf bouwen: te veel securityrisico.

## Gevolgen

- Lokaal = productie voor auth zonder extra container. Sessie-intrekking is direct (sessie staat in de database).
- De API-client hoeft geen token te zetten; bij 401 navigeert de app naar inloggen (geen refresh-ronde).
- Een app die toch een externe provider wil, schrijft een ADR en vervangt alleen `src/api/auth` en `src/web/lib/auth.ts`.
- Rate limiting op inloggen en reset is werk van de API (plugin of eigen limiter), plus CAPTCHA op aanmelden/reset.
