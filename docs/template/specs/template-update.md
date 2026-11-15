---
status: voorstel
namespace: template-update
---

# Een template-update binnenhalen: procedure en volgorde van migraties

## Doel

Een app haalt een nieuwe templateversie binnen met een vaste procedure, en een migratie draait in productie op dezelfde plek als op een verse database, ook als ze via een template-update binnenkomt.

## Rollen en wie wat ziet

Geen wijziging: geen route, permissie of scherm. Het raakt wie een app bijwerkt (de eigenaar of een agent) en wat `check:migrations` en `check:snapshot` weigeren.

## Het probleem

- **Geen procedure.** `docs/nieuwe-app.md` beschrijft de koppeling met de template, niet wat er na `git merge template/main` moet gebeuren.
- **Volgorde.** dbmate past elke nog niet toegepaste migratie toe, in volgorde van versie (het tijdstempel in de naam). Een migratie met een ouder tijdstempel dan een al toegepaste draait in productie dus ná de nieuwere, en op een verse database ervóór. Raken de twee hetzelfde object, dan verschilt productie van wat de tests zien. `check:migrations` toetst nu alleen dat een versie uniek is en de naam klopt.
- Dat kan op twee manieren ontstaan: een branch met een oudere migratie wordt later gemerged dan een branch met een nieuwere, en een template-update brengt een templatemigratie mee die ouder is dan een migratie die de app al heeft toegepast. Het tweede kan de app niet oplossen: een templatemigratie hernoemen mag niet.

## Ontwerp

- **Eigen migraties: altijd later.** `check:migrations` weigert een migratie die in deze branch is toegevoegd en waarvan de versie niet later is dan die van elke migratie op het punt waar de branch van `origin/main` afsplitste. De oplossing is de eigen, nog niet gemergde migratie een nieuw tijdstempel geven. Uitgezonderd is een migratie die via een template-update binnenkomt: een bestand dat met dezelfde inhoud in `template/main` staat (`check-core` haalt die al op in een app). In de template zelf bestaat die uitzondering niet.
- **Templatemigraties: bewijs dat de volgorde niet uitmaakt** (zie OV-1). `check:snapshot` bouwt het schema voortaan twee keer: op versievolgorde (een verse database, zoals nu) en op volgorde van binnenkomst (eerst de migraties van het afsplitspunt, daarna de toegevoegde: wat productie ziet). Verschillen de twee schema's, dan is de check rood, met de namen van de migraties die uit de volgorde lopen. Is er niets toegevoegd met een oudere versie, dan is er niets te vergelijken en verandert de duur niet.
- **Procedure** in `docs/nieuwe-app.md`, sectie "Een template-update binnenhalen", als genummerde stappen met verwachte uitkomst: de versie en de "Bij een update"-notities in `docs/template-changelog.md` lezen; `git fetch template` en `git merge template/main` als echte merge-commit (geen squash); conflicten oplossen (`CHANGELOG.md` is van de app); `pnpm install`; `pnpm db:migrate` en `pnpm db:generate`; `scripts/github-ruleset.sh` als de verplichte checks wijzigden; `pnpm gate:fast`; PR, CI, merge door de eigenaar. Met wat te doen als `check:migrations` of `check:snapshot` rood is.

## Kopieer de vorm van

- `scripts/kit/check-migrations.mjs` met `test/rails/check-migrations.test.ts` (pure functie `migratieRegels` plus fixture-repo's).
- `scripts/check-snapshot.sh` en `scripts/db-generate.sh` voor de tweede bouw.
- `scripts/kit/check-core.mjs` voor het ophalen en lezen van `template/main`.

## Hergebruik en UX

Geen schermen. De meldingen van de twee checks zeggen wat er mis is en wat de oplossing is, in één regel per migratie.

## Acceptatiecriteria

- **template-update/AC-1**: Een toegevoegde migratie met een versie later dan alle bestaande: `check:migrations` groen. Met een versie gelijk aan of eerder dan een bestaande: rood, met de naam van de migratie, de nieuwste bestaande versie en de aanwijzing om het tijdstempel te vernieuwen.
- **template-update/AC-2**: Twee toegevoegde migraties in één branch, beide later dan alle bestaande: groen, ongeacht hun onderlinge volgorde.
- **template-update/AC-3**: In een app: een toegevoegde migratie die met dezelfde inhoud in `template/main` staat en ouder is dan een bestaande app-migratie: `check:migrations` groen (uitgezonderd). Staat ze er met een andere inhoud, of is `template/main` niet te lezen: rood, met de reden.
- **template-update/AC-4**: In de template (herkend zoals `check-core` dat doet) bestaat de uitzondering niet: elke toegevoegde migratie moet later zijn.
- **template-update/AC-5**: De bestaande regels van `check:migrations` blijven: gewijzigde of verwijderde migratie, naamvorm, dubbele versie, onleesbare `origin/main`.
- **template-update/AC-6**: `check:snapshot` met een toegevoegde, oudere migratie die niets raakt wat een nieuwere migratie raakt: groen. Met een oudere migratie waarvan het resultaat afhangt van de volgorde (fixture: twee migraties die dezelfde kolomstandaard zetten): rood, met beide namen. Zonder toegevoegde oudere migratie draait de tweede bouw niet.
- **template-update/AC-7**: `docs/nieuwe-app.md` heeft de sectie "Een template-update binnenhalen" met de stappen uit het ontwerp; `docs/template-changelog.md` verwijst ernaar bovenaan `[Unreleased]`.

## Raakt ook

- Risicowerk (migraties op bestaande rijen, de gate): aparte tester.
- Gewijzigd: `scripts/kit/check-migrations.mjs`, `scripts/check-snapshot.sh` (en waar nodig `scripts/db-generate.sh`, `scripts/runner.sh`, `compose.yaml` voor de tweede bouw: bestanden die de host uitvoert, dus de runner draait pas na de merge of met het akkoord van de eigenaar), `docs/nieuwe-app.md`, `docs/template-changelog.md`, `docs/framework.md` R-DB-07 (een nieuwe migratie is later dan alle bestaande) met spiegel in `.claude/rules/database.md`, de skill `migratie`.
- Bestaande tests: `test/rails/check-migrations.test.ts` volgt alleen als een bestaand geval een oudere toegevoegde migratie als groen vastlegt.

## Buiten scope

App-configuratie naast templateconfiguratie (padtabel, leerpunt-repo); een migratie-runbook voor productie (deel C); `dbmate --strict` in de uitrol.

## Open vragen

- **OV-1**: Wat moet er gebeuren met een templatemigratie die ouder is dan een migratie die de app al heeft toegepast?
  - (a) Bewijzen dat de volgorde niet uitmaakt: de tweede bouw in `check:snapshot` (dit ontwerp). Houdbaar en algemeen: het vangt ook twee eigen branches die elkaar kruisen. Kost een tweede databasebouw in `gate:slow` op de PR's waar het speelt, en raakt bestanden die de host uitvoert.
  - (b) Alleen de regel voor eigen migraties en de procedure, met de afspraak dat een app-migratie geen object van de template raakt. Geen bewijs; een afhankelijkheid valt pas in productie op.
  - (c) Rood zodra een templatemigratie ouder is (zoals het plan het letterlijk zei). Verworpen: de app kan een templatemigratie niet hernoemen, dus de update zit dan vast.
  - Aanbeveling: (a).
- **OV-2**: Hoort de tweede bouw in deze PR of in een vervolg-PR? Aanbeveling: de regel voor eigen migraties en de procedure eerst (klein, geen hostbestanden), de tweede bouw als eigen PR daarna.
