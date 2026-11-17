---
status: gebouwd # #747
namespace: template-repo
---

# De template-repo uit de configuratie

## Doel

Welke repository de template is, staat op één plek in de configuratie (`template.repository` in `.claude/gates.json`) in plaats van vast in drie bestanden met code, zodat een fork van de template één regel configuratie aanpast (plus de letterlijke allow-regel in `.claude/settings.json`, die AC-11 eraan bindt) en elke app de waarde via de template-update meekrijgt.

**Toets aan framework §1.** Aanleiding: de volgorde die de eigenaar op 2026-11-15 goedkeurde ("prima volgorde - ga door"), stap 1 "app-configuratie naast templateconfiguratie", en de regel "Buiten scope" van spec [template-update](template-update.md). Geen nieuwe dependency. Deel 2 van die stap, de padtabel-uitbreiding van een app, staat in spec `app-padtabel` (aparte PR); de twee zijn onafhankelijk.

## Rollen en wie wat ziet

Geen wijziging: geen route, permissie of scherm. Het raakt wat het rolhek, `check-core`, `check:migrations`, `pnpm docs:status` en `pnpm app:init` als de template-repo zien.

## Het probleem

De template-repo staat letterlijk in code:

- `scripts/kit/check-core.mjs:21` `TEMPLATE_URL` (de fetch van `template/main` in `check-core`; `check-migrations.mjs` importeert hem);
- `rails/hooks/lib/task-authority.mjs:5` `TEMPLATE_REPOSITORY` (het doel van een leerpunt in een app, en "ben ik de template" in `rolhek.mjs`, `built-evidence.mjs` en `functional-ui.mjs`);
- `scripts/kit/app-init.mjs:25` (de onderhoud-regel die `app:init` weghaalt) en `:74` (de herkomstregel in de README).

De enige waarde in configuratie, `onderhoud.repository`, haalt `app:init` in een app weg (ADR 0045 punt 8), dus een app kan hem niet gebruiken. Een fork van de template moet nu code met besluit-PR-paden wijzigen.

## Ontwerp

- **Sleutel.** `.claude/gates.json` krijgt `"template": { "repository": "<owner>/<repo>" }`, met dezelfde vorm en dezelfde reguliere expressie als `onderhoud` (`onderhoudVan`, `rails/hooks/lib/rolhek.mjs:79`). De sleutel staat op een eigen regel die niet grenst aan de onderhoud-regel: die regel verdwijnt in een app, en een wijziging aan een buurregel gaf dan bij elke template-update een conflict. `app:init` laat hem staan.
- **Twee betekenissen blijven gescheiden.** `onderhoud.repository` blijft het kenmerk "dit is de template" waar alleen de aanwezigheid telt (`check-migrations.mjs` `isTemplate`, `draai-proef.mjs`) en de onderhoudsmodus (R-ROL-02); `template.repository` is de identiteit van de template, ook in een app. Een check die alleen op aanwezigheid toetst, gaat nooit over op `template`, want dan zou elke app voor de template doorgaan.
- **Vorm.** `templateVan(found)` naast `onderhoudVan`, beide in `rails/hooks/lib/padtabel.mjs` (een module zonder de rest van het rolhek, zodat `check-core` en `app-init` hem los laden; `rolhek.mjs` exporteert ze opnieuw): ontbrekend geeft `undefined`, een andere vorm gooit. `loadConfig` zet `config.template` (`{ repository }` of `undefined`). `check-docs` toetst de vorm (`docs:gates:template`), eist de sleutel, en eist dat `onderhoud.repository`, als hij er is, gelijk is aan `template.repository` (`docs:gates:template-onderhoud`).
- **Lezers, elk uit een vertrouwde bron:**
  - Rolhek, doel van een leerpunt (`rolhek.mjs` bij `leerpuntAfwijking`): `ctx.config.template?.repository`. De configuratie komt in een hook uit het anker (`rolhek-context.mjs` `configuratie`). Ontbreekt de sleutel, dan is elk `gh issue create` van de hoofdsessie ask met de reden `template.repository ontbreekt in .claude/gates.json`.
  - Rolhek, de melding bij core-UI (`rolhek.mjs` bij `isCoreUiSource`): `ctx.authority?.repository` gelijk aan `ctx.config.template?.repository`; ontbrekend telt als ongelijk.
  - `built-evidence.mjs` `approvedBefore`: de waarde uit `authority.trusted('.claude/gates.json')` (anker of `origin/main`, nooit de werkmap, want het beslist over een akkoord); ontbrekend of onleesbaar telt als "niet de template".
  - `functional-ui.mjs` `functionalUiReason` heeft geen aanroeper (geen code, geen test); de functie en haar alleen daar gebruikte helpers `invalidUiPath` en `isUiSource` vervallen, in plaats van een dode functie uit te breiden. `docs/template/specs/spec-en-bouw-in-een-pr.md:91` noemt haar een bestaande extra toets; die regel volgt (het rolhek laat de hoofdsessie die gebouwde spec niet wijzigen, dus de eigenaar of de architect past hem aan; staat in de PR).
  - `check-core.mjs`: eerst `isTemplateRepo` (onderhoud gelijk aan `REPO`: de check staat uit, ook zonder geldige `template`-sleutel); daarna de URL uit de pure functie `templateUrl(gatesJson)` → `https://github.com/<template.repository>.git`, op de `gates.json` die het script al leest (in `guard.yml` de checkout van `BASE_SHA`). Ontbreekt of klopt de sleutel niet, dan is de check rood met `✗ check-core: template.repository ontbreekt of is ongeldig in .claude/gates.json` en de annotatie `::error title=check-core::template.repository ontbreekt of is ongeldig`. `isTemplateRepo` blijft op `onderhoud`.
  - Eén parser: `check-core.mjs`, `check-migrations.mjs`, `check-docs.mjs` en `app-init.mjs` gebruiken `templateVan` uit `padtabel.mjs` (direct of via `rolhek.mjs`).
  - `check-migrations.mjs`: alleen als de template echt nodig is (een oudere toegevoegde migratie in een app, zonder lokale `template/main`), leest het de URL uit `git show origin/main:.claude/gates.json`, niet uit de werkmap: de werkmap komt van de PR. Ontbreekt de sleutel daar, dan is de check rood met de reden.
  - `app-init.mjs`: leest `template.repository` uit de `gates.json` van de verse kopie. Het haalt de onderhoud-regel weg als die precies `"onderhoud": { "repository": "<template.repository>" },` is (anders de bestaande fout), en schrijft de herkomstregel van de README met die waarde. Ontbreekt de sleutel, dan stopt `app:init` met `.claude/gates.json: template.repository ontbreekt`.
- **Weg:** `TEMPLATE_REPOSITORY` (`task-authority.mjs`) en de vaste `TEMPLATE_URL` (`check-core.mjs`). Er blijft geen letterlijke template-repo in `rails/` of `scripts/kit/`.
- **Blijft letterlijk:** de allow-regel `Bash(gh issue create --repo <repo> --label leerpunt *)` in `.claude/settings.json` (settings lezen geen configuratie); `test/rails/leerpunt-settings.test.ts` bindt hem aan `template.repository`. De opstartcommando's in `docs/nieuwe-app.md` en `START-NIEUWE-APP.md` draaien vóór er een repo is en blijven letterlijk.
- **Geen netwerk erbij, geen node_modules erbij:** alle lezers gebruiken alleen `node:`-imports en `JSON.parse`.

## Kopieer de vorm van

- `rails/hooks/lib/rolhek.mjs` `onderhoudVan` en `scripts/kit/check-docs.mjs` `onderhoudViolations` voor `templateVan` en zijn check.
- `scripts/kit/check-migrations.mjs` voor `git show origin/main:<bestand>` met een duidelijke rode melding.

## Hergebruik en UX

Geen schermen. Meldingen letterlijk:

- check-docs: `.claude/gates.json: template is geen { "repository": "<owner>/<repo>" }`; `.claude/gates.json: template ontbreekt`; `.claude/gates.json: onderhoud.repository (<a>) verschilt van template.repository (<b>)`.
- rolhek: `gh issue create buiten de leerpuntvorm: template.repository ontbreekt in .claude/gates.json (ADR 0059)`.
- check-core: `✗ check-core: template.repository ontbreekt of is ongeldig in .claude/gates.json`.
- check-migrations: `template.repository ontbreekt of is ongeldig in origin/main:.claude/gates.json`.
- app-init: `.claude/gates.json: template.repository ontbreekt`.

## Acceptatiecriteria

- **template-repo/AC-1** — `templateVan`: ontbrekend geeft `undefined`; `{ "repository": "a/b" }` geeft `{ repository: 'a/b' }`; een andere vorm (extra sleutel, geen tekst, geen `owner/repo`) gooit. `loadConfig` zet `config.template`.
- **template-repo/AC-2** — check-docs op `.claude/gates.json`: zonder `template` rood (`ontbreekt`); verkeerde vorm rood; `onderhoud.repository` anders dan `template.repository` rood; de echte `gates.json` groen.
- **template-repo/AC-3** — Rolhek, hoofdsessie, `gh issue create --repo <x> --label leerpunt …`: met `template.repository` = x en zonder `onderhoud` (een app) geen ask; met een andere repo ask; zonder `template` ask met de reden uit Hergebruik en UX.
- **template-repo/AC-4** — Rolhek, core-UI-melding: gelijk aan de bestaande uitkomst als origin gelijk is aan `template.repository`; een andere origin of een ontbrekende sleutel geeft de melding niet.
- **template-repo/AC-5** — `approvedBefore` met UI-akkoord: alleen akkoord als `authority.repository` gelijk is aan `template.repository` uit `authority.trusted('.claude/gates.json')`; staat de sleutel alleen in de werkmap (niet in de vertrouwde bron), dan geen akkoord.
- **template-repo/AC-6** — `functionalUiReason`, `invalidUiPath` en `isUiSource` bestaan niet meer in `rails/hooks/lib/functional-ui.mjs`; de overige exports (`isFunctionalUiSpec`, `isCoreUiSource`, `isUiTest`, `testChangeRisk`) zijn ongewijzigd.
- **template-repo/AC-7** — `templateUrl(gatesJson)` geeft `https://github.com/<template.repository>.git` en gooit zonder geldige sleutel; check-core haalt de template op van die URL en is zonder geldige sleutel rood met melding en annotatie. In de template (onderhoud gelijk aan `REPO`) blijft hij uit, ook zonder geldige `template`-sleutel.
- **template-repo/AC-8** — check-migrations, app, oudere toegevoegde migratie, geen lokale template-ref: de URL komt uit `origin/main:.claude/gates.json`, ook als de werkmap een andere `template.repository` heeft; zonder sleutel op `origin/main` rood met de melding. De uitzondering voor de template blijft op `onderhoud` (een app met `template` maar zonder `onderhoud` is geen template).
- **template-repo/AC-9** — `app:init`: de `template`-regel blijft, de onderhoud-regel met dezelfde repo gaat weg, de README-regel noemt `template.repository`; met een andere repo in `template` (een fork) volgt alles die repo; zonder `template` stopt het met de melding.
- **template-repo/AC-10** — Geen `TEMPLATE_REPOSITORY` of `TEMPLATE_URL` meer in `rails/` en `scripts/`, en de waarde van `template.repository` (gelezen uit `.claude/gates.json`, niet letterlijk in de test) komt niet voor in de bestanden onder `rails/` en `scripts/kit/`.
- **template-repo/AC-11** — `test/rails/leerpunt-settings.test.ts`: de allow-regel noemt `template.repository`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Fork van de template | één regel in `gates.json`; check-core, leerpunt, app:init volgen | n.v.t. |
| App zonder `template` (oude kopie) | leerpunt ask, check-core rood met melding, geen stil verkeerd doel | n.v.t. |
| Eerste template-update van een app van vóór deze versie | check:migrations leest `origin/main`, waar de sleutel nog ontbreekt: met een oudere templatemigratie is hij rood. Er bestaan nog geen apps (de proef-app volgt); de "Bij een update"-notitie in `docs/template-changelog.md` zegt dat zo'n app de sleutel eerst in een eigen PR toevoegt | n.v.t. |
| PR wijzigt `template.repository` | `gates.json` is altijdVragen/besluit-pr; check-migrations leest `origin/main`; het rolhek leest het anker | n.v.t. |
| Hoofdletters in de repo-naam | vergelijkingen zoals nu: check-core en het leerpuntdoel hoofdletterongevoelig, de core-UI-melding en `approvedBefore` exact | n.v.t. |

## Raakt ook

- Risicowerk (het rolhek en een vertrouwensgrens): aparte tester; kritiek (`rails/hooks/**`, `.claude/gates.json`): de eigenaar keurt de PR goed.
- Code: `rails/hooks/lib/rolhek.mjs`, `task-authority.mjs`, `built-evidence.mjs`, `functional-ui.mjs`; `scripts/kit/check-core.mjs`, `check-migrations.mjs`, `check-docs.mjs`, `app-init.mjs`.
- Config: `.claude/gates.json` (`template`, `$comment`).
- Docs: `docs/framework.md` R-ROL-07, ADR 0040 (herzien-regel: geen vaste template-URL meer), spec `template-update` (`:27` de fetch komt van `template.repository` op `origin/main`; de herkenning van de template blijft `onderhoud`), spec `leerlus` (`:38`, `:98`: het leerpuntdoel in een app is `template.repository`), spec `spec-en-bouw-in-een-pr` (`:91`, de vervallen `functionalUiReason`), `docs/nieuwe-app.md` (een fork past `template.repository` en de allow-regel aan; `:482` `git remote add template` noemt de repo letterlijk en blijft een opstartstap), `docs/template-changelog.md` (met de "Bij een update"-notitie uit Randgevallen).
- `.claude/skills/opleveren/SKILL.md` noemt het leerpuntdoel in een app letterlijk; de sandbox van de agent kan `.claude/skills/` niet schrijven, dus die regel past de eigenaar aan (staat in de PR).
- Bestaande tests (R-TEST-02, met reden in de PR): `test/hooks/rolhek-leerpunt.test.ts`, `test/hooks/functional-ui-role.test.ts`, `test/rails/leerpunt-settings.test.ts` (de export verdwijnt), `test/scripts/app-init.test.ts` (de onderhoud-regel en de README-regel komen uit de configuratie), en elke test die check-docs of `app:init` op een fixture-`gates.json` zonder `template` draait (onder meer `test/scripts/proef-fixture.ts`; `test/rails/fixtures/padtabel/gates-30cc352.json` is een bevroren fixture en blijft, de test die check-docs erop draait verwacht dan de melding `template ontbreekt` erbij).

## Buiten scope

- De padtabel-uitbreiding van een app (spec `app-padtabel` (aparte PR)).
- `goedkeurders` in `.claude/gates.json` wordt door `app:init` in de app gewijzigd; dat is hetzelfde soort conflict bij een template-update, maar één regel die zelden wijzigt. Vervolg als het in de proef-app knelt.
- Opmerkingen in `.github/workflows/guard.yml` en `leerpunt.yml` die `onderhoud.repository` noemen, blijven kloppen (die checks blijven op `onderhoud`).

## Testplan

- Unit: AC-1, AC-2 tegen `rolhek.mjs` en `check-docs.mjs`; AC-3, AC-4 met `decide` en een geladen configuratie; AC-5 met een nep-`authority`; AC-6 met een import van de module; AC-7 tegen `templateUrl` en `isTemplateRepo`; AC-8 met een fixture-repo zoals `test/rails/check-migrations-volgorde.test.ts`; AC-9 met `planAppInit` op een fixture; AC-10 met `git grep` in een test; AC-11 de bestaande test omgezet.

## Open vragen

- **OV-1 ✅ besloten** — Waar de template-repo staat: in `.claude/gates.json` als `template.repository` (aanbeveling van de hoofdsessie, vooraf aanvaard door de eigenaar op 2026-11-16).
- **OV-2 ✅ besloten** — `functionalUiReason` zonder aanroeper: schrappen in plaats van uitbreiden (bevinding van de spec-review; aanbeveling van de hoofdsessie, vooraf aanvaard).
