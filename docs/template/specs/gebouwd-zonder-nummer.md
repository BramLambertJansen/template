---
status: goedgekeurd
namespace: gebouwd-zonder-nummer
---

# `gebouwd` volgt uit de AC-dekking op `main`; geen statusregel, geen merkteken

## Doel

Of een spec gebouwd is, volgt uit de boom: een AC is gebouwd als een testbestand zijn volledige id als heel woord noemt, en
een `goedgekeurde` spec is gebouwd als elk levend eigen AC dat is, anders deels gebouwd (`n/m`). Niemand schrijft nog
`status: gebouwd` of het merkteken `(nog niet gebouwd)`; de checks die aan "gebouwd" hingen, gaan af in de PR die de stand
verandert, tegenover de merge-base met `origin/main` (ADR 0104, dat ADR 0095 punt 1–5 en 7 wijzigt).

Deze spec is de ene levende spec voor dit mechanisme. AC-1 tot en met AC-15 beschreven de bouw van ADR 0095; wat daarvan
door ADR 0104 vervalt, staat hieronder in de vervallen-vorm. AC-16 en verder zijn de bouw van ADR 0104.

## Rollen en wie wat ziet

- **Developer:** bouwt een AC af door zijn test te schrijven; de merge beslist. Schrijft geen statusregel.
- **Hoofdsessie en architect:** schrijven alleen eigenaarstatussen (`voorstel`, `goedgekeurd`, `vervallen`) in het voorstel
  (R-WERK-08). Ook zij schrijven geen `status: gebouwd`; het rolhek weigert het elke rol (AC-20).
- **Reviewer:** leest de stand per spec uit `feiten specs` of de AC-tabel; toetst zoals nu of een test die een AC-id noemt
  het gedrag ook toetst (aanvaard risico, ADR 0104 Gevolgen), en legt elke nieuwe AC in de vorm `Vervallen door ADR <nummer>`
  naast dat ADR.
- **Eigenaar:** de merge is het besluit, zoals nu. Een app zet haar oude `gebouwd`-regels om wanneer ze wil.
- **CI:** `check:docs` (via `pnpm ratchet`) en `check:roadmap` in `gate:fast` toetsen de PR die de stand verandert.

## Kopieer de vorm van

- `scripts/kit/check-docs.mjs` — `acViolations` (regel 6: id-herkenning, `dekt`, `vervallenAcs`), `doodPadViolations`
  (regel 14), `disciplineViolations` (regel 7), en `docsKrimp` met `fragmentBehoud` en `changelogBehoud` als vorm voor een
  vergelijking met de merge-base die nooit in de baseline komt.
- `scripts/kit/check-roadmap.mjs` — `specMeldingen` en de bronnen `basis`/`head` uit `roadmapVanRepo`.
- `scripts/kit/ac-toets.mjs` — de diffvorm tegenover de merge-base en de melding zonder basis.
- `scripts/kit/feiten-secties.mjs` — `specs(lezer, map)` en `uitLezer`.
- `rails/hooks/lib/document-state.mjs` — `acIds`, `documentInfo`, `MARKERING`.
- `test/rails/check-docs-dood-pad.test.ts` en `test/rails/vergeten-gebouwd.test.ts` (vervallen) — fixtures in een tijdelijke git-repo per
  geval.

## Hergebruik en UX

Geen UI. Eén gedeelde afleiding in twee lagen, zodat het rolhek geen git-laag uit `scripts/kit/` laadt:

**`rails/hooks/lib/ac-dekking.mjs` (nieuw)** — puur, geen fs en geen git. Hierheen verhuizen uit `scripts/kit/check-docs.mjs`
(dat ze opnieuw exporteert, zodat `ac-toets.mjs` en andere importeurs niets merken): `TESTBESTAND`, `SPEC_BESTAND`,
`ADR_STATUS`, `AC_ID`, `heelWoord`, `dekt`, de id-herkenning van regel 6 en `vervallenAcs`. De module importeert niets uit
`node:fs`, `node:child_process` of `scripts/kit/` (dependency-cruiser kijkt alleen naar `src`; een importtoets in
`test/rails/ac-dekking.test.ts` (nieuw) bewaakt het). Nieuw:

```js
/** @typedef {{ bestanden: readonly string[], lees: (pad: string) => string | null }} Boom */
/** @typedef {'voorstel' | 'goedgekeurd' | 'vervallen'} Eigenaarstatus */
/** @typedef {{ eigenaar: Eigenaarstatus | undefined, stand: 'niet' | 'deels' | 'gebouwd',
 *              gebouwd: string[], levend: string[] }} Dekking */   // AC-ids `AC-n`, oplopend

export function eigenaarStatus(text)       // `status: gebouwd…` (elk commentaar) → 'goedgekeurd' (AC-17)
export function gebouwdRegel(text)         // de letterlijke statusregel als die met `status: gebouwd` begint, anders null
export function dekkingVanSpec({ file, text }, boom)   // → Dekking; `boom` levert de testbestanden en de ADR-map
export function acDekking(boom)            // → Map<specpad, Dekking> voor elk SPEC_BESTAND in boom.bestanden
```

`stand` is `gebouwd` als `eigenaar === 'goedgekeurd'`, `levend.length > 0` en `gebouwd.length === levend.length`; `deels` als
`eigenaar === 'goedgekeurd'` en `0 < gebouwd.length < levend.length`; anders `niet`. `n/m` is
`gebouwd.length/levend.length`.

`gebouwd` en `levend` gelden ongeacht de eigenaarstatus: ze volgen alleen uit de AC-regels, de vervallen-vorm en de
testbestanden. Alleen `stand` hangt van de eigenaarstatus af.

Een `goedgekeurde` spec zonder levend eigen AC (geen AC's, of alle vervallen) heeft stand `niet` (besluit OV-9). Dat wijkt af
van de letter van ADR 0104 punt 1, waaruit `gebouwd` volgt (elk levend AC is gebouwd); zo krijgt zo'n spec niet zonder bouw
de roadmap-id-regel en de dood-padcheck.

**`scripts/kit/ac-dekking.mjs` (nieuw)** — de dunne git-laag:

```js
export function boomWerkmap(root)          // git ls-files + inhoud van schijf, zoals trackedFiles in check-docs
export function boomOpBasis(root, sha)     // git ls-tree -r op sha; testbestanden, specs en ADR's in één `git cat-file --batch`; onleesbaar: true als dat faalt (AC-29)
export function dekkingTegenBasis(root)    // → { sha, basis: Map | null, nu: Map, hernoemd, bomen } ; sha en basis null zonder merge-base
```

`boomOpBasis` leest in diezelfde `cat-file --batch` ook `docs/template/adr/*.md` en `docs/adr/*.md`, zodat `vervallenAcs`
op de basis dezelfde ADR-map ziet als in de werkmap.

De merge-base komt uit `basisVan` in `scripts/kit/leesbudget.mjs`; `scripts/kit/ac-dekking.mjs` (nieuw) gebruikt die, en `mergeBasis` in
`scripts/kit/check-docs.mjs` gaat erin op. De eigen varianten in `scripts/kit/ac-toets.mjs` en `scripts/kit/schaduw.mjs` blijven
(buiten scope). `hernoemd` volgt `git diff -M --name-status <basis>` en dient
alleen voor specs: een spec die op de basis onder een andere naam stond, wordt met de dekking van die oude naam vergeleken.
Een hernoemd testbestand heeft `hernoemd` niet nodig; dat valt al onder "een testbestand noemt het id". `<spec>` in de
sleutel `docs:ac:<spec>:<AC-n>` is de bestandsnaam zonder `.md` van de spec in de werkmap (zoals `spec.naam` in
`acViolations`, `scripts/kit/check-docs.mjs`).

Gebruikers:

- `check-docs` regel 7 en 14: `acDekking(boomWerkmap(root))`, alleen de boom (ook in een ondiepe kloon).
- `check-docs` regel 6 (ratchet), de weigering van `status: gebouwd` en van het merkteken: `dekkingTegenBasis(root)` in
  `docsKrimp` (strikt kanaal, nooit in de baseline, zoals regel 17 en 19).
- `check-roadmap`: `roadmapMeldingen` krijgt de dekking als derde bron naast `basis` en `head`; `roadmapVanRepo` vult hem met
  `acDekking(boomOpBasis(…))` en `acDekking(boomWerkmap(…))`, zodat fixtures puur blijven. `specMeldingen` zoekt de dekking
  op de basis op onder `head.hernoemd[bestand] ?? bestand`, zoals het nu de oude tekst opzoekt.
- `feiten specs`: de `Lezer` uit `scripts/kit/feiten-secties.mjs` krijgt een optioneel veld `boom: () => Boom` (lui, alleen
  aangeroepen door de sectie `specs`). De lezer `werkmap` levert `boomWerkmap('.')`; de ref-lezer van `pnpm leespad`
  (`lezing` in `scripts/kit/leespad.mjs`) levert `boomOpBasis(cwd, ref)`, dus de getrackte testbestanden uit `git ls-tree`
  en hun inhoud in één `cat-file --batch`, niet per bestand via `git show`. Een lezer zonder `boom` (een lezer in het
  geheugen zonder tests) geeft elke spec lege `gebouwd`. `specs(lezer, map)` roept `dekkingVanSpec` aan met die boom. De
  dekking wordt alleen in de sectie `specs` uitgerekend, niet bij `fase` of `adr`.
- Rolhek: `gebouwdRegel` op de vertrouwde basis en op de nieuwe tekst; `documentInfo` gebruikt `eigenaarStatus`. De
  weigering van een nieuwe `gebouwd`-regel staat in `rails/hooks/lib/rolhek.mjs` vóór `statusZonderBesluit` en
  `recordedStatus`, zodat geen besluit of "status uit main" haar opheft.

Teksten, letterlijk (`<id>` is `namespace` of anders de bestandsnaam zonder `.md`):

- AC-verlies, sleutel `docs:ac:<spec>:<AC-n>`:
  `<specpad>: <AC-n> was gebouwd op main, maar geen testbestand noemt <id>/<AC-n> meer; herstel de test of laat de AC vervallen (Vervallen door ADR <nummer>; ADR 0104)`.
- Nieuwe statusregel, sleutel `docs:<specpad>:status-gebouwd`:
  `<specpad>: status: gebouwd schrijft niemand meer; gebouwd volgt uit de AC-dekking, de statusregel draagt alleen voorstel, goedgekeurd of vervallen (ADR 0104)`.
- Nieuw merkteken, sleutel `docs:<specpad>:merkteken:<AC-n>`:
  `<specpad>: <AC-n> krijgt "(nog niet gebouwd)"; dat merkteken vervalt, een AC zonder test is vanzelf niet gebouwd (ADR 0104)`.
- `check-roadmap`, sleutel `spec:roadmap:<specpad>` (blijft):
  `<specpad>: wordt in deze PR volledig gebouwd en noemt <roadmap-id>, maar docs/roadmap.md wijzigt niet in deze PR`.
- Merge-base gevonden, maar de boom daar onleesbaar (`git ls-tree` of `git cat-file --batch` faalt), sleutel
  `docs:ac:basis-onleesbaar`, strikt (AC-29):
  `ac-dekking: de boom op de merge-base <sha> is niet te lezen (git ls-tree of git cat-file faalt); de AC-dekking tegenover main toetst niets, haal origin/main opnieuw op (ADR 0104)`.
- Zonder merge-base: geen nieuwe melding. De bestaande melding van `zonderBasis` in `scripts/kit/leesbudget.mjs` (de enige
  "let op" zonder basis in `docsMeldingen`, nooit rood) noemt de AC-dekking erbij en wordt:
  `let op: geen merge-base met origin/main; de krimpcontrole (krimp-op-normen) en de AC-dekking tegenover main (ADR 0104) toetsen niets`.
  De CI-overtreding `docs:normen:geen-basis` gebruikt dezelfde tekst, met `(ADR 0067)` erachter zoals nu.
- Rolhek, elke rol:
  `<pad>: status: gebouwd schrijft niemand meer; gebouwd volgt uit de AC-dekking op main (ADR 0104)`.
- De twee bestaande rolhekweigeringen verliezen hun staart `; status: gebouwd zetten hoofdsessie en architect in de bouw-PR (ADR 0095)`:
  `<pad>: deze statusovergang heeft geen geldig besluit uit de vertrouwde basis` en
  `<pad>: een eigenaarstatus of de inhoud van een goedgekeurde spec schrijven alleen architect en hoofdsessie (ADR 0046 punt 6)`.
- `feiten specs`: de statuskolom toont `gebouwd`, `deels <n>/<m>` of de eigenaarstatus; `--json` geeft per spec
  `{ spec, status, stand, gebouwd, levend }` met `gebouwd` en `levend` als aantallen. De telregel telt per stand.
- De kop van `docs/specs/_template.md` wordt:
  `status: voorstel # voorstel | goedgekeurd | vervallen — architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd volgt uit de AC-dekking (ADR 0104)`;
  die van `docs/specs/_mini.md` gelijk, met "de architect zet" zoals nu.
- De melding van de dood-padcheck en de bestaande AC-meldingen van `ac-toets` blijven ongewijzigd.

## Acceptatiecriteria

- **gebouwd-zonder-nummer/AC-1** — Vervallen door ADR 0104 (niemand schrijft nog `status: gebouwd`). Was: een overgang
  naar `status: gebouwd` zonder roadmap-id is groen in `check:roadmap`, zonder `spec:bewijs`.
- **gebouwd-zonder-nummer/AC-2** — Vervallen door ADR 0104 (de roadmap-id-regel volgt de volledige bouw, AC-24). Was: een
  overgang naar `status: gebouwd` met roadmap-id is rood zonder wijziging van `docs/roadmap.md`.
- **gebouwd-zonder-nummer/AC-3** — Vervallen door ADR 0104 (`gebouwd` wordt als `goedgekeurd` gelezen, AC-17). Was:
  `documentInfo` leest `status: gebouwd` als `gebouwd`.
- **gebouwd-zonder-nummer/AC-4** — Vervallen door ADR 0104 (een AC zonder test is niet gebouwd, geen overtreding, AC-16).
  Was: een gebouwde spec met een AC zonder test is rood.
- **gebouwd-zonder-nummer/AC-5** — Gegeven een spec met een AC zonder testbestand waarvan de tekst direct na het streepje
  begint met `Vervallen door ADR <nummer>`, wanneer `dekkingVanSpec` haar leest, dan staat die AC niet in `levend` als een ADR
  met dat nummer bestaat in de ADR-map naast de specmap (`docs/template/adr/` voor `docs/template/specs/`, `docs/adr/` voor
  `docs/specs/`) en de status `geaccepteerd` heeft. Wel levend: een onbekend nummer; een ADR met status `voorgesteld`,
  `vervallen` of `vervangen door NNNN`; "Vervallen door ADR" elders in de tekst dan direct na het streepje.
  Toets: `test/rails/ac-dekking.test.ts` (nieuw)
- **gebouwd-zonder-nummer/AC-6** — Gegeven een spec met minstens één gebouwd AC en een niet-bestaand repopad tussen
  backticks, direct gevolgd door witruimte met hooguit één regeleinde en dan `(vervallen)`, `(nieuw)` of `(voorbeeld)`,
  wanneer `check:docs` draait, dan geeft de dood-padcheck geen melding. Met een ander woord ertussen, of een lege regel
  ertussen, wel. Toets: `test/rails/ac-dekking.test.ts` (nieuw)
- **gebouwd-zonder-nummer/AC-7** — Vervallen door ADR 0104 (het rolhek weigert `status: gebouwd` elke rol, AC-20). Was:
  hoofdsessie en architect mogen `status: gebouwd` schrijven, de developer niet.
- **gebouwd-zonder-nummer/AC-8** — Vervallen door ADR 0104 (het merkteken vervalt, AC-21). Was: vervolgbouw haalt
  `(nog niet gebouwd)` weg en laat de statusregel staan.
- **gebouwd-zonder-nummer/AC-9** — Vervallen door ADR 0104 (`beslisOvergang` kent geen uitslag `gebouwd` meer, AC-20). Was:
  de overgangen van een spec die `gebouwd` blijft.
- **gebouwd-zonder-nummer/AC-10** — Gegeven de repo na de bouw, wanneer een test `package.json`, `.claude/gates.json` en de
  exports van `rails/hooks/lib/document-state.mjs` leest, dan bestaat het script `docs:status` niet, is er geen rij voor
  `scripts/kit/document-status.mjs` (vervallen), bestaan dat bestand en `scripts/kit/roadmap-item.mjs` (vervallen) niet, en
  exporteert `document-state.mjs` geen `changeStatus` meer.
- **gebouwd-zonder-nummer/AC-11** — Gegeven de repo na de bouw, wanneer een test zoekt naar `docs:status` in
  `docs/framework.md`, `AGENTS.md`, `docs/dod.md`, `docs/operations/agent-doorloop.md`, `.claude/agents/`, `.claude/skills/`,
  `docs/specs/_template.md`, `docs/specs/_mini.md` en `scripts/kit/templates/spec.md.tmpl`, dan vindt hij niets.
- **gebouwd-zonder-nummer/AC-12** — Gegeven de repo na de bouw, wanneer `check:docs` draait, dan is het groen, terwijl
  `docs/template/specs/gebouwd-na-merge.md` (vervallen) niet bestaat en `specarchief-en-bouwvorm/AC-9`,
  `specarchief-en-bouwvorm/AC-10` en `template-repo/AC-5` de vorm uit AC-5 hebben, zonder test.
- **gebouwd-zonder-nummer/AC-13** — Vervallen door ADR 0104 (`gebouwd # #<n>` schrijft niemand meer). Was: een overgang naar
  `status: gebouwd # #<n>` geeft geen `spec:bewijs`, en hoofdsessie en architect mogen die regel schrijven.
- **gebouwd-zonder-nummer/AC-14** — De sectie
  `## Modus spec-review` in `.claude/agents/reviewer.md` geldt bij elke spec in de PR (niet alleen bij migratie, route of
  permissie) en vraagt een oordeel over "kritiek"; de eerste niet-lege regel van `.github/pull_request_template.md` is
  `## Spec`. Bewijs nu: `test/rails/spec-en-bouw.test.ts:49`.
- **gebouwd-zonder-nummer/AC-15** — Vervallen door ADR 0104 punt 6 (er valt niets meer te vergeten). Was: de melding
  `vergeten-gebouwd` als een PR een test toevoegt voor een spec die nog `goedgekeurd` is of een AC met merkteken.
- **gebouwd-zonder-nummer/AC-16** — Gegeven een boom met specs en testbestanden, wanneer `acDekking` draait, dan is per spec:
  `goedgekeurd` met een test voor elk levend eigen AC: stand `gebouwd`, `n/n`; met een test voor een deel: `deels`, `n/m`;
  zonder: `niet`, `0/m`; `voorstel` of `vervallen` met tests voor elk AC: `niet`, met dezelfde `gebouwd` en `levend` als
  bij `goedgekeurd`; `goedgekeurd` zonder AC's of met alleen vervallen AC's: `niet`, `0/0` (OV-9). Een AC telt als gebouwd als een
  testbestand (`TESTBESTAND`) `<namespace>/AC-n` of `<specnaam>/AC-n` als heel woord noemt; een los `AC-n`, een
  `andere/<namespace>/AC-n` of een id in een niet-testbestand telt niet. Een kruisverwijzing `andere-spec/AC-n` in de spec is
  geen eigen AC. Toets: `test/rails/ac-dekking.test.ts` (nieuw)
- **gebouwd-zonder-nummer/AC-17** — Gegeven een spec met statusregel `status: gebouwd`, `status: gebouwd # #12` of
  `status: gebouwd # ander commentaar`, wanneer `eigenaarStatus`, `documentInfo`, `check:docs`, `check:roadmap` en
  `feiten specs` haar lezen, dan is haar eigenaarstatus `goedgekeurd` en haar stand de afgeleide (AC-16), ook in
  `docs/specs/`; staat die regel ongewijzigd op de merge-base, dan geeft geen check een nieuwe overtreding. Het merkteken
  `(nog niet gebouwd)` op een AC dat al op de merge-base stond, verandert de afleiding niet: met test gebouwd, zonder niet.
  Toets: `test/rails/ac-dekking.test.ts` (nieuw)
- **gebouwd-zonder-nummer/AC-18** — Gegeven een merge-base waarop een spec de eigenaarstatus `goedgekeurd` heeft (ook via een
  oude `gebouwd`-regel) en AC-n gebouwd is, wanneer `pnpm ratchet` draait en in de werkmap geen testbestand dat id nog noemt
  (test weg, id uit de test, of de AC-regel uit een spec die blijft bestaan en niet `vervallen` is), dan is de uitslag rood
  met de sleutel `docs:ac:<spec>:<AC-n>` (`<spec>` de bestandsnaam zonder `.md` in de werkmap) en de tekst uit Hergebruik en
  UX, in het strikte kanaal (ook met `pnpm ratchet:update` niet in `.kit/baseline.json`). Een spec die in de werkmap onder een
  nieuwe naam staat (`git diff -M`), wordt met haar oude naam op de basis vergeleken; verliest ze daar een gebouwd AC, dan is
  de sleutel die met de nieuwe naam. Groen: de AC heeft in de werkmap de vervallen-vorm van AC-5; het testbestand is
  hernoemd en noemt het id nog; de spec is hernoemd en haar tests noemen het id nog; de spec is in de werkmap verwijderd; de
  spec staat in de werkmap op `vervallen` (OV-8); de AC was op de merge-base niet gebouwd; de spec was op de merge-base
  `voorstel` of `vervallen`. Toets: `test/rails/ac-dekking-basis.test.ts` (nieuw)
- **gebouwd-zonder-nummer/AC-19** — Gegeven een spec waarvan de statusregel in de werkmap met `status: gebouwd` begint en
  niet letterlijk zo op de merge-base stond (nieuwe spec, `goedgekeurd` naar `gebouwd`, `gebouwd` naar `gebouwd # #5`, een
  nieuwe `; gevalideerd: <sha>`), wanneer `pnpm ratchet` draait, dan is de uitslag rood met de sleutel
  `docs:<specpad>:status-gebouwd` en de tekst uit Hergebruik en UX. Groen: dezelfde regel ongewijzigd (oude
  `gebouwd # #<n>`); `gebouwd` naar `goedgekeurd`. Toets: `test/rails/ac-dekking-basis.test.ts` (nieuw)
- **gebouwd-zonder-nummer/AC-20** — Gegeven een spec in de vertrouwde basis, wanneer hoofdsessie, architect of developer via
  Edit of Write een statusregel schrijft die met `status: gebouwd` begint en niet letterlijk zo in de vertrouwde basis
  staat, ook bij een nieuw bestand, dan weigert het rolhek met de rolhektekst uit Hergebruik en UX, ook als de vertrouwde
  basis een besluit voor die spec heeft of alleen de statusregel verschilt (de weg "status uit main"). Toegestaan voor hoofdsessie en architect:
  `status: gebouwd` (met elk commentaar) naar `status: goedgekeurd` bij verder gelijke inhoud, en een wijziging elders in
  een spec met een ongewijzigde oude `gebouwd`-regel volgens de regels voor `goedgekeurd`. De developer krijgt
  `status: gebouwd` naar `status: goedgekeurd` geweigerd door `recordedStatus` met de ingekorte tekst
  `<pad>: deze statusovergang heeft geen geldig besluit uit de vertrouwde basis`, omdat `canRecordStatus` daarvoor `false`
  geeft. `beslisOvergang` geeft nooit meer de uitslag `gebouwd`.
  Toets: `test/hooks/rolhek-gebouwd-afgeleid.test.ts` (nieuw)
- **gebouwd-zonder-nummer/AC-21** — Gegeven een AC-regel `- **<ns>/AC-n** (nog niet gebouwd)` die zo niet op de merge-base
  stond (nieuwe AC met merkteken, of merkteken op een bestaande AC gezet), wanneer `pnpm ratchet` draait, dan is de uitslag
  rood met de sleutel `docs:<specpad>:merkteken:<AC-n>` en de tekst uit Hergebruik en UX. Groen: het merkteken stond al op
  de merge-base (een app); het merkteken weggehaald; `(nog niet gebouwd)` achter een doelpad in `docs/framework.md`
  (regel 9 blijft). Toets: `test/rails/ac-dekking-basis.test.ts` (nieuw)
- **gebouwd-zonder-nummer/AC-22** — Gegeven een spec met minstens één gebouwd AC (`gebouwd` of `deels`), wanneer
  `check:docs` draait, dan meldt de dood-padcheck een niet-bestaand repopad buiten het lijstitem van een niet-gebouwd AC,
  ook als de spec deels gebouwd is; een pad binnen het lijstitem van een niet-gebouwd AC (het item eindigt bij een lege
  regel of een regel die met `-` of `#` begint) geeft geen melding. Een spec met stand `niet` toetst de dood-padcheck niet.
  Toets: `test/rails/ac-dekking.test.ts` (nieuw)
- **gebouwd-zonder-nummer/AC-23** — Gegeven een spec met een niet-bestaand pad in "Kopieer de vorm van", wanneer `check:docs`
  draait, dan meldt `:vorm` het bij `voorstel` en bij `goedgekeurd` met stand `niet` of `deels`, en niet bij stand
  `gebouwd` (ook niet bij een oude `gebouwd`-regel met volledige dekking) of bij `vervallen`.
  Toets: `test/rails/ac-dekking.test.ts` (nieuw)
- **gebouwd-zonder-nummer/AC-24** — Gegeven een spec die op de merge-base stand `niet` of `deels` heeft (of daar niet
  bestaat) en in de werkmap stand `gebouwd`, en die een roadmap-id noemt, wanneer `check:roadmap` draait en
  `docs/roadmap.md` niet wijzigt, dan is de uitslag rood met de sleutel `spec:roadmap:<specpad>` en de tekst uit Hergebruik
  en UX. Groen: `docs/roadmap.md` wijzigt; de spec was op de merge-base al `gebouwd`; de spec wordt alleen `deels`; de spec
  noemt geen roadmap-id; alleen de statusregel gaat van `gebouwd` naar `goedgekeurd`; de spec is alleen hernoemd en was
  onder haar oude naam op de merge-base al `gebouwd` (opgezocht via `hernoemd`). Geen invoer geeft nog de sleutel
  `spec:bewijs`. Toets: `test/rails/check-roadmap-dekking.test.ts` (nieuw)
- **gebouwd-zonder-nummer/AC-25** — Gegeven specs met stand `gebouwd`, `deels` en `niet` en een met een oude
  `gebouwd`-regel, wanneer `node scripts/kit/feiten.mjs specs` draait, dan toont de statuskolom `gebouwd`, `deels <n>/<m>`
  of de eigenaarstatus volgens AC-16, toont de standaardlijst geen spec met stand `gebouwd` en telt de telregel per stand;
  met `--json` heeft elke spec `{ spec, status, stand, gebouwd, levend }`. De toets roept de pure functie `specs(lezer, map)`
  aan met een lezer in het geheugen (met `boom`), niet de CLI. Toets: `test/rails/ac-dekking.test.ts` (nieuw)
- **gebouwd-zonder-nummer/AC-26** — Gegeven een werkmap zonder merge-base met `origin/main` (ook een ondiepe kloon), wanneer
  `pnpm ratchet` en `check:roadmap` draaien, dan geven AC-18, AC-19, AC-21 en AC-24 geen overtreding, bevat
  `docsMeldingen` precies één melding die met `let op: geen merge-base met origin/main; de krimpcontrole` begint, met de
  tekst uit Hergebruik en UX, houdt `check:roadmap` zijn bestaande melding
  `roadmap:basis`, en geven AC-16, AC-22, AC-23 en AC-25 dezelfde uitslag als met merge-base.
  Toets: `test/rails/ac-dekking-basis.test.ts` (nieuw)
- **gebouwd-zonder-nummer/AC-27** — Gegeven de repo na de bouw, wanneer een test de boom leest, dan bestaan
  `scripts/kit/vergeten-gebouwd.mjs` (vervallen) en `test/rails/vergeten-gebouwd.test.ts` (vervallen) niet, noemt het
  kopcommentaar van `scripts/kit/check-docs.mjs` geen regel 18 en geen `vergeten-gebouwd`, heeft geen bestand in
  `docs/template/specs/` een statusregel die met `status: gebouwd` begint, en heeft geen AC-regel daar het merkteken
  (`acIds(…).gemarkeerd` is leeg). Toets: `test/rails/gebouwd-zonder-nummer.test.ts`
- **gebouwd-zonder-nummer/AC-28** — Gegeven de repo na de bouw, wanneer een test zoekt naar de tekst `status: gebouwd` in
  `AGENTS.md`, `docs/dod.md`, `docs/operations/agent-doorloop.md`, `.claude/agents/`, `.claude/skills/`,
  `docs/specs/_template.md`, `docs/specs/_mini.md` en `scripts/kit/templates/spec.md.tmpl`, dan vindt hij niets; in
  `docs/framework.md` staat hij alleen in R-WERK-08, als de oude vorm die als `goedgekeurd` telt.
  Toets: `test/rails/gebouwd-zonder-nummer.test.ts`
- **gebouwd-zonder-nummer/AC-29** — Gegeven een werkmap met een merge-base met `origin/main` waarvan de boom niet te lezen
  is (`git ls-tree` of `git cat-file --batch` eindigt met een fout, of `cat-file` meldt een object als ontbrekend), wanneer `pnpm ratchet`
  draait, dan is er precies één strikte overtreding `docs:ac:basis-onleesbaar` met de tekst uit Hergebruik en UX, en geen
  AC-verlies, `status-gebouwd` of merkteken op grond van een lege basis. Een leesbare basis zonder testbestanden, specs of
  ADR's geeft die overtreding niet. Toets: `test/rails/ac-dekking-basis.test.ts`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Spec over meer PR's gebouwd | elke deel-PR verhoogt `n/m`; niets wordt rood; de PR die `m/m` haalt, draagt de roadmap-id-regel (AC-24) | n.v.t. |
| Eén AC krijgt nooit een test | de spec blijft zichtbaar `deels` in `feiten` en de AC-tabel; niet rood (aanvaard risico, ADR 0104) | n.v.t. |
| Test noemt een AC-id zonder het gedrag te toetsen | telt als gebouwd, zoals nu; de reviewer toetst het (ADR 0104) | n.v.t. |
| Nieuw AC in een gebouwde spec | inhoudswijziging, dus een besluit (ADR 0080 punt 4); zonder test daalt de stand naar `deels`, zonder merkteken (AC-21) | n.v.t. |
| AC verliest zijn test in een refactor | rood in die PR (AC-18); de test terug, of de AC vervalt door een geaccepteerd ADR | n.v.t. |
| Testbestand hernoemd | volgt `git diff -M`; noemt de nieuwe naam het id, dan groen (AC-18) | n.v.t. |
| Spec wordt verwijderd of gaat naar `vervallen` | de tests van haar gebouwde AC's mogen weg; AC-18 blijft groen (besluit OV-8) | n.v.t. |
| AC-regel verdwijnt uit een levende spec zonder vervallen-vorm | rood als de AC op de merge-base gebouwd was (AC-18) | n.v.t. |
| Spec hernoemd | AC-18 en AC-24 vergelijken met de oude naam op de merge-base (`hernoemd`); de sleutel draagt de nieuwe naam | n.v.t. |
| `goedgekeurd` zonder levend AC | stand `niet`, `0/0` (besluit OV-9, afwijking van de letter van ADR 0104 punt 1) | n.v.t. |
| App met `gebouwd # #<n>` en een AC met `(nog niet gebouwd)` | leest als `goedgekeurd`; de AC zonder test maakt de spec `deels`; niets rood na de template-update (AC-17, AC-21) | n.v.t. |
| App zet haar `gebouwd`-regels om | `gebouwd` naar `goedgekeurd` is groen in elke check (AC-19, AC-24) en mag in het rolhek (AC-20) | n.v.t. |
| Oude vorm `gebouwd # #<n>; gevalideerd: <sha>` | `check-docs` weigert hem zoals nu (`docs:<specpad>:gevalideerd`) | n.v.t. |
| Deels gebouwde spec noemt een pad dat nog komt, buiten een AC-item | dood-padmelding; zet `(nieuw)` erachter (aanvaard risico, ADR 0104) | n.v.t. |
| Spec op `voorstel` heeft al tests met haar AC-ids | stand `niet`; `goedgekeurd` maken is een eigenaarstatus, daarna volgt de stand (AC-16) | n.v.t. |
| Geen merge-base (sandbox, CI met `fetch-depth: 1`) | alleen de boomregels toetsen; één "let op" (AC-26). In CI is `docs:normen:geen-basis` al rood, dus een PR in CI heeft altijd een basis | n.v.t. |
| Merge-base bestaat, boom daar onleesbaar (ontbrekend object, git-fout) | rood: `docs:ac:basis-onleesbaar` (AC-29); geen stil groen met een lege basis | n.v.t. |
| Kruisverwijzing `andere-spec/AC-n` in een test | telt voor die andere spec als gebouwd als die het AC definieert (AC-16); geen eigen AC van deze spec | n.v.t. |

## Raakt ook

**Omzetting (één mechanische commit, ADR 0104 punt 5)**

- In elk bestand `docs/template/specs/*.md` behalve `_`-bestanden: de frontmatterregel die met `status: gebouwd` begint, wordt
  `status: goedgekeurd` met de rest van de regel ongewijzigd (een `# #<n>` blijft als commentaar staan). Nu 84 bestanden; de
  bouw telt opnieuw met `git grep -l -E '^status: gebouwd' -- docs/template/specs`. Deze spec hoort erbij: haar eigen
  statusregel gaat in die commit van `status: gebouwd` naar `status: goedgekeurd`; haar stand is daarna `gebouwd` zodra de
  tests van AC-16 tot en met AC-28 er zijn.
- Het script van de omzetting staat in `$TMPDIR` en wordt niet gecommit; de commitboodschap noemt het commando. Geen andere
  wijziging in die commit.
- `docs/specs/` (een app) wordt niet omgezet; de template-update maakt daar niets rood (AC-17).
- Baseline: er staan nu geen sleutels `docs:ac:…` in `.kit/baseline.json`, dus er valt niets te verhuizen; de nieuwe
  vergelijkingen (AC-18, AC-19, AC-21) staan in het strikte kanaal. De sleutels `docs:<spec>:dood-pad:<pad>` blijven: elke
  nu gebouwde spec heeft volle dekking en blijft getoetst. Geeft regel 14 of 7 op een van de vijf nu goedgekeurde specs een
  nieuwe melding (deels gebouwd), dan lost de bouw-PR die op in die spec (`(nieuw)`, `(vervallen)` of het pad), niet in de
  baseline. Wat vervalt (bijv. dood-padsleutels van een spec die `niet` wordt), haalt `pnpm ratchet:update` weg.
- Tussenstand: tot de bouw is deze spec nog `gebouwd` onder de oude regel 6, dus `check:docs` is rood op AC-16 tot en met
  AC-28 tot hun tests er zijn. Spec en bouw staan in één PR; de PR eindigt groen.

**Checks**

- `scripts/kit/check-docs.mjs`: regel 6 wordt AC-18 (in `docsKrimp`); `acViolations` op `status === 'gebouwd'` vervalt;
  regel 7 (`:vorm`) volgt AC-23; regel 14 volgt AC-22 (`NIEUWE_AC` wordt "lijstitem van een niet-gebouwd AC"); nieuwe
  toetsen AC-19 en AC-21; regel 3 (`specVormViolations`, `:open-vraag`) leest de eigenaarstatus; `docsMeldingen` verliest
  `vergetenGebouwdMeldingen` en krijgt de melding zonder basis; het kopcommentaar van regel 6, 7, 14 en 18 volgt.
- `scripts/kit/check-roadmap.mjs`: `specMeldingen` volgt AC-24; het kopcommentaar (r.2-3) en dat bij `specMeldingen` noemen
  ADR 0104. De omschrijving van `check:roadmap` in `scripts/kit/gates.mjs` volgt als die `gebouwd` noemt.
- `scripts/kit/feiten-secties.mjs` en `scripts/kit/feiten-tekst.mjs`: AC-25; de `Lezer` krijgt het optionele veld `boom`.
- `scripts/kit/leespad.mjs`: de ref-lezer in `lezing` levert `boom` via `boomOpBasis`.
- `scripts/kit/leesbudget.mjs`: de tekst van `zonderBasis` noemt de AC-dekking (AC-26).
- `scripts/kit/ac-toets.mjs`: alleen de imports, als die verhuizen.
- Schrappen: `scripts/kit/vergeten-gebouwd.mjs` (vervallen) en `test/rails/vergeten-gebouwd.test.ts` (vervallen) (ADR 0104 punt 6; het ADR is het
  eigenaarakkoord voor deze test, R-TEST-02).

**Rolhek en document-state**

- `rails/hooks/lib/document-state.mjs`: `documentInfo` geeft voor `gebouwd` de status `goedgekeurd` (via `eigenaarStatus`);
  `gebouwdBlijft` en de uitslag `gebouwd` van `beslisOvergang` vervallen; `builtReference` vervalt als niets hem meer
  gebruikt. `MARKERING` en `acIds` blijven (het merkteken weghalen blijft geen inhoudswijziging; AC-21 gebruikt
  `gemarkeerd`).
- `rails/hooks/lib/rolhek.mjs`: `inPrGebouwd` vervalt; de weigering van AC-20 komt vóór `statusZonderBesluit` en
  `recordedStatus`; de twee ingekorte teksten uit Hergebruik en UX.
- `canRecordStatus` in `rails/hooks/lib/task-authority.mjs` wijzigt van gedrag: de tak `info.status === 'gebouwd'` vervalt
  (`documentInfo` geeft die status niet meer), en in plaats daarvan geeft hij `false` als `gebouwdRegel(nieuw) !== gebouwdRegel(vertrouwd)`
  (alleen dat geval; een commentaarwijziging als `goedgekeurd # #12` naar `goedgekeurd` en de `Status:`-regel van een ADR
  blijven zoals nu). Zo telt `gebouwd` naar `goedgekeurd` niet als "status uit main" en weigert `recordedStatus` het voor
  de developer (AC-20); een ongewijzigde oude `gebouwd`-regel bij gelijke inhoud blijft
  vastlegbaar zoals nu een `goedgekeurde`.

**Tests die wijzigen** (eigenaarakkoord per R-TEST-02: besluit OV-7)

- `test/rails/gebouwd-zonder-nummer.test.ts`: de gevallen van de vervallen AC's (AC-1 tot en met AC-4, AC-7 tot en met AC-9,
  AC-13) gaan weg of naar de nieuwe uitkomst; AC-27 en AC-28 erbij.
- Waarschijnlijk geraakt, de bouw bevestigt per geval: `test/rails/check-roadmap-bewijsvorm.test.ts`,
  `test/rails/check-roadmap.test.ts`, `test/hooks/rolhek-beslisroute.test.ts`, `test/rails/specarchief-document-state.test.ts`,
  `test/rails/bouwvorm-review.test.ts`, `test/rails/check-docs-dood-pad.test.ts`, `test/rails/specarchief-check-docs.test.ts`,
  `test/rails/archief-check-docs.test.ts`, `test/rails/spec-en-bouw.test.ts`, `test/docs/vervallen-documenten-weg.test.ts`.
  Zoekopdracht: `git grep -l -e 'status: gebouwd' -e 'nog niet gebouwd' -e 'vergeten-gebouwd' -e 'inPrGebouwd' -- test`.

**Regelboek, instructies en documenten**

- `docs/framework.md`: R-WERK-08 (de statusregel draagt alleen eigenaarstatussen; `gebouwd` volgt uit de AC-dekking op
  `main`; een bestaande `status: gebouwd` telt als `goedgekeurd`); R-WERK-07 (een nieuw AC in een gebouwde spec krijgt geen
  merkteken); R-DOC-10 (`(nog niet gebouwd)` alleen achter een doelpad). De regeltekst schrijft de bouw (R-DOC-10).
- `AGENTS.md` (de regel over status en `gebouwd`), `docs/dod.md`, `docs/operations/agent-doorloop.md` (o.a. "Bouw-PR vergat
  de status" vervalt), `.claude/agents/architect.md`, `.claude/agents/docs.md`, `.claude/skills/opleveren/SKILL.md` stap 7,
  `docs/specs/_template.md`, `docs/specs/_mini.md` (AC-28).
- `docs/template/specs/specarchief-en-bouwvorm.md`: de Werking-tekst over het merkteken voor een nieuwe AC (r.70) volgt
  ADR 0104; de andere specs die het merkteken als historie noemen, controleert de bouw.
- `docs/roadmap.md`: het item "Bouw ADR 0104" krijgt zijn vinkje met testpad.
- Changelogfragment `docs/template-changelog.d/feat-gebouwd-uit-ac-dekking.md` (nieuw): wat een app moet doen: niets;
  `gebouwd` blijft geldig als `goedgekeurd`, omzetten mag. Het bestaande fragment
  `docs/template-changelog.d/feat-vergeten-gebouwd.md` wijzigt niet (regel 17); het nieuwe noemt dat de melding vervalt.
- ADR's: de hoofdsessie herschrijft de punten die ADR 0104 wijzigt op hun plek met een `Herzien:`-regel (R-CI-05): 0054 punt
  1, 3 en 5; 0080 punt 4, 5 en 6; 0062 punt 4; 0095 punt 1–5 en 7; 0046 punt 5, 6 en 10; 0089 punt 8. ADR 0104 zelf wijzigt
  niet.

**Niet geraakt en beschermd**

- Geen migratie, route, permissie of resource, dus niet `check:migrations`, `check:secdef`, `test:db` of
  `test/security/resources.ts`.
- Beschermde paden: `rails/hooks/`, `.claude/`, `scripts/kit/` en `.kit/` vragen het akkoord van de eigenaar (niveau per pad:
  `node scripts/kit/feiten.mjs pad <pad>`). `.claude/skills/` kan de sandbox niet schrijven (Edit in de hoofdsessie met
  akkoord). Krijgen de twee nieuwe modules een padrij, dan volgt `.github/CODEOWNERS` (gegenereerd).

## Buiten scope

- `gebouwd` afleiden uit de git-historie, een trailer of de PR-beschrijving (ADR 0104, Alternatieven).
- De omzetting van `docs/specs/` in een app.
- Toetsen of een test het gedrag van zijn AC echt toetst (blijft bij de reviewer).
- De regels van `check-roadmap` voor vinkjes.

## Testplan

- Unit, puur: `test/rails/ac-dekking.test.ts` (nieuw), met een boom in het geheugen per geval: AC-5, AC-6, AC-16, AC-17,
  AC-22, AC-23 en AC-25 (via `specs(lezer, map)` met een lezer in het geheugen). Daarnaast een importtoets: de
  importspecificaties van `rails/hooks/lib/ac-dekking.mjs` (nieuw) bevatten geen `node:fs`, `node:child_process` of `scripts/kit`.
- Tegenover de merge-base: `test/rails/ac-dekking-basis.test.ts` (nieuw), een tijdelijke git-repo met `origin/main` per
  geval: AC-18, AC-19, AC-21, AC-26 en AC-29; per geval ook dat `.kit/baseline.json` na `ratchet:update` geen nieuwe sleutel heeft.
- `check-roadmap`: `test/rails/check-roadmap-dekking.test.ts` (nieuw), met `roadmapMeldingen` en bronnen in het geheugen: AC-24.
- Rolhek: `test/hooks/rolhek-gebouwd-afgeleid.test.ts` (nieuw), per rol en per stand van de vertrouwde basis: AC-20.
- Bestandstoetsen: `test/rails/gebouwd-zonder-nummer.test.ts`: AC-27 en AC-28; AC-10 tot en met AC-12 en AC-14 blijven.
- Elke rode fixture uit ADR 0104 Gevolgen heeft een geval: AC verliest zijn test (AC-18), nieuwe `status: gebouwd`
  (AC-19), nieuw merkteken (AC-21), volledig gebouwd met roadmap-id zonder roadmapwijziging (AC-24), dood pad buiten een
  AC-item van een deels gebouwde spec (AC-22); groene: vervallen AC zonder test (AC-5, AC-18), dood pad in een niet-gebouwd
  AC-item (AC-22), oude `gebouwd # #<n>` (AC-17, AC-19).
- Gates: `pnpm ratchet`, `pnpm check:roadmap`, `pnpm test` en `pnpm gate:fast` groen; "Klaar als" van ADR 0104 via AC-25
  en AC-27.

## Open vragen

- **OV-1 ✅ besloten** — Vorm: `status: gebouwd` zonder nummer (eigenaar, 2026-11-18). Herzien door ADR 0104: niemand
  schrijft nog `gebouwd`.
- **OV-2 ✅ besloten** — `pnpm docs:status` vervalt helemaal (eigenaar, 2026-11-18).
- **OV-3 ✅ besloten** — Eén PR met ADR, checks en schrappen (eigenaar, 2026-11-18).
- **OV-4 ✅ besloten** — De vervallen-vorm `Vervallen door ADR <nummer> … Was: …`, alleen met een geaccepteerd ADR (eigenaar,
  2026-11-18).
- **OV-5 ✅ besloten** — Herzien door ADR 0104: het rolhek weigert `status: gebouwd` elke rol (AC-20).
- **OV-6 ✅ besloten** — Testlijst van de bouw van ADR 0095 (eigenaar, 2026-11-18).
- **OV-7 ✅ besloten** — Bestaande tests mogen gewijzigd of geschrapt worden waar `status: gebouwd` of `vergeten-gebouwd`
  vervalt, met de reden per bestand en geval in de PR (R-TEST-02; eigenaar, 2026-11-23).
- **OV-8 ✅ besloten** — Verwijdert een PR een spec of zet ze haar op `vervallen`, dan mogen de tests van haar gebouwde AC's
  weg zonder dat AC-18 rood wordt; een AC uit een levende spec zonder vervallen-vorm blijft rood (eigenaar, 2026-11-23).
- **OV-9 ✅ besloten** — Een `goedgekeurde` spec zonder levend eigen AC heeft stand `niet`, als afwijking van de letter van
  ADR 0104 punt 1 (eigenaar, 2026-11-23); AC-16 toetst het.
