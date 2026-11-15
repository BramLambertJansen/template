---
status: gebouwd # #732
namespace: template-update
---

# Een template-update binnenhalen: procedure en volgorde van migraties

## Doel

Een app haalt een nieuwe templateversie binnen met één volledige procedure, en een migratie draait in productie op dezelfde plek als op een verse database, ook als ze via een template-update binnenkomt.

## Rollen en wie wat ziet

Geen wijziging: geen route, permissie of scherm. Het raakt wie een app bijwerkt (de eigenaar of een agent) en wat `check:migrations` en `check:snapshot` weigeren.

## Het probleem

- **De procedure is onvolledig.** `docs/nieuwe-app.md` heeft de sectie "Naslag: template-updates naar de app" (branch, merge, push, ruleset), maar zegt niets over de versie, de "Bij een update"-notities, migraties, het gegenereerde schema of wat te doen bij een rode check.
- **Volgorde.** dbmate (2.36.0, hier overal zonder `--strict`) past elke nog niet toegepaste migratie toe op volgorde van versie, het tijdstempel in de naam. Een migratie met een ouder tijdstempel dan een al toegepaste draait in productie dus ná de nieuwere, en op een verse database ervóór. Raken de twee hetzelfde object, dan verschilt productie van wat de tests zien. Dit gedrag van dbmate is een aanname van buiten de repo; de fixture van AC-7 bewijst haar. `check:migrations` toetst nu alleen de naamvorm en dat een versie uniek is.
- Het ontstaat op twee manieren: een branch met een oudere migratie wordt later gemerged dan een branch met een nieuwere, en een template-update brengt een templatemigratie mee die ouder is dan een migratie die de app al heeft toegepast. Dat tweede komt vaak voor (de template ontwikkelt door, apps mergen later) en de app kan het niet oplossen: een templatemigratie hernoemen mag niet.

## Ontwerp

Twee PR's (zie OV-2). **PR 1: de regel voor eigen migraties en de procedure.**

- **Eigen migraties: altijd later.** `check:migrations` weigert een migratie die in deze branch is toegevoegd en waarvan de versie niet later is dan die van elke migratie op het punt waar de branch van `origin/main` afsplitste. De oplossing is de eigen, nog niet gemergde migratie een nieuw tijdstempel geven. Twee toegevoegde migraties met dezelfde versie vangt de bestaande regel voor dubbele versies; zonder migraties op het afsplitspunt is elke versie later.
- **Uitzondering voor een templatemigratie.** Alleen in een app, en alleen als er een oudere toegevoegde migratie ís (anders geen netwerk en geen lookup): het bestand staat met dezelfde inhoud in de template. De ref is lokaal `refs/remotes/template/main` en in CI een fetch van `TEMPLATE_URL` naar een eigen ref, zoals `check-core` dat doet in `guard.yml`; `check:migrations` draait in `gate:fast`, waar die ref nu niet bestaat, dus de check haalt hem zelf op. Is de template niet te lezen, dan is de check rood met de reden en het commando om hem op te halen. Gelijke inhoud is een houdbare herkenning: een migratie verandert nooit, ook niet in de template. `migratieFouten(root, base, templateRef)` krijgt de ref als parameter, zodat een test hem met een fixture-repo kan zetten.
- **Controle op main achteraf** (eigenaarbesluit 2026-11-15). Een PR die groen was tegen een oudere main, mag gemerged worden zonder bij te werken (de ruleset eist geen bijgewerkte branch), dus twee PR's met elk een migratie kunnen toch in de verkeerde volgorde op main komen. Staat `HEAD` op `origin/main` (ze zijn gelijk; een branch die alleen achterloopt telt niet), dan vergelijkt `check:migrations` met de eerste ouder van `HEAD`: wat de laatste merge toevoegde, moet later zijn dan wat er al stond. De CI op main wordt dan rood; het herstel is een nieuwe migratie, niet een hernoemde.
- **De template herkent zichzelf** aan `onderhoud.repository` in `.claude/gates.json` (`pnpm app:init` haalt die regel weg); daar bestaat de uitzondering niet.
- **Procedure.** De bestaande sectie in `docs/nieuwe-app.md` wordt uitgebreid en heet "Een template-update binnenhalen" (de verwijzing ernaar eerder in het document volgt): de versie en de "Bij een update"-notities in `docs/template-changelog.md` lezen en per versie uitvoeren; een branch vanaf `origin/main`; `git fetch template` en `git merge template/main` als echte merge-commit (geen squash); conflicten oplossen (`CHANGELOG.md` is van de app); `pnpm install`; `pnpm db:migrate` (de lokale database, niet productie) en `pnpm db:generate`, en het gegenereerde schema committen; `pnpm gate:fast`; push (met `.github/workflows/` pusht de eigenaar), PR, CI, merge door de eigenaar; `scripts/github-ruleset.sh` als de verplichte checks wijzigden. Met per rode check wat te doen: `check:migrations`, `check:snapshot`, `check-core`.

**PR 2: bewijs dat de volgorde niet uitmaakt** (OV-1).

- `check:snapshot` bouwt het schema ook op volgorde van binnenkomst als er een toegevoegde migratie is met een oudere versie dan een bestaande: in de tijdelijke invoermap van de runner krijgt elke toegevoegde migratie (niet alleen de oudere) een naam met een versie die later is dan alle bestaande, in hun onderlinge versievolgorde, en één gewone `dbmate up` op een verse database geeft dan de volgorde die productie zag. Verschilt dat schema van de bouw op versievolgorde, of faalt die bouw, dan is de check rood met de namen van de migraties. Zonder zo'n migratie draait de tweede bouw niet.
- **Hoe.** `node scripts/kit/migratie-volgorde.mjs` drukt, zodra er een toegevoegde migratie is die ouder is dan een bestaande (dezelfde selectie als de volgorderegel in `check:migrations`, op main tegen de vorige commit), per toegevoegde migratie één regel `<bestandsnaam> <nieuwe bestandsnaam>` af; anders niets. Alle toegevoegde migraties, want productie heeft de bestaande al en past daarna alle nieuwe toe op versievolgorde: een latere toegevoegde migratie die van een oudere toegevoegde afhangt, moet er dus achter blijven. De nieuwe naam heeft een versie die later is dan elke versie in `db/migrations`, in de onderlinge versievolgorde. `scripts/runner.sh gen-volgorde` doet hetzelfde als `gen`, maar hernoemt eerst die bestanden in de tijdelijke invoermap (nooit in de werkmap). `scripts/check-snapshot.sh` draait eerst `gen` zoals nu en, alleen als het hulpscript regels geeft, daarna `gen-volgorde`, en vergelijkt de twee schemadumps (zonder de onstabiele regels). `pg_dump --schema-only` bevat geen rijen van `schema_migrations`, dus de andere versienummers zelf geven geen verschil.
- Tot PR 2 is een oudere templatemigratie zonder bewijs uitgezonderd; dat staat in de wijzigingenlijst.

## Kopieer de vorm van

- `scripts/kit/check-migrations.mjs` met `test/rails/check-migrations.test.ts` (pure functie `migratieRegels` plus fixture-repo's).
- `scripts/kit/check-core.mjs` voor het ophalen en lezen van de template.
- `scripts/check-snapshot.sh` en de tijdelijke invoermap in `scripts/runner.sh`.

## Hergebruik en UX

Geen schermen. De meldingen van de twee checks zeggen wat er mis is en wat de oplossing is, in één regel per migratie; is de template niet te lezen, dan één regel met alle betrokken namen, want dan is er één oorzaak en één herstel.

## Acceptatiecriteria

PR 1. Documentatie, getoetst door de reviewer en niet door een test (een test legt gedrag vast, geen formulering): `docs/nieuwe-app.md` heeft één sectie "Een template-update binnenhalen" met de stappen uit het ontwerp en geen tweede procedure ernaast; de verwijzing ernaar klopt; `docs/template-changelog.md` verwijst ernaar bovenaan `[Unreleased]`.

- **template-update/AC-1**: Een toegevoegde migratie met een versie later dan alle bestaande: `check:migrations` groen. Met een versie eerder dan een bestaande: rood, met de naam van de migratie, de nieuwste bestaande versie en de aanwijzing om het tijdstempel te vernieuwen. Zonder migraties op het afsplitspunt: groen.
- **template-update/AC-2**: Twee toegevoegde migraties in één branch, beide later dan alle bestaande: groen, ongeacht hun onderlinge volgorde; met dezelfde versie: rood door de bestaande regel voor dubbele versies.
- **template-update/AC-3**: In een app: een toegevoegde, oudere migratie die met dezelfde inhoud in de template-ref staat: groen. Met een andere inhoud: rood. Template-ref niet te lezen: rood, met de reden en het commando. Zonder oudere toegevoegde migratie wordt de template-ref niet gelezen (de check slaagt ook als de ref niet bestaat).
- **template-update/AC-4**: In de template (met `onderhoud.repository` in `.claude/gates.json`) bestaat de uitzondering niet: elke toegevoegde migratie moet later zijn, ook als de template-ref bestaat.
- **template-update/AC-5**: De bestaande regels van `check:migrations` blijven: gewijzigde of verwijderde migratie, naamvorm, dubbele versie, onleesbare `origin/main`.
- **template-update/AC-8**: Op main zelf (`HEAD` gelijk aan `origin/main`): voegde de laatste merge een migratie toe die ouder is dan een migratie van de eerste ouder, dan is `check:migrations` rood met de naam en de aanwijzing dat het herstel een nieuwe migratie is; voegde hij een latere toe, of niets, dan groen. Een eerste commit zonder ouder: groen. De vergelijking geldt voor elke commit op main, ook een gewone (geen merge). De uitzondering van AC-3 geldt hier ook: in een app is een oudere migratie die met dezelfde inhoud in de template-ref staat groen, anders zou main na elke template-update met een oudere templatemigratie rood blijven.

PR 2:

- **template-update/AC-7**: `check:snapshot` met een toegevoegde, oudere migratie die niets raakt wat een nieuwere raakt: groen. Met een oudere migratie waarvan het resultaat van de volgorde afhangt (twee migraties die dezelfde kolomstandaard zetten): rood, met de namen van de toegevoegde migraties. Faalt de bouw op volgorde van binnenkomst (fixture: een oudere migratie die een kolom verplicht maakt nadat een nieuwere rijen heeft ingevoegd): rood, met de naam van de migratie. Zonder toegevoegde oudere migratie draait de tweede bouw niet. Getoetst op twee niveaus: het hulpscript met fixture-repo's (welke migraties, welke nieuwe namen, ook in een app met een templatemigratie en op main), en `check-snapshot.sh` met een nagebootste `scripts/runner.sh` die per doel een vaste dump schrijft (gelijk, verschillend, falend). De echte dubbele bouw met dbmate draait alleen in de runner: in CI zodra een PR zo'n migratie heeft, of bij de eigenaar.

## Raakt ook

- Risicowerk (een gate, de volgorde van migraties op bestaande rijen): aparte tester. R-DB-07 verandert, dus de eigenaar keurt goed.
- PR 1: `scripts/kit/check-migrations.mjs`, `test/rails/check-migrations.test.ts` volgt alleen als een bestaand geval een oudere toegevoegde migratie als groen vastlegt, `.github/workflows/ci.yml` alleen als `gate:fast` de template-URL als omgevingsvariabele nodig heeft (dan pusht de eigenaar de branch), `docs/nieuwe-app.md`, `docs/template-changelog.md`, `docs/framework.md` R-DB-07 met spiegel in `.claude/rules/database.md`, de skill `migratie`.
- PR 2: `scripts/check-snapshot.sh` en `scripts/runner.sh` (bestanden die de host uitvoert: de runner draait ze pas na de merge of met `--sta-wijzigingen-toe` door de eigenaar).

## Buiten scope

- De controle op main achteraf ziet niet elke commit: de CI annuleert een lopende run op main als er een nieuwe merge komt (`cancel-in-progress`), en de check vergelijkt alleen de laatste commit met zijn ouder. Bij snel opeenvolgende merges kan een te oude migratie in een eerdere merge dus ongemeld blijven. Sluiten vraagt een workflowwijziging (vergelijken met de vorige gepushte stand, of geen annulering op main); dat is een vervolg voor de eigenaar.
- De tak waarin de check de template zelf ophaalt (in CI, als de lokale ref ontbreekt) heeft geen test; het eerste bewijs is de CI van een app met een oudere templatemigratie.
- Data-effecten: de vergelijking in PR 2 is `pg_dump` van het schema; rijen die een migratie invoegt of bijwerkt, vallen erbuiten.
- De tweede bouw geeft de volgorde van binnenkomst als main na elke merge is uitgerold. Rolt een app meerdere merges tegelijk uit, dan draait productie ze op versievolgorde en valt dat samen met de verse bouw; beide gevallen zijn dus gedekt.
- App-configuratie naast templateconfiguratie; een migratie-runbook voor productie (deel C); `dbmate --strict` in de uitrol (maakt een update net zo vast als weigeren).

## Open vragen

Geen. Besloten door de eigenaar op 2026-11-15:

- **OV-1**: bewijzen dat de volgorde niet uitmaakt, met de tweede bouw in `check:snapshot` (PR 2).
- **OV-3**: het gat van een verouderde maar groene PR krijgt een controle op main achteraf (AC-8); de ruleset eist geen bijgewerkte branch.

Keuze van de hoofdsessie, met instemming van de spec-review: twee PR's, eerst de regel en de procedure, dan de tweede bouw (OV-2).
