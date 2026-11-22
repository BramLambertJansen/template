---
status: goedgekeurd # voorstel | goedgekeurd | gebouwd | vervallen — architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd: `status: gebouwd` in de bouw-PR (ADR 0095)
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
| `soort` | `hook`, `check` of `lintregel` (zie OV-1) |
| `spec` | bestaand pad onder `docs/template/specs/` |
| `rids` | niet-lege lijst van `^R-[A-Z]+-\d{2}$`; geen R-id uit `ALTIJD_HARD` |
| `start`, `eind` | `JJJJ-MM-DD`, `start ≤ eind ≤ start + 14 dagen` |
| `drempel` | `{ "hard": string, "aanpassen": string, "verwijderen": string }`, elk niet leeg |
| `aangepast` | `0` of `1` |

`ALTIJD_HARD` is een geëxporteerde constante in `scripts/kit/schaduw.mjs` (ADR 0106 punt 2): elk id dat met `R-AUTH-` begint,
plus R-CODE-03, R-TEST-03, R-DB-01, R-DB-05, R-DB-09, R-CODE-08, R-SEC-01, R-SEC-02, R-SEC-03, R-SEC-04, R-SEC-05, R-SEC-06,
R-SEC-08, R-LAAG-08, R-ROL-03, R-CI-01, R-CI-07, R-REPO-02, R-TEST-04 en R-PRINC-04.

## Checks en meldingen (letterlijk)

Beide checks staan in `strikt` van `scripts/kit/ratchet.mjs`. Ze slaan zonder uitvoer over als `.claude/gates.json` geen geldig
`onderhoud` heeft (`onderhoudVan` uit `rails/hooks/lib/padtabel.mjs`).

`schaduw-register` (schema). Elke sleutel is `<naam>:<reden>`; `<naam>` is `#<index>` als het veld `naam` ongeldig is:
- `.kit/schaduw.json ontbreekt; een leeg register is []` / `.kit/schaduw.json is geen JSON-lijst`
- `<naam>: veld <veld> ontbreekt of heeft niet de vorm uit de spec schaduwmodus` / `<naam>: onbekend veld <veld>`
- `<naam>: staat twee keer in het register` / `<naam>: spec <pad> bestaat niet`
- `<naam>: einddatum <eind> ligt vóór de start <start>`
- `<naam>: einddatum <eind> ligt meer dan 14 dagen na de start <start> (ADR 0106 punt 3)`
- `<naam>: <R-id> moet altijd meteen hard zijn (ADR 0106 punt 2); deze controle kan niet in schaduw`
- `<naam>: al een keer aangepast; het besluit is nu hard of verwijderd (ADR 0106 punt 6)`
- `<naam>: einddatum later dan op de merge-base zonder dat aangepast is opgehoogd; verlengen met dezelfde controle en drempel kan niet (ADR 0106 punt 5)`
  (vergelijking met `git merge-base origin/main HEAD`; ontbreekt de basis, dan lokaal geen melding en in CI rood, zoals bij `ac-toets`)

`schaduw-termijn`. De datum is `git log -1 --format=%cI` (de eerste tien tekens, dus de datum in de tijdzone van de committer),
nooit de klok:
- strikt, als de datum na `eind` ligt: sleutel `<naam>`, melding
  `de schaduwperiode liep af op <eind> (commitdatum HEAD <datum>); leg het besluit voor: hard, aangepast of verwijderd (ADR 0106 punt 6)`
- `meldingen`, als `eind − 3 ≤ datum ≤ eind`: `<naam> loopt af op <eind> (nog <n> dagen); leg vóór die datum het besluit voor`;
  de exitcode blijft 0
- strikt, als een `check` geen uitvoerder `schaduw:<naam>` heeft: `<naam>: geen schaduwcheck schaduw:<naam> in de ratchet`; bij een
  uitvoerder zonder registerregel: `schaduw:<naam>: staat niet in .kit/schaduw.json`
- strikt, als een uitvoerder iets anders teruggeeft dan `{ treffers: string[] }` (ook `{ overgeslagen }`):
  `<naam>: draaide niet volledig; een controle in schaduw draait altijd, nooit als skip (ADR 0106 punt 4)`

Uitvoerders staan in een nieuwe map `schaduw` in de ratchet. Elke treffer komt in `meldingen` als `schaduw:<naam>: <treffer>`,
nooit met een andere exitcode.

`template:release` weigert direct na de templatecontrole, voordat er iets geschreven wordt, met
`✗ template:release: .kit/schaduw.json bevat <n> controle(s) (<namen>); een app krijgt geen controle in schaduw, neem eerst het besluit (ADR 0106 punt 8)`.

## Meetregel en overzicht

`rails/hooks/lib/meting.mjs` exporteert `schaduwRegel(payload, { controle, sleutel }, nu)`. Die geeft
`{ t, e: "Schaduw", s, b, a, c, k }` terug, met `c` = controle (vorm van `naam`) en `k` = sleutel via `sleutel()`, nooit inhoud.
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
  Vóór die datum komt een PR met `pnpm meting --schaduw` en één uitkomst: hard, één keer aangepast of verwijderd. Nooit in
  schaduw gaat wat al hard is of onder `ALTIJD_HARD` valt. Een controle in schaduw telt niet als controle (R-PRINC-10).
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
- **schaduwmodus/AC-3** — Gegeven een registerregel met `rids` `["R-AUTH-07"]` (en apart `["R-SEC-06"]`), wanneer `schaduw-register` draait, dan meldt hij "moet altijd meteen hard zijn" voor dat R-id. Toets: `test/rails/schaduw-register.test.ts` (nieuw)
- **schaduwmodus/AC-4** — Gegeven `aangepast: 2`, of een `eind` die later ligt dan op de merge-base terwijl `aangepast` gelijk bleef, wanneer `schaduw-register` draait, dan is hij strikt rood met de melding uit deze spec. Toets: `test/rails/schaduw-register.test.ts` (nieuw)
- **schaduwmodus/AC-5** — Gegeven een registerregel met `eind` 2026-12-01 en HEAD met commitdatum 2026-12-02, wanneer `pnpm ratchet` draait, dan meldt `schaduw-termijn` een strikte overtreding en is de exitcode 1, ongeacht de systeemklok. Toets: `test/rails/schaduw-termijn.test.ts` (nieuw)
- **schaduwmodus/AC-6** — Gegeven `eind` 2026-12-01 en een commitdatum van 2026-11-28, wanneer `pnpm ratchet` draait, dan staat "loopt af op 2026-12-01 (nog 3 dagen)" in de meldingen en is de exitcode 0; bij 2026-11-27 komt er geen melding. Toets: `test/rails/schaduw-termijn.test.ts` (nieuw)
- **schaduwmodus/AC-7** — Gegeven een check in het register met een uitvoerder die `{ overgeslagen }` teruggeeft, of zonder uitvoerder, of een uitvoerder zonder registerregel, wanneer `schaduw-termijn` draait, dan is hij strikt rood. Toets: `test/rails/schaduw-termijn.test.ts` (nieuw)
- **schaduwmodus/AC-8** — Gegeven een uitvoerder die `{ treffers: ["x"] }` teruggeeft, wanneer de ratchet draait, dan staat `schaduw:<naam>: x` in de meldingen en blijft de exitcode 0. Toets: `test/rails/schaduw-termijn.test.ts` (nieuw)
- **schaduwmodus/AC-9** — Gegeven een app (geen `onderhoud`) met een registerregel waarvan `eind` verlopen is en een ongeldig schema, wanneer `schaduw-register` en `schaduw-termijn` draaien, dan geven ze geen overtreding en geen melding. Toets: `test/rails/schaduw-termijn.test.ts` (nieuw)
- **schaduwmodus/AC-10** — Gegeven een template met een registerregel, wanneer `brengUit` draait, dan gooit hij de weigering uit deze spec en blijven CHANGELOG, TEMPLATE_VERSION en de fragmenten ongewijzigd; met `[]` loopt de release door. Toets: `test/scripts/template-release.test.ts`
- **schaduwmodus/AC-11** — Gegeven een geldige controle en een Bash-invoer met argumenten, wanneer `schaduwRegel` draait, dan bevat de regel `e: "Schaduw"`, `c` en alleen het commandoprefix als `k`; een ongeldige controle of een payload met `hook_event_name: "Schaduw"` geeft `null`. Toets: `test/hooks/meting.test.ts`
- **schaduwmodus/AC-12** — Gegeven een opslag met twee `Schaduw`-regels voor `a` en een register met `a` en `b`, wanneer `pnpm meting --schaduw` draait, dan toont hij `a` met 2 treffers en `b` met 0, en geeft `pnpm meting` zonder vlag dezelfde tellingen als zonder die regels. Toets: `test/rails/meting-schaduw.test.ts` (nieuw)
- **schaduwmodus/AC-13** — Gegeven de repo na de bouw, wanneer je `strikt` uit de ratchet importeert, dan bevat het `schaduw-register` en `schaduw-termijn`, en is `.kit/schaduw.json` `[]`. Toets: `test/rails/schaduw-termijn.test.ts` (nieuw)
- **schaduwmodus/AC-14** — Gegeven `scripts/kit/schaduw.mjs` los gedraaid, wanneer het eindigt, dan is de exitcode 1 en noemt stderr `pnpm ratchet` en `schaduw`. Toets: `test/scripts/ratchet-modules-los.test.ts`

## Randgevallen

| Situatie | Gedrag |
|---|---|
| `eind` is de commitdatum zelf | melding "nog 0 dagen", exit 0 |
| `.claude/gates.json` onleesbaar | de check gooit (net als `isTemplate`), dus geen stil groen |
| HEAD zonder commit (lege repo) | strikt rood: `schaduw-termijn: geen commitdatum van HEAD` |
| `spec` wijst naar `docs/specs/` | schemafout: het register geldt alleen in de template |

## Raakt ook

`scripts/kit/schaduw.mjs` (nieuw), `.kit/schaduw.json` (nieuw, `[]`), `scripts/kit/ratchet.mjs` (strikt, schaduw, meldingen en
kopcommentaar), `scripts/kit/gates.mjs` (beschrijving van `ratchet`), `scripts/kit/template-release.mjs`,
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

## Open vragen

- **OV-1** — Moet het register het veld `soort` krijgen (hook, check of lintregel)? Zonder dat veld weet `schaduw-termijn` niet welke registerregel een uitvoerder `schaduw:<naam>` nodig heeft. Aanbeveling: ja, toevoegen. Een lintregel in schaduw meldt dan via een check in `meldingen`.
- **OV-2** — Wat telt als "skippen" voor een schaduwcheck? Aanbeveling: elke uitkomst die niet precies `{ treffers: string[] }` is. Nul treffers is geen skip; een check kan terecht niets vinden.
- **OV-3** — Hoe komen 0088 punt 3 en 0071 punt 1 en 2 in `ALTIJD_HARD`? Er is geen eigen R-id voor. Aanbeveling: ze vallen onder R-ROL-03 en R-TEST-04. Voor een controle op die punten volgt de spec-review "bij twijfel: hard"; maak er geen nieuwe R-id voor.
- **OV-4** — R-PRINC-13 als nieuwe id of een regel onder §4? Aanbeveling: R-PRINC-13. Het is een werkstraatprincipe naast R-PRINC-09 en R-PRINC-10, geen codeerkader.
