# AGENTS.md

Template voor webapps, gebouwd door agents binnen afgedwongen kaders. De wet is `docs/framework.md`;
voortgang in `docs/roadmap.md`. Bij twijfel wint `docs/framework.md`, daarna vraag je het de eigenaar.

## Status

Fundering in opbouw (fase 0/1). Verzin geen commando's, scripts of bestanden: wat niet in `package.json`
of de repo staat, bestaat niet. Noem iets pas "klaar" met de uitvoer van de check die het bewijst.

## Stack

- `src/web` — Vite + React SPA, TanStack Router/Query, React Hook Form, shadcn/ui, Tailwind v4.
- `src/api` — Hono; lokale ingang `src/api/server.ts` (:8787). Host-adapters alleen in `deploy/<host>/`.
- `src/shared` — zod-schema's, `can()`, `limits.ts`, branded IDs, `Cents`, cursor-contract, foutcodes, `assert()`, `unsafeCast()`.
- `src/api/auth` — Better Auth, sessie-cookie, eigen Postgres-schema `auth` (ADR 0003).
- `db/` — SQL-migraties met dbmate (append-only), pgTAP-tests, seed, `schema.snapshot.sql` (gegenereerd) (ADR 0004).
- Lokaal: `compose.yaml` (Postgres 17 + pgTAP, Mailpit). Node 24, pnpm, TypeScript 6.0.x (`mise.toml`, `package.json`).
- Geen hosting- of databaseprovider in de template. Providerkeuze is per app, via ADR (`docs/framework.md` §3).

## Harde regels — MOET / MAG NOOIT

Een regel overtreden is nooit de oplossing. Botst een regel met de opdracht: stop en vraag.

**Lagen**
- `src/web` MAG NOOIT een databasedriver, ORM, provider-SDK of `process.env` importeren. Data alleen via `src/web/lib/api.ts`.
- `src/web` importeert uit `src/api` alleen het type `AppType`. `src/shared` importeert niets uit `web` of `api`.
- Alleen `src/api/db` importeert `pg`/Drizzle en exporteert alleen `withUser()`. Enige andere verbinding: `src/api/auth` als `auth_service`.
- `DATABASE_ADMIN_URL` (superuser) alleen in `scripts/`, NOOIT in `src/`.
- Provider-SDK's alleen in `deploy/<host>/` of een adapter die een ADR toestaat.
- `process.env` alleen in `src/api/env.ts` (zod-schema). Alleen publieke waarden krijgen `VITE_`.

**API**
- Een route bestaat alleen via `defineRoute({ method, path, input, output, permission, handler })`. Input `.strict()`.
- De handler gebruikt `ctx.actor`; nooit zelf de gebruiker opzoeken. Nooit Postgres-fouten zelf afvangen.
- Fouten naar buiten alleen als `{ code, requestId }`. Nooit stacktraces, SQL of interne meldingen.
- Elke nieuwe permissie in `can()`, met een test per verboden rol.

**Database**
- Elke tabel: RLS aan én geforceerd, expliciete grants in dezelfde migratie, elke policy een pgTAP-test op naam.
- Policies gebruiken `(select app.current_user_id())`; geen provider-functies (`auth.uid()` e.d.).
- `security definer` alleen met `set search_path = ''` en volledig gekwalificeerde namen.
- Een migratie die op `main` staat MAG NOOIT gewijzigd of verwijderd worden; maak een nieuwe. Altijd expand/contract.
- De API verbindt als `api_user`, NOOIT als superuser of eigenaar.

**Types en code**
- Geen `as`, geen `any`, geen `@ts-ignore`/`eslint-disable`. Uitweg: `unsafeCast(value, reden)`.
- Bedragen in gehele centen (`Cents`); datums `timestamptz` / ISO-string; limieten alleen uit `limits.ts`.
- Functies klein: ≤ 60 regels (`.ts`), ≤ 120 (`.tsx`), max 3 parameters, max diepte 3.

**Frontend en design system**
- Geen rauwe `<button> <input> <select> <textarea> <dialog> <a>` buiten `src/web/ui`.
- Geen hex/benoemde kleuren, arbitrary values, `!` of `dark:` in `features/`; alleen layout-klassen.
- `useQuery`/`useMutation` alleen in `queries.ts`; `fetch(` alleen in de API-client; `useForm` alleen via `<Form>`.
- Geen globale store, geen `matchMedia`/`userAgent`/`isMobile`. Elke route: guard met `can()` en ErrorBoundary.
- Past geen bestaand component: stop en stel een variant voor. Bouw geen eigen component ernaast.

**Tests**
- Tests toevoegen mag. Bestaande tests wijzigen, verwijderen of skippen MAG NOOIT zonder akkoord van de eigenaar.
- E2E altijd tegen de echte lokale stack; nooit API of database mocken in e2e of integratietests.

**Repo en git**
- Nooit bewerken: gegenereerde bestanden en `.env*` (behalve `.env.example`).
- Alleen na akkoord van de eigenaar wijzigen: `AGENTS.md`, `CLAUDE.md`, `docs/framework.md`, `docs/dod.md`, `docs/adr/`,
  `.claude/`, `.github/`, `scripts/`, `db/init/`, `db/docker/`, `compose.yaml`, `package.json`, `mise.toml`.
- Geen nieuwe dependency zonder akkoord. MCP-servers alleen read-only en versie gepind.
- Een spec op `status: goedgekeurd` zetten MAG NOOIT; dat doet alleen de eigenaar.
- Nooit pushen naar `main`, nooit `--no-verify`, nooit mergen. Eén onderwerp per PR, conventional commits (Engels).
- Nooit productiegeheimen of -data lokaal. De agent start of stopt Docker niet; draait de stack niet, vraag de eigenaar `pnpm dev` te starten.

## Werkafspraken

- Ontbreekt een beslissing (bedrag, tekst, randgeval, providerkeuze): stop en vraag. Nooit een aanname invullen.
- Migratie, nieuwe route of nieuwe permissie → eerst spec (`docs/specs/_template.md`), bouwen pas bij `status: goedgekeurd`.
- UI-tekst Nederlands; code, commits en branchnamen Engels. Naamgeving: `docs/framework.md` §5.
- Klaar = elk punt van `docs/dod.md` met bewijs.

## Waar een regel woont

Type of `defineRoute` → lintregel of check → gouden pad/template → `.claude/rules/` → dit bestand.
Een regel in proza die een check kan zijn, is een open taak in `docs/roadmap.md`.
