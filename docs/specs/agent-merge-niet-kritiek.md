---
status: goedgekeurd # voorstel | goedgekeurd | gebouwd | vervallen — de architect zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd: # #<deze PR> in de PR met de implementatie (ADR 0062), of # #<PR>; gevalideerd: <sha> (pnpm docs:status)
namespace: agent-merge-niet-kritiek
model: opus
---

# De hoofdsessie merget niet-kritiek werk zelf

## Doel

De hoofdsessie merget een PR zelf met `pnpm pr:merge <nr>` als die niet kritiek is en geen beschermd pad raakt, en alleen als
CI, review en Codex dat aantoonbaar zeggen ([ADR 0069](../adr/0069-agent-merge-niet-kritiek.md)). Alle andere merge-routes
blijven dicht. Aanleiding: opdracht van de eigenaar, 3 november 2026.

## Rollen en wie wat ziet

n.v.t. — geen app-gebruikers. Alleen de hoofdsessie mag `pnpm pr:merge`; subagents nooit; de eigenaar merget alles wat het
oordeel niet toelaat en zet de modus.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes. Het script stopt met exit 1 en één regel per niet-vervulde voorwaarde (AC-3).

## Kopieer de vorm van

- `scripts/kit/diff-guard.mjs` — `geraakt()`, `risico()` en `beoordeel()` (oordeel op de PR als git-data)
- `scripts/kit/pr-verify.mjs` — `checkProgress()` (verplichte checks op de head-SHA uit `requiredChecks`)
- `.github/workflows/guard.yml` — job `diff-guard` (`pull_request_target`, scripts van `main`, geen PR-code uitvoeren)
- `rails/hooks/lib/rolhek.mjs` — de bestaande merge-weigering (WS-04) en de blobcontrole van de lader tegen het anker

## Hergebruik en UX

n.v.t. — geen UI. Meldingen van `pr:merge` en het rolhek zijn Nederlands en noemen de voorwaarde en ADR 0069.

## Acceptatiecriteria

- **agent-merge-niet-kritiek/AC-1** — `scripts/kit/diff-guard.mjs` exporteert een functie die voor een PR `agent-merge: ja`
  of `agent-merge: nee` met redenen geeft. `ja` alleen als: geen pad uit `gates` en geen `jsonGates`-sleutel verandert (een
  nieuw testbestand uit `testpaden` uitgezonderd), geen bestaande test verandert, verdwijnt of hernoemd wordt, het
  risico-overzicht leeg is (migraties, permissiesleutels, dependencies, routes) en geen contractbestand verandert, en geen pad
  `kritiekPad()` uit `scripts/kit/lane.mjs` is. Een APPROVED van een goedkeurder verandert de uitslag niet. Tabeltest met per
  uitsluiting een PR die `nee` geeft en een PR met alleen app-code, een nieuwe test en een doc buiten de gates die `ja` geeft.
- **agent-merge-niet-kritiek/AC-2** — `.github/workflows/guard.yml` krijgt een job `agent-merge` die alleen draait (en
  slaagt) als het oordeel uit AC-1 `ja` is, en anders overgeslagen wordt; hij voert geen PR-code uit en staat niet in
  `requiredChecks`, maar op de lijst bewust niet verplichte jobs naast `diff-guard` (0068 punt 1). De diff-guard zelf
  verandert niet van uitslag.
- **agent-merge-niet-kritiek/AC-3** — `pnpm pr:merge <nr>` (`scripts/kit/pr-merge.mjs`) merget alleen via
  `PUT /repos/{repo}/pulls/{nr}/merge` met `merge_method=squash` en `sha=<head-SHA>`, en alleen als alle voorwaarden uit
  ADR 0069 punt 3 gelden: modus `"niet-kritiek"` in `.claude/gates.json` op `origin/main` (ontbrekend of onleesbaar telt als
  `"eigenaar"`); PR open, geen draft, basis `main`, head-repository gelijk aan basis, head-SHA gelijk aan lokale `HEAD`;
  `main` is voorouder van de head; elke check uit `requiredChecks` `success` op de head-SHA; job `agent-merge` `success` in
  de run van `.github/workflows/guard.yml` met event `pull_request_target` op de head-SHA (een gelijknamige check uit een
  andere workflow telt niet); een PR-commentaar `Review <head-SHA>: geen blokkerende bevindingen`; een Codex-review of
  Codex-uitslag op de head-SHA en geen onopgeloste review-thread; de laatste uitslag van `requiredChecks` op de kop van
  `main` groen. Elke ontbrekende voorwaarde geeft een eigen regel en exit 1 zonder API-schrijfactie. Alleen REST, geen
  GraphQL. Unittest per voorwaarde met nagebootste API-antwoorden.
- **agent-merge-niet-kritiek/AC-4** — Het rolhek weigert elke rol `gh pr merge`, `gh api …/merge`, auto-merge en elke
  `mcp__`-merge, zoals nu. Het staat alleen de hoofdsessie `pnpm pr:merge <nr>` toe (precies die vorm, `<nr>` alleen cijfers),
  en alleen als `scripts/kit/pr-merge.mjs` en de bestanden die het importeert gelijk zijn aan de blobs in het anker; anders
  weigert het met de reden. Een subagent krijgt altijd een weigering. `.claude/settings.json` houdt de deny-regels voor
  `gh pr merge` en `gh api *merge*`.
- **agent-merge-niet-kritiek/AC-5** — `.claude/gates.json` krijgt de sleutel `merge` met waarde `"niet-kritiek"`; `check-docs`
  weigert elke andere waarde dan `"eigenaar"` of `"niet-kritiek"`.
- **agent-merge-niet-kritiek/AC-6** — Regelboek en instructies: R-REPO-01 en R-REPO-05 zeggen dat de eigenaar merget,
  behalve dat de hoofdsessie een PR met oordeel `agent-merge: ja` merget via `pnpm pr:merge` (0069); R-ROL-08 noemt
  `pnpm pr:merge` van de hoofdsessie als enige uitzondering op "mergen"; R-WERK-12 en stap 7 van §8 noemen de agent-merge;
  R-DOC-09 verwijst naar 0069 in plaats van "na de GitHub App". `AGENTS.md`, `CLAUDE.md` en de skill `opleveren` zeggen
  hetzelfde in één zin elk, met de regel dat de agent na een merge PR en SHA meldt. `docs/specs/agent-merge.md` staat op
  `vervallen` en het roadmap-item "ADR 0029 stap 7" verwijst naar deze spec.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| PR raakt alleen `src/web` en voegt een test toe | `agent-merge: ja` (AC-1) | n.v.t. |
| PR wijzigt een bestaande test met reden in de PR | `nee`; eigenaar merget (AC-1) | n.v.t. |
| PR met een spec of ADR | `nee`; de merge is het besluit (AC-1) | n.v.t. |
| PR met een nieuwe migratie in het owner-patroon | `nee`; migraties zijn onherroepelijk in de geschiedenis (AC-1) | n.v.t. |
| PR met nieuwe permissie zonder spec | `nee` via het risico-overzicht (AC-1) | n.v.t. |
| PR-branch voegt een workflow met job `agent-merge` toe | telt niet: alleen de `guard.yml`-run met `pull_request_target`, en `.github/**` is een gate (AC-1, AC-3) | n.v.t. |
| Push na de review | reviewcommentaar hoort bij een oude SHA: geen merge (AC-3) | n.v.t. |
| `main` schoof door na de laatste CI-run | geen merge; eerst `git merge origin/main` en CI opnieuw (AC-3) | n.v.t. |
| `main` is rood | geen merge tot `main` groen is (AC-3) | n.v.t. |
| Modus staat op `"eigenaar"` of ontbreekt | geen merge (AC-3) | n.v.t. |
| Lokaal aangepast `pr-merge.mjs` | rolhek weigert (AC-4); valt het rolhek open, dan toetst CI nog de inhoud en eist de ruleset groene checks | n.v.t. |
| Rolhek valt open op `gh pr merge` | deny-regel in `.claude/settings.json` (AC-4) | n.v.t. |

## Raakt ook

`scripts/kit/diff-guard.mjs`, `scripts/kit/pr-merge.mjs` (nieuw), `package.json` (`scripts`), `.github/workflows/guard.yml`
(eigenaar pusht), `.claude/gates.json`, `.claude/settings.json`, `rails/hooks/lib/rolhek.mjs`, `scripts/kit/check-docs.mjs`,
`test/scripts/github-ruleset.test.ts` (lijst bewust niet verplichte jobs; bestaande test, wijzigt met reden in de PR),
`test/scripts/guard-workflow.test.ts`, `test/rails/diff-guard.test.ts`, de rolhektests met de merge-weigering (bestaande
tests; wijzigen met reden in de PR), `docs/framework.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/skills/opleveren/SKILL.md`,
`docs/operations/agent-doorloop.md`, `docs/specs/agent-merge.md`, `docs/roadmap.md`. De bouw volgt na de bouw van
`samenhang-checks-rollen` (0068), die dezelfde rulesettest en `docs/framework.md` raakt.

## Buiten scope

Ruimer mergen op gate-paden buiten `voorReview`; de GitHub App (ST-01); `agent-merge` als verplichte check; mergen in
andere runtimes dan via `pnpm pr:merge`.

## Testplan

Tabeltest voor het oordeel (AC-1) op `geraakt()`- en `risico()`-invoer; workflowtest op job, conditie en `pull_request_target`
(AC-2); unittests per voorwaarde van `pr:merge` met nagebootste REST-antwoorden, ook een gelijknamige check uit een andere
workflow (AC-3); rolhektests voor hoofdsessie en elke subagentrol, met gelijk en afwijkend script (AC-4); `check-docs`-test op
de modus (AC-5); docs-tests op de regels uit AC-6. Elke negatieve test faalt op de huidige code (R-PRINC-04).

## Open vragen

Geen. De grens "geen gate-pad, behalve een nieuwe test" volgt uit de opdracht ("niet kritiek en niets kunnen slopen");
ruimer is een apart besluit (ADR 0069, Alternatieven).
