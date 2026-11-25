---
status: goedgekeurd
namespace: dependency-achterstand
---

# Achterstand in dependency-updates

## Doel

Een update die blijft hangen, valt uiterlijk een week na zijn grens op: een wekelijkse check op `main` wordt rood als een
Renovate-PR te lang openstaat, of als Renovate een update niet als PR kan openen of een fout meldt.

**Aanleiding.** PR #967 (alle niet-majors van een week) was rood omdat één pakket (lefthook 2.2.2) door pnpm geweigerd werd;
29 andere updates wachtten mee en niets waarschuwde. Majors waren deels verborgen (`allowedVersions`). Eigenaarbesluit
2026-11-24: elke update wordt getest en wie achterloopt, merkt dat. Het Renovate-deel (majors als eigen PR met label `major`,
geen verborgen versies, geen limiet op het aantal PR's) staat in `renovate.json` en R-PROV-04 (branch
`fix/renovate-lockfile-ranges`); deze spec is de bewaking erop en wordt pas na die PR gemerged, want de labels `major` en
`security` komen daarvandaan.

Kritiek werk (`.github/**`, bewaking; R-WERK-05): spec, code en tests in één PR, de eigenaar merget.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| workflow `dependency-achterstand` (wekelijks en handmatig, op `main`) | leest open PR's, issues en de check-runs op de head van een update-PR via de GitHub-API, wordt rood met een lijst | iets schrijven: geen label, comment, issue of status |
| eigenaar | ziet een rode run in Actions; GitHub mailt hem bij een mislukte run als zijn notificatie-instellingen dat toestaan; merget, repareert of sluit de PR met reden | — |
| hoofdsessie | draait het script lokaal op verzoek (`node scripts/kit/dependency-achterstand.mjs` met `GITHUB_TOKEN` en `GITHUB_REPOSITORY`) | — |

## Kopieer de vorm van

Geen resource uit `docs/gouden-pad.md`. Railwerk volgt bestaande vormen:

- `scripts/kit/leerpunt-check.mjs` — `api()` met `fetch` naar `api.github.com`, alleen `node:`-imports, `import.meta.main`
- `.github/workflows/osv.yml` — wekelijkse job met `permissions: read-all`, runner, `timeout-minutes`, checkout zonder
  credentials, mise voor node
- `test/rails/leerpunt-workflow.test.ts` — workflowtoetsen op tekst

## Hergebruik en UX

Geen scherm. Uitvoer in de job-log, Nederlands, één regel per bevinding:

- PR: `#<nr> <titel>: <d> dagen open, grens <g> (<soort>)` met soort `niet-major`, `beveiliging` of `major`.
- Renovate-fout: `Renovate meldt een fout: <issuetitel> (#<nr>)`.
- Dashboard: `Dependency Dashboard (#<nr>): sectie <kop> (<n> regel(s))`, met de kop zoals in het issue.
- Rood sluit af met: `Achterstand in dependency-updates: <n> bevinding(en). Merge, repareer of sluit de PR met een reden.`
- Groen: `Geen achterstand: <n> open update-PR(’s), alle binnen de grens.` (ook bij 0 en 1 letterlijk zo)
- Fout: `GitHub-API: <pad>: HTTP <status>`, `GitHub-API: <pad>: <foutmelding>` of `<NAAM> ontbreekt`.

## Acceptatiecriteria

Bronnen: `GET repos/<repo>/pulls?state=open&per_page=100&page=<p>` en `GET repos/<repo>/issues?state=open&per_page=100&page=<p>`
(elementen met een veld `pull_request` overgeslagen), per bron hooguit 10 pagina's; per update-PR ook
`GET repos/<repo>/commits/<head.sha>/check-runs?per_page=100&page=<p>` (de standaardfilter `latest`: per check alleen de
laatste run; het veld `check_runs`, hooguit 10 pagina's). Een update-PR is een open PR waarvan de
head-branch met `renovate/` begint en die uit `GITHUB_REPOSITORY` zelf komt (`head.repo.full_name`). Een Renovate-issue heeft
auteur `renovate[bot]`. Leeftijd: `floor((nu − created_at) / 86 400 000)` in hele dagen, UTC; melden als leeftijd > grens.
Grens: 7 met label `security`, anders 60 met label `major`, anders 14. Exitcodes: 0 groen, 1 rood (bevindingen), 2 fout.

- **dependency-achterstand/AC-1** — Gegeven een update-PR zonder label `security` of `major` van 15 dagen en een tweede van
  14 dagen, wanneer de check draait, dan meldt hij alleen de eerste als `niet-major` met grens 14 en eindigt hij met
  exitcode 1. Toets: `test/scripts/dependency-achterstand.test.ts`
- **dependency-achterstand/AC-2** — Gegeven een update-PR met label `security` van 8 dagen, wanneer de check draait, dan
  meldt hij hem als `beveiliging` met grens 7; ook als de PR daarnaast label `major` heeft. Toets:
  `test/scripts/dependency-achterstand.test.ts`
- **dependency-achterstand/AC-3** — Gegeven een update-PR met label `major` van 61 dagen en een tweede van 60 dagen, wanneer
  de check draait, dan meldt hij alleen de eerste als `major` met grens 60. Toets:
  `test/scripts/dependency-achterstand.test.ts`
- **dependency-achterstand/AC-4** — Gegeven een open Renovate-issue met een titel die met `Action Required` begint, wanneer de
  check draait, dan meldt hij een Renovate-fout en eindigt met exitcode 1; hetzelfde issue van een andere auteur telt niet.
  Toets: `test/scripts/dependency-achterstand.test.ts`
- **dependency-achterstand/AC-5** — Gegeven het Renovate-issue `Dependency Dashboard` met een kop `## Errored`,
  `## Rate-Limited`, `## Pending Approval` of `## Repository Problems` (hoofdletters vrij), wanneer de check draait, dan meldt
  hij per kop een bevinding met het aantal lijstregels (beginnend met `-`, ook `- [ ]` en `- WARN: …`) eronder; koppen als `## Awaiting Schedule`, `## Open` en
  `## PR Edited (Blocked)` tellen niet. Toets: `test/scripts/dependency-achterstand.test.ts`
- **dependency-achterstand/AC-6** — Gegeven alleen update-PR's binnen hun grens, PR's van een andere branch of uit een fork
  met head-branch `renovate/x` (ongeacht leeftijd) en geen Renovate-bevinding, wanneer de check draait, dan eindigt hij met
  exitcode 0 en de groene regel met het aantal update-PR's. Toets: `test/scripts/dependency-achterstand.test.ts`
- **dependency-achterstand/AC-7** — Gegeven een antwoord dat niet 2xx is, een `fetch` die gooit, een antwoord dat geen
  geldige JSON-lijst is, een ontbrekende `GITHUB_TOKEN` of `GITHUB_REPOSITORY`, of een tiende pagina met precies 100
  elementen (meer dan 10 pagina's, zoals `alleComments` in `scripts/kit/leerpunt-check.mjs`), wanneer de check
  draait, dan eindigt hij met exitcode 2 en de foutregel; hij wordt nooit groen zonder gelezen data. Toets:
  `test/scripts/dependency-achterstand.test.ts`
- **dependency-achterstand/AC-8** — De workflow draait alleen op `schedule` (dinsdag 06:23 UTC, na de Renovate-run van
  maandagochtend) en `workflow_dispatch`, niet op PR of push; heeft `permissions: read-all` en geen rechten per job; checkout
  met `persist-credentials: false`; het token staat expliciet alleen in de stap die het script draait; het script doet alleen `GET`. Toets:
  `test/rails/dependency-achterstand-workflow.test.ts`
- **dependency-achterstand/AC-9** — Gegeven een update-PR (binnen of buiten zijn grens) met op de head-commit een
  check-run met `conclusion` `failure`, `timed_out`, `cancelled` of `action_required`, wanneer de check draait, dan meldt
  hij `#<nr> <titel>: CI rood (<checknaam>)` met de alfabetisch eerste rode check, naast een eventuele leeftijdsmelding
  (dus twee regels voor een PR die te oud én rood is), en eindigt hij met exitcode 1; een PR met alleen geslaagde,
  overgeslagen, neutrale of lopende checks geeft geen CI-melding; een niet-2xx antwoord op de check-runs is exitcode 2
  (AC-7). Toegevoegd door spec `toolchain-bewaking` (eigenaarbesluit 2026-11-25). Toets:
  `test/scripts/dependency-achterstand.test.ts`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| PR met label `security` en `major` | grens 7 (beveiliging gaat voor) | — |
| Renovate-PR die de eigenaar handmatig bewerkte | telt als update-PR op leeftijd | — |
| Bewust overgeslagen versie | de eigenaar sluit de PR met reden; gesloten PR's tellen niet | — |
| Repo zonder Renovate | groen, 0 update-PR's | — |
| Update-PR met rode CI | gemeld als `CI rood`, ook binnen de grens (AC-9; was: alleen op leeftijd) | — |

## Raakt ook

- `renovate.json` (andere PR): `prConcurrentLimit: 0` en `prHourlyLimit: 0`, zodat majors die openstaan nooit een andere
  update tegenhouden; AC-5 is het vangnet.
- `docs/framework.md` R-SEC-06: de wekelijkse achterstandscheck naast CodeQL en osv-scanner.
- Geen vereiste check (R-CI-01): draait niet op PR's. `test/scripts/github-ruleset.test.ts` (`NIET_VERPLICHT`) krijgt de
  job `dependency-achterstand`, met reden in de PR (R-TEST-02).

## Buiten scope

- Zelf een issue of label schrijven (vraagt schrijfrechten).
- Leeftijd van een release meten tegenover de registry (Renovate doet dat met `minimumReleaseAge`).
- pnpm 12 (#970): eigen besluit.
- De runnertekst `ubuntu-24.04` in R-CI-01 tegenover `ubuntu-26.04` in de workflows (#969): apart.

## Testplan

- Unit: de beoordeling is een pure functie over PR's, issues en `nu`; de API-laag krijgt een nep-`fetch`.
- Rails: workflowtekst zoals `test/rails/leerpunt-workflow.test.ts`.
- Na de merge: de eigenaar start de workflow eenmaal met `workflow_dispatch`, ziet de uitslag en controleert of GitHub hem bij
  een rode run mailt (Settings → Notifications → Actions). GitHub schakelt geplande workflows in een publieke repo uit na 60
  dagen zonder activiteit in de repo; bij deze repo niet aan de orde.

## Open vragen

- **OV-1 ✅ besloten** — Signaal via een rode geplande run in plaats van een issue: alleen-lezen past bij R-SEC-06
  (`permissions: read-all`); eigenaar koos 2026-11-24 voor de wekelijkse check.
- **OV-2 ✅ besloten** — Grenzen 14 / 7 / 60 dagen: voorstel aan de eigenaar 2026-11-24, akkoord ("werk uit").
- **OV-3 ✅ besloten** — Updates die Renovate niet als PR opent (limiet, wachten op goedkeuring): limieten uit in
  `renovate.json` en de dashboardkoppen als vangnet (spec-review B1), binnen het eigenaarbesluit "niets mag ongemerkt
  blijven hangen".
