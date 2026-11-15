---
status: voorstel
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
- **De template herkent zichzelf** aan `onderhoud.repository` in `.claude/gates.json` (`pnpm app:init` haalt die regel weg); daar bestaat de uitzondering niet.
- **Procedure.** De bestaande sectie in `docs/nieuwe-app.md` wordt uitgebreid en heet "Een template-update binnenhalen" (de verwijzing ernaar eerder in het document volgt): de versie en de "Bij een update"-notities in `docs/template-changelog.md` lezen en per versie uitvoeren; een branch vanaf `origin/main`; `git fetch template` en `git merge template/main` als echte merge-commit (geen squash); conflicten oplossen (`CHANGELOG.md` is van de app); `pnpm install`; `pnpm db:migrate` (de lokale database, niet productie) en `pnpm db:generate`, en het gegenereerde schema committen; `pnpm gate:fast`; push (met `.github/workflows/` pusht de eigenaar), PR, CI, merge door de eigenaar; `scripts/github-ruleset.sh` als de verplichte checks wijzigden. Met per rode check wat te doen: `check:migrations`, `check:snapshot`, `check-core`.

**PR 2: bewijs dat de volgorde niet uitmaakt** (OV-1).

- `check:snapshot` bouwt het schema ook op volgorde van binnenkomst als er een toegevoegde migratie is met een oudere versie dan een bestaande: in de tijdelijke invoermap van de runner krijgen alleen die migraties een kopie onder een versie die later is dan alle bestaande, en één gewone `dbmate up` op een verse database geeft dan de volgorde die productie zag. Verschilt dat schema van de bouw op versievolgorde, of faalt die bouw, dan is de check rood met de namen van de migraties. Zonder zo'n migratie draait de tweede bouw niet.
- Tot PR 2 is een oudere templatemigratie zonder bewijs uitgezonderd; dat staat in de wijzigingenlijst.

## Kopieer de vorm van

- `scripts/kit/check-migrations.mjs` met `test/rails/check-migrations.test.ts` (pure functie `migratieRegels` plus fixture-repo's).
- `scripts/kit/check-core.mjs` voor het ophalen en lezen van de template.
- `scripts/check-snapshot.sh` en de tijdelijke invoermap in `scripts/runner.sh`.

## Hergebruik en UX

Geen schermen. De meldingen van de twee checks zeggen wat er mis is en wat de oplossing is, in één regel per migratie.

## Acceptatiecriteria

PR 1:

- **template-update/AC-1**: Een toegevoegde migratie met een versie later dan alle bestaande: `check:migrations` groen. Met een versie eerder dan een bestaande: rood, met de naam van de migratie, de nieuwste bestaande versie en de aanwijzing om het tijdstempel te vernieuwen. Zonder migraties op het afsplitspunt: groen.
- **template-update/AC-2**: Twee toegevoegde migraties in één branch, beide later dan alle bestaande: groen, ongeacht hun onderlinge volgorde; met dezelfde versie: rood door de bestaande regel voor dubbele versies.
- **template-update/AC-3**: In een app: een toegevoegde, oudere migratie die met dezelfde inhoud in de template-ref staat: groen. Met een andere inhoud: rood. Template-ref niet te lezen: rood, met de reden en het commando. Zonder oudere toegevoegde migratie wordt de template-ref niet gelezen (de check slaagt ook als de ref niet bestaat).
- **template-update/AC-4**: In de template (met `onderhoud.repository` in `.claude/gates.json`) bestaat de uitzondering niet: elke toegevoegde migratie moet later zijn, ook als de template-ref bestaat.
- **template-update/AC-5**: De bestaande regels van `check:migrations` blijven: gewijzigde of verwijderde migratie, naamvorm, dubbele versie, onleesbare `origin/main`.
- **template-update/AC-6**: `docs/nieuwe-app.md` heeft één sectie "Een template-update binnenhalen" met de stappen uit het ontwerp en geen tweede procedure ernaast; de verwijzing ernaar klopt; `docs/template-changelog.md` verwijst ernaar bovenaan `[Unreleased]`.

PR 2:

- **template-update/AC-7**: `check:snapshot` met een toegevoegde, oudere migratie die niets raakt wat een nieuwere raakt: groen. Met een oudere migratie waarvan het resultaat van de volgorde afhangt (fixture: twee migraties die dezelfde kolomstandaard zetten): rood, met beide namen. Faalt de bouw op volgorde van binnenkomst (fixture: een oudere migratie die een kolom verplicht maakt nadat een nieuwere rijen heeft ingevoegd): rood, met de naam van de migratie. Zonder toegevoegde oudere migratie draait de tweede bouw niet.

## Raakt ook

- Risicowerk (een gate, de volgorde van migraties op bestaande rijen): aparte tester. R-DB-07 verandert, dus de eigenaar keurt goed.
- PR 1: `scripts/kit/check-migrations.mjs`, `test/rails/check-migrations.test.ts` volgt alleen als een bestaand geval een oudere toegevoegde migratie als groen vastlegt, `.github/workflows/ci.yml` alleen als `gate:fast` de template-URL als omgevingsvariabele nodig heeft (dan pusht de eigenaar de branch), `docs/nieuwe-app.md`, `docs/template-changelog.md`, `docs/framework.md` R-DB-07 met spiegel in `.claude/rules/database.md`, de skill `migratie`.
- PR 2: `scripts/check-snapshot.sh` en `scripts/runner.sh` (bestanden die de host uitvoert: de runner draait ze pas na de merge of met `--sta-wijzigingen-toe` door de eigenaar).

## Buiten scope

- Data-effecten: de vergelijking in PR 2 is `pg_dump` van het schema; rijen die een migratie invoegt of bijwerkt, vallen erbuiten.
- De tweede bouw geeft de volgorde van binnenkomst als main na elke merge is uitgerold. Rolt een app meerdere merges tegelijk uit, dan draait productie ze op versievolgorde en valt dat samen met de verse bouw; beide gevallen zijn dus gedekt.
- App-configuratie naast templateconfiguratie; een migratie-runbook voor productie (deel C); `dbmate --strict` in de uitrol (maakt een update net zo vast als weigeren).

## Open vragen

- **OV-1**: Een templatemigratie die ouder is dan een migratie die de app al heeft toegepast. (a) Bewijzen dat de volgorde niet uitmaakt met de tweede bouw (PR 2). (b) Alleen de regel en de procedure, met de afspraak dat een app-migratie geen object van de template raakt; die afspraak is niet te controleren en nu al onwaar, want een nieuwe app-tabel krijgt per ontwerp een rij in `app.retention`. (c) Weigeren: verworpen, de update zit dan vast. Aanbeveling van spec en spec-review: (a).
- **OV-2**: Twee PR's (eerst regel en procedure, dan de tweede bouw met hostbestanden)? Aanbeveling: ja.
- **OV-3**: Het gat dat overblijft. Een PR die groen was tegen een oudere main, mag nu gemerged worden zonder eerst bij te werken (`strict_required_status_checks_policy: false` in de ruleset). Twee PR's met elk een migratie kunnen dan toch in de verkeerde volgorde op main komen, en geen check ziet het daarna nog. (i) De ruleset eist een bijgewerkte branch: sluit het gat, maar elke PR moet vóór de merge main binnenhalen en opnieuw door de CI. (ii) Een controle op main na de merge: meldt het achteraf, blokkeert niets. (iii) Aanvaarden en benoemen. Aanbeveling: (ii) nu, in PR 1; (i) is een grotere verandering van de werkwijze die apart besloten hoort te worden.
