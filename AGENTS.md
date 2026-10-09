# AGENTS.md

Webapp-template, gebouwd door agents binnen afgedwongen kaders. Ontwerp: `docs/plan.md`. Voortgang: `docs/roadmap.md`.

## Status

Skelet. Er is nog geen code, geen `pnpm`-script en geen CI. Verzin geen commando's: wat niet in
`package.json` staat, bestaat nog niet. Bouw volgens de roadmap, fase voor fase.

## Stack

- `src/web` — Vite + React SPA, TanStack Router/Query, React Hook Form, shadcn/ui, Tailwind v4.
- `src/api` — Hono-app; lokaal via `src/api/server.ts` (:8787), op Vercel via `api/index.ts`.
- `src/shared` — zod-schema's, `can()`, `limits.ts`, branded IDs, foutcodes, `assert()`, `unsafeCast()`.
- `supabase/` — migraties (append-only), pgTAP-tests, seed, `schema.snapshot.sql` (gegenereerd).
- Node 24 LTS, pnpm, TypeScript 6.0.x — versies in `mise.toml` en `package.json`.

## Harde regels (worden checks; tot dan: handmatig naleven)

- De browser raakt geen database: alleen `@supabase/auth-js` voor inloggen, data via `src/web/lib/api.ts`.
- `src/api/db` exporteert alleen `withUser()`. Nooit verbinden als `postgres`.
- Een route bestaat alleen via `defineRoute({ method, path, input, output, permission, handler })`.
- `process.env` alleen in `src/api/env.ts`. Geen `as`; uitweg is `unsafeCast(value, reden)`.
- Elke tabel: RLS aan, expliciete grants in de migratie, elke policy een pgTAP-test op naam.
- Een gecommitte migratie wijzig je nooit; maak een nieuwe. Migraties zijn expand/contract.
- Tests: toevoegen mag, bestaande wijzigen of verwijderen niet zonder akkoord.
- Geen kleuren, radius of schaduw buiten tokens; geen rauwe HTML-controls buiten `src/web/ui`.

## Werkafspraken

- Ontbreekt een beslissing (bedrag, tekst, randgeval): stop en vraag. Vul geen aanname in.
- Feature met migratie, nieuwe route of nieuwe permissie: eerst spec (`docs/specs/_template.md`),
  status `goedgekeurd` zet alleen de eigenaar. Zonder die drie: licht pad (plan, bouwen, review).
- UI-tekst Nederlands; code, commits en branchnamen Engels. Conventional commits, één onderwerp per PR.
- Bestanden kebab-case, componenten PascalCase, hooks `useX`, tabellen/kolommen snake_case.
- Klaar = `docs/dod.md`.

## Waar een regel woont

Type of `defineRoute` → lintregel of check → gouden pad/template → `.claude/rules/` → dit bestand.
Een nieuwe regel hier is het laatste redmiddel.
