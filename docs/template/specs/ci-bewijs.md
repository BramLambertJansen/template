---
status: goedgekeurd
namespace: ci-bewijs
---

# CI- en runnerbewijs: leerpunten-bundel C (#683, #758, #961)

## Doel

Minder fouten die richting productie doorglippen. Een review van werk dat `db/`, `test/security/` of `e2e/` raakt,
komt niet meer op "goedgekeurd" uit zonder runnerbewijs of voorbehoud (#683, met precies die paden). De hook toetst de
vorm van het bewijs en de sha, niet of de check echt groen draaide: het is een prikkel tot bewijs, geen afgedwongen
bewijs. CI draait `gate:slow` op elke PR, en die is het echte bewijs. De secrets-job op `main` wordt niet rood door andermans branch (#758). Een rode
`gate:slow` toont met `pnpm pr:log <nr>` ook de falende test (#961).

Gemeten op `d25dbf8`:

- `reviewerStop` in `rails/hooks/lib/werkstraat.mjs` toetst alleen de kop `## Bevindingen`. Een rapport
  "Geen blokkerende bevindingen" op een diff in `db/` gaat door, ook zonder dat iemand `pnpm test:db` draaide.
- De job `secrets` in `.github/workflows/ci.yml` draait bij elk event behalve `pull_request` `betterleaks git` zonder
  `--log-opts`, dus over alle gefetchte refs (`fetch-depth: 0`). Een achtergebleven branch met een afgekeurde commit
  maakte `main` op 15 november vier keer rood (#758).
- `pnpm pr:log 967` haalt in de cloud de logs van de rode jobs op, ook van `gate:slow (ui:check 1/2)`. Het kernprobleem
  van #961 is dus opgelost door ADR 0102. Het uittreksel toont 15 regels vóór elke `##[error]`. Bij vitest staat de
  falende test daar niet in (alleen `1 failed`), en bij `ui:check` alleen uitvoer van compose. `pnpm pr:verify` noemt
  bij rood `pnpm pr:log` niet.

## Rollen en wie wat ziet

- **Reviewer-subagent:** krijgt de blokkade uit AC-1 als hij een rapport afsluit op een diff die `db/`, `test/security/`
  of `e2e/` raakt, zonder runnerbewijs of voorbehoud. De runnerchecks draait hij niet: hij leest alleen.
- **Hoofdsessie:** geeft de reviewer de runneruitvoer of het CI-bewijs op de head mee, of zet het voorbehoud met het
  terminalblok in de PR. Bij rode CI wijst `pnpm pr:verify` naar `pnpm pr:log <nr>` (AC-7).
- **Eigenaar:** draait bij een voorbehoud het terminalblok. Hij keurt deze PR goed en merget hem. Het is kritiek werk:
  `rails/hooks/**`, `.github/**` en `scripts/kit/pr-log.mjs` hebben `besluit-pr`.
- **Tester:** schrijft vóór de bouw de tests van AC-1 tot en met AC-7. Het is risicowerk, want het raakt de bewaking zelf.

## Kopieer de vorm van

- `test/hooks/werkstraat.test.ts`: `fakeDeps` en de reviewertest rond `subagentStop`.
- `test/rails/ci-scan.test.ts`: `runBlock()` en `scan(event)` voor de job `secrets`.
- `test/scripts/ci-loguittreksel.test.ts`: `log()` en `bereik()` voor `foutUittreksel`.

## Hergebruik en UX

Geen UI. Wijzigingen:

1. **`rails/hooks/lib/werkstraat.mjs`:** `reviewerStop(payload, deps)`. `subagentStop` geeft `deps` door.
   - Runnerpaden: elk bestand uit `deps.changed()` dat begint met `db/` of `test/security/` vraagt `pnpm test:db`. Elk
     bestand dat begint met `e2e/` vraagt `pnpm ui:check`. Volgorde in meldingen: `pnpm test:db`, dan `pnpm ui:check`.
   - Zonder `## Bevindingen` blijft de bestaande blokkade. Met de kop en zonder gevraagde check: `{}`, zoals nu.
   - Met de kop en een gevraagde check gaat het rapport door als één van twee vormen erin staat:
     - **Runnerbewijs:** per gevraagde check een regel die voldoet aan
       `^\s*(?:[-*]\s+)?Runnerbewijs: (pnpm (?:test:db|ui:check)) groen op ([0-9a-f]{7,40})\b` (vlag `m`). De sha
       begint de uitvoer van `git rev-parse HEAD` (via `deps.run`). Faalt `git rev-parse`, dan telt geen enkele
       bewijsregel.
     - **Voorbehoud:** de tekst `goedgekeurd onder voorbehoud van runnerchecks`, en elke gevraagde check staat letterlijk
       binnen een codeblok (tussen twee regels die met drie backticks beginnen) in het rapport: het terminalblok voor
       de eigenaar.
   - Anders volgt een blokkade met letterlijk deze reden, `<checks>` met `, ` gescheiden:
     `Reviewer: de diff raakt db/, test/security/ of e2e/ en het rapport heeft geen runnerbewijs (leerpunt #683). Zet per check een regel "Runnerbewijs: <check> groen op <sha van HEAD>" (uitvoer of CI-bewijs van de hoofdsessie), of schrijf "goedgekeurd onder voorbehoud van runnerchecks" met de checks in een codeblok: het terminalblok voor de eigenaar. Gevraagd: <checks>.`
2. **`.github/workflows/ci.yml`**, job `secrets`: de tak voor elk event behalve `pull_request` krijgt
   `--log-opts "HEAD"`. Dan scant die tak alleen de geschiedenis van de uitgecheckte commit, op `main` dus `main`. De
   PR-tak blijft `origin/main..HEAD`. De commentaren in de job en bovenaan het bestand volgen, en ook de kop van
   `test/rails/ci-scan.test.ts`.
3. **`scripts/kit/pr-log.mjs`**, `foutUittreksel`: foutmarkeringen.
   - Een foutmarkering is een regel die, zonder tijdstempel en zonder ANSI-kleurcodes (`/\x1b\[[0-9;]*m/g`), voldoet aan
     `^\s*(?:FAIL\s|×\s|✘\s|not ok \d|\d+\) \[[^\]]+\] › )`. Zo herkent hij vitest (`FAIL`, `×`), Playwright (`✘`,
     `1) [chromium] › …`) en TAP (`not ok 3`).
   - De markeringen die niet in een venster van een `##[error]` vallen, komen vooraan, in de volgorde van de log, als
     hun regel zonder tijdstempel; de ANSI-codes blijven staan. Het zijn er hooguit 20. "In een venster" betekent in
     een venster vóór het afkappen op 120 regels.
   - Na de markeringen volgt een regel `…`, en daarna het bestaande uittreksel: de vensters, of zonder `##[error]` de
     laatste 30 regels. Een markering die in die laatste 30 regels valt, komt niet vooraan.
   - De grens van 120 regels en de telregel gelden voor het geheel. Zonder markering blijft de uitvoer gelijk aan nu.
4. **`scripts/kit/pr-verify.mjs`**: nieuwe export `roodMelding(nummer)` geeft
   `CI is rood; herstel de oorzaak en controleer de nieuwe commit (fouten per rode job: pnpm pr:log <nummer>)`.
   `volgChecks` krijgt het PR-nummer en gooit die melding bij rood.
5. **Docs:**
   - `docs/operations/review-checklists.md`, onder "Werkwijze": de regel van AC-1.
   - `docs/template/specs/ci-log.md`, punt 7: een verwijzing naar ci-bewijs/AC-5 en AC-6.
   - `docs/operations/recepten.md`: geen wijziging, want de rij `pnpm pr:log <nr>` staat er al.
   - Een changelogfragment.

## Acceptatiecriteria

Nieuw gedrag faalt op `main` op een `expect`, niet bij het laden. Een nieuwe export laad je dynamisch als `unknown`
en lees je met `Reflect.get`, zoals in `test/hooks/meting.test.ts`; de test begint met
`expect(typeof <export>).toBe('function')`.

- **ci-bewijs/AC-1** — Gegeven een reviewer-rapport met `## Bevindingen` en `Geen blokkerende bevindingen`, en een
  diff met `db/migrations/x.sql` (voorbeeld), wanneer `subagentStop` draait, dan blokkeert het met de reden uit "Hergebruik en UX"
  punt 1 en `Gevraagd: pnpm test:db`. Met `e2e/a.spec.ts` (voorbeeld) erbij eindigt de reden op `Gevraagd: pnpm test:db, pnpm ui:check`.
  Met alleen `test/security/resources.ts` is het `Gevraagd: pnpm test:db`. Toets: `test/hooks/werkstraat-runnerbewijs.test.ts`
- **ci-bewijs/AC-2** — Gegeven dezelfde diff met `db/` en HEAD `abcdef1234…`, wanneer het rapport
  `Runnerbewijs: pnpm test:db groen op abcdef1` bevat, dan `{}`. Met een andere sha, een sha van 6 tekens, of een
  falende `git rev-parse`, blokkeert het. Met `db/` en `e2e/` en alleen een bewijsregel voor `pnpm test:db` blokkeert
  het ook. De bewijsregel als opsommingspunt (`- Runnerbewijs: …`) telt; midden in een zin niet. Toets: `test/hooks/werkstraat-runnerbewijs.test.ts`
- **ci-bewijs/AC-3** — Gegeven een diff met `db/` en `e2e/`, wanneer het rapport `goedgekeurd onder voorbehoud van
  runnerchecks` en een codeblok met `pnpm test:db` en `pnpm ui:check` bevat, dan `{}`. Ontbreekt `pnpm ui:check` in
  het codeblok (ook als het erbuiten staat), dan blokkeert het. Gegeven alleen `src/a.ts` (voorbeeld), dan `{}` met alleen de kop,
  zonder `git rev-parse HEAD` via `deps.run`. Toets:
  `test/hooks/werkstraat-runnerbewijs.test.ts`
- **ci-bewijs/AC-4** — Gegeven het `run`-blok van de job `secrets`, wanneer het draait met `EVENT` `push`,
  `merge_group` of `workflow_dispatch`, dan krijgt betterleaks `--log-opts HEAD`. Elke regel met `betterleaks git` in de job
  heeft `--log-opts`. Toets: `test/rails/ci-scan.test.ts`
- **ci-bewijs/AC-5** — Gegeven een log met `FAIL  test/a.test.ts > x` (met ANSI-kleurcodes en tijdstempel) op regel 10
  en een `##[error]` op regel 80, wanneer `foutUittreksel` draait, dan eerst de regel `FAIL  …` zonder tijdstempel, dan
  `…`, dan het venster van regel 65 tot en met 80; de ANSI-codes in de regel vooraan blijven. Een markering binnen het
  venster komt niet vooraan. Zonder markering blijft het resultaat gelijk aan ci-log/AC-3 en ci-log/AC-4. Toets: `test/scripts/ci-loguittreksel.test.ts`
- **ci-bewijs/AC-6** — Gegeven 30 markeringsregels ver vóór één `##[error]`, wanneer `foutUittreksel` draait, dan de
  eerste 20, `…` en het venster. Gegeven een log zonder `##[error]` met `  1) [chromium] › e2e/a.spec.ts:3:1 › t` op
  regel 5 en `not ok 2 - x` op regel 90 van 100, dan die eerste regel, `…` en de laatste 30 regels. Toets:
  `test/scripts/ci-loguittreksel.test.ts`
- **ci-bewijs/AC-7** — `roodMelding(12)` geeft letterlijk
  `CI is rood; herstel de oorzaak en controleer de nieuwe commit (fouten per rode job: pnpm pr:log 12)`. Toets:
  `test/scripts/pr-verify-rood.test.ts`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Reviewer in spec-review-modus op een PR die alleen een spec onder `docs/` raakt | Geen runnerpad, dus alleen de kop | — |
| Werkmap met een verwijderd bestand onder `db/` | `deps.changed()` laat verwijderde bestanden weg, dus geen eis | — |
| Bewijsregel met hoofdletters in de sha | Telt niet: alleen kleine hextekens, zoals `git rev-parse` ze geeft | — |
| Een geheim op een branch zonder PR | Niet meer in CI gemeld. De pre-commit-scan blijft, en R-SEC-06 eist secret scanning met push protection | — |
| Ongecommitte wijziging onder `db/` met een bewijsregel op de sha van HEAD | Gaat door: het bewijs geldt voor HEAD, niet voor de werkmap. De review toetst de gecommitte stand | — |
| Markering in een venster dat door de grens van 120 regels wegvalt | Komt niet vooraan; de telregel meldt het weglaten | — |

## Raakt ook

- `test/rails/ci-scan.test.ts`: de test "bij %s alle gefetchte refs, zonder beperking" verandert van verwachting
  (R-TEST-02, reden: besluit van de eigenaar bij #758).
- De hooks draaien van `main` (`.claude/hooks/`, anker). AC-1 tot en met AC-3 werken pas na de merge.
- Beschermde paden: `rails/**` en `scripts/**` (voorReview), `.github/**` (altijdVragen; de hoofdsessie bewerkt het met
  akkoord van de eigenaar). Kritiek werk, dus de eigenaar keurt goed en merget.
- Renovate-PR #967 wijzigt dezelfde job `secrets` op de regels van `mise-action`. Renovate zet die PR zelf opnieuw op bij
  een conflict.

## Buiten scope

- De reviewer zelf runnerchecks laten draaien. Hij leest alleen (R-ROL-02).
- Een CI-check op de PR-sectie Bewijs. Daar besloot de eigenaar tegen (OV-1): CI draait `gate:slow` zelf al.
- ANSI-kleurcodes uit het hele uittreksel halen.
- Runnerbewijs eisen bij andere paden, zoals `src/web/`, `src/api/` of `*.int.test.ts`. #683 noemt alleen `db/`,
  `test/security/` en `e2e/`; een bredere set is een nieuw leerpunt.
- `.claude/agents/reviewer.md`: de hook geeft de route, en de reviewer leest de checklist bij elke review.

## Testplan

Unit-tests zonder netwerk en zonder database. AC-4 draait het `run`-blok in de kooi, zoals de bestaande test. De
regel "elke `betterleaks git` heeft `--log-opts`" heeft geen kooi nodig. Daarnaast `pnpm gate:fast` lokaal groen, en
de CI-uitslag op de head van de PR.

## Open vragen

- **OV-1 ✅ besloten** — #683: een reviewer-stophook met runnerbewijs of voorbehoud. Geen CI-check op de PR-sectie
  Bewijs (eigenaar, 24 november 2026).
- **OV-2 ✅ besloten** — #758: buiten een PR scant de job alleen de geschiedenis van HEAD. Er komt geen aparte scan van
  alle branches (eigenaar, 24 november 2026).
- **OV-3 ✅ besloten** — #961: kleine aanvulling. `pnpm pr:verify` verwijst bij rood naar `pnpm pr:log <nr>`, en het
  uittreksel neemt foutmarkeringen op (eigenaar, 24 november 2026).
