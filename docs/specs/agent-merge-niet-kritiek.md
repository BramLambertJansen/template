---
status: gebouwd # #579
namespace: agent-merge-niet-kritiek
model: opus
---

# De hoofdsessie merget niet-kritiek werk zelf

## Doel

De hoofdsessie merget een PR zelf met `pnpm pr:merge <nr>` als die niet kritiek is en geen beschermd pad raakt, en alleen als
CI en review dat aantoonbaar zeggen ([ADR 0069](../adr/0069-agent-merge-niet-kritiek.md)). Alle andere merge-routes
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
  of `agent-merge: nee` met redenen geeft. `ja` alleen als: elk geraakt pad (bij hernoeming beide) past op
  `agentMerge.toegestaan` en op geen glob uit `gates`, `agentMerge.kritiek` of `kritiekPad()`, met als enige uitzondering een
  nieuw testbestand uit `testpaden` onder `src/`, `test/`, `e2e/` of `db/tests/` met extensie `.ts`, `.tsx` of `.sql`; geen
  pad dat op naam vanzelf geladen wordt, waar ook (een segment dat met `.` begint, `CLAUDE*.md`, `AGENTS*.md` zoals
  `INSTRUCTIES` in `scripts/kit/lane.mjs`, `*.config.*`, `package.json`, `tsconfig*.json`); geen
  `jsonGates`-sleutel verandert; geen bestaande test verandert, verdwijnt of hernoemd wordt; het risico-overzicht leeg is
  (migraties, permissiesleutels, dependencies, routes) en geen contractbestand verandert; en geen toegevoegde of verwijderde
  regel in `src/` het woord `permission` bevat. Een onbekend pad, een ontbrekende of onleesbare `agentMerge` en een APPROVED
  van een goedkeurder geven `nee` respectievelijk geen verandering. Tabeltest met per uitsluiting een PR die `nee` geeft (o.a.
  `docs/adr/0070-x.spec.md`, `.claude/agents/x.test.md`, een nieuwe `postcss.config.mjs`, `playwright.smoke.config.ts`,
  `src/api/login-policy.ts`, een verwijderde permissiesleutel, `src/web/CLAUDE.md`, `docs/AGENTS.md`,
  `src/web/postcss.config.mjs`, `src/x/.claude/skills/y.md`, `docs/operations/agent-doorloop.md`) en een PR met alleen `src/web`-code, een nieuwe test en een doc
  buiten de gates die `ja` geeft. Omvanggrens: ook `nee` boven `agentMerge.maxRegels` regels, met een binair bestand of een
  onleesbare telling (AC-9).
- **agent-merge-niet-kritiek/AC-2** — `.github/workflows/guard.yml` krijgt een job `agent-merge` die alleen draait (en
  slaagt) als het oordeel uit AC-1 `ja` is, en anders overgeslagen wordt; hij voert geen PR-code uit en staat niet in
  `requiredChecks`, maar op de lijst bewust niet verplichte jobs naast `diff-guard` (0068 punt 1). De diff-guard zelf
  verandert niet van uitslag.
- **agent-merge-niet-kritiek/AC-3** — `pnpm pr:merge <nr>` (`scripts/kit/pr-merge.mjs`) merget alleen via
  `PUT /repos/{repo}/pulls/{nr}/merge` met `merge_method=squash` en `sha=<head-SHA>`, en alleen als alle voorwaarden uit
  ADR 0069 punt 3 gelden. Modus en kop van `main` leest het via REST (`GET …/branches/main`, `GET …/contents/.claude/gates.json?ref=<sha>`),
  niet uit de lokale `origin/main`; ontbrekend of onleesbaar telt als `"eigenaar"`. `requiredChecks` leest het uit
  `.claude/decisions.json` op dezelfde main-SHA. Voorouder: `GET …/compare/<main-sha>...<head-sha>`
  met `behind_by` 0. Checks: elke naam uit `requiredChecks` (uit dezelfde main-SHA) `success` op de head-SHA, en job
  `agent-merge` `success` in de workflow-run met `path` `.github/workflows/guard.yml` en event `pull_request_target` op de
  head-SHA (een gelijknamige check uit een andere workflow telt niet); de laatste uitslag van `requiredChecks` op de kop van
  `main` is `success`. De check-runs van `pull_request_target` hangen aan de PR-head (vastgesteld op #445: `diff-guard`,
  `document-status` en `check-core` stonden op head-SHA `39f0ce8`); het script koppelt de check-run `agent-merge` via zijn
  `check_suite` aan de workflow-run en eist `path` `.github/workflows/guard.yml` en event `pull_request_target` (een run waarvan
  `pull_requests` alleen andere PR-nummers noemt, telt niet; leeg kan, gezien op #445); lukt dat niet, dan geen merge. De job houdt daarom de vaste naam `agent-merge`. Review: een PR-commentaar `Review <head-SHA>: geen blokkerende bevindingen`. Geen onopgeloste review-thread: REST kent die
  stand niet, dus de ruleset op main (`required_review_thread_resolution`) weigert de merge dan. Een externe review is geen
  voorwaarde (AC-7). Elke ontbrekende voorwaarde geeft een eigen regel en exit 1 zonder schrijfactie. Alleen REST, geen
  GraphQL. Unittest per voorwaarde met nagebootste API-antwoorden. `pr:merge` telt de omvang via REST tegen
  `agentMerge.maxRegels` (AC-9).
- **agent-merge-niet-kritiek/AC-4** — Het rolhek weigert elke rol `gh pr merge`, `gh api …/merge`, auto-merge en elke
  `mcp__`-merge, zoals nu. Het geeft de hoofdsessie `allow` voor precies `pnpm pr:merge <nr>` (`<nr>` alleen cijfers), alleen
  als op schijf `scripts/kit/pr-merge.mjs`, de bestanden die het importeert en de bestanden uit `HOST_FILES`
  (`rails/hooks/lib/runner-authority.mjs`) gelijk zijn aan de blobs in het anker; anders weigert het met de reden. Tabeltest
  met een gewijzigde scriptregel `pr:merge` in `package.json` en een gewijzigde `.npmrc`. Een subagent krijgt altijd een weigering. `.claude/settings.json` houdt de deny-regels voor `gh pr merge` en
  `gh api *merge*`, zet `pnpm pr:merge` in `sandbox.excludedCommands` (anders keurt `autoAllowBashIfSandboxed` hem vanzelf
  goed) en krijgt een `ask`-regel `Bash(pnpm pr:merge *)`, zodat een openvallend rolhek een prompt geeft. De bouw-PR toetst
  beide paden: met werkend rolhek geen prompt (hook-`allow`), met falend rolhek een prompt; geeft een hook-`allow` de
  `ask`-regel niet vrij, dan meldt de bouw-PR dat en kiest de eigenaar. `scripts/kit/pr-merge.mjs` staat in `KRITIEK` in `scripts/kit/lane.mjs`.
- **agent-merge-niet-kritiek/AC-5** — `.claude/gates.json` krijgt `merge: "niet-kritiek"` en `agentMerge` met `toegestaan`
  en `kritiek` zoals in ADR 0069 punt 1 en 3. `check-docs` weigert voor `merge` elke andere waarde dan `"eigenaar"` of
  `"niet-kritiek"`, en een configuratie waarin een pad uit `voorReview` of `altijdVragen` na de uitsluitingen (`gates`, `agentMerge.kritiek`,
  de naamregel uit AC-1) nog agent-mergebaar is; de toets gebruikt dezelfde functie als AC-1 op de vaste paden en globs van die
  lijsten. `docs/**` in `toegestaan` is dus geldig zolang `docs/framework.md` en `docs/dod.md` gates zijn. Vorm van `agentMerge`:
  `maxRegels` een geheel getal ≥ 1, ook getoetst door `check-docs` (AC-8, AC-9).
- **agent-merge-niet-kritiek/AC-6** — Regelboek en instructies: R-REPO-01 en R-REPO-05 zeggen dat de eigenaar merget, behalve
  dat de hoofdsessie in Claude Code een PR met oordeel `agent-merge: ja` merget via `pnpm pr:merge` (0069); R-ROL-08 noemt
  `pnpm pr:merge` van de hoofdsessie als enige uitzondering op "mergen"; R-WERK-12 en stap 7 van §8 noemen de agent-merge;
  R-WERK-23 en R-ROL-10 zeggen dat de inhoudstoets voor een agent-merge een vangnet is (script en rolhek) en geen grens van
  GitHub, en dat een andere runtime niet merget; R-DOC-09 verwijst naar 0069 in plaats van "na de GitHub App". `AGENTS.md`,
  `CLAUDE.md` en de skill `opleveren` zeggen hetzelfde in één zin elk, met de regel dat de agent na een merge PR en SHA meldt
  en de CI op `main` volgt. `docs/specs/agent-merge.md` staat op `vervallen`; de roadmap-items "ADR 0029 stap 7" en
  "ADR 0030 PR 2" en de verwijzing bij "Volledig pad naar `gh` in het rolhek" verwijzen naar deze spec.
- **agent-merge-niet-kritiek/AC-7** — Geen Codex-voorwaarde meer (ADR 0069 herzien 2026-11-05):
  `scripts/kit/pr-merge.mjs` verliest `CODEX`, `CODEX_LOOPT`, `codexStand()`, `codexRedenen()`, `codexBezig()`,
  `codexSpoorOp()`, `codexVoorwaarde()` en `branchPrs()`, en leest geen reacties, check-suites of reviews meer voor Codex.
  `beoordeelMerge()` geeft `{ redenen }` zonder stand; `slotRegels(nummer, head)` geeft na elke geslaagde merge precies twee
  regels: de bestaande slotregel en `Meld deze merge als steekproef (ADR 0069 punt 5).` (`STEEKPROEF`, vervangt
  `STEEKPROEF_VERVIEL` en `STEEKPROEF_UIT`). Unittest: een wereld met een 👀 of een samenvatting `running` van
  `chatgpt-codex-connector[bot]` geeft geen reden (faalt op de huidige code met de wachtreden); de steekproefregel komt ook
  bij een wereld zonder enig Codex-spoor en is letterlijk deze tekst.
- **agent-merge-niet-kritiek/AC-8** — `agentMerge.codex` vervalt: `.claude/gates.json` en zijn
  `$comment` noemen `codex` niet meer; `leesAgentMerge()` in `scripts/kit/agent-merge.mjs` geeft `null` en
  `agentMergeFouten()` de reden `agentMerge.codex bestaat niet meer: haal de sleutel weg (ADR 0069)` zodra het blok een sleutel
  `codex` heeft, welke waarde ook; `CodexModus` en `leesCodex()` verdwijnen. `check-docs` (`agentMergeVorm`) meldt dan
  `docs:agentMerge.codex` met `.claude/gates.json: agentMerge.codex bestaat niet meer (ADR 0069); haal de sleutel weg`.
  Tabeltest met `codex` `true`, `false`, `"indien-aanwezig"` en `"ja"`: elk geeft `null`, de reden en de overtreding; zonder
  `codex` is het blok geldig. De omvanggrens (`maxRegels`, `maxBytes`, binair) blijft ongewijzigd.
- **agent-merge-niet-kritiek/AC-9** — Deze spec draagt de omvanggrens: het oordeel (AC-1) en `pr:merge`
  (AC-3) geven `nee` respectievelijk een reden boven `agentMerge.maxRegels` regels, met een binair bestand of bij een
  onleesbare telling, zoals tot nu in [agent-merge-zonder-codex](agent-merge-zonder-codex.md) AC-1 tot en met AC-3 en AC-6
  (de bytegrens blijft in [agent-merge-bytegrens](agent-merge-bytegrens.md)); de tests daarvan dragen voortaan deze AC-id en
  blijven verder gelijk. De bouw-PR werkt AC-1, AC-3 en AC-5 bij: de verwijzingen naar agent-merge-zonder-codex en
  agent-merge-codex-wachten, het woord "Codex" in "Doel" ("CI, review en Codex") en de zinnen over Codex gaan eruit, het
  randgeval "App zonder Codex" vervalt; de AC-id's blijven. In dezelfde bouw-PR gaan
  [agent-merge-zonder-codex](agent-merge-zonder-codex.md) en [agent-merge-codex-wachten](agent-merge-codex-wachten.md) naar
  `vervallen` (in deze besluit-PR houden ze hun status, omdat de code ze tot de bouw nog uitvoert).
- **agent-merge-niet-kritiek/AC-10** — Geen Codex in de actieve werkstraat. Uitgangspunt is
  `git grep -il codex -- scripts .claude README.md docs/operations test src rails db e2e .github package.json AGENTS.md CLAUDE.md docs/framework.md docs/dod.md`
  zonder `test/rails/fixtures/` (stand bij dit besluit: de 32 bestanden onder "Raakt ook"). Na de bouw-PR geeft die
  opdracht alleen nog deze uitzonderingen, letterlijk:
  1. `scripts/kit/meting.mjs`, `scripts/kit/meting-trend.mjs`, `test/rails/leesbudget.test.ts`,
     `test/rails/meting-kerncijfers-pr-tabel.test.ts` en `test/rails/meting-stuurt.test.ts` (de meting, tot de aparte
     meting-PR, OV-1);
  2. in `.claude/skills/opleveren/SKILL.md` alleen stap 8 ("CI-rood of Codex-bevindingen"), en in
     `docs/operations/agent-doorloop.md` alleen de twee zinnen over `pnpm meting --pr-tabel` en `--trend` (idem);
  3. de constante `KOP_0069` in `test/rails/adr-herzien.test.ts` (vaste historische kop, niet vergeleken met het echte ADR);
  4. de nieuwe docs-test van deze AC zelf;
  5. alleen regels die de verouderde sleutel of de bot herkennen, melden of nabootsen: in `scripts/kit/agent-merge.mjs` en
     `scripts/kit/check-docs.mjs` de regels die de sleutel `codex` herkennen of melden (de reden en `docs:agentMerge.codex`
     uit AC-8); in de opvolgers van `test/scripts/pr-merge-zonder-codex.test.ts` en
     `test/rails/agent-merge-zonder-codex.test.ts` (naam zonder "codex") de regels die de wereld met
     `chatgpt-codex-connector[bot]` (AC-7) of de `codex`-fixtures en de verwachte reden en `docs:agentMerge.codex` (AC-8)
     opbouwen. Andere regels in die vier bestanden noemen het woord niet (eigenaar, 5 november 2026).
  Elke andere treffer is weg: stap 3 van "Mergen" in de skill wordt `Threads zijn opgelost; een externe review is geen
  voorwaarde.`; de runtimezinnen in `README.md` en `docs/operations/agent-doorloop.md` zeggen "andere runtimes" zonder
  naam; in `docs/operations/review-checklists.md` vervalt "Codex vraagt hier steeds naar." en wordt "de PR- of Codex-review"
  "de PR-review"; herkomst in testnamen en commentaar ("review Codex", "Codex-review", "Codex-bevinding op #544",
  "codex-bevindingen") wordt "review op #<nr>", branchnamen `codex/…` in tests worden `claude/…`. Een nieuwe docs-test in
  `test/docs/` draait de opdracht hierboven en faalt op elke treffer buiten de vijf uitzonderingen (op regelniveau voor 2,
  3 en 5); een treffer in `docs/adr/` of `docs/specs/` telt niet (historie blijft).

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| PR raakt alleen `src/web` en voegt een test toe | `agent-merge: ja` (AC-1) | n.v.t. |
| PR wijzigt een bestaande test met reden in de PR | `nee`; eigenaar merget (AC-1) | n.v.t. |
| PR met een spec of ADR | `nee`; de merge is het besluit (AC-1) | n.v.t. |
| Nieuw `docs/adr/0070-x.spec.md` of `.claude/agents/x.test.md` | `nee`: de testuitzondering geldt alleen onder `src/`, `test/`, `e2e/`, `db/tests/` (AC-1) | n.v.t. |
| Nieuw configbestand in de root (`postcss.config.mjs`, `.mcp.json`) | `nee`: niet op de toegestane lijst (AC-1) | n.v.t. |
| Wijziging in `src/api/login-policy.ts` of `src/shared/limits.ts` | `nee`: `agentMerge.kritiek` (AC-1) | n.v.t. |
| Permissiesleutel verwijderd of inline `permission:` gewijzigd | `nee` (AC-1) | n.v.t. |
| Eigenaar zette de modus terug, lokale `origin/main` is oud | geen merge: modus komt via REST van de kop van `main` (AC-3) | n.v.t. |
| Agent in een andere runtime dan Claude Code | merget niet (AC-6) | n.v.t. |
| PR met een nieuwe migratie in het owner-patroon | `nee`; migraties zijn onherroepelijk in de geschiedenis (AC-1) | n.v.t. |
| PR met nieuwe permissie zonder spec | `nee` via het risico-overzicht (AC-1) | n.v.t. |
| PR-branch voegt een workflow met job `agent-merge` toe | telt niet: alleen de `guard.yml`-run met `pull_request_target`, en `.github/**` is een gate (AC-1, AC-3) | n.v.t. |
| Push na de review | reviewcommentaar hoort bij een oude SHA: geen merge (AC-3) | n.v.t. |
| `main` schoof door na de laatste CI-run | geen merge; eerst `git merge origin/main` en CI opnieuw (AC-3) | n.v.t. |
| `main` is rood | geen merge tot `main` groen is (AC-3) | n.v.t. |
| Modus staat op `"eigenaar"` of ontbreekt | geen merge (AC-3) | n.v.t. |
| Nieuwe `src/web/CLAUDE.md` of `src/web/postcss.config.mjs` | `nee`: vanzelf geladen op naam (AC-1) | n.v.t. |
| Branch wijzigt de scriptregel `pr:merge` in `package.json` | rolhek weigert: `HOST_FILES` wijkt af van het anker (AC-4) | n.v.t. |
| Lokaal aangepast `pr-merge.mjs` | rolhek weigert (AC-4); valt het rolhek open, dan eist de ruleset alleen groene checks: de inhoudstoets is dan weg (aanvaard restrisico, ADR 0069) | n.v.t. |
| Rolhek valt open op `gh pr merge` | deny-regel in `.claude/settings.json` (AC-4) | n.v.t. |
| Codex reviewt toch en zet een 👀 of open punten | geen voorwaarde, ook niet als Codex wél reviewt: `pr:merge` wacht niet; een open review-thread houdt de ruleset tegen (AC-7, OV-2) | n.v.t. |
| App heeft na de template-update nog `agentMerge.codex: true` | `check-docs` rood en geen agent-merge tot de sleutel weg is (AC-8, OV-4) | n.v.t. |
| Docs-test van AC-10 vindt "codex" in `agent-merge.mjs`, `check-docs.mjs` of de opvolgers van de twee AC-7/AC-8-testbestanden | toegestaan op een regel die de oude sleutel herkent of meldt, of de botwereld of `codex`-fixture opbouwt (uitzondering 5); elke andere regel in die bestanden met "codex" faalt (AC-10) | n.v.t. |
| Besluit-PR gemerged, bouw-PR nog niet | `agentMerge.codex: "indien-aanwezig"` staat nog op main en `pr:merge` toetst hem; de Codex-afspraken uit ADR 0069 punt 5 van vóór 2026-11-05 (spoor, `@codex review` op een nieuwe head, niet ontwijken) gelden tot de merge van de bouw-PR (ADR 0069, overgang) | n.v.t. |

## Raakt ook

`scripts/kit/diff-guard.mjs`, `scripts/kit/pr-merge.mjs` (nieuw), `scripts/kit/lane.mjs` (`KRITIEK`), `package.json` (`scripts`), `.github/workflows/guard.yml`
(eigenaar pusht), `.claude/gates.json`, `.claude/settings.json`, `rails/hooks/lib/rolhek.mjs`, `scripts/kit/check-docs.mjs`,
`test/scripts/github-ruleset.test.ts` (lijst bewust niet verplichte jobs; bestaande test, wijzigt met reden in de PR),
`test/scripts/guard-workflow.test.ts`, `test/rails/diff-guard.test.ts`, de rolhektests met de merge-weigering (bestaande
tests; wijzigen met reden in de PR), `docs/framework.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/skills/opleveren/SKILL.md`,
`docs/operations/agent-doorloop.md`, `docs/specs/agent-merge.md`, `docs/roadmap.md` (ADR 0029 stap 7, ADR 0030 PR 2, "Volledig pad naar `gh` in het rolhek"),
`rails/hooks/lib/runner-authority.mjs` (`HOST_FILES`; aanvullen met `.pnpmfile.mjs` als pnpm 11 die laadt). De bouw volgt na de bouw van
`samenhang-checks-rollen` (0068), die dezelfde rulesettest en `docs/framework.md` raakt.

Bouw van AC-7 tot en met AC-10 (leerpunt #562; kritiek, de eigenaar merget; de merge van de besluit-PR is het akkoord voor de
bestaande tests hieronder, R-TEST-02). Per treffer uit de `git grep` van AC-10 (32 bestanden), bouwlijst of uitzondering:

| Bestand | Bouw-PR |
|---|---|
| `.claude/gates.json` | `agentMerge.codex` en de uitleg ervan in `$comment` weg (AC-8) |
| `.claude/skills/opleveren/SKILL.md` | stap 3 van "Mergen" zoals AC-10; stap 8 blijft (uitzondering 2) |
| `README.md` | runtimezin zonder naam (AC-10) |
| `docs/operations/agent-doorloop.md` | runtimezinnen (rond "eigen runtimebeleid" en "draaien ze niet automatisch") zonder naam; de twee metingzinnen blijven (uitzondering 2) |
| `docs/operations/review-checklists.md` | twee zinnen zoals AC-10 |
| `scripts/kit/pr-merge.mjs` | Codex-logica weg, `STEEKPROEF` (AC-7) |
| `scripts/kit/agent-merge.mjs` | `CodexModus`, `leesCodex()` weg, sleutel `codex` faalt dicht (AC-8); specverwijzingen in commentaar naar deze spec; alleen de regels die de sleutel `codex` herkennen of melden houden het woord (uitzondering 5) |
| `scripts/kit/check-docs.mjs` | `agentMergeVorm` zoals AC-8; alleen de regels die de sleutel herkennen of `docs:agentMerge.codex` melden houden het woord (uitzondering 5) |
| `scripts/kit/diff-guard.mjs` | specverwijzingen in commentaar naar deze spec (AC-9) |
| `scripts/kit/meting.mjs`, `scripts/kit/meting-trend.mjs` | ongewijzigd (uitzondering 1) |
| `test/docs/agent-merge-codex-wachten-docs.test.ts`, `test/docs/agent-merge-zonder-codex-docs.test.ts` | weg (toetsen Codex-tekst die verdwijnt) |
| `test/scripts/pr-merge.test.ts` | weg: de rijen "Codex met open punten op de head, daarna een 👍", "een oudere Codex-samenvatting zonder punten, de nieuwste met open punten", "Codex loopt nog (👀)", "Codex op een andere SHA", "Codex met open punten", "Codex-samenvatting door iemand anders geschreven" en de tests "een 👍 van Codex na de push telt, een 👍 van vóór de push niet", "agentMerge.codex false slaat Codex over", "de Codex-stand komt uit het HTML-gecodeerde commentaar"; de goede wereld zonder Codex-samenvatting en fixtures zonder `codex` |
| `test/scripts/pr-merge-zonder-codex.test.ts` | weg: de describes "agent-merge-zonder-codex/AC-4 Codex-voorwaarde bij indien-aanwezig", "agent-merge-codex-wachten/AC-1 Codex is bezig", "…/AC-2 een lopende review op een andere PR van de branch is een spoor", "…/AC-3 wachtreden bij true en indien-aanwezig, niet bij false", "…/AC-4 bij tegoed op verandert niets", "…/AC-5 tabel via beoordeelMerge()"; "agent-merge-zonder-codex/AC-3" (omvang) blijft als AC-9, "…/AC-5 steekproefregel na de merge" wordt AC-7 met de ene regel `STEEKPROEF`; bestand krijgt een naam zonder "codex"; alleen de regels die de wereld met `chatgpt-codex-connector[bot]` opbouwen houden het woord (uitzondering 5) |
| `test/rails/agent-merge-zonder-codex.test.ts` | AC-1, AC-2, AC-3 en AC-6 blijven als AC-9 (omvang) en AC-8 (sleutel `codex`: de rijen met geldige `codex`-waarden worden rijen met `null` en een overtreding); naam zonder "codex"; alleen de regels die de `codex`-fixtures en de verwachte reden en overtreding opbouwen houden het woord (uitzondering 5) |
| `test/scripts/pr-merge-padtabel.test.ts`, `test/scripts/pr-merge-bytegrens.test.ts`, `test/rails/agent-merge-bytegrens.test.ts`, `test/rails/padtabel-kit.ts`, `test/rails/padtabel-gelijkwaardig.test.ts`, `test/scripts/pr-verify-diagnostics.test.ts` | fixtures zonder `codex` en zonder `beoordeelMerge().codex`; uitkomst verder gelijk |
| `test/rails/spec-en-bouw.test.ts`, `test/hooks/testteller.test.ts`, `test/hooks/rolhek-verse-main.test.ts`, `test/hooks/bouwvorm-vervolgbouw.test.ts` | herkomst in testnaam of commentaar wordt "review op #<nr>" (AC-10) |
| `test/hooks/rolhek-sandbox-werkstraat.test.ts`, `test/rails/meting-sandbox-werkstraat.test.ts` | branchnamen `codex/…` worden `claude/…`; in de prefixtabel vervalt `codex/x` (AC-10) |
| `test/rails/leesbudget.test.ts`, `test/rails/meting-kerncijfers-pr-tabel.test.ts`, `test/rails/meting-stuurt.test.ts` | ongewijzigd (uitzondering 1) |
| `test/rails/adr-herzien.test.ts` | ongewijzigd (uitzondering 3) |
| `docs/specs/agent-merge-zonder-codex.md`, `docs/specs/agent-merge-codex-wachten.md` | status `vervallen` (AC-9) |
| `docs/specs/agent-merge-niet-kritiek.md` | AC-1, AC-3, AC-5, "Doel" en de rij "App zonder Codex" zoals AC-9; markeringen weg, `gebouwd # #<bouw-PR>` |

Niet geraakt (historie): `test/rails/fixtures/padtabel/`, `docs/adr/`, overige `docs/specs/`, `docs/reviews/`,
`docs/roadmap.md`. Geen migratie, route, permissie of resource: `check:migrations`,
`check:secdef`, `test:db` en `test/security/resources.ts` n.v.t. Bewijs: `pnpm test:unit`, `pnpm ratchet` (check-docs:
AC-dekking, adr-herzien), `pnpm lint`, `pnpm typecheck`.

## Buiten scope

Ruimer mergen op gate-paden buiten `voorReview`; de GitHub App (ST-01) en daarmee een harde grens bij GitHub; `agent-merge`
als verplichte check; mergen in andere runtimes dan Claude Code.

## Testplan

Tabeltest voor het oordeel (AC-1) op `geraakt()`- en `risico()`-invoer; workflowtest op job, conditie en `pull_request_target`
(AC-2); unittests per voorwaarde van `pr:merge` met nagebootste REST-antwoorden, ook een gelijknamige check uit een andere
workflow (AC-3); rolhektests voor hoofdsessie en elke subagentrol, met gelijk en afwijkend script (AC-4); `check-docs`-test op
de modus (AC-5); docs-tests op de regels uit AC-6. Elke negatieve test faalt op de huidige code (R-PRINC-04).

## Open vragen

De toegestane lijst volgt uit de opdracht ("niet kritiek en niets kunnen slopen"); ruimer, of andere runtimes, is een
apart besluit (ADR 0069, Alternatieven). Bij AC-7 tot en met AC-10 (leerpunt #562):

- **OV-1 ✅ besloten** — De maat "Codex-bevindingen" in `pnpm meting --pr-tabel` en `--trend` (`scripts/kit/meting.mjs`,
  `scripts/kit/meting-trend.mjs`; leesbudget/AC-7, meting-kerncijfers/AC-2, ADR 0064 punt 3 en 0065 punt 4) wordt
  geschrapt in een aparte besluit-PR; tot dan staat de meting als uitzondering 1 en 2 in AC-10 (eigenaar, 5 november 2026).
- **OV-2 ✅ besloten** — `pr:merge` wacht niet op een externe review die toch loopt; een open review-thread houdt de ruleset
  al tegen (eigenaar, 5 november 2026).
- **OV-3 ✅ besloten** — De eerdere merges met steekproefregel tellen mee voor de "eerste tien" van ADR 0069 punt 5
  (eigenaar, 5 november 2026).
- **OV-4 ✅ besloten** — Een overgebleven `agentMerge.codex` blokkeert: geen agent-merge en `check-docs` rood (AC-8;
  eigenaar, 5 november 2026).
