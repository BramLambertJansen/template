---
status: goedgekeurd # #796
namespace: agent-samenvoegen
---

# De agent werkt onder het eigenaaraccount; het mergescript beslist op de padtabel

## Doel

Werk komt zonder handwerk van de eigenaar op `main`: de agent werkt onder het account van de eigenaar, het mergescript voegt
een PR zonder beschermd pad samen bij groene checks, en een PR met een beschermd pad voegt de eigenaar samen met één klik
(ADR 0093).

## Rollen en wie wat ziet

- **Eigenaar:** voegt een PR met een beschermd pad samen op GitHub (browser of telefoon). Geeft in de vraagprompt akkoord voor
  het rulesetscript; draait zelf geen terminalcommando's voor dit onderwerp.
- **Hoofdsessie:** opent de PR onder het account van de eigenaar, wacht op de CI (`pnpm pr:verify <nr> --watch`) en draait dan
  `pnpm pr:merge <nr>`. Draait `scripts/github-ruleset.sh` alleen na akkoord van de eigenaar in de vraagprompt.
- **Subagents:** geen push, PR of samenvoeging (ongewijzigd, R-ROL-12).
- **GitHub:** de ruleset op `main` eist een PR en groene verplichte checks, voor iedereen, zonder bypass. Tussen een vrij en een
  beschermd pad maakt GitHub geen onderscheid meer; dat doet het mergescript (vangnet, geen grens).

## Kopieer de vorm van

- `scripts/kit/pr-merge.mjs` — pure functies die redenen teruggeven, een `Api`-functie als parameter, elke aanroep afgevangen,
  één schrijfactie aan het eind.
- `test/scripts/pr-merge.test.ts` — unit-tests met een nep-API per endpoint.

## Hergebruik en UX

Geen UI. Uitvoer in het Nederlands, zoals nu: bij succes de bestaande slotregels (`slotRegels`: de melding en de
steekproefregel), bij een reden exit 1 met `Geen merge (ADR 0069):` en per reden een regel. Hergebruik: `padNiveau`,
`samengevoegd`, `afgeleid` en `globMatch` uit `rails/hooks/lib/padtabel.mjs`; `prRedenen`, `checkRedenen`, `mainRedenen`,
`alle` en `bestandOp` in het mergescript blijven.

## Acceptatiecriteria

- **agent-samenvoegen/AC-1** — Padtoets, template: gegeven een padtabel waarvan `onderhoud.repository` gelijk is aan de
  repository, dan is een pad beschermd als zijn besluit niet `agent` is (`src/web/x.tsx` (voorbeeld) en `docs/x.md`
  (voorbeeld) vrij; `docs/roadmap.md`, `src/x.test.ts` (voorbeeld), `scripts/x.mjs` (voorbeeld), `package.json` en een pad
  zonder passende glob beschermd).
- **agent-samenvoegen/AC-2** — Padtoets, app: gegeven een padtabel zonder `onderhoud` of met een andere repository, dan is een
  pad alleen beschermd als zijn besluit `besluit-pr` is, zijn schrijfniveau `voorReview` of `altijdVragen` is, een glob uit
  `migraties` past, of het onder `src/core/` of `docs/template/` valt. Vrij: `src/x.test.ts` (voorbeeld),
  `test/x.test.ts` (voorbeeld), `docs/roadmap.md`, `docs/specs/x.md` (voorbeeld), `src/api/app.ts`, `deploy/x/y.ts` (voorbeeld) en
  `src/web/x.tsx` (voorbeeld). Beschermd: `.github/workflows/x.yml` (voorbeeld), `package.json`, `scripts/x.mjs` (voorbeeld),
  `AGENTS.md`, `eslint.config.js`, `.claude/agents/x.md` (voorbeeld), `docs/adr/0001-x.md` (voorbeeld),
  `db/migrations/1_x.sql` (voorbeeld), `src/core/api/auth/x.ts` (voorbeeld), `src/core/web/x.tsx` (voorbeeld) en
  `docs/template/adr/x.md` (voorbeeld).
  Rijen uit `.claude/gates.app.json` op `main` tellen mee met strengste-wint: een rij met `besluit-pr` of schrijven
  `voorReview` maakt het pad beschermd, een rij met alleen `eigenaar` of `gate` niet.
- **agent-samenvoegen/AC-3** — Het mergescript leest de bestanden van de PR via `repos/<repo>/pulls/<nr>/files` (alle
  pagina's) en toetst van elk bestand `filename` en, als het er is, `previous_filename`, tegen de padtabel op de kop van
  `main` (`.claude/gates.json`, in een app samengevoegd met `.claude/gates.app.json`). Raakt er één een beschermd pad, dan is
  de reden `raakt een beschermd pad (<hoogstens vijf paden>[, en <n> meer]): de eigenaar voegt samen` en volgt geen
  schrijfactie. Een onleesbare lijst, meer dan tien pagina's, een bestand zonder `filename`, of een onleesbare padtabel op
  `main` (ook een `gates.app.json` dat bestaat maar geen geldige JSON is) geeft de reden
  `de bestanden van de PR of de padtabel op main zijn niet te lezen: de eigenaar voegt samen`. Een `gates.app.json` dat niet
  bestaat (404) telt als leeg.
- **agent-samenvoegen/AC-4** — Samenvoegen: zonder reden uit de modus (`merge` is `niet-kritiek`; een andere modus stopt nog
  steeds als eerste), `prRedenen`, de padtoets, `checkRedenen` en `mainRedenen` voegt het script samen met squash en de
  head-SHA als voorwaarde, en drukt het de bestaande slotregels af. Elke reden betekent geen schrijfactie. De grenscontrole
  van templateregime/AC-14 bestaat niet meer: `grensRedenen` en de vier `REDEN_`-teksten zijn weg, en een repository zonder
  ruleset, met een bypass of met fouten in `CODEOWNERS` geeft daar geen reden.
- **agent-samenvoegen/AC-5** — Rulesetscript: de payload heeft `require_code_owner_review` gelijk aan `false` en een lege
  `bypass_actors`; de optie `--bypass-beheerder` bestaat niet meer (exit 2 met de gebruiksregel); de overige regels en de
  melding voor een privé-repo zonder betaald abonnement zijn ongewijzigd. De controle op fouten in `CODEOWNERS` na het zetten
  vervalt.
- **agent-samenvoegen/AC-6** — Weg zijn `scripts/kit/agent-token.mjs` (vervallen),
  `test/scripts/agent-token.test.ts` (vervallen) en `test/scripts/merge-ruleset.test.ts` (vervallen); de tests van AC-3 en AC-4 vervangen die laatste. De spec van het
  tokenscript is verwijderd; in de spec `templateregime` zijn templateregime/AC-1, -6 en -14 en het deel van templateregime/AC-7 over de
  inhoudstoets gemarkeerd als vervallen door ADR 0093. Eigenaarakkoord voor het verwijderen van die tests via deze spec
  (R-TEST-02).
- **agent-samenvoegen/AC-7** — Vervallen door ADR 0100 (procesbewijs is geen acceptatiecriterium). Was: Bewijs na de merge, in de eerste PR daarna zonder beschermd pad: de hoofdsessie opent hem onder
  het account van de eigenaar en voegt hem bij groene checks samen met `pnpm pr:merge`; de uitvoer staat in de thread. En op
  een PR met een beschermd pad weigert het script met de reden uit AC-3; die uitvoer staat in die PR. Vooraf sluit de
  hoofdsessie proef-PR #795 zonder merge.
- **agent-samenvoegen/AC-8** — `pnpm pr:merge <nr>`
  (`scripts/kit/pr-merge.mjs`) leest modus en kop van `main` via REST (`GET …/branches/main`,
  `GET …/contents/.claude/gates.json?ref=<sha>`), niet uit de lokale `origin/main`; ontbrekend of onleesbaar telt als
  `"eigenaar"`. `requiredChecks` komt uit `.claude/decisions.json` op dezelfde main-SHA. Een reden, elk met een eigen regel en
  exit 1 zonder schrijfactie: modus niet `niet-kritiek`; PR dicht, draft, basis niet `main`, een fork, head niet gelijk aan de
  lokale HEAD; een verplichte check op de head ontbreekt, is niet `success` of komt van een andere app; de laatste uitslag op
  de kop van `main` is niet `success`, loopt nog of ontbreekt. Een ongeldig argument (leeg, `0`, twee nummers, `7;x`, `abc`)
  geeft `Gebruik: pnpm pr:merge <nummer>`. Samenvoegen alleen via `PUT /repos/{repo}/pulls/{nr}/merge` met
  `merge_method=squash` en `sha=<head-SHA>`; alleen REST. Bewijs nu: `test/scripts/pr-merge.test.ts:73`.
- **agent-samenvoegen/AC-9** — Het rolhek weigert elke
  rol `gh pr merge`, `gh api …/merge` en auto-merge, en geeft alleen de hoofdsessie in de repo-root `allow` voor precies
  `pnpm pr:merge <nr>` (`<nr>` cijfers), als `trustedMerge` waar is: modus `niet-kritiek` in het anker en `MERGE_FILES`
  (`HOST_FILES` uit `rails/hooks/lib/runner-authority.mjs` plus `rails`) lokaal en gecommit gelijk aan het anker, zonder
  geplante `gh`, `git` of `node` (ook `.exe`) in `node_modules/.bin`; anders `deny` met de reden. Elke andere vorm
  (`node scripts/kit/pr-merge.mjs`, `pnpm run pr:merge`, een omhulsel, een glob, een extra argument) en elke subagent:
  `deny`. Lezen van het script met `cat`, `head`, `tail`, `grep`, `wc`, `ls`, `diff`, `stat` of git `log`, `show`, `diff`,
  `blame`, `ls-files`, `grep` blijft vrij. `.claude/settings.json` houdt `deny` voor `Bash(gh pr merge*)` en
  `Bash(gh api *merge*)`, `ask` voor `Bash(pnpm pr:merge *)`, `pnpm pr:merge *` in `sandbox.excludedCommands`, en geen
  `allow`-regel met `pr:merge`. Bewijs nu: `test/hooks/rolhek-pr-merge.test.ts:45` en `:180`.
- **agent-samenvoegen/AC-10** — Een externe
  reviewdienst is geen voorwaarde: `beoordeelMerge` leest geen reacties, check-suites, reviews, inline-commentaar of
  branch-PR's, en een 👀 of een samenvatting (ook met open punten) van een reviewbot geeft geen reden. `slotRegels(nummer,
  head)` geeft precies twee regels: de slotregel en `Meld deze merge als steekproef (ADR 0069 punt 5).` (`STEEKPROEF`). Bewijs
  nu: `test/scripts/pr-merge-omvang-steekproef.test.ts:93`.
- **agent-samenvoegen/AC-11** — Geen externe
  reviewdienst in de actieve werkstraat: `git grep --untracked -I -i -n <naam van de dienst>` over `scripts`, `.claude`,
  `README.md`, `docs/operations`, `test`, `src`, `rails`, `db`, `e2e`, `.github`, `package.json`, `AGENTS.md`, `CLAUDE.md`,
  `docs/framework.md` en `docs/dod.md`, zonder `test/rails/fixtures`, geeft alleen de docs-test zelf en in
  `test/scripts/pr-merge-omvang-steekproef.test.ts` de regels die de botnaam of de marker nabouwen. Bewijs nu:
  `test/docs/geen-externe-review-docs.test.ts:76` en `:104`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Hernoemen van een beschermd pad naar een vrij pad | beschermd, via `previous_filename` (AC-3) | n.v.t. |
| PR met meer dan 1000 bestanden | onleesbaar: de eigenaar voegt samen (AC-3) | n.v.t. |
| Push na de toets, vóór de samenvoeging | GitHub weigert: de head-SHA klopt niet meer; opnieuw draaien toetst de nieuwe head | n.v.t. |
| App zonder `.claude/gates.app.json` op `main` (404) | alleen de padtabel van de template telt | n.v.t. |
| Padtabel op `main` zonder `paden` (oude vorm) | onleesbaar: de eigenaar voegt samen (AC-3) | n.v.t. |
| Privé-repo zonder ruleset, checks groen | samenvoegen (AC-4): het script toetst de checks zelf | n.v.t. |
| PR met beschermd pad en een mislukte check | beide redenen in de uitvoer, geen schrijfactie | n.v.t. |

## Raakt ook

- `docs/template/adr/0093-agent-onder-eigenaaraccount.md` (nieuw); `Herzien:`-regels in ADR 0089, 0069, 0045, 0039 en 0091.
- Vervolg, niet in deze PR (het rolhek blijft erbuiten): commentaar dat de review van een code-eigenaar nog de grens noemt
  in `rails/hooks/rolhek.mjs`, `rails/hooks/lib/document-state.mjs`, `.github/workflows/leerpunt-bewijs.yml` en
  `test/scripts/github-ruleset.test.ts`.
- `docs/framework.md`: R-REPO-01, R-REPO-02, R-CI-07, R-ROL-10, R-WERK-05, R-DOC-09 en stap 7 van §8; `AGENTS.md` (de regel
  over wie samenvoegt); `.claude/skills/opleveren/SKILL.md` (hoofdsessie met Edit, akkoord eigenaar);
  `docs/operations/agent-doorloop.md`. R-WERK-12 wijzigt niet.
- `docs/nieuwe-app.md`: 4.1 (de let-op over de App), 6.2 (ruleset zonder review van een code-eigenaar, geen App, geen token),
  fase 10 (wat er nog niet is, en de regel "Later aanzetten" over `--bypass-beheerder`), "Een eigen beschermd pad" (in een app
  beschermt `besluit-pr` of `voorReview`).
- `docs/template/specs/templateregime.md` (templateregime/AC-1, -2, -6, -7, -14 en de randgevallen daarbij),
  `docs/template/specs/app-padtabel.md` en `docs/template/specs/leerlus-bewijs.md` (elk één zin over de code-eigenaar of de App),
  `docs/roadmap.md` (het item over de GitHub-bescherming), `docs/template-changelog.md`.
- `scripts/github-ruleset.sh`, `test/scripts/github-ruleset.test.ts`, `test/scripts/github-ruleset-templateregime.test.ts`.
- Bestaande tests die wijzigen omdat deze spec het gedrag verandert (R-TEST-02): in
  `test/scripts/schrap-documentbewaking-templateregime.test.ts` het geval dat eist dat het mergescript geen `/files` leest
  (vervalt: de padtoets leest ze weer); in `test/scripts/pr-merge.test.ts`, `test/scripts/pr-merge-padtabel.test.ts` en
  `test/scripts/pr-merge-omvang-steekproef.test.ts` krijgt de nep-API het `files`-endpoint en verdwijnen de endpoints van de
  grenscontrole; de verwachtingen over modus, PR, checks, `main` en slotregels blijven. Uitzondering: in
  `test/scripts/pr-merge-padtabel.test.ts` verwacht het geval met de oude vorm van de padtabel (zonder `paden`) voortaan de
  reden "niet te lezen" in plaats van een samenvoeging, omdat het script de tabel weer leest en bij twijfel weigert.
- `docs/template/specs/padtabel.md`: Werking 7 en AC-5 ("het mergescript leest alleen nog de modus") krijgen een verwijzing
  naar deze spec.
- `.claude/gates.json`: alleen het `$comment` (wat `merge` en `CODEOWNERS` betekenen). De padtabel zelf wijzigt niet.
- Niet: `rails/hooks/lib/rolhek.mjs`. De regels blijven; `pnpm pr:merge <nr>` van de hoofdsessie laat het rolhek al door.
- Na de merge, door de hoofdsessie met akkoord in de vraagprompt: `scripts/github-ruleset.sh BramLambertJansen/template`
  (haalt de bypass van de proef en de review van een code-eigenaar uit de ruleset).

## Buiten scope

- `gebouwd` afleiden uit de merge (overnameplan punt 4a): eigen PR daarna.
- Auto-merge van GitHub en een melding achteraf (ADR 0093, Alternatieven).
- Een machineaccount of de review van een code-eigenaar terug voor een app met echte gebruikers: eigen app-ADR.
- `CODEOWNERS` en `scripts/kit/codeowners.mjs` verwijderen; het rolhek wijzigen; een lichtere reviewroute voor docs.
- De App `bram-template-agent` van de repo halen: dat doet de eigenaar op GitHub.

## Testplan

Tests eerst (R-PRINC-04), door de tester (risicowerk). AC-1 en AC-2 als unit-tests op een pure functie
`beschermdPad(pad, tabel, repo)` met de echte `.claude/gates.json`, een variant zonder `onderhoud`, en een `gates.app.json` met
een rij `besluit-pr`, een rij `voorReview` en een rij `eigenaar`. AC-3 en AC-4 in `test/scripts/pr-merge-samenvoegen.test.ts`
met een nep-API per endpoint: per reden geen schrijfactie, en bij succes een lege redenenlijst. AC-5 in de bestaande
rulesettests op de payload en de opties. AC-6 als test dat de bestanden weg zijn en de statussen kloppen. AC-7 is bewijs na de
merge, geen test.

## Open vragen

- **OV-1 ✅ besloten** — Identiteit: het account van de eigenaar, geen App of machineaccount (eigenaar, 2026-11-18).
- **OV-2 ✅ besloten** — Ruleset zonder review van een code-eigenaar en zonder bypass; het mergescript beslist op de padtabel
  (eigenaar, 2026-11-18, na de proef met #794 en #795).
- **OV-3 ✅ besloten** — App: smalle lijst (auth, migraties, bewaking, core); template: breed zoals nu; privé-repo zonder
  ruleset: zachte modus (eigenaar, 2026-11-18). "Bewaking" is uitgewerkt als schrijfniveau `voorReview` of hoger; tests zijn
  in een app vrij.
- **OV-4 ✅ besloten** — Geen auto-merge: het script voegt samen bij groen op de getoetste head-SHA (eigenaar, 2026-11-18, na
  de spec-review).
