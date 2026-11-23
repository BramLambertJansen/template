---
status: goedgekeurd # #748
namespace: app-padtabel
---

# Eigen beschermde paden van een app

## Doel

Een app beschermt eigen paden in `.claude/gates.app.json`, een bestand van de app dat de padtabel van de template aanvult zonder `.claude/gates.json` te wijzigen, zodat een template-update geen conflict in de padtabel geeft en geen app-rij een templatepad losser maakt.

**Toets aan framework §1.** Aanleiding: de volgorde die de eigenaar op 2026-11-15 goedkeurde ("prima volgorde - ga door"), stap 1 "app-configuratie naast templateconfiguratie", en de regel "Buiten scope" van spec [template-update](template-update.md). Geen nieuwe dependency. Deel 1 van die stap, de template-repo uit de configuratie, staat in spec `template-repo` (aparte PR); de twee zijn onafhankelijk.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| elke rol | leest het niveau met `feiten.mjs pad <pad>`, ook voor een app-rij | — |
| hoofdsessie (in een app) | schrijft `.claude/gates.app.json` na eigenaarakkoord (het bestand is altijdVragen en besluit-pr) | een templaterij losser maken |
| developer, architect, tester, reviewer, docs | — | `.claude/gates.app.json` schrijven (vloer) |
| eigenaar | keurt de PR met het app-bestand goed (code-eigenaar) | — |

## Het probleem

In een app is `.claude/gates.json` van de template: een template-update overschrijft of merget hem. De padtabel-spec staat een app toe eigen rijen toe te voegen (randgeval "App voegt eigen rijen toe"), maar alleen in dat bestand, dus elke wijziging van de padtabel in de template geeft dan in de app een conflict. Een app die niets toevoegt, kan haar eigen gevoelige paden (bijvoorbeeld een betaalmodule) niet zwaarder beschermen dan `src/**` (besluit `agent`).

## Ontwerp

- **Bestand.** `.claude/gates.app.json` is optioneel en heeft precies de vorm `{ "$comment"?: <tekst>, "paden": { "<glob>": { "schrijven"?: …, "besluit"?: … } } }`. Elke andere sleutel is rood in check-docs; de lezers lezen alleen `paden`. Zo kan het bestand `merge`, `autoRunner`, `schrijfrecht`, `onderhoud`, `goedkeurders` of `template` niet overschrijven; de lezers daarvan (`runner-authority.mjs`, `pr-merge.mjs`, `pr-verify.mjs`) lezen het bestand niet.
- **Wat een app-rij mag.** Alleen toevoegen of aanscherpen:
  - `schrijven` is `gate` of `voorReview`; `altijdVragen` niet, want dat niveau spiegelt naar de Edit-`ask` in `.claude/settings.json` (padtabel/AC-7), en die is ook van de template: een app-rij met `altijdVragen` bracht precies het conflict terug. In een app is de onderhoudsmodus uit (R-ROL-02), dus voor het rolhek is `voorReview` daar even streng als `altijdVragen`; met `besluit-pr` is het pad ook kritiek.
  - `besluit` is `eigenaar` of `besluit-pr`; `agent` niet, want een pad dat geen templaterij raakt, heeft standaard `eigenaar`, en een app-rij met `agent` maakte het dan losser (CODEOWNERS haalt de eigenaar weg).
  - Een glob die al in `.claude/gates.json` staat, herhaalt de app niet: aanscherpen kan met een eigen, specifiekere glob. Zo blijft de rij van een templatepad op één plek en is er niets te vergelijken.
- **Samenvoegen.** Eén pure functie in `rails/hooks/lib/padtabel.mjs`, `samengevoegd(ruw, app)`: `app` is de geparste app-inhoud of `null`. Het resultaat is `ruw` met `paden` = de templaterijen, met daarna de app-globs die de template niet heeft; bij dezelfde glob (een fout volgens check-docs) is de samengevoegde rij per kolom het maximum van `rijNiveau(templaterij)` en `rijNiveau(app-rij)`, als volledige rij `{ schrijven, besluit }` geschreven; is één van beide onleesbaar, dan is de rij `STRENGST`. Zo wordt een onleesbare templaterij nooit leesbaar en maakt ook die fout niets losser. Een kolom die de app-rij weglaat, laat de waarde van de template staan. Voor het lezen telt een verboden waarde in een app-rij zo: `agent` als `eigenaar`, `altijdVragen` blijft `altijdVragen` (strenger kan altijd); een onleesbare app-rij telt, zoals een templaterij, als het strengste niveau (padtabel Werking 5). Zo maakt het app-bestand bij het lezen nooit iets losser, ook niet als check-docs nog niet gedraaid heeft. `padNiveau`, `afgeleid` en `padenVan` blijven ongewijzigd en krijgen het samengevoegde object. `samengevoegd` gooit als het app-bestand geen object is, `paden` mist of geen object is, of als `gates.json` in de oude vorm is (zonder `paden`) en er een app-bestand is: de lezer valt dan dicht in plaats van app-rijen stil te negeren. Een tweede export `appGlobs(app)` geeft de globs uit het app-bestand die de template niet heeft, voor de herkomst in `feiten.mjs pad`.
- **Lezers.** Elke lezer van de padtabel leest het app-bestand uit dezelfde bron als `gates.json` en geeft het samengevoegde object door:
  - Rolhek: `loadConfig(text, appText = null)` (`rolhek.mjs`) voegt samen vóór `afgeleid`. `configuratie()` (`rolhek-context.mjs`) leest in een hook beide uit het anker; buiten een hook `gates.json` uit `authority.trusted` en het app-bestand met `basis.readOptional` uit dezelfde commit (`origin/main` of de basis); alleen als `gates.json` uit de werkmap komt, komt ook het app-bestand uit de werkmap. In een hook kost dat een tweede gecontroleerde wandeling naar `.claude/`; een gedeelde controle voor beide bestanden mag, als het resultaat gelijk is.
  - **Afwezig of vervalst.** In een hook geeft `vertrouwdeTekst` (`objecten.mjs`) `null` voor een ontbrekend bestand én voor een object met een verkeerde hash; voor het app-bestand moet afwezig "geen app-rijen" betekenen, en een vervalst object mag dat niet nabootsen. Daarom een variant `vertrouwdeTekstOptioneel(root, sha, pad)` die `{ afwezig: true }` geeft alleen als een geverifieerde boom op het pad de naam niet bevat, de tekst bij een geverifieerde gewone blob, en gooit bij een hashfout, een andere modus of een onleesbare boom (het rolhek valt dan dicht, zoals bij `gates.json`). Het basisobject (`authority-context.mjs`) krijgt `readOptional`; buiten een hook leest het elke boom op het pad met `git ls-tree` en geeft `{ afwezig: true }` alleen als een leesbare boom de naam mist; een git-fout (ontbrekende of beschadigde boom of blob), een tussenstap die geen map is, en een eindpunt dat geen gewoon bestand is (symlink, gitlink, map) gooien. Git controleert de hash van een los object daar niet; buiten een hook is de basis een lokale ref, en CI is de grens. In de werkmap is `ENOENT` afwezig en gooit elke andere fout. Ongeldige JSON gooit overal.
  - Een basisobject zonder `readOptional` (oudere aanroepers, teststubs): buiten een hook telt het app-bestand als afwezig; in een hook valt het rolhek dicht met `geen gecontroleerde .claude/gates.app.json in het anker (ADR 0045)`.
  - `check-docs.mjs`: `padenViolations` (vorm, rijregels, dubbele sleutels, vloer) blijft op de tekst van `gates.json`; de app-regels hieronder draaien op de tekst van het app-bestand, alleen als het getrackt is; `schrijfrechtViolations` en `mirrorViolations` (CODEOWNERS en `ask`) draaien op het samengevoegde object. Een app-glob die CODEOWNERS niet kan uitdrukken (`patroon` in `codeowners.mjs`), meldt `.claude/gates.app.json: paden.<glob>: …` in plaats van `.claude/gates.json`. Zonder app-bestand verandert niets.
  - `codeowners.mjs` (`main` en `codeownersTekst`) en `feiten.mjs pad`: lezen het app-bestand uit de werkmap als het bestaat en gebruiken `samengevoegd`. De kop van de gegenereerde CODEOWNERS (`KOP`) noemt ook `.claude/gates.app.json`.
  - Niet gewijzigd: `app-init.mjs` (draait één keer op een verse templatekopie, en daar is een app-bestand rood) en `document-status.mjs` (`loadConfig(tekst)` werkt met de standaard `null`).
- **check-docs, nieuwe regels** (sleutel `docs:gates-app:<…>`, tekst na `.claude/gates.app.json: `):
  - `onbekende sleutel <x>` voor een sleutel naast `$comment` en `paden`; `paden is geen object`;
  - dezelfde rijregels als `gates.json` (onbekende kolom of waarde, `rij zonder kolom`, `een glob begint niet met !`, dubbele sleutel in de ruwe tekst);
  - `paden.<glob>: altijdVragen kan alleen in de template (vloer en ask-spiegel); gebruik voorReview met besluit-pr`;
  - `paden.<glob>: besluit agent kan alleen in de template`;
  - `paden.<glob>: staat al in .claude/gates.json; scherp aan met een eigen glob`;
  - `bestaat in de template zelf (onderhoud.repository staat in .claude/gates.json); app-rijen horen in een app` (in de template is elk app-bestand rood: de onderhoudsmodus zou een app-rij met voorReview tot een melding maken);
  - de samenhangregel `schrijven <niveau> met besluit agent` vervalt hier door de regel over `agent`.
- **Vloer.** `.claude/gates.app.json` komt in `VLOER` (`padtabel.mjs`): een eigen rij in `.claude/gates.json` met `altijdVragen` en `besluit-pr`, een Edit-regel in de `ask` van `.claude/settings.json` en een regel in `.github/CODEOWNERS` (gegenereerd). Zo is het bestand in de template en in elke app beschermd zoals `gates.json`, ook voordat het bestaat.
- **feiten.** `feiten.mjs pad <pad>` noemt een bron uit het app-bestand als `<glob> (app)`: de glob staat in `appGlobs(app)`.
- **CODEOWNERS.** `codeownersTekst` op het samengevoegde object; de volgorde (eerst `*`, dan `agent`-rijen, dan de rest) blijft gelden, dus een app-rij met besluit `eigenaar` of `besluit-pr` op een `src/**`-pad krijgt de eigenaar terug.

## Kopieer de vorm van

- `rails/hooks/lib/padtabel.mjs` `padNiveau` en `rang` voor het samenvoegen per kolom.
- `scripts/kit/check-docs.mjs` `padenViolations`, `rijMeldingen` en `padenSleutels` voor de app-regels.
- `rails/hooks/lib/objecten.mjs` `vertrouwdeTekst` voor de variant met afwezigheid.

## Hergebruik en UX

Geen schermen. De meldingen staan letterlijk in het Ontwerp; daarnaast `feiten.mjs pad`: `<pad>: schrijven <niveau> (<bronnen>), besluit <niveau> (<bronnen>)`, met een app-bron als `<glob> (app)`.

## Acceptatiecriteria

- **app-padtabel/AC-1** — `samengevoegd(ruw, null)` geeft `ruw` ongewijzigd terug (diep gelijk). Met een app-rij `payments/**` `{ schrijven: voorReview, besluit: besluit-pr }` geeft `padNiveau('payments/x.ts', …)` voorReview/besluit-pr en `afgeleid` heeft `payments/**` in `gates`, `voorReview` en `kritiek`, niet in `altijdVragen`. Een app-glob `__proto__` blijft een eigen sleutel van `paden` (het prototype van `paden` verandert niet) en `padNiveau('__proto__', …)` volgt haar rij.
- **app-padtabel/AC-2** — Dezelfde glob in template en app geeft bij het lezen per kolom de strengste (template `src/core/**` gate + app `src/core/**` `{ besluit: besluit-pr }` geeft gate/besluit-pr; app `.claude/**` `{}` laat `.claude/**` voorReview; een onleesbare templaterij plus een geldige app-rij op dezelfde glob geeft altijdVragen/besluit-pr), en check-docs is rood met `staat al in .claude/gates.json`. `samengevoegd` gooit bij een app-bestand zonder object-`paden` en bij `gates.json` in de oude vorm met een app-bestand.
- **app-padtabel/AC-3** — Een app-rij met `besluit: agent` op een pad zonder templaterij geeft bij het lezen besluit `eigenaar`, en CODEOWNERS houdt de eigenaar op dat pad; een onleesbare app-rij geeft altijdVragen/besluit-pr.
- **app-padtabel/AC-4** — check-docs met een getrackt app-bestand: elke melding uit het Ontwerp verschijnt bij haar geval (onbekende sleutel, `paden` geen object, rijfouten, dubbele sleutel, altijdVragen, agent, glob uit de template, app-bestand in de template); een geldig app-bestand is groen als `.claude/settings.json` en CODEOWNERS kloppen, en CODEOWNERS zonder de app-rij is rood.
- **app-padtabel/AC-5** — Zonder app-bestand geven `samengevoegd(ruw, null)`, `codeownersTekst` en `padNiveau` per pad uit `git ls-files` hetzelfde als met `ruw` alleen, en de bestaande tests van rolhek, check-docs en feiten blijven groen (op de vloerlijsten na).
- **app-padtabel/AC-6** — Vloer: zonder rij `.claude/gates.app.json` met altijdVragen/besluit-pr in `gates.json` is check-docs rood; met de rij is de developer geweigerd op `.claude/gates.app.json` en vraagt de hoofdsessie.
- **app-padtabel/AC-7** — `vertrouwdeTekstOptioneel`: afwezig in een geverifieerde boom geeft `{ afwezig: true }`; een gewone blob geeft de tekst; een vervalst los object (verkeerde hash), een symlink of een onleesbare boom gooit. Buiten een hook geeft `trustedBase(…).readOptional` afwezig alleen als een leesbare boom de naam mist (ook als `.claude` ontbreekt), de tekst bij een gewoon bestand (ook leeg: `''`), en gooit bij een ontbrekend of beschadigd blob- of boomobject, een gitlink, een symlink of een map op het pad.
- **app-padtabel/AC-8** — Rolhek in een hook (anker gezet): met een app-bestand in het anker geldt de app-rij (developer geweigerd op `payments/x.ts` bij voorReview); een app-bestand alleen in de werkmap geldt niet; een vervalst app-object in het anker laat het rolhek dichtvallen; geen app-bestand in het anker: zoals nu.
- **app-padtabel/AC-9** — `loadConfig(tekst)` met één argument werkt als nu; `loadConfig(tekst, appTekst)` voegt samen; ongeldige JSON in `appTekst` gooit.
- **app-padtabel/AC-10** — `feiten.mjs pad payments/x.ts` met het app-bestand uit AC-1 toont `schrijven voorReview (payments/** (app)), besluit besluit-pr (payments/** (app))`.
- **app-padtabel/AC-11** — `codeowners.mjs --schrijf` met een app-bestand schrijft de app-rij, en de kop noemt `.claude/gates.app.json`.
- **app-padtabel/AC-12** — In een tijdelijke app-repo die begint met de uitvoer van `app:init` (`goedkeurders` gewijzigd, `onderhoud` weg) plus een eigen `.claude/gates.app.json`: de template voegt een rij toe aan `.claude/gates.json` en de app doet `git merge template/main`; `.claude/gates.json` geeft geen conflict en de nieuwe templaterij en de app-rij gelden allebei (`padNiveau`). CODEOWNERS kan conflicteren; het herstel is opnieuw genereren (`docs/nieuwe-app.md`).

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Geen app-bestand (de template, een nieuwe app) | alles zoals nu | n.v.t. |
| App-bestand alleen op een branch | het rolhek leest het pas na de merge (anker = main); check-docs en CODEOWNERS in de PR wel | n.v.t. |
| App wil een pad altijdVragen | kan niet; voorReview + besluit-pr is in een app even streng voor rolhek en merge | n.v.t. |
| Template voegt later dezelfde glob toe | bij het lezen strengste per kolom; check-docs rood tot de app haar rij weghaalt of specifieker maakt | n.v.t. |
| App-rij overlapt het schrijfrecht van een rol (bv. docs op `docs/**`) | check-docs rood (padtabel/AC-8), net als bij een templaterij | n.v.t. |

## Raakt ook

- Risicowerk (het rolhek, een vertrouwensgrens, de bewaking zelf): aparte tester; kritiek (`rails/hooks/**`, `.claude/gates.json`, `.claude/settings.json`, `.github/CODEOWNERS`): de eigenaar keurt de PR goed. De hoofdsessie schrijft de configuratie, de goedgekeurde specs, het ADR en het regelboek (het rolhek weigert de developer daar).
- Code: `rails/hooks/lib/padtabel.mjs`, `objecten.mjs`, `authority-context.mjs`, `rolhek.mjs` (`loadConfig`), `rolhek-context.mjs`; `scripts/kit/check-docs.mjs`, `codeowners.mjs`, `feiten.mjs`.
- Config: `.claude/gates.json` (vloerrij, `$comment`), `.claude/settings.json` (Edit-`ask`), `.github/CODEOWNERS` (gegenereerd).
- Docs: spec [padtabel](padtabel.md) (randgeval "App voegt eigen rijen toe" wijst hierheen; Werking 6 vloer), ADR 0079 (herzien-regel bij punt 1 en 3: de tabel is `gates.json` plus het optionele app-bestand; de vloer telt acht paden), `docs/framework.md` R-WERK-05, R-ROL-01 en R-REPO-03 (de padtabel is `gates.json` plus `gates.app.json`; een app-rij met besluit-pr maakt werk kritiek), `.claude/rules/core.md` (spiegel van R-REPO-03), `docs/nieuwe-app.md` (een eigen beschermd pad; de uitzondering op "raak `.claude/` niet aan"; bij een template-update CODEOWNERS opnieuw genereren), `docs/template-changelog.md`.
- Bestaande tests (R-TEST-02, met reden in de PR): de lijsten met de vloer en de echte `altijdVragen`/`voorReview` krijgen `.claude/gates.app.json`: `test/rails/check-docs-voorreview.test.ts` (`VLOERRIJEN`, `ALTIJD_VRAGEN`), `test/rails/check-docs-onderhoud.test.ts` (`ECHTE_ALTIJD_VRAGEN`), `test/rails/padtabel-kit.ts` (`VLOER`), `test/rails/check-docs-padtabel.test.ts` waar hij de vloer telt, de fixture `test/rails/fixtures/claude-sandbox-werkstraat/boundaries.json` (`ask` krijgt `Edit(.claude/gates.app.json)`, zoals `.claude/settings.json`); teststubs van het basisobject alleen als ze in een hook `readOptional` nodig hebben.

## Buiten scope

- Andere app-configuratie dan de padtabel (`schrijfrecht`, `testpaden`). `goedkeurders` naar het app-bestand verplaatsen, zodat `app:init` `gates.json` niet meer wijzigt, is een logisch vervolg (voorstel uit een parallelle conceptspec); het vraagt een wijziging van `app:init`, `codeowners.mjs` en de rolhek-lezers van `goedkeurders`.
- Afdwingen dat `.claude/gates.json` in een app alleen via een template-merge wijzigt (`check-core` als zone): vervolg; nu weigert de padtoets van het mergescript zo'n PR en voegt de eigenaar samen (vangnet, ADR 0093).
- Een app-bestand voor `.claude/settings.json`: Claude Code kent geen gedeeld tweede projectbestand.
- De padtabel-gelijkwaardigheidstest (padtabel/AC-2) blijft op de template; app-rijen kunnen alleen aanscherpen.

## Testplan

- Unit: AC-1 t/m AC-3 en AC-9 tegen `padtabel.mjs` en `loadConfig`; AC-4 en AC-6 tegen `check-docs.mjs` met fixture-mappen zoals `test/rails/check-docs-padtabel.test.ts`; AC-7 met een fixture-repo zoals `test/hooks/vertrouwde-basis-anker.test.ts`; AC-8 met het rolhek en een anker zoals in die test; AC-10 als CLI-test zoals `test/scripts/feiten-pad.test.ts`; AC-11 tegen `codeownersTekst` en de CLI; AC-12 met tijdelijke git-repo's in de vorm van `test/scripts/proef-fixture.ts`.
- AC-5: de bestaande tests van rolhek, check-docs en feiten blijven groen.

## Open vragen

- **OV-1 ✅ besloten** — Waar de app-rijen staan: `.claude/gates.app.json`, in de vloer (aanbeveling van de hoofdsessie, vooraf aanvaard door de eigenaar op 2026-11-16).
- **OV-2 ✅ besloten** — Mag een app-rij versoepelen: nee, alleen toevoegen en aanscherpen; een poging is rood in check-docs en telt bij het lezen niet (aanbeveling, vooraf aanvaard).
- **OV-3 ✅ besloten** — `altijdVragen` en `agent` in een app-rij: niet toegestaan, om de ask-spiegel in `.claude/settings.json` en de standaard `eigenaar` niet te ondergraven (aanbeveling van de hoofdsessie, volgt uit OV-2).
