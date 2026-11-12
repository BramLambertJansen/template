---
status: goedgekeurd
namespace: templateregime
---

# Templateregime

## Doel

In de template-repo vervallen de besluit-PR en de onwijzigbaarheid van ADR's, archief en gebouwde specs (ADR 0089); in een app
blijft alles streng, behalve voor templatedocumenten die de app ongewijzigd uit `template/main` overneemt.

## Rollen en wie wat ziet

Architect en hoofdsessie schrijven ADR's en specs; de eigenaar merget. Andere rollen blijven op documenten geweigerd zoals nu.

## Datawijzigingen (met grants)

n.v.t. — alleen scripts, hooklib en docs.

## Routes en foutcodes

n.v.t. — geen API-route.

## Koppeling

n.v.t. — geen externe dienst; `template/main` komt van `TEMPLATE_URL` zoals in `check-core`.

## Kopieer de vorm van

- `scripts/kit/check-core.mjs` — `isTemplateRepo` als enige herkenning, en `template/main` vers ophalen van `TEMPLATE_URL` in
  een eigen ref (`refs/guard/template`), dicht vallend als dat niet lukt.

## Hergebruik en UX

n.v.t. — geen UI; meldingen houden hun tekst, behalve AC-11.

## Acceptatiecriteria

Template = `isTemplateRepo(<gates.json van de vertrouwde basis>, <repository>)` is waar; app = elk ander geval. Wat in AC-2 tot
en met AC-5 vervalt, vervalt alleen in de template. Functies uit `check-document-status.mjs` tenzij anders genoemd.

- **templateregime/AC-1** — Template alleen als `isTemplateRepo` waar is voor de `gates.json` van de basis en `REPO`. Zonder
  `onderhoud`, met een andere naam, of als `isTemplateRepo` gooit (ongeldige JSON): streng; een unit-test per geval.
- **templateregime/AC-2** — Template, ADR's: `beslisOvergang` geeft `besluit` (niet `vrij`, `geweigerd` of `a4`) voor een
  herschreven geaccepteerd ADR zonder herzieningsregel, een gewijzigd vervallen of vervangen ADR waarvan de status gelijk
  blijft, geaccepteerd → `vervangen door NNNN` of `vervallen` met nieuwe inhoud, een gewijzigd kopnummer en een wijziging in het
  archief; elke andere statusovergang volgt `toegestaanZonderRecord`; `verifyHerzieningPr` toetst niet. Een ADR met
  eigenaarstatus verwijderen of hernoemen, ook naast een nieuw ADR met hetzelfde nummer, slaagt (`verifyAdrWeg`).
- **templateregime/AC-3** — Template, archief: wijzigen, verwijderen of hernoemen onder `docs/adr/archief/` of
  `docs/specs/archief/` slaagt; alle eisen van `verifyVerhuizingen` vervallen (byte-gelijk, `verifyArchiefStatus`, alleen met
  `docs/`).
- **templateregime/AC-4** — Template, specs: slagen, ook naast code: een gebouwde spec van inhoud wijzigen
  (`verifyGebouwdeInhoud`), een AC-id laten verdwijnen (`verifyAcIdsBlijven`), een markering zonder de eisen van
  `verifyMarkering`, een spec met eigenaarstatus verwijderen of hernoemen (`verifySpecWeg`, `verifyGeenRename`).
- **templateregime/AC-5** — Template, lane: elk besluit naast elk ander pad geeft in `laneVan` de lane `template`, ook naast
  `docs/framework.md`, `docs/operations/*` of een kritiek pad (`kritiekPad`). Daar vervallen "een ADR gaat in een besluit-PR
  (ADR 0062)", "is kritiek; dat vraagt eerst een besluit-PR (ADR 0062 punt 2)", en uit `buitenBereik` "is een ADR" en "een
  bestaande spec verwijderen"; in `verifyFeatureInhoud` vervallen `migratieOvertreding` en de grens van één nieuwe migratie.
  Blijven rood met hun melding: de rest van `buitenBereik` ("wijzigt instructies van de agent", "onbekend pad buiten gates",
  "een bestaande test verwijderen of hernoemen", "een bestaande test buiten JS/TS wijzigen", "een migratie wijzigen of
  verwijderen"), `functionalUiReason` en `verifyFunctionalUiChanges` voor een functionele-UI-spec, de kop "Datawijzigingen (met
  grants)" bij een nieuwe migratie, `verifyVolgorde` en `verifyTestwijzigingen`.
- **templateregime/AC-6** — Template, wat blijft, elk rood met de melding van nu: ongeldige statusregel
  (`statusregelOvertreding`); een ADR terug naar `voorgesteld`; een andere `geweigerd`-overgang (`GEEN_BESLUIT`); "is al gebruikt
  door een verwijderd ADR"; "is inmiddels op main gebruikt"; een dubbel nummer (`duplicateAdrNumbers`); `vervangen door NNNN`
  zonder doel (`verifyVervanger`, `verifyVervangersBestaan`) of met een cyclus; `gebouwd # #<PR>` zonder bouwbewijs
  (`verifyGebouwd`, `verifyGemergd`, `verifyBuilt`); in het rolhek een eigenaarstatus door een andere rol dan architect of
  hoofdsessie; in `check-docs` een dode link, een AC zonder test en een krimpovertreding.
- **templateregime/AC-7** — App: elk geval uit AC-2 tot en met AC-5 wordt geweigerd met de melding van nu; de bestaande tests in
  `test/rails/` en `test/hooks/` blijven ongewijzigd groen. Rood bewijs: dezelfde test met `onderhoud.repository` gelijk aan
  `REPO` faalt.
- **templateregime/AC-8** — App, template-update: `check-document-status` haalt `template/main` altijd vers op van `TEMPLATE_URL`
  in een eigen ref; een bestaande ref zoals `refs/remotes/template/main` telt niet. Een pad is een ongewijzigd templatedocument
  als (a) de versie op de basis byte-gelijk is aan dat pad op `merge-base(<basis>, template/main)`, of het pad op beide ontbreekt,
  én (b) de versie na de PR byte-gelijk is aan `template/main`, of het pad ontbreekt zowel na de PR als op `template/main`; bij
  een rename bron en doel apart. Zo'n pad valt buiten AC-2 tot en met AC-4 en telt niet als besluit in
  `verifyInPrStatus`/`laneVan` of in `verifyGebouwd`/`verifyGemergd`. Elk ander pad krijgt de strenge toets, ook zonder of met
  meer dan één merge-base en als ophalen of lezen mislukt; de uitvoer noemt dan de reden, en bij een afwijking dat
  `template/main` intussen verder kan zijn.
- **templateregime/AC-9** — `check-docs`: `adrHerzienViolations` en `specarchiefViolations` ("een naam komt niet terug") geven in
  de template geen overtreding; in een app toetst `adrHerzienViolations` alleen een wijzigend ADR vanaf 0100. De repository komt
  uit `GITHUB_REPOSITORY` in CI en lokaal uit de `origin`-URL; onbekend is streng. `check-docs` is geen grens (het draait de code
  en `gates.json` van de PR); de guard is de grens.
- **templateregime/AC-10** — Rolhek in de onderhoudsmodus (`ctx.onderhoud === true`), voor een `beslisrol`: niet meer geweigerd,
  elk nu eerst rood: Edit, Write of verwijderen in het archief (`archiefWeg`, `beslisOvergang`); een Bash-schrijfactie in het
  archief (`decideChange`, `archiefViaBash`, `ARCHIEF_MELDING`); een inhoudswijziging aan een vervallen of vervangen ADR;
  geaccepteerd → vervangen met nieuwe inhoud; een gewijzigd kopnummer. Blijft geweigerd: terug naar `voorgesteld`, en elk geval
  voor een andere rol of zonder onderhoudsmodus.
- **templateregime/AC-11** — Meldingen: in de template noemt geen weigering uit AC-6 of AC-10 "besluit-PR" als uitweg (een test
  per melding faalt op die tekst); in een app blijft `A4_MELDING` letterlijk.
- **templateregime/AC-12** — Docs, reviewpunt (de reviewer toetst per R-id): `docs/framework.md` R-WERK-05, R-WERK-07, R-WERK-08,
  R-WERK-24, R-CI-05, R-CI-06, R-ROL-02 en R-ROL-08 noemen het onderscheid template/app; `.claude/agents/architect.md` en
  `docs/adr/_template.md` spreken het niet tegen.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `REPO` ontbreekt of is leeg | rood: "REPO ontbreekt" (`requiredEnv`) | n.v.t. |
| `isTemplateRepo` gooit op ongeldige JSON | streng | n.v.t. |
| PR in de template haalt `onderhoud` uit `gates.json` | de basis telt, niet de PR | n.v.t. |
| App voegt een eigen document toe | streng: (b) faalt | n.v.t. |
| App verwijdert een eigen document | streng: (a) faalt | n.v.t. |
| Template voegt een spec toe met de naam van een app-spec | streng: (a) faalt | n.v.t. |
| App paste een templatedocument eerder aan | streng: (a) faalt | n.v.t. |
| App nooit aan de template gekoppeld, of meerdere merge-bases | streng | n.v.t. |

## Raakt ook

- `scripts/kit/check-document-status.mjs`, `scripts/kit/lane.mjs` (`laneVan`, `buitenBereik`),
  `rails/hooks/lib/document-state.mjs` (`beslisOvergang`, `A4_MELDING`), `scripts/kit/check-docs.mjs`,
  `scripts/kit/adr-herzien.mjs`, `rails/hooks/lib/rolhek.mjs`; `scripts/kit/check-core.mjs` hergebruikt.
- Tests in `test/rails/` en `test/hooks/` (onder meer `archief-guard`, `bouwvorm-levende-spec`, `adr-herzien`, `rolhek-archief`,
  `rolhek-archief-bash`, `rolhek-beslisroute`, `rolhek-onderhoud`): nieuwe gevallen, bestaande ongewijzigd.
- Docs: `docs/framework.md`, `.claude/agents/architect.md`, `docs/adr/_template.md`, `docs/operations/agent-doorloop.md`.
- Niet: `check:migrations`, `check:secdef`, `test:db`, `test/security/resources.ts`, permissietests, workflows,
  `.claude/decisions.json`.

## Buiten scope

Korte specs, architect op verzoek, tester bij risicowerk en ADR's samenvoegen; `check-docs` als grens; ander appgedrag dan AC-8
en AC-9.

## Testplan

Tests eerst (R-PRINC-04), elk eerst rood. Fixtures: template (`onderhoud.repository` gelijk aan `REPO`), app (zonder
`onderhoud`), app met template-update (een lokale bare repo als vervanger van `TEMPLATE_URL`). AC-2 tot en met AC-6 en AC-11 in
de template-fixture; AC-7: bestaande tests ongewijzigd, plus een nieuwe app-test per geval zonder bestaande app-fixture. AC-8:
byte-gelijk gewijzigd, verwijderd door de template, rename, eigen document verwijderd, eigen document toegevoegd (ontbreekt op
alle drie de plekken), afwijkend, `template/main` onleesbaar, geen merge-base, meerdere merge-bases, een verouderde
`refs/remotes/template/main` genegeerd, een nieuw template-ADR met code, een gebouwde templatespec met een vreemd PR-nummer.
AC-1 en AC-9 als unit-test; AC-10 in de rolhektests. Geen bestaande fixture krijgt een `onderhoud`-regel.

## Open vragen

Geen.
