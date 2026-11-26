---
status: goedgekeurd # #486
namespace: een-proefkopie
---

# Eén proefkopie voor app:init en de generator

## Doel

Per PR draait de snelle suite nog maar één keer in een tijdelijke kopie. In de template gebeurt dat na `app:init` en
`new:resource`, in een app na `new:resource`. Er wordt niets overgeslagen en R-CI-08 blijft gelijk
([ADR 0073](../adr/0073-een-proefkopie-per-pr.md)). Aanleiding: bevinding P4 uit de review van main op 3 november 2026
(drie suites per PR, kosten groeien per generator, R-DOC-09).

**Toets aan framework §1.** Er is aanleiding (P4, gemeten op run #460: 5,0 en 4,8 minuten runnertijd voor de twee proeven).
Geen nieuwe dependency. Een verplichte check verdwijnt, maar zijn bescherming gaat op in de andere. Daarom gaat dit via
ADR 0073 (A4) en een besluit-PR.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| CI (job `check:new-resource`) | draait `pnpm check:new-resource` op elke PR en elke push naar `main`, altijd volledig | stappen overslaan op grond van de diff |
| developer / hoofdsessie | draait `pnpm check:new-resource` lokaal; `--bewaar` om de kopie te bekijken | de check overslaan of een rode uitslag als groen melden |
| eigenaar | merget bouw-PR 1, past daarna de ruleset toe (`scripts/github-ruleset.sh`) en merget dan bouw-PR 2; in een app draait hij de ruleset opnieuw bij de template-update | — |

## Datawijzigingen (met grants)

n.v.t.: geen migratie, tabel of policy.

## Routes en foutcodes

n.v.t.: geen API-route, permissie of foutcode.

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

## Kopieer de vorm van

- `scripts/kit/check-app-init.mjs`: `draaiProef(bron, scripts, opties)` met `isTemplate()`, `initialiseer()` en opruimen in `finally`.
- `scripts/kit/check-new-resource.mjs`: `genereer(root)` (fase 1 en 2 van de generator, gate-wijzigingen zetten).
- `scripts/kit/proef-kopie.mjs`: `kopie()`, `script()`, `bijSignaal()`, `ruimOp()`; alleen `CHECKNAMEN` en de terugvalnaam in `ruimOp()` volgen het ene prefix.

## Hergebruik en UX

- Hergebruikt: `scripts/kit/app-init.mjs` en `scripts/kit/new-resource.mjs` als CLI, `snelleGates()`, de module `proef-kopie.mjs`.
- Alle zichtbare tekst letterlijk:
  - geslaagd in de template: `check:new-resource: time-entries haalt gate:fast na app:init`
  - geslaagd in een app: `check:new-resource: time-entries haalt gate:fast`
  - init mislukt: `✗ check:new-resource: app:init faalde in de kopie`
  - generator mislukt: `✗ check:new-resource: <commando> faalde`
  - gate rood: eerst de foutmelding van `script()` (zoals nu in `check-app-init.mjs`), dan `✗ check:new-resource: <script> faalt na <stappen>`, met `<stappen>` = `app:init en new:resource (zie leerpunt #334)` in de template en `new:resource` in een app
  - geen node_modules: `✗ check:new-resource: node_modules ontbreekt; draai eerst pnpm install`
  - geen `.claude/gates.json`: `✗ check:new-resource: .claude/gates.json ontbreekt`
  - bewaard: `check:new-resource: kopie bewaard in <pad>`
- Focusvolgorde en toetsenbord: n.v.t., geen UI.

### Werking (bindend)

1. **Kopie.** Eén kopie via `kopie(bron, 'new-resource-')` uit `scripts/kit/proef-kopie.mjs`: een map via
   `mkdtempSync(path.join(os.tmpdir(), 'new-resource-'))` (respecteert `TMPDIR`) met de bestanden uit
   `git ls-files -z --cached --others --exclude-standard` van de bron, een symlink naar `node_modules` van de bron, en
   daarin `git init -b main` met commit `basis` (de stand van de bron) en `refs/remotes/template/main` op die commit.
   Ontbreekt `node_modules` of `.claude/gates.json` in de bron, dan stopt de check vóór het kopiëren.
2. **Init, alleen in de template.** Heeft `.claude/gates.json` een `onderhoud`, dan draait
   `node scripts/kit/app-init.mjs proef-app "Proef-app" --owner proef-eigenaar` in de kopie (de CLI, niet `planAppInit`;
   met `--owner`, zodat ook `.github/CODEOWNERS` wijzigt). Daarna commit `chore: rename to proef-app` en
   `refs/remotes/origin/main` op die commit; `template/main` blijft op `basis`. In een app wordt deze stap overgeslagen.
3. **Generator.** Daarna draait `genereer()` (fase 1, spec op goedgekeurd, fase 2, gate-wijzigingen) in dezelfde kopie.
4. **Suite.** Daarna één keer elk script uit `snelleGates()` via `script()`. De eerste rode gate stopt de check.
5. **Volgende generator.** Een nieuwe generator krijgt een stap tussen 3 en 4, geen eigen job en geen eigen suite (ADR 0073 punt 4).
6. **Vorm.** `scripts/kit/draai-proef.mjs` (in bouw-PR 1 nog `check-app-init.mjs`) exporteert `draaiProef(bron, scripts, { bewaar, genereer })`, met `genereer`
   als de generatorstap (`(root) => Promise<void>`), zodat een fixture zonder echte generator draait. `check-new-resource.mjs`
   roept hem aan met de echte `genereer()`.
7. **Overgang in twee bouw-PR's.** `pnpm pr:verify` en `pnpm pr:merge` lezen `requiredChecks` van `main`. Daarom haalt
   bouw-PR 1 `check:app-init` alleen uit `requiredChecks`, de ruleset en `docs/nieuwe-app.md`, en laat hij de job en het
   script `check:app-init` ongewijzigd draaien. Na die merge past de eigenaar de ruleset toe. Bouw-PR 2 (opruimen)
   verwijdert daarna de job, het script en de CLI van `check-app-init.mjs`. Er draait dus nergens een lege job die groen
   meldt zonder te toetsen.
8. **Niet:** geen overslaan op grond van de diff of een eerdere uitslag, geen cache van uitslagen (de pnpm-store van de job mag: ADR 0096), geen `pnpm` in de kopie, geen netwerk,
   geen Docker, geen schrijfactie in de bron.
9. **Opruimen en isolatie.** In `finally` en bij `SIGINT`/`SIGTERM` (exit 130/143, via `bijSignaal()`) verwijdert
   `ruimOp()` de kopie, maar alleen als het pad direct onder `os.tmpdir()` ligt en met het eigen prefix begint; anders
   weigert hij met `✗ check:new-resource: weigert <pad> te verwijderen: niet de eigen tijdelijke map`. `rmSync` volgt de
   `node_modules`-link niet. `--bewaar` slaat het opruimen over en meldt het pad. Elk kindproces krijgt de omgeving zonder
   de repovariabelen van git (`git rev-parse --local-env-vars`, o.a. `GIT_DIR` en `GIT_INDEX_FILE`), zodat een git-hook
   de kopie niet naar de bron laat wijzen.

## Acceptatiecriteria

- **een-proefkopie/AC-1**: Gegeven een schone checkout van de template, wanneer `pnpm check:new-resource` draait, dan eindigt hij met exitcode 0 en als laatste regel `check:new-resource: time-entries haalt gate:fast na app:init`.
- **een-proefkopie/AC-2**: Gegeven een fixture-repo met de `app:init`-invoer (vorm van `test/scripts/app-init.test.ts`) en een snel script dat faalt zodra `.claude/gates.json` geen `onderhoud` meer heeft, wanneer de check daarop draait, dan is de exitcode ≠ 0 en staat `✗ check:new-resource: <script> faalt na app:init en new:resource (zie leerpunt #334)` in de uitvoer, na de foutmelding van `script()`. Zonder die afhankelijkheid slaagt dezelfde fixture. Toets: `test/scripts/een-proefkopie.test.ts`, `test/scripts/check-app-init.test.ts`
- **een-proefkopie/AC-3**: Gegeven een fixture waarin de generatorstap een bestand schrijft dat een snel script rood maakt, dan is de exitcode ≠ 0 met dezelfde regel, ook als `app:init` slaagt.
- **een-proefkopie/AC-4**: Gegeven een fixture waarin `app:init` faalt, dan is de exitcode ≠ 0 met `✗ check:new-resource: app:init faalde in de kopie` en draaien er geen generatorstap en geen gate.
- **een-proefkopie/AC-5**: Gegeven een bron zonder `onderhoud` (een app), dan draait geen `app:init`, wel de generatorstap en de suite, en de laatste regel is `check:new-resource: time-entries haalt gate:fast`.
- **een-proefkopie/AC-6**: Gegeven een fixture met een eigen `TMPDIR` en een generatorstap die vastlegt wat hij ziet, dan ziet die stap een `.claude/gates.json` zonder `onderhoud` en een `package.json` met naam `proef-app` (init vóór generator), draait de suite daarna één keer, en heeft er precies één map met prefix `new-resource-` bestaan.
- **een-proefkopie/AC-7**: Gegeven een generatorstap die faalt, dan is de exitcode ≠ 0 met `✗ check:new-resource: <commando> faalde` en draait er geen gate; met `--bewaar` staat `check:new-resource: kopie bewaard in <pad>` in de uitvoer en bestaat de map nog.
- **een-proefkopie/AC-8**: De waarborgen van stap 1 en 9 gelden met `check:new-resource` als naam in de meldingen en `new-resource-` als enige prefix: (a) na een geslaagde én een gefaalde run bestaat de tijdelijke map niet meer, met `--bewaar` wel en staat het pad in de uitvoer; (b) een run die tijdens een gate met `SIGINT` of `SIGTERM` wordt afgebroken, ruimt op en eindigt met exit 130 of 143; (c) de opruimguard verwijdert niets buiten `os.tmpdir()` of zonder het prefix (ook niet het oude prefix `app-init-proef-`) en meldt de weigering; (d) na een run zijn `git status --porcelain`, `git rev-parse HEAD` en `node_modules/.bin` van de bron gelijk, ook met `GIT_DIR` en `GIT_INDEX_FILE` naar de bron, en ook bij `kopie(bron, 'new-resource-')` alleen; (e) nep-uitvoerbare `pnpm`, `npm` en `docker` vooraan in `PATH` worden nooit aangeroepen; (f) zonder `node_modules` of zonder `.claude/gates.json` in de bron is de exitcode ≠ 0 met `✗ check:new-resource: node_modules ontbreekt; draai eerst pnpm install` of `✗ check:new-resource: .claude/gates.json ontbreekt`, en er wordt geen tijdelijke map gemaakt. Toets: `test/scripts/check-app-init.test.ts`, `test/scripts/proef-kopie.test.ts`, `test/scripts/een-proefkopie.test.ts`
- **een-proefkopie/AC-9** (bouw-PR 1): Gegeven `.claude/decisions.json`, `scripts/github-ruleset.sh` en `docs/nieuwe-app.md`, dan staat `check:new-resource` in elk ervan en `check:app-init` in geen ervan; de job `check:app-init` in `ci.yml` en het script in `package.json` bestaan nog.
- **een-proefkopie/AC-10** (bouw-PR 2): Gegeven `.github/workflows/ci.yml`, dan bestaat er geen job `check:app-init` meer. De job `check:new-resource` draait op `pull_request` en push naar `main`, zonder `if:` en zonder `paths`-filter, en voert `pnpm check:new-resource` uit. `package.json` heeft geen script `check:app-init`.
- **een-proefkopie/AC-11**: Gegeven een fixture met een snel script dat `planAppInit` zonder guard aanroept, wanneer de check draait, dan faalt hij (exitcode ≠ 0); hetzelfde script in de bron zonder init slaagt. Toets: `test/scripts/check-app-init.test.ts`
- **een-proefkopie/AC-12**: Gegeven de kopie na stap 2, dan heet `package.json` `proef-app`, bevat `.claude/gates.json` geen `onderhoud`, staat `@proef-eigenaar` in `.github/CODEOWNERS`, wijst `origin/main` naar de rename-commit en `template/main` naar `basis`. Toets: `test/scripts/check-app-init.test.ts`
- **een-proefkopie/AC-13**: Gegeven `scripts/kit/proef-kopie.mjs`, dan importeert `scripts/kit/draai-proef.mjs` `kopie()` en `script()` daaruit, gebruikt `scripts/kit/check-new-resource.mjs` `draaiProef` uit `draai-proef.mjs`, en definieert geen van beide `kopie()` of `script()` zelf; importeren van `proef-kopie.mjs` of `draai-proef.mjs` start geen proces en maakt geen map. Toets: `test/scripts/proef-kopie.test.ts`, `test/scripts/check-app-init.test.ts`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| De PR raakt alleen `docs/` | volledige run, net als nu | n.v.t. |
| Gate rood en het is onduidelijk welke stap het veroorzaakt | melding noemt de stappen; `--bewaar` laat de kopie staan | n.v.t. |
| Een open PR van vóór bouw-PR 1 | draait `check:app-init` nog uit zijn eigen `ci.yml`; na de rulesetronde is die niet meer verplicht. In dat venster is hij op andere PR's niet verplicht, maar draait hij wel | n.v.t. |
| `pnpm pr:verify` op bouw-PR 1 | leest `requiredChecks` van `main` en vindt `check:app-init` groen, want de job draait nog (stap 7) | n.v.t. |
| De check in een app | faalt nu bij een ontbrekende `node_modules` of `.claude/gates.json`; `check:new-resource` deed dat niet. Gewenst: een verplichte check slaagt niet stil | n.v.t. |
| Een template-update in een app die `check:app-init` schrapt | de eigenaar draait `scripts/github-ruleset.sh` opnieuw (stap in `docs/nieuwe-app.md`) | n.v.t. |
| Gate in de kopie hangt | `timeout-minutes: 20` van de job; opruimen via de signaalhandler | n.v.t. |

## Raakt ook

- Bouw-PR 1: `scripts/kit/check-new-resource.mjs` (init-stap in de template, meldingen), `scripts/kit/check-app-init.mjs` (`draaiProef` met `genereer`), `scripts/kit/proef-kopie.mjs` (`CHECKNAMEN`, terugvalnaam), `.claude/decisions.json` en `scripts/github-ruleset.sh` (`check:app-init` weg), `docs/nieuwe-app.md` (twee opsommingen, plus de stap "draai de ruleset opnieuw als een template-update een verplichte check schrapt"), `.github/workflows/ci.yml` (commentaar in regel 1 en bij de job `new-resource`).
- Bouw-PR 2: job `app-init` uit `ci.yml`, script `check:app-init` uit `package.json`, de CLI-ingang van `check-app-init.mjs`.
- Tests (bestaande gewijzigd omdat deze spec het gedrag verandert, met reden in de PR): `test/scripts/check-app-init.test.ts` (meldingen; de criteria over job en verplichte check worden AC-9 en AC-10 hier), `test/scripts/proef-fixture.ts` (`CHECK`), `test/scripts/github-ruleset.test.ts`, `test/scripts/proef-kopie.test.ts` (één prefix). Wordt `check-app-init.test.ts` hernoemd, dan verhuist zijn sleutel in `eslint-suppressions.json` mee (aantal gelijk).
- Herzien-markering (R-CI-05): ADR 0047 punt 9, en in spec app-init-proef stap 0, 1, 3 en 7, OV-4 en OV-5, en de criteria `app-init-proef/AC-1`, `-2`, `-5`, `-8`, `-12`, `-13`, `-15`, `-16` en `-17`. Spec app-init-proef is daarna verwijderd (R-CI-06); zijn criteria die nog gelden, staan hier als AC-2, AC-8 en AC-11 t/m AC-13.
- Docs: `docs/gouden-pad.md` (regel over `pnpm check:new-resource`: ook `app:init` in de template), `docs/operations/agent-doorloop.md` (de alinea over `check:app-init`), `CHANGELOG.md`.

## Buiten scope

- De suite in de kopie in banen draaien zoals `gate:fast`. Dat kan later, op aanleiding.
- Overslaan op grond van de diff (ADR 0073, alternatief 1).
- `test:db`, `ui:check` of `check:snapshot` in de kopie.

## Testplan

- Unit (fixture-repo, seconden): AC-2 t/m AC-8, AC-11 en AC-12 in `test/scripts/check-app-init.test.ts` (of de opvolger), met de generatorstap als parameter, zodat de fixture geen echte generator nodig heeft.
- AC-13: `test/scripts/proef-kopie.test.ts` leest de imports van beide scripts en importeert `proef-kopie.mjs` zonder bijwerking; `test/scripts/check-app-init.test.ts` doet dat voor `draai-proef.mjs`.
- AC-9 en AC-10: tests die `ci.yml`, `package.json`, `decisions.json`, `github-ruleset.sh` en `nieuwe-app.md` lezen.
- AC-1: uitslag van `pnpm check:new-resource` lokaal en de CI-job op de PR-SHA (`pnpm pr:verify`), met de gemeten duur van de job tegenover run #460.
- Negatief bewijs in de PR: een tijdelijke commit met een test die `onderhoud` eist, met de rode `check:new-resource`-run als link. Daarna terugdraaien.

## Open vragen

- **OV-1 ✅ besloten**: samenvoegen in één kopie, niet overslaan als de invoer gelijk is (eigenaar, 2026-11-03, keuze in de
  projectthread; ADR 0073).
