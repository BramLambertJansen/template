---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — alleen de eigenaar zet goedgekeurd
namespace: roadmap
---

# Roadmap-vinkjes afdwingen: `check:roadmap`

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Een check meldt in een PR elk nieuw of gewijzigd `[x]` in `docs/roadmap.md` zonder verwijzing naar bewijs of met een genoemd bestand dat
niet bestaat, en elke spec die naar `gebouwd` gaat zonder bewijs. Daarmee wordt de regel uit `docs/framework.md` §8 ("Docs horen bij de
wijziging") en `docs/dod.md` (Altijd, vierde punt) een check (roadmap stuk 4, item "Roadmap-vinkjes afdwingen").

## Rollen en wie wat ziet

| Rol | Ziet | Mag |
|---|---|---|
| developer / hoofdsessie | de meldingen lokaal (`pnpm check:roadmap`) en in CI | vinkjes en statussen voorstellen; `docs/roadmap.md` en `docs/specs/` zijn gate-paden, dus alleen met akkoord van de eigenaar |
| reviewer | de uitslag als bewijs bij `docs/dod.md` Altijd | alleen lezen en de check draaien (`pnpm check:*`) |
| eigenaar | de meldingen in de PR | beslist (OV-1) of een melding blokkeert; vinkt af of heropent |
| CI (`ci.yml`, job `gate:fast`) | draait de check met `fetch-depth: 0` (staat er al voor `check:migrations`) | — |

## Datawijzigingen (met grants)

n.v.t. — geen migratie, tabel of rol; de check leest alleen git en bestanden.

## Routes en foutcodes

n.v.t. — geen route, permissie of foutcode; het is een script in `scripts/kit/`.

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| — | — | — | — |

## Ontwerp van de check

### Plek: nieuw script, geen uitbreiding van een bestaand

`scripts/kit/check-roadmap.mjs`, met package-script `check:roadmap`. Afgewogen:

- **Niet in `check-docs.mjs`**: die check kijkt naar de toestand van de repo (via de ratchet, tegen `.kit/baseline.json`), zonder base.
  "Nieuw vinkje" en "naar `gebouwd`" zijn overgangen en vragen een vergelijking met het afsplitspunt. Bovendien staan er 91 bestaande `[x]`-items,
  waarvan een deel zonder verwijzing (bijv. `docs/roadmap.md:82`); een toestandscheck zou die allemaal in de baseline zetten.
- **Niet in `check-docs-drift.mjs`**: die is per ontwerp nooit een blokkade (kop van het script: "Nooit een blokkade (exit 0)") en kijkt alleen
  naar gewijzigde paden, niet naar inhoud. Deze check leest de inhoud op twee revisies en moet kunnen blokkeren als de eigenaar dat kiest
  (OV-1). Er bij inbouwen zou óf het ontwerp van docs-drift breken óf de keuze vastleggen.
- **Hergebruik** (geen nieuwe dependency):
  - afsplitspunt: hetzelfde patroon als `driftVanRepo` in `scripts/kit/check-docs-drift.mjs` en `check-migrations.mjs`
    (`git merge-base origin/main HEAD`, daarna `git show <afsplitsing>:<pad>`);
  - padherkenning: `looksLikePath` en `pathExists` uit `scripts/kit/check-docs.mjs` (nu niet geëxporteerd; de PR exporteert ze zonder
    gedragswijziging), zodat "bestaat dit pad" in beide checks hetzelfde betekent;
  - scripts uit `package.json`: `packageScripts` uit `check-docs.mjs` (zelfde export);
  - specstatus: de regex `SPEC_STATUS` uit `check-docs.mjs` (zelfde export);
  - testpaden: `testpaden` uit `.claude/gates.json` met `globMatch` uit `.claude/hooks/lib/rolhek.mjs`, zoals `scripts/kit/diff-guard.mjs` doet;
  - het gate-register `scripts/kit/gates.mjs` voor de checknamen (zie Bewijs).

De kern is een pure functie (geen git, geen fs) zodat de fixtures haar direct voeden:
`roadmapMeldingen({ basis, head, scripts, testpaden })` → `{ key, message }[]` (zelfde vorm als `Violation` in `check-docs.mjs`), waarbij
`basis` en `head` elk `{ lees(pad): string | null, bestanden: string[] }` zijn. Een dunne laag `roadmapVanRepo(root, base)` vult die uit git
(`head.bestanden` = `git ls-files`).

### Een item

- Een item begint met een regel `- [x] ` of `- [ ] ` (ook `[X]`; voorloopspaties toegestaan) in `docs/roadmap.md`.
- Het loopt door over de volgende regels die verder ingesprongen zijn dan het streepje, tot een lege regel, een kop (`#`), een regel die met
  `**` begint, of een nieuw streepje op dezelfde of een lagere inspringing.
- De **tekst** van een item is de beginregel plus de vervolgregels, met de witruimte aan het eind van elke regel weggehaald.
- Een item is **nieuw afgevinkt** als het in `head` `[x]` is en er in `basis` geen `[x]`-item met precies dezelfde tekst is. Dat dekt:
  `[ ]` → `[x]`, een nieuw item dat meteen `[x]` is, en een bestaand `[x]`-item waarvan de tekst wijzigt (OV-2).
- Alleen nieuw afgevinkte items worden gecontroleerd; bestaande `[x]`-items die niet wijzigen nooit.

### Bewijs

Een nieuw afgevinkt item heeft bewijs als zijn tekst (buiten `~~…~~`) minstens één van deze bevat:

| Soort | Herkend als | Voorwaarde |
|---|---|---|
| PR-nummer | `#` gevolgd door cijfers, niet direct na een letter of cijfer (`#9`, `(#34)`, `#9: `) | alleen de vorm (OV-7) |
| testpad | een token tussen backticks dat matcht op een glob uit `testpaden` in `.claude/gates.json` (een afsluitende `/` telt als map) | bestaat in `head` (`pathExists`); een map telt als er minstens één bestand in git onder staat |
| checknaam | een token tussen backticks `pnpm <naam>` of `<naam>` | `<naam>` is een script in `package.json` én staat in het gate-register (`scripts/kit/gates.mjs`), of is `gate:fast`, `gate:slow` of begint met `check:` of `test:` (OV-6) |

Een **vervallen** item (tekst na `[x] ` begint met `~~`) heeft bewijs als het een PR-nummer bevat of `ADR NNNN` waarvoor
`docs/adr/NNNN-*.md` in `head` bestaat (OV-5).

### Genoemde bestanden

Elk token tussen backticks in een nieuw afgevinkt item (buiten `~~…~~`) waarvoor `looksLikePath` waar is, moet in `head` bestaan
(`pathExists`, dus ook `#core/…`-aliassen en kale bestandsnamen zoals in `check-docs`). Globs (`*`), `<…>` en URL-paden (`/route`) vallen er al
buiten via `looksLikePath`.

### Spec naar `gebouwd`

Voor elk bestand `docs/specs/<naam>.md` (niet `_template.md`) met in `head` status `gebouwd` en in `basis` een andere status of geen bestand:

- **Bewijs** (R3): goed als (a) deze PR minstens één nieuw afgevinkt roadmap-item met bewijs bevat, of (b) het commentaar achter de status
  (`status: gebouwd # …`, precedent: `docs/specs/design-system.md:2` "gebouwd in PR #51") bewijs bevat volgens de tabel hierboven (OV-3).
- **Roadmap mee** (R4): noemt de spec een roadmap-item (tekst `roadmap stuk <n>` of `ST-<nn>`, hoofdletterongevoelig), dan moet
  `docs/roadmap.md` in deze PR wijzigen (de tekst in `basis` en `head` verschilt). Een spec zonder zo'n verwijzing is de bewuste
  uitzondering: daar geldt alleen R3 (OV-4).

### Uitvoer en exitcode

- Geen meldingen: exit 0.
- Meldingen: elke melding op een eigen regel; in CI (`GITHUB_ACTIONS=true`) met `::error::` of `::warning::` ervoor, afhankelijk van OV-1.
  Exitcode 1 bij blokkeren, 0 bij waarschuwen (OV-1).
- `origin/main` niet te lezen: bij blokkeren een fout (exit 1, zoals `check:migrations`, "onleesbaar telt als fout"), bij waarschuwen een
  waarschuwing (exit 0, zoals `check:docs-drift`) (OV-1).

## Hergebruik en UX

- **Bestaande componenten:** n.v.t. — geen scherm. Hergebruikte code: `looksLikePath`, `pathExists`, `packageScripts`, `SPEC_STATUS`
  (`scripts/kit/check-docs.mjs`), `globMatch` (`.claude/hooks/lib/rolhek.mjs`), het gate-register (`scripts/kit/gates.mjs`), het
  afsplitspuntpatroon van `scripts/kit/check-docs-drift.mjs` en `scripts/kit/check-migrations.mjs`, de fixture-opzet van
  `test/rails/fixtures/depcruise/` (een mini-repo per geval).
- **Staten per scherm:** n.v.t. — geen scherm; de "staten" van de check zijn: niets te melden, meldingen, base onleesbaar.
- **Alle zichtbare tekst letterlijk** (`<regel>` = regelnummer van de eerste regel van het item in `head`; `<…>` wordt ingevuld; de
  backticks horen bij de tekst):

| Key | Tekst |
|---|---|
| `roadmap:bewijs:<regel>` | `docs/roadmap.md:<regel>: vinkje zonder bewijs; zet er een testpad, checknaam (pnpm …) of PR-nummer (#…) achter` |
| `roadmap:pad:<regel>:<pad>` | `` docs/roadmap.md:<regel>: vinkje noemt `<pad>`, dat niet bestaat `` |
| `spec:bewijs:<bestand>` | `<bestand>: naar gebouwd zonder bewijs; vink het roadmap-item af met bewijs, of zet bewijs achter de status (status: gebouwd # #<PR> of een testpad)` |
| `spec:roadmap:<bestand>` | `<bestand>: naar gebouwd en noemt <verwijzing>, maar docs/roadmap.md wijzigt niet in deze PR` |
| (base onleesbaar) | `origin/main is niet te lezen; roadmap-vinkjes niet gecontroleerd (git fetch origin main of fetch-depth: 0)` |
| (niets te melden) | `✓ check:roadmap: elk nieuw vinkje en elke gebouwde spec verwijst naar bewijs` |

  Lokaal staat `✗ check:roadmap: ` (blokkeren) of `⚠ check:roadmap: ` (waarschuwen) voor elke melding, zoals `check:docs-drift`.
- **Focusvolgorde en toetsenbord:** n.v.t. — geen scherm.

## Acceptatiecriteria

- **roadmap/AC-1** — Gegeven een item dat in de basis `[ ]` is, wanneer de PR het op `[x]` zet zonder PR-nummer, testpad of checknaam, dan
  meldt de check `roadmap:bewijs:<regel>`.
- **roadmap/AC-2** — Gegeven een item dat de PR op `[x]` zet met `(#123)`, of met een bestaand testpad (`db/tests/rls.sql`, of een map als
  `test/rails/` met een bestand erin), of met `` `pnpm check:migrations` `` of `` `gate:fast` ``, dan meldt de check niets voor dat item.
- **roadmap/AC-3** — Gegeven een nieuw afgevinkt item waarvan het enige "bewijs" een testpad is dat niet bestaat, dan meldt de check zowel
  `roadmap:bewijs:<regel>` als `roadmap:pad:<regel>:<pad>`.
- **roadmap/AC-4** — Gegeven een nieuw afgevinkt item met een checknaam die geen script is (`` `pnpm check:bestaat-niet` ``) of een script dat
  geen check is (`` `pnpm dev` ``), dan telt die niet als bewijs: zonder ander bewijs `roadmap:bewijs:<regel>`.
- **roadmap/AC-5** — Gegeven een nieuw afgevinkt item met bewijs dat een bestand noemt dat in `head` niet bestaat (`` `src/api/weg.ts` ``), dan
  meldt de check `roadmap:pad:<regel>:src/api/weg.ts`; een glob (`` `eslint.config.*` ``), een URL-pad (`` `/design-system` ``) en een
  bestaande kale naam (`` `mise.toml` ``) geven geen melding.
- **roadmap/AC-6** — Gegeven een `[x]`-item dat in de basis al zo stond (zelfde tekst), ook zonder bewijs, dan meldt de check niets.
- **roadmap/AC-7** — Gegeven een `[x]`-item waarvan de PR de tekst wijzigt en daarbij geen bewijs heeft, dan meldt de check
  `roadmap:bewijs:<regel>` (onder voorbehoud van OV-2).
- **roadmap/AC-8** — Gegeven een nieuw item over meer regels waarvan het bewijs alleen op een vervolgregel staat, dan meldt de check niets;
  staat het bewijs alleen in het volgende item of na een lege regel, dan wel.
- **roadmap/AC-9** — Gegeven een nieuw vervallen item `- [x] ~~…~~ — vervallen: …`, dan is `ADR NNNN` met een bestaand ADR-bestand of een
  PR-nummer bewijs; een niet-bestaand ADR-nummer niet; paden tussen `~~` worden niet op bestaan gecontroleerd.
- **roadmap/AC-10** — Gegeven een spec die van `goedgekeurd` naar `gebouwd` gaat, zonder roadmap-verwijzing, zonder nieuw afgevinkt item en
  zonder bewijs achter de status, dan meldt de check `spec:bewijs:<bestand>`; met `status: gebouwd # gebouwd in PR #51` niets.
- **roadmap/AC-11** — Gegeven een spec die naar `gebouwd` gaat en "roadmap stuk 3f" noemt, terwijl `docs/roadmap.md` niet wijzigt, dan meldt de
  check `spec:roadmap:<bestand>` (ook als het statuscommentaar bewijs heeft); wijzigt de roadmap en vinkt hij een item af met bewijs, dan niets.
- **roadmap/AC-12** — Gegeven een spec die al `gebouwd` was in de basis, of een nieuwe spec met status `voorstel`, of `_template.md`, dan meldt
  de check niets over specs.
- **roadmap/AC-13** — Gegeven een nieuwe spec (niet in de basis) die meteen `gebouwd` is, dan geldt hij als overgang naar `gebouwd` (AC-10/11).
- **roadmap/AC-14** — Gegeven een branch die achterloopt op `main` (op `main` is na het afsplitsen een item afgevinkt), dan meldt de check dat
  item niet: hij vergelijkt met het afsplitspunt, niet met de kop van `main`.
- **roadmap/AC-15** — Gegeven een onleesbare base, dan geeft `roadmapVanRepo` de tekst "origin/main is niet te lezen; …" en is de exitcode die
  van OV-1 (1 bij blokkeren, 0 bij waarschuwen).
- **roadmap/AC-16** — Gegeven de echte repo op `main` (geen diff), dan is de check groen.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `[x]` → `[ ]` (heropenen) | geen melding van deze check; de diff-guard eist al akkoord van de eigenaar voor `docs/roadmap.md` (gate-pad) | n.v.t. |
| item verwijderd | geen melding | n.v.t. |
| item alleen verplaatst (zelfde tekst, andere regel of sectie) | geen melding (vergelijking op tekst, niet op regel) | n.v.t. |
| twee identieke `[x]`-items in head, één in basis | geen melding (de tekst bestond al als `[x]`) | n.v.t. |
| `[X]` hoofdletter | telt als afgevinkt | n.v.t. |
| `#9` binnen een link-anker of `§` | een anker (`(#agenttaken-…)`) begint niet met een cijfer en telt niet; `§10` is geen `#` | n.v.t. |
| PR-nummer dat niet bestaat (`#99999`) | telt als bewijs; alleen de vorm wordt gecontroleerd (OV-7) | n.v.t. |
| testpad met `#`-alias of zonder map (`excluded-commands.test.ts`) | `pathExists` zoals in `check-docs` (eindigt een bestand in git erop, dan bestaat het) | n.v.t. |
| `docs/roadmap.md` bestaat niet in basis of head (app zonder roadmap) | geen roadmap-meldingen; R3 kan alleen via het statuscommentaar | n.v.t. |
| spec hernoemd én naar `gebouwd` | geldt als nieuwe spec (AC-13) | n.v.t. |
| spec naar `vervallen` | geen melding | n.v.t. |
| werkmap met niet-gecommitte wijzigingen | head = de bestanden die git volgt (`git ls-files`) met de inhoud van schijf, zoals `check-docs`; lokaal telt de werkmap dus mee, in CI is die gelijk aan `HEAD` | n.v.t. |
| `package.json` onleesbaar of zonder `scripts` | geen checknamen; PR-nummer en testpad werken nog | n.v.t. |

## Raakt ook

Gate-paden uit `.claude/gates.json` die de bouw-PR raakt (dus label `gate-wijziging` en goedkeuring van de eigenaar op de head-SHA via de
diff-guard; de hoofdsessie schrijft ze alleen na `ask`):

| Pad | Gate | Wijziging |
|---|---|---|
| `scripts/kit/check-roadmap.mjs` (nieuw) | `scripts/**` | de check |
| `scripts/kit/check-docs.mjs` | `scripts/**` | `looksLikePath`, `pathExists`, `packageScripts`, `SPEC_STATUS` exporteren; geen gedragswijziging |
| `scripts/kit/gates.mjs` | `scripts/**` | alleen bij blokkeren (OV-1): `check:roadmap` als snelle gate; `feiten.mjs` toont hem dan vanzelf |
| `package.json` → `scripts` | `jsonGates` | `check:roadmap`; bij blokkeren ook in `gate:fast` (`test/rails/gates.test.ts` eist dat `gate:fast` precies de snelle gates draait) |
| `.github/workflows/ci.yml` | `.github/**` | alleen bij waarschuwen: een stap `pnpm check:roadmap` na `check:docs-drift`; het commit met `.github/workflows/` pusht de eigenaar |
| `test/rails/check-roadmap.test.ts` (nieuw) | `test/**`, `**/*.test.*` | de tests (tester) |
| `test/rails/fixtures/roadmap/**` (nieuw) | `test/**` | de fixtures (tester); toevoegen mag, later wijzigen meldt het rolhek |
| `docs/framework.md` §8 ("Docs horen bij de wijziging") | gate | de zin over `check:docs-drift` uitbreiden met `check:roadmap` en of hij blokkeert |
| `docs/dod.md` (Altijd, vierde punt) | gate | verwijzen naar `pnpm check:roadmap` |
| `docs/roadmap.md` stuk 4 | gate | het item afvinken met bewijs (`test/rails/check-roadmap.test.ts`, PR-nummer), in dezelfde PR |

Niet geraakt: `.claude/gates.json` (alle paden vallen al onder bestaande gates), `.kit/baseline.json` (de check zit niet in de ratchet),
CODEOWNERS en `ask` (geen nieuwe gate). `CHANGELOG.md` krijgt een regel.

## Buiten scope

- Controleren of een PR-nummer bestaat of gemerged is (vraagt de GitHub API; `gate:fast` draait zonder netwerk) (OV-7).
- Controleren of het genoemde bewijs groen is: de uitslag staat in de PR (`docs/dod.md`); de check ziet alleen de verwijzing.
- Inhoudelijk oordelen of een item echt af is, of of een open item afgevinkt had moeten worden: blijft een bevinding van de reviewer
  (`docs/dod.md`, Altijd).
- Heropenen (`[x]` → `[ ]`) melden: de diff-guard eist al akkoord van de eigenaar voor elke wijziging van `docs/roadmap.md`.
- Bestaande `[x]`-items zonder bewijs achteraf aanvullen.
- Vinkjes in andere bestanden (`docs/dod.md`, `docs/operations/…`).
- Draaien in `guard.yml` (de versie van `main`): niet nodig, want de check zelf staat in `scripts/**`, een gate-pad (OV-8).

## Testplan

Unit (`test/rails/check-roadmap.test.ts`, Vitest-project `unit`, dus in `test:unit` en `gate:fast`). Fixtures in
`test/rails/fixtures/roadmap/<geval>/` met per geval een map `basis/` en `head/` (een mini-repo: `docs/roadmap.md`, waar nodig
`docs/specs/*.md`, `docs/adr/*.md`, `package.json`, `db/tests/*.sql`, `test/rails/x/*`). De test leest beide mappen in als `basis` en
`head` voor `roadmapMeldingen` en geeft vaste `testpaden` (die uit `.claude/gates.json`) mee. Geen bestand in de fixtures heet `*.test.ts`
(Vitest pakt `{src,test}/**/*.test.ts` op): testpaden in fixtures zijn `db/tests/*.sql` of een map. `*.md` staat in `.prettierignore`.

Bewijsmatrix (één test per rij; verwachte keys exact met `toStrictEqual`):

| Geval (map) | AC | Verwacht |
|---|---|---|
| `schoon` (basis = head) | AC-6, AC-16 | `[]` |
| `oud-vinkje-zonder-bewijs` (bestaand `[x]` zonder bewijs, ongewijzigd) | AC-6 | `[]` |
| `vinkje-zonder-bewijs` | AC-1 | `['roadmap:bewijs:<r>']` |
| `vinkje-met-pr` | AC-2 | `[]` |
| `vinkje-met-testpad` (`db/tests/rls.sql` bestaat) | AC-2 | `[]` |
| `vinkje-met-testmap` (`test/rails/` met een bestand) | AC-2 | `[]` |
| `vinkje-met-checknaam` (`pnpm check:migrations` en kaal `gate:fast`) | AC-2 | `[]` |
| `vinkje-testpad-bestaat-niet` | AC-3 | `['roadmap:bewijs:<r>', 'roadmap:pad:<r>:db/tests/weg.sql']` |
| `vinkje-onbekend-script` (`pnpm check:bestaat-niet`) | AC-4 | `['roadmap:bewijs:<r>']` |
| `vinkje-geen-check` (`pnpm dev`) | AC-4 | `['roadmap:bewijs:<r>']` |
| `vinkje-pad-bestaat-niet` (`#12` en `src/api/weg.ts`) | AC-5 | `['roadmap:pad:<r>:src/api/weg.ts']` |
| `vinkje-glob-url-kale-naam` | AC-5 | `[]` |
| `nieuw-item-afgevinkt` (nieuwe regel, meteen `[x]`, zonder bewijs) | AC-1 | `['roadmap:bewijs:<r>']` |
| `vinkje-tekst-gewijzigd` (bestaand `[x]`, tekst anders, geen bewijs) | AC-7 | `['roadmap:bewijs:<r>']` |
| `bewijs-op-vervolgregel` | AC-8 | `[]` |
| `bewijs-na-lege-regel` | AC-8 | `['roadmap:bewijs:<r>']` |
| `anker-is-geen-pr` (`(#agenttaken-…)` en `§10` als enige "bewijs") | AC-1 | `['roadmap:bewijs:<r>']` |
| `vervallen-met-adr` (ADR bestaat; pad tussen `~~` bestaat niet) | AC-9 | `[]` |
| `vervallen-adr-bestaat-niet` | AC-9 | `['roadmap:bewijs:<r>']` |
| `verplaatst` (zelfde `[x]`-tekst, andere sectie) | randgeval | `[]` |
| `heropend` (`[x]` → `[ ]`) | randgeval | `[]` |
| `spec-gebouwd-zonder-bewijs` | AC-10 | `['spec:bewijs:docs/specs/a.md']` |
| `spec-gebouwd-bewijs-in-status` | AC-10 | `[]` |
| `spec-gebouwd-met-roadmapvinkje` (roadmap wijzigt, vinkje met bewijs) | AC-11 | `[]` |
| `spec-roadmapverwijzing-roadmap-ongewijzigd` (bewijs in status) | AC-11 | `['spec:roadmap:docs/specs/a.md']` |
| `spec-al-gebouwd` / `spec-nieuw-voorstel` / `template` | AC-12 | `[]` |
| `spec-nieuw-gebouwd` (geen basis, geen bewijs) | AC-13 | `['spec:bewijs:docs/specs/a.md']` |

Git-laag (tijdelijke repo zoals `test/rails/check-migrations.test.ts`): AC-14 (branch achter `main`), AC-15 (`roadmapVanRepo('.', 'bestaat-niet-ref')`
bevat "niet te lezen"), en één doorloop van `[ ]` → `[x]` in een commit op de branch die `roadmap:bewijs` geeft.

Na de bouw: `pnpm check:roadmap` op de bouw-PR zelf (die het item in stuk 4 afvinkt met `test/rails/check-roadmap.test.ts`) groen, en
`pnpm gate:fast` groen; uitslagen in de PR.

## Open vragen voor de eigenaar

- **OV-1 Blokkeren of waarschuwen?** Aanbeveling: **blokkeren** (exit 1), als snelle gate in `gate:fast` en `scripts/kit/gates.mjs`, met
  onleesbare base als fout (zoals `check:migrations`). Reden: `check:docs-drift` waarschuwt omdat "raakt dit gedrag?" een oordeel is; hier is de
  vraag objectief (staat er een verwijzing, bestaat het pad) en de check kijkt alleen naar nieuwe of gewijzigde vinkjes, dus vals alarm kost
  één verwijzing. Een waarschuwing in CI wordt makkelijk gemist, en een vinkje zonder bewijs is volgens `docs/dod.md` al een bevinding.
  Alternatief: waarschuwen als stap in `ci.yml` (naast `check:docs-drift`), buiten `gate:fast`.
- **OV-2 Telt een gewijzigd, al afgevinkt item als nieuw vinkje?** Aanbeveling: ja (AC-7). Anders kan een PR een bestaand `[x]`-item inhoudelijk
  oprekken zonder bewijs. Prijs: wie een oud item zonder bewijs alleen herformuleert, moet er nu bewijs bij zetten.
- **OV-3 Waar staat bewijs in een spec?** Aanbeveling: in het commentaar achter `status: gebouwd # …` (precedent `docs/specs/design-system.md`).
  De hele spec kan niet: het Testplan noemt altijd al `pnpm test:db` en testpaden, dus elke spec zou slagen. Zo ja: het commentaar in
  `docs/specs/_template.md` aanvullen ("gebouwd: # PR-nummer of testpad").
- **OV-4 Spec met roadmap-verwijzing: roadmap verplicht, of bewijs in de spec genoeg?** De opdracht zegt "roadmap **of** de spec"; het
  roadmap-item zegt "zonder dat `docs/roadmap.md` mee wijzigt, behalve bij een spec zonder roadmap-item". Aanbeveling: beide regels (R3 én R4,
  zoals AC-11): noemt de spec een roadmap-item, dan wijzigt de roadmap mee (afvinken, of een regel "Deels gebouwd: …" zoals nu gebruikelijk);
  het bewijs mag in de roadmap of in de spec staan.
- **OV-5 Vervallen items (`[x] ~~…~~ — vervallen: …`)**: wat is bewijs? Aanbeveling: een bestaand ADR-nummer of een PR-nummer (AC-9).
  Alternatief: ook "besluit eigenaar JJJJ-MM-DD" (staat elders in de roadmap), maar dat is niet te controleren.
- **OV-6 Welke scripts tellen als checknaam?** Aanbeveling: scripts in het gate-register, `gate:fast`, `gate:slow`, en alles met `check:` of
  `test:` (dus ook `check:docs-drift`, `test:e2e`); niet `dev`, `build`, `db:*`, `new:resource`. Workflow-jobnamen (CodeQL, osv-scanner,
  `secrets`) tellen niet; daarvoor is het PR-nummer.
- **OV-7 PR-nummer alleen op vorm?** Aanbeveling: ja; `gate:fast` heeft geen netwerk en de eigenaar ziet elke roadmap-wijziging al (gate-pad).
  Bestaan of gemerged zijn controleren vraagt de GitHub API en hoort dan in `guard.yml`; dat is een eigen besluit.
- **OV-8 Alleen in `gate:fast`/`ci.yml`, of ook in `guard.yml`?** Aanbeveling: niet in `guard.yml`; het script staat onder `scripts/**`, dus een
  PR die het afzwakt, vraagt al het label `gate-wijziging` en jouw goedkeuring.
