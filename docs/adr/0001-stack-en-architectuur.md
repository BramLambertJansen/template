# 0001 — Stack en architectuur

Status: geaccepteerd (2026-10-09)

## Context

Eén webapp, gebouwd door agents. Alle schermen achter login. Ontwikkelen volledig lokaal; release naar Vercel + Supabase.

## Besluit

Vite + React SPA en Hono-API in één pakket (`src/web`, `src/api`, `src/shared`), Supabase voor Postgres en Auth.
De browser praat alleen met de API; de API raakt Postgres alleen via `withUser()` onder de identiteit van de gebruiker.
Details: `docs/plan.md`, hoofdstukken Architectuur en Data-toegang.

## Alternatieven

- Monorepo met drie pakketten: meer onderhoud (configs, workspace-links, build-volgorde) voor dezelfde garantie.
- Full-stack framework met server functions (TanStack Start, React Router framework mode): even veilig,
  maar koppelt sterker aan de host; Hono houdt de uitwijkroute open.
- Server-rendering: levert niets op achter een login.

## Gevolgen

- Grenzen tussen mappen moeten met dependency-cruiser bewaakt worden.
- Open risico: Supavisor in transaction mode met eigen rol `api_user` is nog niet bewezen (fase 0).
