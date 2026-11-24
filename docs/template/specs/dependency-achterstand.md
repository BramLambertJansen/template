---
status: goedgekeurd
namespace: dependency-achterstand
---

# Achterstand in dependency-updates

## Doel

Een update die blijft hangen, valt binnen een week op: een wekelijkse check op `main` wordt rood als een Renovate-PR te lang
openstaat of Renovate zelf een fout meldt, zodat de repo niet ongemerkt achterloopt.

**Aanleiding.** PR #967 (alle niet-majors van een week) was rood omdat één pakket (lefthook 2.2.2) door pnpm geweigerd werd;
29 andere updates wachtten mee en niets waarschuwde. Majors waren deels verborgen (`allowedVersions`). Eigenaarbesluit
2026-11-24: elke update wordt getest en wie achterloopt, merkt dat. Het Renovate-deel (majors als PR met label `major`, geen
verborgen versies) staat in `renovate.json` en R-PROV-04; deze spec is de bewaking erop.

Kritiek werk (`.github/**`, bewaking; R-WERK-05): spec, code en tests in één PR, de eigenaar merget.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| workflow `dependency-achterstand` (wekelijks en handmatig, op `main`) | leest open PR's en issues via de GitHub-API, wordt rood met een lijst | iets schrijven: geen label, comment, issue of status |
| eigenaar | krijgt bij rood de standaardmail van GitHub over een mislukte geplande run; merget, repareert of sluit de PR met reden | — |
| hoofdsessie | draait het script lokaal op verzoek (`node scripts/kit/dependency-achterstand.mjs` met `GITHUB_TOKEN` en `GITHUB_REPOSITORY`) | — |

## Kopieer de vorm van

n.v.t. voor `docs/gouden-pad.md` (geen resource). Railwerk volgt bestaande vormen:

- `scripts/kit/leerpunt-check.mjs` — `api()` met `fetch` naar `api.github.com`, alleen `node:`-imports, `import.meta.main`
- `.github/workflows/osv.yml` — wekelijkse job met `permissions: read-all`, checkout zonder credentials, mise voor node
- `test/rails/leerpunt-workflow.test.ts` — workflowtoetsen op tekst

## Hergebruik en UX

Geen scherm. Uitvoer in de job-log, Nederlands, één regel per bevinding:

- Bevinding: `#<nr> <titel>: <d> dagen open, grens <g> (<soort>)` met soort `niet-major`, `beveiliging` of `major`.
- Renovate-fout: `Renovate meldt een fout: <issuetitel> (#<nr>)` of `Dependency Dashboard (#<nr>) heeft een sectie Errored`.
- Rood sluit af met: `Achterstand in dependency-updates: <n> bevinding(en). Merge, repareer of sluit de PR met een reden.`
- Groen: `Geen achterstand: <n> open update-PR('s), alle binnen de grens.`

## Acceptatiecriteria

Een update-PR is een open PR waarvan de head-branch met `renovate/` begint. Leeftijd telt in hele dagen vanaf `created_at`.
Grenzen: 7 dagen met label `security`, anders 60 met label `major`, anders 14.

- **dependency-achterstand/AC-1** — Gegeven een update-PR zonder label `security` of `major` die 15 dagen open is (en een
  tweede die 14 dagen open is), wanneer de check draait, dan meldt hij alleen de eerste als `niet-major` met grens 14 en is de
  uitslag rood. Toets: `test/scripts/dependency-achterstand.test.ts` (nieuw)
- **dependency-achterstand/AC-2** — Gegeven een update-PR met label `security` die 8 dagen open is, wanneer de check draait,
  dan meldt hij hem als `beveiliging` met grens 7; ook als de PR daarnaast label `major` heeft. Toets:
  `test/scripts/dependency-achterstand.test.ts` (nieuw)
- **dependency-achterstand/AC-3** — Gegeven een update-PR met label `major` die 61 dagen open is (en een tweede die 59 dagen
  open is), wanneer de check draait, dan meldt hij alleen de eerste als `major` met grens 60. Toets:
  `test/scripts/dependency-achterstand.test.ts` (nieuw)
- **dependency-achterstand/AC-4** — Gegeven een open issue van `renovate[bot]` met een titel die met `Action Required` begint,
  of een open issue `Dependency Dashboard` van `renovate[bot]` met een regel `## Errored`, wanneer de check draait, dan meldt
  hij dat als Renovate-fout en is de uitslag rood; hetzelfde issue van een andere auteur telt niet. Toets:
  `test/scripts/dependency-achterstand.test.ts` (nieuw)
- **dependency-achterstand/AC-5** — Gegeven alleen update-PR's binnen hun grens, PR's van andere branches (ongeacht leeftijd)
  en geen Renovate-fout, wanneer de check draait, dan is de uitslag groen met het aantal open update-PR's. Toets:
  `test/scripts/dependency-achterstand.test.ts` (nieuw)
- **dependency-achterstand/AC-6** — Gegeven een fout van de GitHub-API (niet-2xx), wanneer de check draait, dan eindigt hij
  met exitcode 2 en de melding `GitHub-API: <pad>: HTTP <status>`; hij wordt nooit groen zonder gelezen data. Toets:
  `test/scripts/dependency-achterstand.test.ts` (nieuw)
- **dependency-achterstand/AC-7** — De workflow draait alleen op `schedule` en `workflow_dispatch` (niet op PR of push), heeft
  `permissions: read-all` en geen rechten per job, checkout met `persist-credentials: false`, het token alleen in de stap die
  het script draait; het script doet alleen `GET`. Toets: `test/rails/dependency-achterstand-workflow.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Meer dan 100 open PR's of issues | het script leest per pagina van 100, hooguit 10 pagina's; daarboven exitcode 2 | — |
| PR met label `security` en `major` | grens 7 (beveiliging gaat voor) | — |
| Renovate-PR die de eigenaar handmatig bewerkte (dashboard: "PR Edited (Blocked)") | telt als gewone update-PR op leeftijd | — |
| Bewust overgeslagen versie | de eigenaar sluit de PR met reden; gesloten PR's tellen niet | — |
| Repo zonder Renovate (geen update-PR's, geen issues van Renovate) | groen, `0 open update-PR's` | — |

## Raakt ook

- `docs/framework.md` R-SEC-06: de wekelijkse achterstandscheck naast CodeQL en osv-scanner.
- Geen vereiste check (R-CI-01): hij draait niet op PR's, zodat een hangende update geen andere PR rood maakt.

## Buiten scope

- Zelf een issue of label schrijven (vraagt schrijfrechten; de mail van GitHub bij een rode geplande run is het signaal).
- Leeftijd van een release meten tegenover de registry (Renovate doet dat al met `minimumReleaseAge`).
- pnpm 12 (#970): eigen besluit.

## Testplan

- Unit: de beoordeling is een pure functie over PR's, issues en `nu`; de API-laag krijgt een nep-`fetch`.
- Rails: workflowtekst zoals `test/rails/leerpunt-workflow.test.ts`.
- Na de merge: de eigenaar start de workflow eenmaal met `workflow_dispatch` en ziet de uitslag (geen AC, CI-stap).

## Open vragen

- **OV-1 ✅ besloten** — Signaal via rode geplande run (mail van GitHub) in plaats van een issue: alleen-lezen past bij
  R-SEC-06 (`permissions: read-all`); eigenaar koos 2026-11-24 voor de wekelijkse check.
- **OV-2 ✅ besloten** — Grenzen 14 / 7 / 60 dagen: voorstel aan de eigenaar 2026-11-24, akkoord ("werk uit").
