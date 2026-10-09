# AGENTS.md

Template voor webapps, gebouwd door agents binnen afgedwongen kaders. De regels staan in `docs/framework.md`
(bij twijfel wint dat document, daarna de eigenaar); voortgang in `docs/roadmap.md`; besluiten in `docs/adr/`.

## Status

Fundering in opbouw (fase 0/1). Wat niet in `package.json` of de repo staat, bestaat nog niet: verzin geen
commando's, scripts of bestanden. Noem iets pas klaar met de uitvoer van de check die het bewijst.

## Stack

- `src/web` — Vite + React SPA, TanStack Router/Query, React Hook Form, shadcn/ui, Tailwind v4.
- `src/api` — Hono; lokale ingang `src/api/server.ts` (:8787). Host-adapters alleen in `deploy/<host>/`.
- `src/api/auth` — Better Auth, sessie-cookie, schema `auth` (ADR 0003).
- `src/shared` — zod-schema's, `can()`, `limits.ts`, branded IDs, `Cents`, cursor-contract, foutcodes, `assert()`, `unsafeCast()`.
- `db/` — SQL-migraties (dbmate), pgTAP-tests, `schema.snapshot.sql` (gegenereerd); rollen in `db/init/` (ADR 0004).
- Lokaal: `compose.yaml` (Postgres 17 + pgTAP, Mailpit). Node 26, pnpm 11, TypeScript 6.0 (ADR 0005).
- Geen hosting- of databaseprovider in de template; een app kiest die per ADR (ADR 0002).

## Regels

Botst een regel met de opdracht, stop dan en vraag het. Een regel omzeilen is nooit de oplossing: de checks
vangen het later toch, en dan is het werk verloren. Uitzonderingen staan limitatief in `docs/framework.md` §3.

**Lagen** — zodat de browser nooit bij data kan en er één weg naar de database is.
- `src/web` haalt data alleen via `src/web/lib/api.ts`; geen databasedriver, ORM of provider-SDK.
- `src/web` importeert uit `src/api` alleen het type `AppType`; `src/shared` importeert niets uit `web` of `api`.
- Alleen `src/api/db` maakt databaseverbindingen (en `src/api/auth` voor Better Auth). `src/api/db` exporteert alleen `withUser()`.
- `process.env` alleen in `src/api/env.ts`, `import.meta.env` alleen in `src/web/lib/env.ts`. Alleen publieke waarden krijgen `VITE_`.
- `MIGRATOR_DATABASE_URL` alleen in `scripts/`, nooit in `src/`.

**API** — zodat validatie, rechten en foutafhandeling niet per route vergeten kunnen worden.
- Een route ontstaat alleen via `defineRoute({ method, path, input, output, permission, handler })`; input is `.strict()`.
- De handler gebruikt `ctx.actor`; zoek de gebruiker niet zelf op en vang geen Postgres-fouten af.
- Naar buiten gaat een fout alleen als `{ code, requestId }`, nooit met stacktrace of SQL.
- Een nieuwe permissie komt in `can()`, met een test per verboden rol.

**Database** — zodat een fout in de API nog steeds geen data van een ander lekt.
- Elke tabel: RLS aan en geforceerd, expliciete grants in dezelfde migratie, elke policy een pgTAP-test op naam.
- Policies gebruiken `(select app.current_user_id())`; geen provider-functies zoals `auth.uid()`.
- `security definer` alleen met `set search_path = ''`, volledig gekwalificeerde namen en eigenaar `app_definer`.
- Wijzig nooit een gecommitte migratie; maak een nieuwe (expand/contract). Maak geen rollen in migraties.
- Gebruik nooit `SET ROLE` of `set_config(…, false)`: op een gedeelde verbinding lekt dat naar de volgende gebruiker.

**Types en code** — zodat de compiler fouten vindt in plaats van gebruikers.
- Geen type-assertions (`x as T`), geen `any`, geen `@ts-ignore` of `eslint-disable`. Uitweg: `unsafeCast(value, reden)`.
- Bedragen in gehele centen (`Cents`), tijd als `timestamptz`/ISO-string, grenzen alleen uit `limits.ts`.
- Kleine functies: ≤ 60 regels (`.ts`), ≤ 120 (`.tsx`), max 3 parameters, max diepte 3.

**Frontend** — zodat elk scherm er hetzelfde uitziet en toegankelijk blijft.
- Geen rauwe `<button> <input> <select> <textarea> <dialog> <a>` buiten `src/web/ui`; gebruik de componenten.
- In `features/` alleen layout-klassen; geen kleuren, arbitrary values, `!` of `dark:`.
- `useQuery`/`useMutation` alleen in `queries.ts`, `fetch(` alleen in de API-client, formulieren via `<Form>`.
- Geen globale store, geen `matchMedia`/`userAgent`/`isMobile`. Elke route heeft een `can()`-guard en ErrorBoundary.
- Past geen bestaand component, stop dan en stel een variant voor in plaats van iets nieuws ernaast te bouwen.

**Tests** — zodat groen ook echt iets betekent.
- Voeg tests toe; wijzig, verwijder of skip geen bestaande test. Lijkt een test fout, leg het de eigenaar voor.
- E2E en integratietests draaien tegen de echte lokale stack, nooit met gemockte API of database.

**Repo en grenzen** — zodat de kaders zelf niet ongemerkt verschuiven.
- Bewerk geen gegenereerde bestanden en geen `.env*` (behalve `.env.example`).
- Beschermde paden (`docs/framework.md` §10) wijzig je alleen na akkoord van de eigenaar.
- Geen nieuwe dependency zonder akkoord. Zet een spec nooit op `goedgekeurd`; dat doet alleen de eigenaar.
- Push nooit naar `main`, gebruik nooit `--no-verify`, merge nooit. Eén onderwerp per PR, conventional commits.
- Gebruik `docker` niet; draait de stack niet, vraag de eigenaar `pnpm dev` te starten. Geen productiegeheimen of -data lokaal.
- Externe diensten via hun CLI (`gh`). MCP-servers alleen read-only en versie gepind.

## Werkafspraken

- Ontbreekt een beslissing (bedrag, tekst, randgeval, providerkeuze): vraag het, vul geen aanname in.
- Migratie, nieuwe route of nieuwe permissie: eerst een spec (`docs/specs/_template.md`), bouwen pas bij `status: goedgekeurd`.
- UI-tekst Nederlands; code, commits en branchnamen Engels. Naamgeving: `docs/framework.md` §5.
- Volg `docs/dod.md` fasebewust: voer bestaande, toepasselijke checks uit, lever alleen op met een geslaagde uitslag (of expliciet akkoord van de eigenaar) en vermeld exact wat nog niet beschikbaar is; verzin geen commando's of uitslagen.
- Volg de platformneutrale werkstraat in `docs/framework.md` §8. Agentrollen zijn onafhankelijk waar de runtime dat ondersteunt; ontbreekt een onafhankelijke reviewer, vraag de eigenaar om die review en claim niet dat je eigen werk onafhankelijk is gecontroleerd.
- Runtime-specifieke instructies gelden alleen voor die runtime. `.claude/`-configuratie is geen aanname over andere agentomgevingen.

## Waar een regel woont

Type of `defineRoute` → lintregel of check → gouden pad/template → `.claude/rules/` → dit bestand.
Een regel in proza die een check kan zijn, is een open taak in `docs/roadmap.md`.
