---
status: goedgekeurd
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
| eigenaar | past vlak vóór de merge van de bouw-PR de ruleset toe vanaf de bouwbranch (`scripts/github-ruleset.sh`); in een app bij de template-update | — |

## Datawijzigingen (met grants)

n.v.t.: geen migratie, tabel of policy.

## Routes en foutcodes

n.v.t.: geen API-route, permissie of foutcode.

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

## Kopieer de vorm van

- `scripts/kit/check-app-init.mjs`: `draaiProef(bron, scripts, opties)` met `isTemplate()`, `initialiseer()` en opruimen in `finally`.
- `scripts/kit/check-new-resource.mjs`: `genereer(root)` (fase 1 en 2 van de generator, gate-wijzigingen zetten).
- `scripts/kit/proef-kopie.mjs`: `kopie()`, `script()`, `bijSignaal()`, `ruimOp()`, ongewijzigd.

## Hergebruik en UX

- Hergebruikt: `scripts/kit/app-init.mjs` en `scripts/kit/new-resource.mjs` als CLI, `snelleGates()`, de module `proef-kopie.mjs`.
- Alle zichtbare tekst letterlijk:
  - geslaagd in de template: `check:new-resource: time-entries haalt gate:fast na app:init`
  - geslaagd in een app: `check:new-resource: time-entries haalt gate:fast`
  - init mislukt: `✗ check:new-resource: app:init faalde in de kopie`
  - generator mislukt: `✗ check:new-resource: <commando> faalde`
  - gate rood: `✗ check:new-resource: <script> faalt na <stappen>`, met `<stappen>` = `app:init en new:resource` in de template en `new:resource` in een app
  - geen node_modules: `✗ check:new-resource: node_modules ontbreekt; draai eerst pnpm install`
  - geen `.claude/gates.json`: `✗ check:new-resource: .claude/gates.json ontbreekt`
  - bewaard: `check:new-resource: kopie bewaard in <pad>`
- Focusvolgorde en toetsenbord: n.v.t., geen UI.

### Werking (bindend)

1. **Kopie.** Eén kopie via `kopie(bron, 'new-resource-')`, zoals nu.
2. **Init, alleen in de template.** Heeft `.claude/gates.json` een `onderhoud`, dan draait `app:init` zoals in
   app-init-proef stap 2 (CLI met `--owner`, commit `chore: rename to proef-app`, `origin/main` op die commit,
   `template/main` op `basis`). In een app wordt deze stap overgeslagen.
3. **Generator.** Daarna draait `genereer()` (fase 1, spec op goedgekeurd, fase 2, gate-wijzigingen) in dezelfde kopie.
4. **Suite.** Daarna één keer elk script uit `snelleGates()` via `script()`. De eerste rode gate stopt de check.
5. **Volgende generator.** Een nieuwe generator krijgt een stap tussen 3 en 4, geen eigen job en geen eigen suite (ADR 0073 punt 4).
6. **Niet:** geen overslaan op grond van de diff of een eerdere uitslag, geen cache, geen `pnpm` in de kopie, geen netwerk,
   geen Docker. Opruimen, signalen en git-isolatie blijven zoals in app-init-proef stap 4 en 5.

## Acceptatiecriteria

- **een-proefkopie/AC-1**: Gegeven een schone checkout van de template, wanneer `pnpm check:new-resource` draait, dan eindigt hij met exitcode 0 en als laatste regel `check:new-resource: time-entries haalt gate:fast na app:init`, en heeft er precies één tijdelijke kopie bestaan.
- **een-proefkopie/AC-2**: Gegeven de fixture van app-init-proef AC-2 (een snel script dat faalt zonder `onderhoud`), wanneer de check daarop draait, dan is de exitcode ≠ 0 en staat `✗ check:new-resource: <script> faalt na app:init en new:resource` in de uitvoer. Zonder die afhankelijkheid slaagt dezelfde fixture.
- **een-proefkopie/AC-3**: Gegeven een fixture waarin de generator code oplevert die een snel script rood maakt, dan is de exitcode ≠ 0 met dezelfde regel, ook als `app:init` slaagt.
- **een-proefkopie/AC-4**: Gegeven een fixture waarin `app:init` faalt, dan is de exitcode ≠ 0 met `✗ check:new-resource: app:init faalde in de kopie` en draaien er geen generator en geen gate.
- **een-proefkopie/AC-5**: Gegeven een bron zonder `onderhoud` (een app), dan draait geen `app:init`, wel de generator en de suite, en de laatste regel is `check:new-resource: time-entries haalt gate:fast`.
- **een-proefkopie/AC-6**: Gegeven `.github/workflows/ci.yml`, dan bestaat er geen job `check:app-init` meer. De job `check:new-resource` draait op `pull_request` en push naar `main`, zonder `if:` en zonder `paths`-filter, en voert `pnpm check:new-resource` uit. `package.json` heeft geen script `check:app-init`.
- **een-proefkopie/AC-7**: Gegeven `.claude/decisions.json`, `scripts/github-ruleset.sh` en `docs/nieuwe-app.md`, dan staat `check:new-resource` in elk ervan en `check:app-init` in geen ervan.
- **een-proefkopie/AC-8**: De criteria app-init-proef AC-6 t/m AC-11, AC-14, AC-17 en AC-18 gelden onveranderd voor de samengevoegde check (opruimen, signalen, bron ongewijzigd, git-isolatie, geen pnpm/npm/docker, ontbrekende `node_modules` of `gates.json`), met `check:new-resource` als naam in de meldingen.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| De PR raakt alleen `docs/` | volledige run, net als nu | n.v.t. |
| Gate rood en het is onduidelijk welke stap het veroorzaakt | melding noemt de stappen; `--bewaar` laat de kopie staan | n.v.t. |
| Een open PR van vóór de bouw-PR | rapporteert nog `check:app-init`; na de rulesetronde is die niet meer verplicht en ook niet schadelijk | n.v.t. |
| Gate in de kopie hangt | `timeout-minutes: 20` van de job; opruimen via de signaalhandler | n.v.t. |

## Raakt ook

- Gewijzigd: `scripts/kit/check-new-resource.mjs` (init-stap in de template, meldingen), `scripts/kit/check-app-init.mjs` (wordt een module zonder CLI, of gaat op in `check-new-resource.mjs`), `package.json` (script `check:app-init` weg), `.github/workflows/ci.yml` (job `app-init` weg, commentaar bij `new-resource`), `.claude/decisions.json` en `scripts/github-ruleset.sh` (`check:app-init` weg), `docs/nieuwe-app.md` (twee opsommingen).
- Tests (bestaande gewijzigd omdat deze spec het gedrag verandert, met reden in de PR): `test/scripts/check-app-init.test.ts` (meldingen en AC-12/AC-15 van app-init-proef worden AC-6/AC-7 hier), `test/scripts/github-ruleset.test.ts`, `test/scripts/proef-kopie.test.ts` (één prefix).
- Herzien-markering in ADR 0047 punt 9 en in spec app-init-proef (OV-5, AC-12, AC-15), volgens R-CI-05.
- Docs: `docs/gouden-pad.md`, `docs/operations/agent-doorloop.md`, `CHANGELOG.md`.

## Buiten scope

- De suite in de kopie in banen draaien zoals `gate:fast`. Dat kan later, op aanleiding.
- Overslaan op grond van de diff (ADR 0073, alternatief 1).
- `test:db`, `ui:check` of `check:snapshot` in de kopie.

## Testplan

- Unit (fixture-repo, seconden): AC-2 t/m AC-5 en AC-8 in `test/scripts/check-app-init.test.ts` (of de opvolger), met de generatorstap als parameter, zodat de fixture geen echte generator nodig heeft.
- AC-6 en AC-7: tests die `ci.yml`, `package.json`, `decisions.json`, `github-ruleset.sh` en `nieuwe-app.md` lezen.
- AC-1: uitslag van `pnpm check:new-resource` lokaal en de CI-job op de PR-SHA (`pnpm pr:verify`), met de gemeten duur van de job tegenover run #460.
- Negatief bewijs in de PR: een tijdelijke commit met een test die `onderhoud` eist, met de rode `check:new-resource`-run als link. Daarna terugdraaien.

## Open vragen

- **OV-1 (aanbeveling: samenvoegen)**: samenvoegen in één kopie, of overslaan als de invoer gelijk is? Aanbeveling:
  samenvoegen (ADR 0073, alternatieven). De eigenaar kiest in de projectthread; de merge van deze PR is het besluit.
