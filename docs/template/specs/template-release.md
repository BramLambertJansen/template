---
status: goedgekeurd
namespace: template-release
---

# Templaterelease als eenheid van een update, changelogfragmenten en `pnpm template:status`

## Doel

Een app werkt bij naar een getagde templaterelease in plaats van naar `template/main`, ziet met één alleen-lezend commando welke releases en "Bij een update"-notities nog openstaan, en PR's in de template botsen niet meer op `docs/template-changelog.md`.

## Rollen en wie wat ziet

Geen route, permissie of scherm. Het raakt wie de template uitbrengt (eigenaar en hoofdsessie), wie een app bijwerkt (eigenaar of agent) en elke template-PR (een fragment in plaats van een regel in de wijzigingenlijst).

## Het probleem

- **Updates volgen geen release (F3).** `TEMPLATE_VERSION` (`src/core/shared/template-version.ts`) staat op `0.1.0`, terwijl onder `## [Unreleased]` in `docs/template-changelog.md` tientallen wijzigingen staan, een deel met "Bij een update". De procedure in `docs/nieuwe-app.md` merget `template/main`; na de merge noemt de app dezelfde versie als ervoor, dus bij de volgende update ziet ze niet welke notities ze al heeft uitgevoerd.
- **Conflicthotspot (F8).** Elke template-PR voegt een regel toe bovenaan dezelfde secties van `docs/template-changelog.md`; twee open PR's conflicteren daar vrijwel altijd (op 2026-11-18 twee keer).
- **Notities zonder vaste plek.** "Bij een update" staat nu meestal midden in een lijstitem, soms in een eigen sectie; een script kan ze niet betrouwbaar per release vinden.

## Ontwerp

Volgt de besluiten van de eigenaar bij OV-1 tot en met OV-8 (2026-11-18).

- **Release.** Een release is een commit op `main` van de template met een releasekop `## [x.y.z] - JJJJ-MM-DD` in `docs/template-changelog.md`, `TEMPLATE_VERSION` gelijk aan `x.y.z` (de test van release-versie/AC-1 blijft gelden) en een geannoteerde tag `template-vx.y.z` op die commit. Versieschema: semver in de `0.x`-reeks, minor bij een release met minstens één "Bij een update"-notitie, anders patch; `1.0.0` alleen op een eigen besluit (OV-1). De eigenaar tagt met de hand na de merge van de release-PR, op de squash-commit van die PR op `main` (OV-2); de agent tagt niet, zoals bij `v0.1.0` (spec release-versie, "De tag"). Een release-tag is onveranderlijk: verplaatsen of opnieuw zetten mag niet; een fout herstel je met een nieuwe release. `v0.1.0` blijft bestaan; de eigenaar zet `template-v0.1.0` op dezelfde commit, zodat elke release één naamvorm heeft (OV-3).
- **Waarom `template-v`.** Een app kan haar eigen productiereleases als `v*` taggen (R-REL-01 eist een release-tag voor productie, maar schrijft geen vorm voor). Met dezelfde vorm zou een opgehaalde templatetag met een apptag kunnen botsen; met het voorvoegsel niet.
- **Changelogfragmenten.** Een template-PR met een wijziging die een gebruiker of app merkt, voegt een fragment toe in `docs/template-changelog.d/` (OV-4). De naam is de branchnaam in kleine letters, met elk teken buiten `[a-z0-9-]` vervangen door `-` (`docs/spec-template-release` wordt `docs-spec-template-release.md`, `chore/template-release-0.3.0` wordt `chore-template-release-0-3-0.md`, `dependabot/npm_and_yarn/vite-7.1.2` wordt `dependabot-npm-and-yarn-vite-7-1-2.md`). Een fragment heeft één `soort`; heeft een PR items van meer dan één soort, dan voegt ze per soort een fragment toe met achtervoegsel `-2`, `-3` (`docs-spec-template-release-2.md`). Vorm:

  ```markdown
  ---
  soort: toegevoegd
  ---

  - <wat verandert, met spec en pad>

  ### Bij een update

  - <wat een app moet doen, zelfstandig leesbaar>
  ```

  `soort` is één van `toegevoegd`, `gewijzigd`, `opgelost`, `verwijderd`, `documentatie`. Daarna minstens één lijstitem; de enige toegestane kop is `### Bij een update`, met minstens één lijstitem eronder. `docs/template-changelog.d/README.md` legt de vorm uit en is geen fragment.
- **`[Unreleased]` blijft, maar leeg.** De kop `## [Unreleased]` blijft de eerste kop (release-versie/AC-1) met alleen de zin "Nog niet uitgebrachte wijzigingen staan als fragment in `docs/template-changelog.d/`." Een lijstitem of `###`-kop eronder is rood (AC-5); zo ziet een PR die het oude patroon volgt meteen waar de regel heen moet.
- **Herkenning van de template.** `template:release`, `template:status` en `driftVanRepo` herkennen de template met `onderhoudVan` uit `rails/hooks/lib/padtabel.mjs` (zonder imports, bedoeld als gedeelde parser) op de waarde van `onderhoud` in de geparste `.claude/gates.json`: geeft ze `undefined`, dan is het geen template. Bij een ongeldige vorm gooit `onderhoudVan`; `template:release` en `template:status` stoppen dan met exit 1 en die melding, zoals check-docs (`docs:gates:onderhoud`) de vorm al hard toetst. `driftVanRepo` blijft adviserend en telt een ontbrekend, onleesbaar of ongeldig bestand als `template: false`. Er komt geen nieuwe parser. De bestaande ontledingen (`isTemplateRepo` in `scripts/kit/check-core.mjs`, `isTemplate` in `scripts/kit/check-migrations.mjs`, `onderhoudRepo` in `scripts/kit/leerpunt-check.mjs`) blijven ongewijzigd; ze samenvoegen valt buiten deze spec.
- **Releasekoppen, één ontleding.** `scripts/kit/template-release.mjs` exporteert `releasesUit(changelog)`: de releases onder `## [Unreleased]` op volgorde van de lijst, elk `{ versie, datum, notities }` (`notities`: de lijstitems onder `### Bij een update` van die release, als tekst). De functie gooit met dezelfde meldingen als nu `latestRelease` in `test/scripts/template-version.test.ts` ("de eerste kop is niet …", "geen releasekop …", "releasekop zonder de vorm …"). `template:release`, `template:status` en de test van release-versie/AC-1 gebruiken alle drie deze functie; `latestRelease` in de test wordt `releasesUit(changelog)[0].versie`, met dezelfde verwachtingen. Het script draait zijn CLI alleen als het zelf wordt aangeroepen (zoals `scripts/kit/check-docs-drift.mjs`), zodat importeren niets doet.
- **`pnpm template:release <x.y.z>`** (`scripts/kit/template-release.mjs`), alleen in de template. Het script voegt alle fragmenten samen tot een releasesectie direct onder het `[Unreleased]`-blok, met de subkoppen `### Toegevoegd`, `### Gewijzigd`, `### Opgelost`, `### Verwijderd`, `### Documentatie`, `### Bij een update` in die volgorde (lege weggelaten, items op volgorde van bestandsnaam), zet `TEMPLATE_VERSION` op `x.y.z` en verwijdert de verwerkte fragmenten. Optie `--datum JJJJ-MM-DD`, anders de datum van vandaag. Het script commit niet, pusht niet en tagt niet. Gebruik: de hoofdsessie maakt op verzoek van de eigenaar een release-PR (branch `chore/template-release-x.y.z`) met alleen deze wijziging; na de merge tagt de eigenaar de squash-commit van die PR op `main`.
- **De eerste release.** De bouw-PR knipt het huidige `[Unreleased]` af als `## [0.2.0] - <datum>` en zet `TEMPLATE_VERSION` op `0.2.0` (OV-6); zo is AC-5 vanaf die PR groen. De bestaande items gaan ongewijzigd mee, plus een item voor deze wijziging zelf; elke "Bij een update"-zin uit een lijstitem onder `[Unreleased]` komt daarnaast als zelfstandig leesbaar lijstitem onder `### Bij een update` van `0.2.0`. De sectie `[0.1.0]` blijft ongewijzigd, ook haar zin "De template heeft nog geen releaseversies …": een uitgebrachte release verandert niet. Dat is eenmalig handwerk in de diff, getoetst door de reviewer, geen blijvende test. Na de merge tagt de eigenaar de squash-commit van de bouw-PR op `main` als `template-v0.2.0`. Fragmenten die vóór die merge op `main` komen, gaan mee in de volgende release.
- **`pnpm template:status`** (`scripts/kit/template-status.mjs`), alleen-lezend: geen fetch, geen netwerk, geen schrijfactie in werkmap of `.git`; het leest de werkmap en lokale refs. Exitcode 0 als het iets kan melden (ook als de app achterloopt: de controle is adviserend, ST-12); 1 alleen als de template-ref of `.claude/gates.json` onleesbaar is, of `onderhoud` een ongeldige vorm heeft.
  - **In een app** leest het `TEMPLATE_VERSION` uit de werkmap, de releases met `releasesUit` uit `refs/remotes/template/main:docs/template-changelog.md` en de lokale tags `refs/tags/template-v*`. Het meldt de versie van de app, de nieuwste release, elke nieuwere release op oplopende versie met haar notities, een release zonder tag, en een app die templatecommits na haar release heeft die in geen release zitten. Ontbreekt `template-v<TEMPLATE_VERSION van de app>` lokaal, dan is die laatste controle niet te berekenen: het meldt dan alleen de ontbrekende tag voor die versie en slaat de waarschuwing over templatecommits over. Tags `v*` leest het niet.
  - **In de template** meldt het `TEMPLATE_VERSION`, of `template-v<TEMPLATE_VERSION>` lokaal bestaat, en het aantal fragmenten dat op een release wacht, waarvan hoeveel met "Bij een update".
- **Updateprocedure.** "Een template-update binnenhalen" in `docs/nieuwe-app.md` merget een tag; `template/main` komt in de stappen niet meer voor als bron van de merge of de namen:
  1. `git fetch --no-tags template main` en `git fetch --no-tags template 'refs/tags/template-v*:refs/tags/template-v*'`. De expliciete `--no-tags` haalt geen `v*`-tags van de template mee, die met apptags kunnen botsen; zonder `+` in de refspec faalt de fetch als de template een tag zou hebben verplaatst, in plaats van stil andere inhoud onder dezelfde versie binnen te halen. Geen `git config`: de procedure schrijft de git-configuratie niet.
  2. De openstaande releases en notities lezen. Heeft de app `pnpm template:status` (haar `TEMPLATE_VERSION` is `0.2.0` of hoger), dan daarmee. Heeft ze het nog niet (haar `TEMPLATE_VERSION` is lager dan `0.2.0`), lees dan per release boven haar versie de notities met `git show template-v<x.y.z>:docs/template-changelog.md`; na de merge van `template-v0.2.0` of later bestaat het commando.
  3. branch `chore/template-v<x.y.z>` vanaf `origin/main`, `git merge --no-edit template-v<x.y.z>` (de nieuwste release; tussenliggende releases sla je over in de merge, niet in de notities);
  4. conflicten oplossen zoals nu, met core en `docs/template` uit de tag: `git checkout template-v<x.y.z> -- src/core docs/template`;
  5. de notities van elke openstaande release uitvoeren, op oplopende versie.

  De stappen daarna (install, migraties, gates, push, merge-commit, ruleset) blijven, met de PR-titel `chore: template-update template-v<x.y.z>`. In de fouttabel wordt het herstel bij `check-core` `git checkout template-v<x.y.z> -- src/core docs/template`, en de oorzaak "geen echte merge van een `template-v`-tag". Zou de conflictstap core uit `template/main` halen terwijl daar al commits na de tag staan, dan is core in de merge niet gelijk aan de tweede ouder en wordt `check-core` rood (ADR 0040 punt 16); daarom noemt de procedure overal de tag. `check-core` zelf blijft werken zonder codewijziging: een tag van de template staat op `main` van de template, dus de tweede ouder is een voorouder van `template/main`. `check:migrations` leest de template-ref zoals nu; de rijen voor `check:migrations` in de fouttabel blijven (`git fetch --no-tags template main` in plaats van `git fetch template main`).
- **Ontbrekend fragment** (OV-5). `check:docs-drift` waarschuwt in de template (niet in een app) als een PR een pad buiten `docs/` en `test/` wijzigt dat geen testbestand is (dezelfde `TEST`-regex als nu) en niet gegenereerd is (dezelfde `GEGENEREERD`-set), zonder bestand in `docs/template-changelog.d/`. Nooit een blokkade, zoals de bestaande waarschuwing; de reviewer beoordeelt of een app het merkt. Vorm: `driftWaarschuwing(paden, { template = false } = {})`; de standaard is app-gedrag, zodat bestaande aanroepen en tests ongewijzigd blijven. `driftVanRepo` bepaalt `template` zoals onder "Herkenning van de template". Gelden beide waarschuwingen, dan voegt de functie ze samen met `; ` (eerst die over `src/`) en blijft de exitcode 0.

## Kopieer de vorm van

- `scripts/kit/check-migrations.mjs` met `test/rails/check-migrations.test.ts`: een pure functie plus fixture-repo's. De herkenning van de template kopieer je niet: die komt uit `onderhoudVan` (zie Ontwerp, "Herkenning van de template").
- `scripts/kit/check-core.mjs`: de template-ref lezen en dicht falen met het herstelcommando in de melding.
- `test/scripts/template-version.test.ts`: de meldingen bij een ongeldige releasekop, die `releasesUit` overneemt.
- `scripts/kit/check-docs-drift.mjs` met `test/rails/check-docs-drift-template-changelog.test.ts`: een waarschuwing die nooit blokkeert, en een CLI die alleen draait als het script zelf wordt aangeroepen.
- `scripts/kit/check-docs.mjs`: een regel met een eigen meldingscode per bestand.

## Hergebruik en UX

Geen schermen. Uitvoer van `pnpm template:status`, letterlijk (`<…>` wordt ingevuld; regels zonder inhoud vallen weg):

In een app:

```
Templateversie van deze app: <versie>
Nieuwste release: <versie> (template-v<versie>, <datum>)
Bijgewerkt: geen openstaande releases.
```

of, bij achterstand, in plaats van de regel "Bijgewerkt: …":

```
Openstaande releases: <versie>, <versie>

Bij een update naar <versie>:
- <notitie>
Bij een update naar <versie>: geen notities.
```

Waarschuwingen, elk op een eigen regel na de rest:

- `Let op: release <versie> staat in de wijzigingenlijst van template/main, maar de tag template-v<versie> ontbreekt lokaal; haal de tags op (stap 1 van "Een template-update binnenhalen") of wacht op de tag van de eigenaar.`
- `Let op: deze app bevat templatecommits na template-v<versie> die in geen release zitten; hun notities staan nog niet in een release.`

Fouten (exit 1):

- `✗ template:status: refs/remotes/template/main is niet te lezen; haal de template op met git fetch --no-tags template main`
- `✗ template:status: <melding van onderhoudVan of de JSON-fout>` bij een onleesbare `.claude/gates.json` of een ongeldige vorm van `onderhoud`; `template:release` gebruikt dezelfde vorm met `✗ template:release:`.

In de template:

```
Templateversie: <versie>
Tag: template-v<versie> (lokaal aanwezig)
Wachtend op een release: <n> fragmenten, waarvan <m> met "Bij een update".
```

met `Tag: template-v<versie> ontbreekt lokaal; de eigenaar tagt de squash-commit van de release-PR op main.` als de tag ontbreekt.

Waarschuwing van `check:docs-drift`: `geen changelogfragment in docs/template-changelog.d/; voeg er een toe als een app of gebruiker deze wijziging merkt`. Samen met de bestaande waarschuwing: `<bestaande waarschuwing over src/>; geen changelogfragment in docs/template-changelog.d/; …`.

## Acceptatiecriteria

Bestaande tests blijven groen (een voorwaarde, geen eigen criterium); release-versie/AC-1 tot en met AC-3 blijven ongewijzigd gelden, ook nu AC-1 via `releasesUit` ontleedt.

- **template-release/AC-1** — `check-docs` keurt een geldig fragment goed. Rood met `docs:changelog-fragment:<bestand>` en de reden bij: ontbrekende of onbekende `soort`; geen lijstitem; een andere kop dan `### Bij een update`; `### Bij een update` zonder lijstitem; een bestandsnaam die niet aan `^[a-z0-9][a-z0-9-]*\.md$` voldoet. `README.md` in de map wordt niet als fragment getoetst.
- **template-release/AC-2** — `template:release 0.3.0 --datum 2026-12-01` in een fixture-template met `TEMPLATE_VERSION` `0.2.0` en drie fragmenten (`b.md` toegevoegd, `a.md` opgelost met notitie, `c.md` toegevoegd): de wijzigingenlijst krijgt direct onder het `[Unreleased]`-blok `## [0.3.0] - 2026-12-01` met `### Toegevoegd` (items van `b`, dan `c`), `### Opgelost` (`a`) en `### Bij een update` (de notitie van `a`), zonder lege subkoppen; het `[Unreleased]`-blok en oudere releases zijn byte-gelijk; `TEMPLATE_VERSION` is `'0.3.0'`; de drie fragmenten zijn weg en `README.md` staat er nog; `releasesUit` op de nieuwe lijst geeft als eerste `{ versie: '0.3.0', datum: '2026-12-01' }` met precies de notitie van `a`.
- **template-release/AC-3** — `template:release` stopt met exit 1 en wijzigt geen bestand bij: een versie die geen semver is; een versie niet hoger dan `TEMPLATE_VERSION`; alleen het patchnummer verhoogd terwijl een fragment een `### Bij een update` heeft (OV-1); geen fragmenten; een ongeldig fragment (melding zoals AC-1); uitvoering in een app (geen `onderhoud` in `.claude/gates.json`); een `onderhoud` met ongeldige vorm (de melding van `onderhoudVan`).
- **template-release/AC-4** — `template:status` in een fixture-app op `0.3.0`, met `template/main` waarvan de nieuwste release `0.3.0` is en tag `template-v0.3.0` lokaal: precies "Templateversie van deze app: 0.3.0", "Nieuwste release: 0.3.0 (template-v0.3.0, <datum>)" en "Bijgewerkt: geen openstaande releases.", geen waarschuwing, exit 0.
- **template-release/AC-5** — Onder `## [Unreleased]` in `docs/template-changelog.md` staat geen lijstitem en geen `###`-kop; een test faalt bij één van beide, met een melding die `docs/template-changelog.d/` noemt.
- **template-release/AC-6** — `template:status` in een fixture-app op `0.2.0`, met releases `0.3.0` (één notitie) en `0.4.0` (geen notities) op `template/main` en beide tags lokaal: "Openstaande releases: 0.3.0, 0.4.0", daarna de notitie onder "Bij een update naar 0.3.0:" en "Bij een update naar 0.4.0: geen notities.", exit 0. Een notitie uit een oudere release (`0.2.0` of lager) staat niet in de uitvoer.
- **template-release/AC-7** — Zelfde app, tag `template-v0.4.0` ontbreekt lokaal: de uitvoer van AC-6 plus de waarschuwing over de ontbrekende tag voor `0.4.0`, exit 0. Een app op `0.3.0` waarvan `HEAD` een templatecommit bevat die na `template-v0.3.0` komt en in geen tag zit: de waarschuwing "templatecommits na template-v0.3.0", exit 0; zonder zo'n commit ontbreekt die regel. Een app op `0.3.0` met release `0.3.0` op `template/main` maar zonder lokale tag `template-v0.3.0`: alleen de waarschuwing over de ontbrekende tag voor `0.3.0`, geen waarschuwing over templatecommits, exit 0. Een lokale tag `v0.1.0` die naar een templatecommit wijst, verandert de uitvoer van geen van deze gevallen.
- **template-release/AC-8** — Zonder `refs/remotes/template/main`: de foutregel over de template-ref, exit 1. Met `"onderhoud": "kapot"` in `.claude/gates.json`: de foutregel met de melding van `onderhoudVan`, exit 1. In elk geval van AC-4, AC-6, AC-7 en AC-8 zijn `git for-each-ref` en `git status --porcelain` na afloop gelijk aan ervoor, ook als de remote `template` naar een onbereikbare URL wijst.
- **template-release/AC-9** — `template:status` in een fixture-template op `0.3.0` met twee fragmenten, waarvan één met notitie: "Templateversie: 0.3.0", de tagregel (aanwezig en, in een tweede geval, ontbrekend) en "Wachtend op een release: 2 fragmenten, waarvan 1 met "Bij een update".", exit 0.
- **template-release/AC-10** — `driftWaarschuwing(paden, { template: true })` geeft de fragmentwaarschuwing bij een gewijzigd pad buiten `docs/` en `test/` zonder pad onder `docs/template-changelog.d/` (bijv. `['package.json']`); geen fragmentwaarschuwing als zo'n pad meewijzigt, als alleen `docs/` of `test/` wijzigt, als alleen een testbestand buiten `test/` wijzigt (`['src/core/shared/cursor.test.ts']`), of zonder optie (`driftWaarschuwing(['package.json'])` is `null`, `driftWaarschuwing(['src/api/routes/notes.ts', 'docs/template-changelog.md'])` is `null`). Met `{ template: true }` en `['src/api/routes/notes.ts']` geeft ze beide waarschuwingen in één string, eerst die over `src/`, gescheiden door `; `. `driftVanRepo` op een fixture-repo met `onderhoud.repository` in `.claude/gates.json` geeft de fragmentwaarschuwing; op dezelfde repo zonder die sleutel, en met `"onderhoud": "kapot"`, niet. De bestaande waarschuwing over `src/` zonder docs blijft zoals in release-versie/AC-10; het script eindigt nog steeds altijd met exit 0.

Documentatie, getoetst door de reviewer en niet door een test: "Een template-update binnenhalen" in `docs/nieuwe-app.md` volgt het ontwerp (tag in plaats van `template/main` in merge, conflictstap, branchnaam, PR-titel en fouttabel bij `check-core`; fetch met `--no-tags` en een refspec zonder `+`; geen `git config`; `git merge --no-edit`) en heeft geen tweede procedure ernaast; stap 2 noemt beide bronnen voor de notities: `pnpm template:status` vanaf `0.2.0`, en `git show template-v<x.y.z>:docs/template-changelog.md` voor een app met een lagere `TEMPLATE_VERSION`, zodat geen stap een commando gebruikt dat pas met een latere stap binnenkomt. De kop van `docs/template-changelog.md` noemt fragmenten, `template:release`, de tagvorm en dat een release-tag niet verplaatst; `docs/template-changelog.d/README.md` beschrijft de fragmentvorm en de naamregel. Na de bouw geeft `git grep -n -F -e 'git merge template/main'` alleen nog treffers in historische stukken (`docs/reviews/`, gebouwde specs en hun fixtures, de koppeling met `-s ours`) en in ADR-tekst met een `Herzien:`-regel die 0093 noemt; elk ander treffer is een doc die de bouw-PR vergat (zie "Raakt ook").

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Release-PR gemerged, eigenaar heeft nog niet getagd | `template:status` in de template meldt dat de tag ontbreekt; in een app de waarschuwing van AC-7. Een app wacht op de tag | n.v.t. |
| De template verplaatst een al opgehaalde tag (fout) | De fetch van stap 1 faalt omdat de refspec geen `+` heeft; de app merget niets en meldt het de eigenaar. Een release-tag is onveranderlijk (ADR 0094) | n.v.t. |
| Een fragment wordt gemerged nadat `template:release` draaide maar vóór de merge van de release-PR | Het staat na de squash in de getagde commit maar niet in de release; de volgende release neemt het mee. In een app onschadelijk: `template:status` leest geen fragmenten in een app, en `check-docs` keurt het als geldig fragment | n.v.t. |
| Twee PR's met dezelfde branchnaam na elkaar | Het tweede fragment geeft een add/add-conflict op hetzelfde bestand; de PR voegt de tekst samen | n.v.t. |
| Een app slaat releases over | Ze merget de nieuwste tag en voert de notities van elke tussenliggende release uit, op oplopende versie (AC-6) | n.v.t. |
| Een app merget toch `template/main` (bijv. een dringende fix vóór een release) | `check-core` accepteert het (voorouder van `template/main`); `template:status` waarschuwt dat de app templatecommits buiten een release heeft (AC-7). De notities volgen met de volgende release | n.v.t. |
| App met een eigen tag `v0.1.0` | De fetch met `--no-tags` haalt `v0.1.0` van de template niet op; geen botsing | n.v.t. |
| App die eerder zonder `--no-tags` ophaalde en `v0.1.0` van de template lokaal heeft | `template:status` leest geen `v*`-tags en meldt niets (AC-7). De procedure noemt bij stap 1 de controle: een lokale `v*`-tag die niet in `git ls-remote --tags origin` staat, komt van de template; verwijder hem lokaal met `git tag -d <tag>` voordat de app zelf tagt of `git push --tags` gebruikt | n.v.t. |
| `template-v<TEMPLATE_VERSION van de app>` ontbreekt lokaal (de app merget `template/main` vóór de tag, of haalde de tags niet op) | Alleen de waarschuwing over de ontbrekende tag voor die versie; de controle op templatecommits buiten een release vervalt tot de tag er is (AC-7) | n.v.t. |
| Nieuwe app, gekoppeld aan `template/main` terwijl daar commits na de laatste release staan | De koppeling (`-s ours`) blijft op `template/main`; `template:status` waarschuwt voor templatecommits buiten een release tot de app de volgende tag merget | n.v.t. |
| Fragmentnaam bij een branch met hoofdletters, punten of underscores | De naamregel maakt er kleine letters en `-` van, zodat de naam aan AC-1 voldoet | n.v.t. |
| App van vóór deze spec (`TEMPLATE_VERSION` `0.1.0`, alleen `template/main` gemerged) | Ze heeft `pnpm template:status` nog niet; stap 2 leest de notities per release boven `0.1.0` met `git show template-v<x.y.z>:docs/template-changelog.md`. Na de merge van `template-v0.2.0` of later bestaat het commando en toont het geen openstaande release tot de volgende | n.v.t. |
| Template-PR met alleen een fragment onder `docs/` en een wijziging in `src/` | Het fragment telt als docs-wijziging en dempt de bestaande waarschuwing "src/ zonder docs", net als nu een regel in de wijzigingenlijst (release-versie/AC-10). Bewuste keuze: de reviewer beoordeelt de docs bij elke PR | n.v.t. |
| PR die alleen testbestanden wijzigt, ook `src/**/*.test.ts` | Geen fragmentwaarschuwing (AC-10) | n.v.t. |

## Raakt ook

- **Kritiek werk** door `package.json` (schrijven `altijdVragen`, besluit `besluit-pr` volgens `node scripts/kit/feiten.mjs pad package.json`) en door het nieuwe ADR: de eigenaar keurt de PR goed. `scripts/**` (`voorReview`, besluit eigenaar) en `docs/nieuwe-app.md` (gate) zijn op zichzelf niet kritiek. In de template staan spec, ADR, code en tests van kritiek werk in één PR (R-WERK-05, ADR 0090): deze spec wordt niet los gemerged. De wijziging in `package.json` schrijft de hoofdsessie met akkoord van de eigenaar.
- **Geen risicowerk** (R-WERK-04): de bewaking van de grens tussen core en app (`scripts/kit/check-core.mjs`, `scripts/kit/check-migrations.mjs`) houdt haar code; alleen de kopregel van check-core gaat de tag noemen. De nieuwe scripts lezen alleen of schrijven alleen werkmapbestanden in de template; `check-docs` krijgt een extra regel die alleen strenger maakt; `check:docs-drift` blijft adviserend. Geen auth, data of vertrouwensgrens; de developer schrijft de tests eerst. Wijzigt de bouw toch code in check-core of check-migrations, dan wordt het risicowerk met een aparte tester vóór de developer.
- **ADR nodig: ja, 0093** (drempel A1: het contract tussen template en app verandert van "merge `template/main`" naar "merge een releasetag"; A4: herziet ADR 0040 punt 1, die na de koppeling "gewone merges" van `template/main` noemt, en ADR 0059 punt 5). Inhoud: release als eenheid van een update, tagvorm `template-v`, versieschema semver `0.x`, de eigenaar tagt met de hand, een release-tag is onveranderlijk. Het ADR komt in dezelfde PR als de bouw (template: geen besluit-PR, ADR 0090); ADR 0040 en ADR 0059 krijgen een `Herzien:`-regel die 0093 noemt (R-CI-05). 0093 is nu het volgende vrije nummer; de bouw kijkt opnieuw met `node scripts/kit/feiten.mjs adr` of een parallelle PR het al nam.
- Nieuw: `scripts/kit/template-release.mjs` (met `releasesUit`), `scripts/kit/template-status.mjs`, `docs/template-changelog.d/README.md`, tests (zie Testplan). Gewijzigd: `package.json` (`template:release`, `template:status`), `scripts/kit/check-docs.mjs` (fragmentregel), `scripts/kit/check-docs-drift.mjs` (optie `template` en fragmentwaarschuwing), de kopregel van `scripts/kit/check-core.mjs` ("updates komen alleen via `git merge template/main`" gaat de tag noemen; geen codewijziging), `docs/template-changelog.md` (kop, `[Unreleased]`-zin en de knip naar `0.2.0`), `src/core/shared/template-version.ts` (`0.2.0`), `docs/nieuwe-app.md` (zie onder).
- Bestaande test met een gewijzigde import (R-TEST-02, reden: deze spec verplaatst de ontleding naar één geëxporteerde functie): `test/scripts/template-version.test.ts` importeert `releasesUit` in plaats van zijn lokale `latestRelease`; de verwachtingen en meldingen blijven gelijk. Verder geen wijziging verwacht: `test/rails/check-docs-drift.test.ts` en `test/rails/check-docs-drift-template-changelog.test.ts` roepen `driftWaarschuwing` zonder optie aan en blijven app-gedrag toetsen; `test/rails/check-core.test.ts`, `test/scripts/template-repo-check-core.test.ts`, `test/rails/check-migrations.test.ts` en `test/scripts/leerpunt-check.test.ts` blijven ongewijzigd, omdat hun scripts ongewijzigd blijven.
- Docs die met de bouw onwaar worden en in dezelfde PR meegaan (R-WERK-15; gevonden met `git grep -n -F -e 'template/main'` in het regelboek, `docs/`, `.claude/rules/` en `README.md`):
  - `docs/framework.md` §10 "Template-updates naar een app" (beschermd regelboek, akkoord van de eigenaar): "Een `template-v<x.y.z>`-tag mergen op een branch via een PR (R-REPO-04); stand en notities met `pnpm template:status`", gevolgd door de bestaande zin over de leerlus (label `leerpunt`, ADR 0059; leerlus/AC-9 in `test/rails/opleveren-skill.test.ts` leest die sectie). Geen spiegel van deze zin gevonden; spiegels volgen volgens `check-docs`.
  - `docs/nieuwe-app.md`: de procedure en fouttabel volgens Ontwerp, plus de zinnen bij de koppeling ("de volgende `git merge template/main`" en "Daarna haalt `git merge template/main` alleen nieuwe template-commits binnen"), die de tag gaan noemen; de koppeling zelf (`-s ours template/main`) blijft.
  - `docs/operations/st-09-praktijkproef.md` stap 4: de app neemt de wijziging over via de eerstvolgende `template-v`-tag (`git merge --no-edit template-v<x.y.z>`), niet via `template/main`; een app op `0.1.0` leest de notities met `git show` (stap 2).
  - `.claude/rules/core.md` ("Core-updates in een app via `git merge template/main`"): wordt "via de merge van een `template-v`-tag". Pad `.claude/**` is `voorReview`: de hoofdsessie of de eigenaar schrijft het, niet de developer.
  - `README.md` ("Latere updates gaan met `git merge template/main`"): wordt de tag, met verwijzing naar "Een template-update binnenhalen".
  - `docs/roadmap.md`: ST-09 "Werk" ("Neem daarna één echte template-update over (`git merge template/main`)") en ST-17 ("bij `git merge template/main` conflicteert") noemen de tag of "een template-update".
  - ADR 0040 en ADR 0059 punt 5 ("Verspreiden via de bestaande `git merge template/main`"): `Herzien:`-regel die 0093 noemt (zie ADR hierboven).
  - Spec `template-update` (gebouwd): de zin "`git merge template/main`" onder "Procedure" gaat in de bouw-PR mee (hoofdsessie), zodat twee levende specs elkaar niet tegenspreken. Spec `release-versie` (gebouwd): ongewijzigd; "De tag" daar (`v0.1.0`) blijft historisch juist.
  - Blijven ongewijzigd, omdat ze historisch of mechanisch juist blijven: `docs/reviews/`, `docs/operations/agent-doorloop.md` (check-core gebruikt `template/main` als referentie), `.claude/skills/opleveren/SKILL.md` (`git merge-base HEAD template/main` als templatebasis in een leerpunt: blijft juist, want een tag staat op `template/main`), en de gebouwde specs `app-agentregels` en `app-padtabel` met hun fixtures (`test/scripts/app-agentregels-merge.test.ts`, `test/scripts/app-padtabel-merge.test.ts`), die het mergen zelf toetsen; een tag merget dezelfde boom.
- `.claude/settings.json` (OV-8): de eigenaar voegt een allow-regel toe voor `pnpm template:status`; niet de developer of de hoofdsessie via de Bash-sandbox. Niet in deze PR: `.github/workflows/` (geen tagworkflow, OV-2).
- Roadmap (OV-7): ST-09 krijgt bij de bouw een voortgangsregel (release als updateeenheid, versieschema semver `0.x` besloten, adviserende `template:status`); ST-12 blijft onder Geparkeerd met zijn "Klaar als" (herkomst bij `app:init`, fixture voor een ontbrekende upgradevoorwaarde, buildmetadata), en de zin "er is nog geen afgesproken versieschema en een update volgt nog `template/main`" in ST-12 wordt bijgewerkt naar de nieuwe stand. Het open punt (1) "CHANGELOG netjes indelen" onder "Open uit die ronde" krijgt het PR-nummer van de bouw-PR (de knip naar `0.2.0`); het nalezen per sectie dat daar ook staat, blijft open. `pnpm check:roadmap` blijft groen.
- Wijzigingenlijst: het item van de bouw-PR staat direct in `0.2.0`, met onder "Bij een update": haal voortaan op met `--no-tags` en merge een `template-v`-tag; draai `pnpm template:status` (vanaf `0.2.0`).

## Buiten scope

Een workflow die tagt of een GitHub Release aanmaakt; een release-branch of backports naar oudere releases; `app:init` die de releasetag in `CHANGELOG.md` van de app noemt (ST-12); een check die afdwingt dat een app op een tag staat; versie en build in de webapp; het samenvoegen van de bestaande ontledingen van `onderhoud` in check-core, check-migrations en leerpunt-check.

## Testplan

- `test/scripts/template-release.test.ts`: AC-2 en AC-3 met fixture-templates in een tijdelijke map (vorm van `test/rails/check-migrations.test.ts`), plus `releasesUit` op de meldingen van release-versie/AC-1.
- `test/scripts/template-status.test.ts`: AC-4, AC-6, AC-7, AC-8 (fixture-app met een lokale `template`-remote en tags) en AC-9 (fixture-template); per geval de vergelijking van `git for-each-ref` en `git status --porcelain` voor en na.
- `test/scripts/template-changelog-unreleased.test.ts`: AC-5 op de echte `docs/template-changelog.md`.
- `test/rails/check-docs-changelog-fragment.test.ts`: AC-1, per reden een fixture-fragment.
- `test/rails/check-docs-drift-fragment.test.ts`: AC-10, de pure functie en `driftVanRepo` op fixture-repo's.
- `test/scripts/template-version.test.ts`: ongewijzigde verwachtingen, nu via `releasesUit`.

## Open vragen

- **OV-1** — Versieschema. ✅ besloten 2026-11-18 (eigenaar): semver `0.x`; minor bij een release met minstens één "Bij een update"-notitie, patch anders, `1.0.0` op een eigen besluit. AC-3 dwingt het af.
- **OV-2** — Wie tagt en wanneer. ✅ besloten 2026-11-18 (eigenaar): de eigenaar tagt met de hand na de merge van een release-PR, op de squash-commit op `main`; de hoofdsessie maakt de release-PR op verzoek. Geen nieuwe schrijfrechten in CI; een vergeten tag is zichtbaar in `template:status` (AC-7, AC-9).
- **OV-3** — Tagvorm. ✅ besloten 2026-11-18 (eigenaar): `template-vx.y.z`, plus `template-v0.1.0` op de commit van `v0.1.0`.
- **OV-4** — Vorm en naam van fragmenten. ✅ besloten 2026-11-18 (eigenaar): `docs/template-changelog.d/<branchnaam>.md` met de naamregel uit Ontwerp, front matter `soort`, een optionele `### Bij een update` en per soort een fragment met achtervoegsel `-2`, `-3`.
- **OV-5** — Eist CI een fragment? ✅ besloten 2026-11-18 (eigenaar): nee, alleen een waarschuwing van `check:docs-drift` in de template; de vorm hard via `check-docs`. Herzien als een release een gemiste notitie blijkt te hebben.
- **OV-6** — Het bestaande `[Unreleased]`. ✅ besloten 2026-11-18 (eigenaar): in de bouw-PR knippen als release `0.2.0`, met de inline notities verzameld onder `### Bij een update`.
- **OV-7** — Roadmap. ✅ besloten 2026-11-18 (eigenaar): het werk valt onder ST-09 (Nu) met een voortgangsregel; ST-12 blijft Geparkeerd voor de rest van zijn "Klaar als".
- **OV-8** — `pnpm template:status` zonder vraag. ✅ besloten 2026-11-18 (eigenaar): ja, als allow-regel in `.claude/settings.json`, door de eigenaar; het commando leest alleen (AC-8).
