---
status: goedgekeurd
namespace: templateregime
---

# Templateregime

## Doel

GitHub bewaakt wie beslist (GitHub App, `CODEOWNERS` uit de padtabel, ruleset), waarna de eigen documentbewaking verdwijnt en
template-documenten naar `docs/template/` verhuizen (ADR 0089).

## Rollen en wie wat ziet

De agent werkt als GitHub App; de eigenaar keurt goed op paden van een code-eigenaar en activeert App en ruleset. Architect
en hoofdsessie schrijven ADR's en specs.

## Datawijzigingen (met grants)

n.v.t. — scripts, workflow, padtabel, `CODEOWNERS`, tests en docs.

## Routes en foutcodes

n.v.t. — geen API-route.

## Koppeling

n.v.t. — GitHub is de bestaande host, geen nieuwe koppeling van de app.

## Kopieer de vorm van

- `scripts/kit/check-core.mjs` — `coreTree` en `commitFout` als vorm voor de tweede zone.

## Hergebruik en UX

n.v.t. — geen UI.

## Acceptatiecriteria

Stap 2 = bouw van ADR 0089 punt 2 en 3 met activering; stap 3 = weghalen van punt 5; stap 4 = verhuizing.

- **templateregime/AC-1** — Vervallen door ADR 0093 punt 1 (geen App, geen token). Was: Token: de eigenaar maakt een installatietoken van hoogstens een uur aan met
  `scripts/kit/agent-token.mjs` vanaf `main`, buiten de sandbox (spec agent-token, ADR 0089 Herzien 2026-11-17), en de agent geeft het per commando mee (`GH_TOKEN` vóór een
  letterlijk `gh`- of `git push`-commando, gelezen uit een bestand, nooit letterlijk in de opdracht); de sleutel van de App staat op een pad
  dat de sandbox niet laat lezen. Geen test hier: het gedrag van het script toetst spec agent-token.
- **templateregime/AC-2** — Gewijzigd door ADR 0093 punt 2 (spec agent-samenvoegen AC-5): het script eist geen review van
  een code-eigenaar meer en de optie `--bypass-beheerder` bestaat niet meer; de tests met dit AC-id toetsen dat. De rest
  geldt nog. Was: Stap 2, rulesetscript: eist review van een code-eigenaar met nul vereiste goedkeuringen, trekt een
  goedkeuring in bij een nieuwe push, eist geen bijgewerkte branch, en eist precies `requiredChecks` (ook `check-core`,
  `leerpunt-bewijs`, `codeql (javascript-typescript)` en, tot stap 3, `document-status`). Zonder de optie `--bypass-beheerder`
  is `bypass_actors` leeg; de eigenaar gebruikt die optie pas na AC-6. De test is rood bij een ontbrekende of extra check, bij
  een bypass zonder de optie, als de App erin staat en bij een andere `bypass_mode` dan `pull_request`.
  Bewijs na activering: de eigenaar leest de ruleset met `gh api` en zet de uitvoer in de PR.
- **templateregime/AC-3** — Stap 2, `CODEOWNERS`: eerst `* @<eigenaar>`, dan elke glob met besluit `agent` zonder eigenaar
  (nu `/src/`, `/docs/` en `/CHANGELOG.md`), dan elke glob met een besluit anders dan `agent`, met `/` vooraan bij een glob zonder `**/`. De padtabel heeft rijen
  met besluit `eigenaar` voor `docs/template/**`, `**/CLAUDE*.md`, `**/AGENTS*.md`, `**/.*`, `**/.*/**`, `**/*.config.*`,
  `**/package.json` en `**/tsconfig*.json`. De test rekent met "laatste passende patroon wint" over alle getrackte paden plus
  `db/migrations/x.sql`, `docs/template/adr/x.md` en `src/x/CLAUDE.md`, en is rood als een pad een andere eigenaar krijgt dan
  het besluit in de padtabel. Bij de activering meldt GitHub geen fouten in `CODEOWNERS` (bewijs: eigenaar, in de PR).
- **templateregime/AC-4** — Proef, pad van een code-eigenaar: geleverd op 2026-11-12. PR #695 van de App
  (`scripts/proef-app-beschermd.md`) was geblokkeerd met alle checks groen, mergebaar na goedkeuring van de eigenaar, en weer
  geblokkeerd na een nieuwe commit van de App. Na stap 2 herhaald met de echte `CODEOWNERS` op `docs/template/adr/`.
- **templateregime/AC-5** — Proef, geen pad van een code-eigenaar: geleverd op 2026-11-12. PR #694 van de App
  (`docs/proef-app-vrij.md`) was mergebaar zonder review zodra de verplichte checks groen waren. Na stap 2 herhaald.
- **templateregime/AC-6** — Vervallen door ADR 0093 punt 1 (de agent werkt onder het account van de eigenaar). Was:
  Identiteit, nog niet bewezen: in de agentsessie mislukt lezen van `~/.config/gh/`, levert
  `git credential fill` voor github.com niets, ontbreken `GH_TOKEN`, `GITHUB_TOKEN` en `SSH_AUTH_SOCK` in de sessieomgeving, en tonen de auteur van
  push en PR de App. Bewijs: een sandboxtest per punt plus de uitvoer in een PR, bevestigd door de eigenaar. De bypass en
  ADR 0089 punt 9 beginnen pas na dit AC; stap 3 hangt er niet van af.
- **templateregime/AC-7** — Stap 3, na AC-4 en AC-5: `.github/workflows/guard.yml` heeft geen jobs `diff-guard`,
  `agent-merge` en `document-status`; `document-status` staat niet meer in `requiredChecks` en de eigenaar werkt de ruleset
  direct na de merge bij; de scripts uit "Raakt ook" zijn weg; `pnpm pr:merge` verliest de inhoudstoets (dit deel is
  vervallen door ADR 0093 punt 3: de padtoets is terug, spec agent-samenvoegen) en houdt head-SHA, groene checks en de modus `merge` uit `.claude/gates.json` tot ADR 0089 punt 9 (de effecttoets is weg, ADR 0091).

  | Onderdeel | Overgenomen door |
  |---|---|
  | A4 met herzieningsroute, archief, levende spec, AC-id's, besluit-PR, lanes | goedkeuring op `docs/adr/**`, `docs/specs/**`, `docs/template/**` |
  | bouwbewijs van `gebouwd` | de merge met verplichte checks; de vorm toetst `check:roadmap` |
  | inhoudstoets van de agent-merge op zelfladende bestanden | `CODEOWNERS`-rijen uit AC-3 |
  | spec vóór code, testgevallen weghalen of skippen, onbekende paden, binaire bestanden | goedkeuring op testpaden en gates; anders afspraak |
  | routes en permissies buiten `src/shared/contracts/` en `permissions.ts` | afspraak R-WERK-09, getoetst door de reviewer |
  | kop van main in de PR | niets: aanvaard risico, de CI op main vangt het |
  | `merge: eigenaar` | de eigenaar zet zo nodig één vereiste goedkeuring |

- **templateregime/AC-8** — `check-core` bewaakt `src/core` en `docs/template` elk als zone (`coreTree`, `coreBron`,
  `oudereCore`, `commitFout` en meldingen per zone): een app-PR die `docs/template/` buiten een vertrouwde template-merge
  wijzigt, faalt met de zone in de melding.
- **templateregime/AC-9** — `check-docs` toetst in `docs/adr/`, `docs/specs/`, `docs/template/adr/` en `docs/template/specs/`:
  links, statuswoorden, unieke nummers per map, kopnummer gelijk aan bestandsnummer, AC→test en de kopcontroles voor specs.
  `adrHerzienViolations` en de archiefnaamregel verdwijnen in stap 3; de reeks 0001–0099 / 0100+ staat nergens meer.
- **templateregime/AC-10** — Stap 2, rolhek: het schrijfrecht van de architect omvat `docs/template/adr/**` en
  `docs/template/specs/**` (ook in `SCHRIJFRECHT_VRIJ`); `check-docs` is groen op de samenhang met de padtabel. De A4- en
  identiteitsregels van het rolhek blijven tot ADR 0089 punt 9.
- **templateregime/AC-11** — Stap 4: onder `docs/adr/` staat alleen `_template.md`, onder `docs/specs/` alleen `_template.md` en `_mini.md`; geen
  `archief/`; elk verplaatst document staat onder dezelfde naam in `docs/template/`; `check-docs` is groen; `feiten.mjs adr` en
  `specs` tonen twee lijsten met een kop per map, app eerst.
- **templateregime/AC-12** — Docs, reviewpunt per plek: `docs/framework.md` (opening, §8 met de kop "Afgedwongen door", §10,
  R-PROV-01, R-WERK-05 tot en met R-WERK-09, R-WERK-12, R-WERK-23, R-WERK-24, R-CI-01, R-CI-04 tot en met R-CI-08, R-REPO-01,
  R-REPO-02 met de bypass, R-REPO-05, R-ROL-10, R-ARCH-07), `AGENTS.md`, `CLAUDE.md`, `docs/operations/agent-doorloop.md`, de
  skill `opleveren`, `.claude/agents/architect.md` en `docs/nieuwe-app.md`. Die laatste en de stap voor template-updates lezen
  vóór de merge de ruleset van de app en noemen: de App op de app-repo, de handle uit `goedkeurders` in `CODEOWNERS`, een
  installatie met `issues: write` op de template-repo voor leerpunten, en het betaalde abonnement voor een ruleset op een
  privé-repo.
- **templateregime/AC-13** — Stap 3 verwijdert de tests uit "Raakt ook" die alleen verdwenen code toetsen, en uit de gemengde
  tests alleen die gevallen; de lijst met reden staat in de PR (eigenaarakkoord via deze spec, R-TEST-02).
- **templateregime/AC-14** — Vervallen door ADR 0093 punt 5 (de grenscontrole is weg; het mergescript beslist op de
  padtabel, spec agent-samenvoegen). Was: Het mergescript van de hoofdsessie (`scripts/kit/pr-merge.mjs`, `beoordeelMerge`) merget alleen als
  GitHub de grens van ADR 0089 punt 2 echt bewaakt voor wie het script draait. Na de modustoets (de modus `eigenaar` stopt nog
  steeds als eerste) leest het via de API, elke aanroep afgevangen:
  1. `repos/<repo>/rules/branches/main` (alle pagina's, ook regels uit een organisatie-ruleset) en eist minstens één regel van
     type `pull_request` met `parameters.require_code_owner_review` gelijk aan `true`; een regel zonder `parameters` telt als `false`;
  2. per `ruleset_id` van zo'n regel `repos/<repo>/rulesets/<id>` en eist `current_user_can_bypass` gelijk aan `"never"`
     (minstens één zo'n ruleset is genoeg; een antwoord zonder dat veld telt als niet te lezen);
  3. `repos/<repo>/codeowners/errors?ref=<sha van main>` en eist een lege lijst `errors`.
  De redenen worden aan de bestaande lijst toegevoegd (geen vroege return); elke reden betekent geen merge (fail-closed):
  "de ruleset op main bewaakt geen review van een code-eigenaar: de eigenaar merget" (1), "wie dit script draait kan de ruleset
  passeren: de eigenaar merget" (2), "`CODEOWNERS` op main heeft fouten" (3), en "de ruleset of `CODEOWNERS` op main is niet te
  lezen: de eigenaar merget" bij een onleesbaar antwoord, een 404 of een ongeldige vorm. Klassieke branch protection zonder ruleset
  telt niet: de rules-API toont die niet, dus het script weigert (bewust). Reviewbevinding A2 (2026-11-17): zonder deze toets
  merget de hoofdsessie in een app zonder ruleset (privé-repo zonder Pro, of vóór fase 6) ook `src/core`, migraties of hooks.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| PR raakt alleen paden met besluit `agent` | de hoofdsessie merget na groene checks (spec agent-samenvoegen) | n.v.t. |
| PR raakt `src/x/CLAUDE.md` of een `.`-bestand | de eigenaar merget (spec agent-samenvoegen AC-1) | n.v.t. |

De randgevallen bij AC-6 en AC-14 (bypass, repo zonder ruleset, onleesbare rules-API, `CODEOWNERS` met fouten of afwezig,
klassieke branch protection) zijn vervallen door ADR 0093; de oude rijen staan in git.

## Raakt ook

- Stap 2: `.claude/gates.json` (rijen), `.github/CODEOWNERS`, `scripts/github-ruleset.sh`, `scripts/kit/check-docs.mjs`,
  `rails/hooks/lib/padtabel.mjs`, `scripts/kit/check-core.mjs`.
- Stap 3 verwijdert: `scripts/kit/check-document-status.mjs`, `lane.mjs`, `diff-guard.mjs`, `agent-merge.mjs`,
  `document-status-lokaal.mjs`, `functional-ui-status.mjs`, `adr-herzien.mjs`, de inhoudstoets in `pr-merge.mjs`, drie jobs in
  `.github/workflows/guard.yml`; past aan: `.claude/decisions.json` (`document-status` weg) en `lefthook.yml`.
  `rails/hooks/lib/document-state.mjs` houdt wat `check-docs`, `pnpm docs:status` en het rolhek (tot punt 9) gebruiken.
- Blijven: `scripts/kit/document-status.mjs`, `status-git.mjs`, `github-evidence.mjs`, `rails/hooks/lib/built-evidence.mjs`,
  `scripts/kit/leerpunt.mjs`, `scripts/kit/leerpunt-bewijs.mjs`.
- Tests die verdwijnen, alleen verdwijnende code: `test/rails/` `agent-merge`, `agent-merge-bytegrens`, `agent-merge-omvang`,
  `diff-guard`, `diff-guard-bytegrens`, `diff-guard-risico`, `lane`, `lane-security`, `lane-status`, `lane-status-a4`,
  `functional-ui-status`, `document-status-lokaal-config`, `archief-guard`, `specarchief-guard`, `spec-en-bouw`,
  `bouwvorm-levende-spec`, `bouwvorm-review`, `gate-label-weg`, `adr-herzien`; `test/hooks/` `adr-statusregel`,
  `beslisroute-review`, `taakmandaat-weg`, `mandate-follow-up-ci`, `mandate-follow-up-status`, `follow-up-kit.ts`;
  `test/scripts/` `document-status-lokaal`, `pr-merge-bytegrens`, `pr-merge-omvang-steekproef`; `test/docs/`
  `agent-merge-bytegrens-docs`.
- Gemengd, alleen die gevallen: `test/rails/` `bouwvorm-na-merge`, `gebouwd-na-merge`, `gebouwd-na-merge-git`,
  `check-roadmap-bewijsvorm`, `document-integrity`, `roadmap-adr-archief`, `roadmap-archive-protection`,
  `mandate-follow-up-docs`, `padtabel`, `padtabel-gelijkwaardig`, `samenhang-checks-rollen`, `guard-imports`; `test/hooks/`
  `bouwvorm-docs-status`, `bouwvorm-vervolgbouw`, `authority-git`, `rolhek-pr-merge`; `test/scripts/` `guard-workflow`,
  `github-ruleset`, `pr-merge`, `pr-merge-padtabel`, `feiten-adr-history`, `feiten-archief`, `leerlus-herzien`,
  `leerpunt-bewijs`; `test/docs/` `geen-externe-review-docs`. Stap 3 bevestigt de indeling per bestand.
- Niet: `check:migrations`, `check:secdef`, `test:db`, `test/security/resources.ts`, permissietests.

## Buiten scope

De identiteitsregels van het rolhek (ADR 0089 punt 9); de effecttoets is weg met ADR 0091.

## Testplan

Tests eerst (R-PRINC-04). AC-2, AC-3, AC-8, AC-9 en AC-10 als unit-tests, eerst rood; AC-6 met sandboxtests. AC-4 en
AC-5 met proef-PR's (geleverd, herhaald na stap 2). AC-7 en AC-13 in stap 3 met `pnpm ratchet` en `pnpm gate:fast` groen.
AC-11 in stap 4. AC-14 als unit-tests met een nep-API in een nieuw testbestand (`test/scripts/merge-ruleset.test.ts`), eerst
rood, met elk randgeval uit de tabel. De `goed()`-wereld van `test/scripts/pr-merge.test.ts`, `pr-merge-omvang-steekproef.test.ts`,
`pr-merge-padtabel.test.ts` en `schrap-documentbewaking-templateregime.test.ts` krijgt de antwoorden op `rules/branches/main`
(een regel `pull_request` met `require_code_owner_review: true` en een `ruleset_id`), `rulesets/<id>`
(`current_user_can_bypass: "never"`) en `codeowners/errors?ref=<main>` (`{ errors: [] }`); daarbuiten veranderen die tests niet
(gedragswijziging door deze spec, R-TEST-02, reden in de PR). Raakt ook: `docs/framework.md` R-REPO-01 (de opsomming van
mergevoorwaarden), ADR 0069 punt 3 (`Herzien:`-regel), de kopcommentaar van `scripts/kit/pr-merge.mjs`, `docs/nieuwe-app.md`
fase 6 ("`pnpm pr:merge` weigert als de ruleset geen review van een code-eigenaar eist, wie merget hem kan passeren, of
`CODEOWNERS` fouten heeft (templateregime AC-14); of de rest van de ruleset blijft staan, controleert niets: `check-github`
bestaat nog niet (roadmap ST-01)"), `docs/template-changelog.md`.

## Open vragen

Geen.
