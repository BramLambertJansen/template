---
status: gebouwd # voorstel | goedgekeurd | gebouwd | vervallen — architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd: `status: gebouwd` in de bouw-PR (ADR 0095)
namespace: schaduwmodus
---

# Schaduwmodus met tijdgrens

## Doel

Een nieuwe controle kan maximaal 14 dagen alleen loggen. Ze staat dan in een register met een drempel die vooraf vastligt, en
na de einddatum wordt de template rood tot het besluit (hard, aangepast of verwijderd) is gemerged (ADR 0106).

## Rollen en wie wat ziet

Geen gebruikersrollen. Het gaat om twee checks in `pnpm ratchet` (lokaal, `gate:fast`, CI), een weigering in
`pnpm template:release`, een meetregel en `pnpm meting --schaduw`. De hoofdsessie ziet de meldingen en neemt het besluit mee in
een PR. Het register `.kit/schaduw.json` is beschermd (`schrijven voorReview`, besluit eigenaar). Bij de bouw is het register
leeg (`[]`): er staat nog geen controle in schaduw.

## Register `.kit/schaduw.json`

Een JSON-lijst, met per controle precies deze velden (een onbekend veld is een fout):

| Veld | Vorm |
|---|---|
| `naam` | `^[a-z][a-z0-9-]{0,63}$`, uniek; voor een check ook de sleutel `schaduw:<naam>` in de ratchet |
| `soort` | `hook`, `check` of `lintregel`; een `check` en een `lintregel` hebben een uitvoerder `<naam>` in de map `schaduw` van de ratchet, voor een `hook` dwingt niets af dat hij draait (reviewpunt) |
| `spec` | bestaand bestand op `.md` onder `docs/template/specs/`, al genormaliseerd: geen padsegment `.` of `..`, geen `//` en geen `/` aan het eind (toets: `path.posix.normalize(spec) === spec`; B-8) |
| `rids` | niet-lege lijst van `^R-[A-Z]+-\d{2}$`; geen R-id uit `ALTIJD_HARD` |
| `start`, `eind` | `JJJJ-MM-DD`, `start ≤ eind ≤ start + 14 dagen` |
| `drempel` | `{ "hard": string, "aanpassen": string, "verwijderen": string }`, elk niet leeg |
| `aangepast` | `0` of `1` |

`ALTIJD_HARD` is een geëxporteerde constante in `scripts/kit/schaduw.mjs` (ADR 0106 punt 2) met twee delen: de voorvoegsels
`R-AUTH-` en `R-ROL-` (rolhek, GitHub-schrijfacties en zelfladende paden; nieuwe ids vallen er vanzelf onder) en de ids
R-WERK-09, R-CODE-03, R-TEST-02, R-TEST-03, R-TEST-04, R-DB-01, R-DB-05, R-DB-09, R-CODE-08, R-SEC-01, R-SEC-02, R-SEC-03,
R-SEC-04, R-SEC-05, R-SEC-06, R-SEC-08, R-LAAG-08, R-CI-01, R-CI-07, R-REPO-02 en R-PRINC-04. Bij twijfel hoort een id erbij.

## Checks en meldingen (letterlijk)

Beide checks staan in `strikt` van `scripts/kit/ratchet.mjs`. Ze slaan zonder uitvoer over als `.claude/gates.json` geen
`onderhoud` heeft (het veld ontbreekt: een app; `onderhoudVan` uit `rails/hooks/lib/padtabel.mjs`). Een ongeldige vorm of een
onleesbaar bestand laat de check gooien, net als `onderhoudVan` en `isTemplate`. In een app draaien ook de uitvoerders niet.

`schaduw-register` (schema). Elke sleutel is `<naam>:<reden>`; `<naam>` is `#<index>` als het veld `naam` ongeldig is:
- `.kit/schaduw.json ontbreekt; een leeg register is []` / `.kit/schaduw.json is geen JSON-lijst`
- `<naam>: veld <veld> ontbreekt of heeft niet de vorm uit de spec schaduwmodus` / `<naam>: onbekend veld <veld>`
- `<naam>: staat twee keer in het register` / `<naam>: spec <pad> bestaat niet`
- `<naam>: einddatum <eind> ligt vóór de start <start>`
- `<naam>: einddatum <eind> ligt meer dan 14 dagen na de start <start> (ADR 0106 punt 3)`
- `<naam>: <R-id> moet altijd meteen hard zijn (ADR 0106 punt 2); deze controle kan niet in schaduw`

Vier regels vergelijken met de registerregel van dezelfde naam op `git merge-base origin/main HEAD` (ontbreekt de basis, dan
lokaal geen melding en in CI rood, zoals bij `ac-toets`; staat de naam niet op de basis, dan vervallen ze):
- op de basis `aangepast: 1` en `start`, `eind` of `drempel` verschilt, of `aangepast` is lager dan op de basis:
  `<naam>: al een keer aangepast; het besluit is nu hard of verwijderd (ADR 0106 punt 6)`
- `aangepast` van 0 naar 1 met dezelfde `drempel` (diepe vergelijking):
  `<naam>: aangepast zonder andere drempel; een aanpassing wijzigt de drempel (ADR 0106 punt 6)`
- `drempel` anders dan op de basis (diepe vergelijking, zoals hierboven) terwijl `aangepast` op 0 bleef (B-7):
  `<naam>: drempel anders dan op de merge-base zonder dat aangepast is opgehoogd; een aanpassing hoogt aangepast op (ADR 0106 punt 6)`
- `eind` later dan op de basis terwijl `aangepast` op 0 bleef en `drempel` gelijk is (de regels sluiten elkaar uit; per naam
  hooguit één melding):
  `<naam>: einddatum later dan op de merge-base zonder dat aangepast is opgehoogd; verlengen met dezelfde controle en drempel kan niet (ADR 0106 punt 5)`

`schaduw-termijn`. De datum is `git log -1 --format=%cI` (de eerste tien tekens, dus de datum in de tijdzone van de committer),
nooit de klok. `<n>` is het verschil in dagen tussen twee datums, gerekend in UTC (`Date.UTC`), niet in lokale tijd:
- strikt, als de datum na `eind` ligt: sleutel `<naam>`, melding
  `de schaduwperiode liep af op <eind> (commitdatum HEAD <datum>); leg het besluit voor: hard, aangepast of verwijderd (ADR 0106 punt 6)`
- `meldingen`, als `eind − 3 ≤ datum ≤ eind`: `<naam> loopt af op <eind> (nog <n> dagen); leg vóór die datum het besluit voor`;
  de exitcode blijft 0
- strikt, als een `check` of `lintregel` geen uitvoerder heeft: `<naam>: geen uitvoerder <naam> in de map schaduw van de ratchet`;
  bij een uitvoerder zonder registerregel: sleutel `schaduw:<naam>`, melding `staat niet in .kit/schaduw.json`
- strikt, als een uitvoerder iets anders teruggeeft dan `{ treffers: string[] }` (ook `{ overgeslagen }`) of gooit:
  `<naam>: draaide niet volledig; een controle in schaduw draait altijd, nooit als skip (ADR 0106 punt 4)`

Uitvoerders staan in een nieuwe geëxporteerde map `schaduw` in de ratchet
(`Record<string, () => Promise<{ treffers: string[] }>>`, sleutel = `naam`). Ze draaien één keer per ratchetrun: `schaduw.mjs`
bewaart de uitkomst per proces, en `strikt` en `meldingen` lezen dezelfde uitkomst. De ratchet krijgt twee entries in
`meldingen`: `schaduw-termijn` (de "loopt af"-regels) en `schaduw` (per treffer de regel `<naam>: <treffer>`). Met het
voorvoegsel van `meld()` wordt dat letterlijk `schaduw-termijn: <naam> loopt af op …` en `schaduw: <naam>: <treffer>`, nooit
met een andere exitcode. Staat een naam twee keer in het register, dan telt voor de termijn, de meldingen en de uitvoerders
alleen de eerste regel met die naam; `schaduw-register` meldt de dubbele naam al (B-10).

De groene regel van `pnpm ratchet` noemt voortaan ook de strikte modules:
`✓ ratchet: geen nieuwe of opgeloste overtredingen (<checks>); strikt: <namen uit strikt>`.

`template:release` weigert in `brengUit`, direct na `isTemplate` en vóór de eerste schrijfactie. `brengUit` gooit de tekst zonder
voorvoegsel (dat zet de hoofdroutine al), dus op stderr staat
`✗ template:release: .kit/schaduw.json bevat <n> controle(s) (<namen>); een app krijgt geen controle in schaduw, neem eerst het besluit (ADR 0106 punt 8)`.
Is het register geen geldige JSON of geen lijst, dan weigert hij ook (B-9):
`✗ template:release: .kit/schaduw.json is geen JSON-lijst; herstel het register vóór de release (ADR 0106 punt 8)`.

## Meetregel en overzicht

`rails/hooks/lib/meting.mjs` exporteert `schaduwRegel(payload, controle, nu)`. Die geeft
`{ t, e: "Schaduw", s, b, a, c, k }` terug, met `c` = controle (vorm van `naam`) en
`k = sleutel(payload.tool_name, payload.tool_input, payload.cwd)` uit dezelfde payload, nooit inhoud.
Bij een ongeldige controle geeft hij `null`. `EVENTS` blijft voor hookpayloads; een payload met `hook_event_name: "Schaduw"` geeft
`null`. `pnpm meting --schaduw` (ook met `--json`, `--branch`) geeft per registerregel
`schaduw <naam>: <n> treffers, <m> sleutels, <s> sessies, eind <eind>`, met een regel van 0 als er geen treffer is. Een controle
in de opslag die niet in het register staat, krijgt `(niet in register)` achter de regel. De bestaande tellingen veranderen
niet. De help noemt `--schaduw`.

## Regelboek (R-DOC-10)

Nieuw onder §1:
- **R-PRINC-13** Een nieuwe hook, check, gate of lintregel, of het nieuwe deel van een aangescherpte controle, mag eerst
  alleen loggen als de spec dat kiest. De controle staat dan in `.kit/schaduw.json` met spec, R-id's, een einddatum van
  hoogstens 14 dagen na de start en een drempel (hard, aanpassen, verwijderen). Treffers komen als meetregel `Schaduw` of in
  `meldingen` met `schaduw:`, nooit als skip. `schaduw-termijn` wordt rood als de commitdatum van HEAD na de einddatum ligt.
  Vóór die datum komt een PR met `pnpm meting --schaduw` en één uitkomst: hard, één keer aangepast (met een andere drempel) of
  verwijderd; verlengen met dezelfde controle en drempel kan niet. Nooit in schaduw gaat wat al hard is of onder `ALTIJD_HARD`
  valt; bij twijfel: hard. Een controle in schaduw telt niet als controle (R-PRINC-10).
  Alleen in de template; `template:release` weigert een gevuld register (0106)

## Kopieer de vorm van

- `scripts/kit/ac-toets.mjs` — merge-base lezen, lokaal melden zonder basis en rood in CI; de exports voor de ratchet en de
  verwijzing naar `pnpm ratchet` als je hem los draait.
- `scripts/kit/conflictmarkers.mjs` — een module in `strikt`, `{ key, message }`, geen uitzonderingslijst.
- `scripts/kit/template-release.mjs` — `isTemplate` en `onderhoudVan`; weigeren voordat er geschreven wordt.
- `scripts/kit/meting.mjs` — een vlag naast `--pr-tabel`, plus help en `--json`.

## Hergebruik en UX

Geen UI. De meldingen volgen `✗ <check>: <sleutel>` met een regel uitleg (ratchet) en `<check>: <melding>` (meldingen). Er komen
geen nieuwe bibliotheken.

## Acceptatiecriteria

- **schaduwmodus/AC-1** — Gegeven een template met een registerregel zonder `drempel` (en apart een zonder `eind`), wanneer `schaduw-register` draait, dan geeft hij een strikte overtreding `<naam>:veld drempel` (of `eind`). Toets: `test/rails/schaduw-register.test.ts` (nieuw)
- **schaduwmodus/AC-2** — Gegeven `start` 2026-11-01, wanneer `eind` 2026-11-16 is, dan meldt `schaduw-register` "meer dan 14 dagen na de start", en bij `eind` 2026-11-15 niet. Toets: `test/rails/schaduw-register.test.ts` (nieuw)
- **schaduwmodus/AC-3** — Gegeven een registerregel met `rids` `["R-AUTH-07"]` (en apart `["R-SEC-06"]`, `["R-ROL-08"]`, `["R-ROL-99"]`, `["R-TEST-02"]` en `["R-WERK-09"]`), wanneer `schaduw-register` draait, dan meldt hij "moet altijd meteen hard zijn" voor dat R-id; met `["R-WEB-01"]` niet. Toets: `test/rails/schaduw-register.test.ts` (nieuw)
- **schaduwmodus/AC-4** — Gegeven `aangepast: 2`, wanneer `schaduw-register` draait, dan is hij strikt rood met "veld aangepast ontbreekt of heeft niet de vorm"; gegeven een `eind` die later ligt dan op de merge-base terwijl `aangepast` op 0 bleef, dan precies één overtreding met "verlengen met dezelfde controle en drempel kan niet". Toets: `test/rails/schaduw-register.test.ts` (nieuw)
- **schaduwmodus/AC-15** — Gegeven op de merge-base `aangepast: 0`, wanneer HEAD `aangepast: 1` heeft met een later `eind` en dezelfde `drempel`, dan meldt `schaduw-register` "aangepast zonder andere drempel", en met een andere `drempel` niet; gegeven op de basis `aangepast: 1`, wanneer HEAD `eind` of `drempel` wijzigt, dan meldt hij "al een keer aangepast". Toets: `test/rails/schaduw-register.test.ts` (nieuw)
- **schaduwmodus/AC-5** — Gegeven een registerregel met `eind` 2026-12-01 en HEAD met commitdatum 2026-12-02, wanneer `pnpm ratchet` draait, dan meldt `schaduw-termijn` een strikte overtreding en is de exitcode 1, ongeacht de systeemklok. Toets: `test/rails/schaduw-termijn.test.ts` (nieuw)
- **schaduwmodus/AC-6** — Gegeven `eind` 2026-12-01 en een commitdatum van 2026-11-28, wanneer `pnpm ratchet` draait, dan staat "loopt af op 2026-12-01 (nog 3 dagen)" in de meldingen en is de exitcode 0; bij 2026-11-27 komt er geen melding. Toets: `test/rails/schaduw-termijn.test.ts` (nieuw)
- **schaduwmodus/AC-7** — Gegeven een `check` (en apart een `lintregel`) in het register met een uitvoerder die `{ overgeslagen }` teruggeeft of gooit, of zonder uitvoerder, of een uitvoerder zonder registerregel, wanneer `schaduw-termijn` draait, dan is hij strikt rood; een `hook` zonder uitvoerder is niet rood. Toets: `test/rails/schaduw-termijn.test.ts` (nieuw)
- **schaduwmodus/AC-8** — Gegeven een uitvoerder `a` die `{ treffers: ["x"] }` teruggeeft, wanneer de ratchet draait, dan staat precies de regel `schaduw: a: x` in de meldingen, draait de uitvoerder één keer en blijft de exitcode 0. Toets: `test/rails/schaduw-termijn.test.ts` (nieuw)
- **schaduwmodus/AC-9** — Gegeven een app (geen `onderhoud`) met een registerregel waarvan `eind` verlopen is en een ongeldig schema, wanneer `schaduw-register` en `schaduw-termijn` draaien, dan geven ze geen overtreding en geen melding. Toets: `test/rails/schaduw-termijn.test.ts` (nieuw)
- **schaduwmodus/AC-10** — Gegeven een template met een registerregel, wanneer `brengUit` draait, dan gooit hij de weigering uit deze spec en blijven CHANGELOG, TEMPLATE_VERSION en de fragmenten ongewijzigd; met `[]` loopt de release door. Toets: `test/scripts/template-release.test.ts`
- **schaduwmodus/AC-11** — Gegeven een geldige controle en een Bash-invoer met argumenten, wanneer `schaduwRegel` draait, dan bevat de regel `e: "Schaduw"`, `c` en alleen het commandoprefix als `k`; een ongeldige controle of een payload met `hook_event_name: "Schaduw"` geeft `null`. Toets: `test/hooks/meting.test.ts`
- **schaduwmodus/AC-12** — Gegeven een opslag met twee `Schaduw`-regels voor `a` en een register met `a` en `b`, wanneer `pnpm meting --schaduw` draait, dan toont hij `a` met 2 treffers en `b` met 0, en geeft `pnpm meting` zonder vlag dezelfde tellingen als zonder die regels. Toets: `test/rails/meting-schaduw.test.ts` (nieuw)
- **schaduwmodus/AC-13** — Gegeven de repo na de bouw, wanneer je `strikt` uit de ratchet importeert, dan bevat het `schaduw-register` en `schaduw-termijn`, en is `.kit/schaduw.json` `[]`; een groene `pnpm ratchet` eindigt met een regel die na `strikt:` ook `schaduw-termijn` noemt. Toets: `test/rails/schaduw-termijn.test.ts` (nieuw)
- **schaduwmodus/AC-14** — Gegeven `scripts/kit/schaduw.mjs` los gedraaid, wanneer het eindigt, dan is de exitcode 1 en noemt stderr `pnpm ratchet` en `schaduw`. Toets: `test/scripts/ratchet-modules-los.test.ts`
- **schaduwmodus/AC-16** — Gegeven op de merge-base en op HEAD `aangepast: 0`, wanneer HEAD een andere `drempel` heeft, dan geeft `schaduw-register` precies één overtreding met "drempel anders dan op de merge-base zonder dat aangepast is opgehoogd", ook als `eind` daarbij later ligt; met dezelfde `drempel` en hetzelfde `eind` niets. Toets: `test/rails/schaduw-register.test.ts`
- **schaduwmodus/AC-17** — Gegeven een tijdelijke repo met de bestanden `docs/template/specs/x.md`, `docs/template/adr/0106-schaduwmodus-met-tijdgrens.md` en de map `docs/template/specs/sub`, wanneer `schaduw-register` draait met `spec` `docs/template/specs/../adr/0106-schaduwmodus-met-tijdgrens.md`, `docs/template/specs/./x.md`, `docs/template/specs//x.md` of `docs/template/specs/sub`, dan meldt hij telkens `spec <pad> bestaat niet`; met `docs/template/specs/x.md` niet. Toets: `test/rails/schaduw-register.test.ts`
- **schaduwmodus/AC-18** — Gegeven een template met `.kit/schaduw.json` `{}` (en apart de ongeldige JSON `{`), wanneer `brengUit` draait, dan gooit hij "is geen JSON-lijst" en blijven CHANGELOG, TEMPLATE_VERSION en de fragmenten ongewijzigd. Toets: `test/scripts/template-release.test.ts`
- **schaduwmodus/AC-19** — Gegeven twee registerregels met dezelfde naam `a`, de eerste met `eind` binnen 3 dagen na de commitdatum en de tweede met een verlopen `eind`, en een uitvoerder `a` die `{ treffers: ["x"] }` teruggeeft, wanneer de ratchet draait, dan staat `schaduw-termijn: a loopt af op <eind van de eerste>` precies één keer en `schaduw: a: x` precies één keer in de meldingen, geeft `schaduw-termijn` geen "liep af"-overtreding, en meldt `schaduw-register` wel `a: staat twee keer in het register`. Toets: `test/rails/schaduw-termijn.test.ts`
- **schaduwmodus/AC-20** — Gegeven de rol reviewer, wanneer hij `pnpm meting --schaduw` (ook met `--json` of `--branch <naam>`) draait, dan laat het rolhek het door. Toets: `test/hooks/rolhek-lezen.test.ts`

## Randgevallen

| Situatie | Gedrag |
|---|---|
| `eind` is de commitdatum zelf | melding "nog 0 dagen", exit 0 |
| `.claude/gates.json` onleesbaar of ongeldig | de check gooit (net als `isTemplate`), dus geen stil groen |
| `.claude/gates.json` ontbreekt | telt als app en slaat over, net als `check-docs` |
| HEAD zonder commit (lege repo) | strikt rood: `schaduw-termijn: geen commitdatum van HEAD` |
| `spec` wijst naar `docs/specs/` | schemafout: het register geldt alleen in de template |
| PR-CI met de merge-commit van GitHub als HEAD | de datum is die van die merge-commit en schuift mee met elke run; een rerun na `eind` wordt rood zonder nieuwe commit. "Dezelfde commit, dezelfde uitslag" geldt lokaal en op `main` |
| regel verwijderd en later onder dezelfde naam terug, of hernoemd met een later `eind` | de check ziet alleen de merge-base en meldt niets; de reviewer toetst het (aanvaard) |

## Raakt ook

`scripts/kit/schaduw.mjs` (nieuw), `.kit/schaduw.json` (nieuw, `[]`), `scripts/kit/ratchet.mjs` (strikt, schaduw, meldingen, groene
regel en kopcommentaar), `scripts/kit/gates.mjs` (beschrijving van `ratchet`), `scripts/kit/template-release.mjs`,
`rails/hooks/lib/meting.mjs`, `scripts/kit/meting.mjs` (vlag en help), `docs/framework.md` (R-PRINC-13), een changelogfragment
en de docs die de ratchetkanalen en `pnpm meting` beschrijven. `check:migrations`, `check:secdef`, `test:db`,
`test/security/resources.ts` en permissietests worden niet geraakt: er is geen database, route of permissie.

## Buiten scope

Een concrete controle in schaduw zetten. Een gedeelde schrijfhelper voor hooks in schaduw (komt met de eerste hook in
schaduw). Treffers van andere machines verzamelen (ADR 0106, aanvaard risico).

## Testplan

Eerst de tests, en elke test faalt op de code van vóór de bouw (R-PRINC-04). Gebruik tijdelijke git-repo's met
`GIT_COMMITTER_DATE` en een eigen `.claude/gates.json` met en zonder `onderhoud`, zoals `test/rails/ac-toets.test.ts`. Na de
bouw draai je `pnpm ratchet`, dat `schaduw-termijn` in `strikt` toont; het bewijs gaat in de PR (ADR 0106, "Klaar als").
AC-14 breidt `test/scripts/ratchet-modules-los.test.ts` uit met `schaduw` (geen verzwakking; reden in de PR, R-TEST-02).

## Besluiten (eigenaar, 2026-11-22)

- **B-1** — `ALTIJD_HARD` dekt het hele voorvoegsel `R-ROL-` plus R-TEST-02 (tests skippen of verwijderen, ook 0088 punt 3) en R-WERK-09 (permissies); R-CODE-03 blijft.
- **B-2** — Een aanpassing wijzigt de drempel: `aangepast` van 0 naar 1 met dezelfde drempel is rood (AC-15).
- **B-3** — De groene regel van `pnpm ratchet` noemt ook de strikte modules (AC-13).
- **B-4** — Het veld `soort` blijft; `check` en `lintregel` eisen een uitvoerder, voor `hook` is het draaien een reviewpunt.
- **B-5** — Skippen is elke uitkomst die niet precies `{ treffers: string[] }` is; nul treffers is geen skip.
- **B-6** — De regel wordt R-PRINC-13, een werkstraatprincipe naast R-PRINC-09 en R-PRINC-10.

## Vervolg na de bouw (#918, kleine bevindingen; eigenaar 2026-11-23: "pak de laatste openstaande dingetjes op")

- **B-7** — Ook met `aangepast: 0` mag de drempel niet ongemerkt veranderen: een andere drempel hoogt `aangepast` op (AC-16). Ook een tikfout herstellen kost dus de ene aanpassing; dat volgt uit ADR 0106 punt 3 (drempel vooraf).
- **B-8** — `spec` moet al genormaliseerd zijn; `..` kan de mapcontrole niet omzeilen (AC-17).
- **B-9** — `template:release` weigert ook een register dat geen JSON-lijst is (AC-18).
- **B-10** — Een dubbele naam geeft geen dubbele meldingen; de eerste regel telt (AC-19).
- **B-11** — De reviewer mag `pnpm meting --schaduw` draaien, want het besluit na de termijn vraagt die uitvoer (AC-20).
