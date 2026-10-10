# Keuzes van de agent onder mandaat (2026-10-10/11)

De eigenaar gaf de agent mandaat om keuzes te maken, specs goed te keuren, ADR's te accepteren en te mergen bij groene checks,
met de afspraak dat de keuzes achteraf samen worden doorgelopen. Elke rij: wat gekozen is, het belangrijkste alternatief, en waar.
Elke PR had een onafhankelijke read-only reviewer (subagent); fixes uit de review staan in dezelfde PR.

| # | Onderwerp | Keuze | Alternatief | Waar |
|---|---|---|---|---|
| 1 | Taal | Alleen Nederlands, geen meertaligheid (besluit eigenaar) | i18n voorbereiden | #65, roadmap |
| 2 | Readiness | `GET /api/ready` met een eigen ping-verbinding (max 1, timeouts 900 ms), cache 1 s, hooguit één controle | Ping via de pool van `withUser()` | ADR 0018, #66 |
| 3 | Productie | Eén image serveert SPA en `/api` op één origin; geen buildstap voor de API (Node type stripping) | SPA op een statische host/CDN; reverse proxy in de image | ADR 0019, #67 |
| 4 | Headers | CSP en andere SPA-headers uit één bron (`security-headers.ts`) voor Vite en de server | Per host apart | #67 |
| 5 | Pools | `error`-listener, `keepAlive` (10 s), connect-timeout 10 s, `application_name` op alle pools | Alleen de listener | #68 |
| 6 | Toegankelijkheid | Paginatitel via de h1, skip-link, focus naar de h1 na navigeren; lazy route nog open | Router-`head` per route | #70, roadmap 3f |
| 7 | Bevestigen | `ConfirmDialog`: focus op Annuleren, `alertdialog`, tijdens busy niet te sluiten, `onConfirm` één keer | Gewone `Dialog` per feature | #71 |
| 8 | Mail | Eén layout (tekst + HTML); teksten "Wachtwoord instellen" en "Werkt de knop niet? Open dan deze link:" | Alleen tekstmails | #72 |
| 9 | Zoekmachines | `noindex` via meta-tag, `robots.txt` laat crawlen toe | `Disallow: /` | #74 |
| 10 | Bestaande test | e2e van het menu-sheet pollt tot de animatie klaar is (alleen timing) | Animatie uit in e2e | #73 |
| 11 | Hernoemen | `pnpm app:init` (alleen Node, vóór `pnpm install` te draaien) | Handwerk uit `nieuwe-app.md` | #75 |
| 12 | CI | CodeQL (`security-extended`, TypeScript en workflows); Betterleaks gepind in `mise.toml` i.p.v. image op digest | Image op digest | #76 |
| 13 | Definer-views | `check:secdef` eist barrier, actorfilter (heuristiek), namen met schema en eigenaar; fail-closed bij twijfel; recursieve definer-view kan niet | Alleen pgTAP | #78 |
| 14 | Achtergrondtaken | Runner in het API-proces met advisory locks, eigen rol `app_jobs`, mail-outbox | Queue-bibliotheek; cron van de host | ADR 0020 |
| 15 | Audit log | In core, append-only, alleen ID's, in dezelfde transactie; lezen alleen admin met MFA | Op aanleiding; generieke triggers | ADR 0021 |
| 16 | AVG | Export door de gebruiker, verwijderen door admin met MFA, bewaarcatalogus per tabel, register-sjabloon | Alleen documentatie | ADR 0022 |

Nog niet besloten (vraagt de eigenaar): contactadres voor `security.txt`, eigenaar in `LICENSE`, versie en build-SHA zichtbaar maken,
verplichte checks in de ruleset (`image`, `secrets`, `codeql`).
