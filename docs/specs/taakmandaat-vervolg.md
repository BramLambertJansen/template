---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — alleen de eigenaar zet goedgekeurd; gebouwd: # PR-nummer of testpad
namespace: mandate-follow-up
---

# Taakmandaat: vervolg op de review van PR #130

## Doel

Een taak onder een taakmandaat kan haar eigen roadmap-vinkje en `gebouwd`-status in één stap en één PR afronden, met één
bewijsvorm die `check:roadmap` en `check-document-status` gelijk lezen, en de runner-hostbestanden lopen niet ongemerkt uiteen.

Achtergrond: [spec taakmandaat](taakmandaat-frameworkwerk.md), [ADR 0027](../adr/0027-taakmandaat-voor-frameworkwerk.md),
[spec roadmap-vinkjes](roadmap-vinkjes.md). Eigenaarbesluiten (2026-10-13, na de review van PR #130):

- **B1** — Binnen een taakmandaat mag `docs/roadmap.md` meewijzigen, maar alleen het vinkje van het item van de taak.
- **B2** — Eén bewijsvorm voor gebouwd: `check-document-status` en `check:roadmap`/`docs/dod.md:10` accepteren hetzelfde; `docs/dod.md` gaat mee.
- **B3** — `HOST_FILES` staat dubbel (`.claude/hooks/lib/runner-authority.mjs:4-6`, `scripts/runner.sh:12-13`): één bron of een check die ze gelijk houdt.

De uitwerking hiervan is met de eigenaarbesluiten OV-1 t/m OV-6 vastgelegd (onderaan). De spec blijft `voorstel` tot de
eigenaar hem zelf op `goedgekeurd` zet.

### Huidige stand (origin/main `f290a76`)

1. `verifyScopedFile` (`scripts/kit/check-document-status.mjs:63-77`) laat bij een actief mandaat een gate-pad dat geen
   spec/ADR met gelijke digest is alleen door via `canWriteProtected`. `docs/roadmap.md` is een gate-pad (`.claude/gates.json`)
   en staat niet in de `paths` van het besluit, dus elk vinkje faalt met `docs/roadmap.md: buiten het broncodemandaat; bewaking blijft beschermd`.
   `check:roadmap` eist intussen dat een spec die "roadmap stuk N" of "ST-n" noemt bij `gebouwd` de roadmap laat meewijzigen.
2. Ook `statusOnlyDiff` (`scripts/kit/status-git.mjs:15-33`) weigert na de gevalideerde SHA elke wijziging die geen spec/ADR
   met gelijke digest is. Een vinkje in de administratiecommit (na de groene broncommit) maakt `gebouwd` dus ongeldig.
3. `builtReference` (`.claude/hooks/lib/document-state.mjs:78-83`) accepteert alleen
   `status: gebouwd # #<PR>; gevalideerd: <40 hex>`. `statusBewijs` (`scripts/kit/check-roadmap.mjs:143-151`) accepteert
   een PR-nummer, testpad of checknaam ergens in het commentaar, en `specMeldingen` (`:158-182`) laat een nieuw afgevinkt
   roadmap-item met bewijs gelden in plaats van bewijs achter de status. `check:roadmap` kan dus groen zijn terwijl
   `check-document-status` dezelfde spec weigert.
4. `pnpm docs:status` (`scripts/kit/document-status.mjs`) schrijft alleen de statusregel; het vinkje moet nu met de hand.
5. De twee `HOST_FILES`-lijsten zijn nu inhoudelijk gelijk, maar niets houdt ze gelijk. In `runner.sh` staat
   `compose.*.yaml` ongequote in een bash-array (glob-expansie door bash), in de hook als git-pathspec. De hook
   (`trustedRunner`, `runner-authority.mjs:25-37`) weigert ook genegeerde bestanden en onveilige paden
   (`safeRepositoryPath`); `runner.sh` (`check_host_files`, `:25-43`) niet.

## Rollen en wie wat ziet

- Eigenaar: keurt deze spec goed; reviewt en merget de PR. Het vinkje blijft een eigenaarakkoord via de PR-review (`docs/dod.md:7`).
- Hoofdsessie: zet status en vinkje samen met `pnpm docs:status <spec> gebouwd --pr <nummer> --roadmap` (OV-3).
- Developer: geen nieuw recht. Het lokale rolhek voor `docs/roadmap.md` blijft zoals het is (gate-pad).
- CI (`guard.yml`, versie uit main): `check-document-status` past de smalle uitzondering toe; `gate:fast` draait `check:roadmap`;
  `gate:slow` draait `scripts/runner.sh` met de aangescherpte hostcontrole.

## Datawijzigingen (met grants)

n.v.t. — geen database. Het register `.claude/decisions.json` krijgt geen nieuw veld; de koppeling tussen taak en
roadmap-item loopt via de tekst van het item (OV-2).

## Routes en foutcodes

n.v.t. — geen HTTP-route, permissie of applicatiefoutcode. Wel nieuwe en gewijzigde CLI-meldingen (letterlijk, onder "Hergebruik en UX").

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| n.v.t. | n.v.t. | n.v.t. | n.v.t. |

## Hergebruik en UX

- Bestaande componenten: n.v.t. — geen scherm. Hergebruikte code: `builtReference`, `changeStatus` en `documentInfo`
  (`.claude/hooks/lib/document-state.mjs`), `heeftBewijs` en `leesItems` (`scripts/kit/check-roadmap.mjs`), `parseNameStatus`
  (`scripts/kit/diff-guard.mjs`), `statusOnlyDiff` (`scripts/kit/status-git.mjs`), `safeRepositoryPath`
  (`.claude/hooks/lib/authority-context.mjs`). Eén gedeelde functie voor de B1-controle (hierna `taakVinkje`), gebruikt door
  `check-document-status`, `statusOnlyDiff` en `docs:status`. Geen nieuwe dependency.
- Staten per scherm: n.v.t. — CLI: exit 0 met een succesregel, of exit 1 met de meldingen hieronder.
- Alle zichtbare tekst letterlijk: zie de meldingentabel en de nieuwe teksten voor `docs/dod.md:10` en `docs/framework.md` §8.
- Focusvolgorde en toetsenbord: n.v.t. — geen scherm.

### B1 — Het vinkje van de taak (OV-2)

"Het item van spec S" is het roadmap-item waarvan de tekst (eerste regel plus vervolgregels, zoals `leesItems` het leest)
het pad van S tussen backticks noemt, bijvoorbeeld `` `docs/specs/taakmandaat-vervolg.md` ``. Een actief mandaat is een
besluit op main met `status: goedgekeurd`, dezelfde repository en branch, en `documentKind(entry.file) === 'spec'`.
Een wijziging van `docs/roadmap.md` onder één of meer actieve mandaten is alleen toegestaan als alles hieronder geldt:

1. Elk gewijzigd item is het item van een spec met een actief mandaat. Per zo'n spec staat in de basis precies één item
   dat het pad noemt, en dat item is open (`[ ]`). Geen of meerdere open items voor die spec: de uitzondering geldt niet.
2. In de head is elk zo'n item `[x]`; de tekst van het item in de basis is een prefix van de tekst in de head (alleen
   aanvullen aan het einde, op dezelfde regel of op nieuwe vervolgregels van dat item).
3. Elke andere regel van het bestand is gelijk aan de basis; er komen geen regels bij of af buiten die items.
4. Elk afgevinkt item heeft bewijs volgens `heeftBewijs` (zelfde functie als `check:roadmap`, zie B2).

Twee mandaten op één branch mogen elk hun eigen item afvinken, in dezelfde PR. Dezelfde regel geldt in `statusOnlyDiff`:
na de gevalideerde SHA mag naast statusregels alleen deze vinkjeswijziging volgen. Hernoemen of verwijderen van
`docs/roadmap.md` valt nooit onder de uitzondering. Regels worden vergeleken na normalisatie van `\r\n`.

### B1 — Vinkje en status in één stap (OV-3)

`pnpm docs:status <spec> gebouwd --pr <nummer> --roadmap` doet in één stap wat `pnpm docs:status <spec> gebouwd --pr <nummer>`
nu doet, plus het vinkje:

1. `--roadmap` mag alleen met een spec, status `gebouwd` en `--pr`. Anders: gebruiksfout, niets geschreven.
2. `docs/roadmap.md` moet een veilig pad zijn (`authority.safe`) en in de werkmap gelijk aan HEAD (de bestaande
   `unchanged`-controle dekt al de hele werkmap).
3. Het item van de spec wordt gezocht met dezelfde regel als B1 punt 1 (precies één open item dat het spec-pad noemt).
4. De nieuwe roadmaptekst: `[ ]` wordt `[x]` en achter de laatste regel van het item komt ` (#<nummer>)`. Daarna moet
   `taakVinkje(basis, nieuw, [spec])` slagen; de helper schrijft nooit iets wat de CI-controle zou weigeren.
5. Alle bewijscontroles van `gebouwd` blijven ongewijzigd (PR, checks op HEAD, `canRecordBuilt`). Pas als alles slaagt en
   de werkmap tijdens de controle niet veranderde, schrijft de helper de spec en `docs/roadmap.md`; faalt één stap, dan
   wijzigt geen van beide bestanden.

### B2 — Eén bewijsvorm (OV-1)

- **Spec naar `gebouwd`**: alleen de vorm die `pnpm docs:status` schrijft (`changeStatus`, `document-state.mjs:67-72`):
  `status: gebouwd # #<PR>; gevalideerd: <40 hex>`. `builtReference` is de enige parser; `check-roadmap.mjs` importeert
  hem in plaats van `statusBewijs`. Een afgevinkt roadmap-item vervangt dit bewijs niet meer (de `roadmapBewijs`-route in
  `specMeldingen` vervalt). `check:roadmap` controleert alleen de vorm (offline); `check-document-status` controleert
  daarnaast PR, SHA en checks live (ongewijzigd, task-mandate/AC-9).
- **Roadmap-vinkje**: ongewijzigd: een testpad, een checknaam (`` `pnpm …` ``) of een PR-nummer (`#…`), gelezen door
  `heeftBewijs`, dat `check-roadmap.mjs` exporteert; `check-document-status` en `docs:status` gebruiken dezelfde functie.

### B3 — Hostbestanden (OV-4, OV-5)

- Twee lijsten blijven; `runner-authority.mjs` exporteert `HOST_FILES`. Een unit-test leest de `HOST_FILES=( … )`-array
  letterlijk uit `scripts/runner.sh` (zonder bash-expansie, `#`-commentaar genegeerd, tot de sluitende `)`) en vergelijkt
  beide als verzameling. Reden: bij één gedeeld bestand moet de hook dat uit main lezen en `runner.sh` uit de merge-base,
  anders kan een werkbranch de lijst zelf inkorten.
- `runner.sh` quote `'compose.*.yaml'`, zodat git het als pathspec leest, net als de hook.
- `check_host_files` in `runner.sh` weigert daarnaast, vóór de CI-uitzondering (dus lokaal én in CI), net als de hook:
  (a) genegeerde bestanden onder `HOST_FILES` (`git ls-files --others --ignored --exclude-standard -- …`);
  (b) een getrackt hostbestand dat zelf of via een map in zijn pad een symlink of geen gewoon bestand of map is
  (zelfde regel als `safeRepositoryPath`). `--sta-wijzigingen-toe` slaat ook deze controles over, zoals nu.

### Letterlijke meldingen

| Waar | Situatie | Tekst |
|---|---|---|
| `check:roadmap` | `spec:bewijs:<bestand>` (vervangt de huidige tekst) | `<bestand>: naar gebouwd zonder bouwbewijs; zet de status met pnpm docs:status (status: gebouwd # #<PR>; gevalideerd: <sha>)` |
| `check-document-status` | roadmapwijziging buiten de uitzondering | `docs/roadmap.md: buiten het taakmandaat; alleen het vinkje van het item van een spec met mandaat mag wijzigen` |
| `check-document-status`, `docs:status` | geen of meerdere open items voor een spec | `docs/roadmap.md: geen eenduidig open item dat <spec-pad> noemt; vraag de eigenaar` |
| `docs:status` | gebruik | `Gebruik: pnpm docs:status <document> <status> [--pr <nummer> [--roadmap]]` |
| `docs:status` | `--roadmap` zonder spec, `gebouwd` of `--pr` | `--roadmap kan alleen met een spec, status gebouwd en --pr` |
| `docs:status` | gelukt met `--roadmap` | `<spec>: gebouwd; bewijs gecontroleerd, alleen de statusregel en het vinkje van het item gewijzigd` |
| `runner.sh` | genegeerde hostbestanden | `✗ Genegeerde bestanden in hostpaden; de host zou ze ongezien gebruiken:` + lijst + `  → verwijder ze of gebruik de wegwerp-CI (ADR 0027).` |
| `runner.sh` | symlink of onveilig pad | `✗ Hostpad is een symlink of geen gewoon bestand: <pad>` + `  → gebruik de wegwerp-CI (ADR 0027); geen agentoverride.` |

### Nieuwe tekst `docs/dod.md:10` (vervangt de huidige regel)

> - [ ] Is het bewijs voor een roadmap-item beschikbaar (checkuitslag of test, eventueel met PR-nummer), dan vinkt dezelfde PR dat item af, met een verwijzing achter het vinkje (testpad, checknaam of PR-nummer; de uitslag staat in de PR) en met akkoord van de eigenaar. Een spec naar `gebouwd` heeft één vorm, die `pnpm docs:status` schrijft: `status: gebouwd # #<PR>; gevalideerd: <sha>`; een afgevinkt roadmap-item vervangt die niet. Binnen een taakmandaat wijzigt in `docs/roadmap.md` alleen het vinkje van het item dat de spec van het mandaat tussen backticks noemt (precies één open item per spec); `pnpm docs:status <spec> gebouwd --pr <nummer> --roadmap` zet status en vinkje samen (ADR 0027). Een item dat deze PR afrondt maar open blijft, is een bevinding van de reviewer, net als een vinkje zonder bewijs. `pnpm check:roadmap` (in `gate:fast`) en `check-document-status` (CI) lezen beide vormen met dezelfde code; of het juiste item is afgevinkt blijft een oordeel van de reviewer.

### Nieuwe zin `docs/framework.md` §8 (OV-6)

Na "roadmap-vinkjes met eigenaarakkoord." (`docs/framework.md:297`):

> Binnen een taakmandaat mag `docs/roadmap.md` alleen het vinkje van het item van de taak meewijzigen; de precieze regel staat in [`docs/dod.md`](dod.md).

## Acceptatiecriteria

- **mandate-follow-up/AC-1** — Gegeven een actief mandaat voor spec S en een PR die in `docs/roadmap.md` alleen het enige
  open item dat `` `S` `` noemt afvinkt met een PR-nummer erachter, dan slaagt `check-document-status` voor dat bestand.
- **mandate-follow-up/AC-2** — Gegeven hetzelfde mandaat, dan faalt `check-document-status` met de melding "buiten het
  taakmandaat" als de PR daarnaast één andere regel van `docs/roadmap.md` wijzigt, een item van een spec zonder actief
  mandaat afvinkt, een regel toevoegt of verwijdert buiten het item, tekst van het item wijzigt in plaats van aanvult, het
  item heropent, of het bestand hernoemt of verwijdert.
- **mandate-follow-up/AC-3** — Gegeven een actief mandaat voor S en geen, of meer dan één, open item dat `` `S` `` noemt,
  dan faalt een wijziging van het item van S met de melding "geen eenduidig open item".
- **mandate-follow-up/AC-4** — Gegeven het afgevinkte item van de taak zonder bewijs volgens `heeftBewijs`, dan faalt
  `check-document-status`, en `check:roadmap` meldt `roadmap:bewijs:<regel>`.
- **mandate-follow-up/AC-5** — Gegeven actieve mandaten voor S1 en S2 op dezelfde branch en een PR die het item van S1 en
  het item van S2 afvinkt (elk met bewijs), dan slaagt `check-document-status`; vinkt de PR daarnaast een derde item af, dan faalt hij.
- **mandate-follow-up/AC-6** — Gegeven een gevalideerde broncommit en daarna één commit die alleen de statusregel van S op
  `gebouwd` zet en het item van S afvinkt (zoals in AC-1), dan geeft `statusOnlyDiff` `true`; met daarnaast één andere
  gewijzigde regel in `docs/roadmap.md` of één ander gewijzigd bestand `false`.
- **mandate-follow-up/AC-7** — Zonder actief mandaat verandert het gedrag van `check-document-status` voor `docs/roadmap.md`
  niet (geen scopecontrole; `verifyScope` keert terug zoals nu).
- **mandate-follow-up/AC-8** — Gegeven een schone werkmap, een open item dat `` `S` `` noemt en geldig bouwbewijs, dan
  zet `pnpm docs:status S gebouwd --pr <n> --roadmap` de statusregel op `status: gebouwd # #<n>; gevalideerd: <HEAD>` en
  het item op `[x]` met ` (#<n>)` erachter; `git diff` toont alleen die twee wijzigingen, en `check-document-status`,
  `statusOnlyDiff` en `check:roadmap` accepteren het resultaat.
- **mandate-follow-up/AC-9** — `pnpm docs:status … --roadmap` faalt met exit 1 en wijzigt geen enkel bestand als: geen of
  meerdere open items S noemen; het item al `[x]` is; `--roadmap` gebruikt wordt met een ADR, een andere status of zonder
  `--pr`; `docs/roadmap.md` afwijkt van HEAD of een symlink is; of het bouwbewijs ontbreekt (bestaande controles).
- **mandate-follow-up/AC-10** — Gegeven een spec die naar `gebouwd` gaat met `status: gebouwd # #130; gevalideerd: <40 hex>`,
  dan meldt `check:roadmap` niets over die spec; met `status: gebouwd # #130`, `status: gebouwd # test/rails/x.test.ts`,
  `` status: gebouwd # `pnpm test:unit` `` of `status: gebouwd # gebouwd in PR #51` meldt hij `spec:bewijs:<bestand>`
  met de nieuwe tekst.
- **mandate-follow-up/AC-11** — Gegeven een spec die naar `gebouwd` gaat zonder geldig statusbewijs maar met een nieuw
  afgevinkt roadmap-item met bewijs, dan meldt `check:roadmap` `spec:bewijs:<bestand>`.
- **mandate-follow-up/AC-12** — `check-roadmap.mjs` heeft geen eigen parser voor het statuscommentaar: hij importeert
  `builtReference`, en voor elke statusregel uit AC-10 geven `builtReference(...) !== null` en "geen `spec:bewijs`-melding"
  dezelfde uitkomst.
- **mandate-follow-up/AC-13** — Een spec die in de basis al `gebouwd` was (ook in een oude vorm, zoals
  `docs/specs/roadmap-vinkjes.md` en `docs/specs/design-system.md`), geeft geen melding; alleen de overgang wordt
  gecontroleerd (roadmap/AC-12 blijft gelden).
- **mandate-follow-up/AC-14** — `docs/dod.md:10` en de zin in `docs/framework.md` §8 luiden letterlijk als hierboven;
  `pnpm ratchet` (check-docs) blijft groen.
- **mandate-follow-up/AC-15** — Een unit-test faalt zodra `HOST_FILES` in `scripts/runner.sh` en de export uit
  `.claude/hooks/lib/runner-authority.mjs` als verzameling verschillen (bewezen met een fixture waarin één entry ontbreekt),
  en slaagt op de huidige stand.
- **mandate-follow-up/AC-16** — `scripts/runner.sh` geeft `compose.*.yaml` ongeëxpandeerd aan git door: met een
  ongetrackt `compose.extra.yaml` stopt hij met de bestaande melding "wijken af van HEAD".
- **mandate-follow-up/AC-17** — `scripts/runner.sh db` stopt vóór de eerste `docker`-aanroep met de letterlijke melding als
  (a) een genegeerd bestand onder een hostpad staat, (b) een getrackt hostbestand een symlink is, of (c) een map in het pad
  van een hostbestand een symlink is; lokaal en met `CI=true`. Met `--sta-wijzigingen-toe` gaat hij door.
- **mandate-follow-up/AC-18** — De bestaande tests in `test/scripts/runner-guard.test.ts` en
  `test/hooks/runner-authority.test.ts` blijven groen.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Item noemt de spec alleen zonder backticks of via een markdownlink | Geen match; uitzondering geldt niet (AC-3) | n.v.t. |
| Item was in de basis al `[x]` | Geen open item; wijziging faalt (AC-3, AC-9) | n.v.t. |
| Eén item noemt de paden van twee specs met mandaat | Het is het item van beide; elk van beide moet precies één open item hebben | n.v.t. |
| Bewijs op een nieuwe vervolgregel van het item | Toegestaan als aanvulling (B1 punt 2) | n.v.t. |
| CRLF in `docs/roadmap.md` | Vergelijking per regel na normalisatie van `\r\n`, zoals `documentInfo` | n.v.t. |
| Vinkje vóór de gevalideerde SHA gezet (met de hand) | Valt onder de gewone diff van de PR; B1 geldt via `verifyScopedFile` | n.v.t. |
| `docs:status --roadmap` zonder actief mandaat | Zelfde itemregels; CI controleert dan geen scope (AC-7) | n.v.t. |
| Spec in oude vorm al `gebouwd` op main | Geen melding, geen omzetting van oude statusregels (AC-13) | n.v.t. |
| Spec naar `gebouwd` zonder roadmap-item | Alleen statusbewijs nodig; `--roadmap` faalt (AC-9) | n.v.t. |
| Genegeerd bestand onder een hostpad in CI (bijv. een `*.log` in `scripts/`) | `runner.sh` stopt ook in CI (AC-17); geen uitzondering voor CI | n.v.t. |

## Raakt ook

| Bestand | Gate-pad | Wijziging |
|---|---|---|
| `scripts/kit/check-document-status.mjs` | ja | B1 in `verifyScopedFile` via `taakVinkje` |
| `scripts/kit/status-git.mjs` | ja | B1 in `statusOnlyDiff` via `taakVinkje` |
| `scripts/kit/document-status.mjs` | ja | optie `--roadmap`, nieuwe gebruikstekst en succesregel |
| `scripts/kit/check-roadmap.mjs` | ja | `builtReference` importeren, `statusBewijs` en de `roadmapBewijs`-route weg, nieuwe meldingstekst, `heeftBewijs` exporteren |
| nieuw: module met `taakVinkje` (bijv. `scripts/kit/roadmap-item.mjs`) | ja | gedeelde B1-controle |
| `.claude/hooks/lib/runner-authority.mjs` | ja | `HOST_FILES` exporteren |
| `scripts/runner.sh` | ja | `'compose.*.yaml'` quoten; genegeerde en onveilige hostbestanden weigeren |
| `docs/dod.md` | ja | regel 10 |
| `docs/framework.md` | ja | één zin in §8 (regel 297) |
| `docs/operations/agent-doorloop.md` | nee | voorbeeld `pnpm docs:status … gebouwd --pr 123 --roadmap` bij de gebouwd-stap (rond regel 76) |
| `test/rails/check-roadmap.test.ts` + fixtures | ja | de bestaande gevallen `spec-gebouwd-bewijs-in-status` en `spec-gebouwd-met-roadmapvinkje` krijgen een andere verwachting, omdat B2 het gedrag verandert (reden in de PR) |

Door B2 vervallen of veranderen bestaande criteria: roadmap/AC-10 (het voorbeeld `status: gebouwd # gebouwd in PR #51`
is niet meer geldig) en de route "vink het roadmap-item af" uit "Spec naar `gebouwd`" in `docs/specs/roadmap-vinkjes.md`.
Die spec staat op `gebouwd` en wordt niet bewerkt (inhoud wijzigen onder een goedkeuringsstatus vraagt een nieuw
eigenaarbesluit, task-mandate/AC-8); deze spec gaat voor.

## Buiten scope

- `checks: read` in `.github/workflows/guard.yml` (de eigenaar wacht af of het nodig is).
- De spec- en ADR-statussen van PR #130 (de eigenaar bevestigt die zelf).
- Het lokale rolhek voor `docs/roadmap.md` (blijft gate-pad).
- Bestaande gebouwde specs omzetten naar de nieuwe vorm.
- Eén gedeeld bestand voor `HOST_FILES` (OV-4 kiest twee lijsten plus test).
- ADR 0029 (snellere beslisroute, `voorgesteld`): deze spec bouwt er niet op.

## Testplan

- Unit (`test/rails/`, in `pnpm test:unit`): fixtures voor `check:roadmap` per regel van AC-10 en AC-11; de tabeltest van
  AC-12 over `builtReference`; `taakVinkje` per geval van AC-1 t/m AC-5 als pure functie; de gelijkheidstest van AC-15
  met een negatieve fixture.
- Echte tijdelijke Git-repositories (zoals `test/hooks/authority-git.test.ts`): `check-document-status` met een register
  op main voor AC-1 t/m AC-5 en AC-7; `statusOnlyDiff` voor AC-6; `docs:status --roadmap` voor AC-8 en AC-9, met
  GitHub-gegevens als pure invoer zoals nu in `test/hooks/pr-evidence.test.ts` (geen live netwerk in tests).
- `scripts/runner.sh` in tijdelijke repo's met de docker-stub uit `test/scripts/runner-guard.test.ts` voor AC-16 en AC-17;
  regressie AC-18.
- Daarna `pnpm gate:fast`, de verplichte GitHub-checks op de head-SHA en eigenaarreview (diff-guard, label `gate-wijziging`).

## Eigenaarbesluiten

Doorgegeven via de hoofdsessie op 2026-10-13; de eigenaar bevestigt ze door deze spec op `goedgekeurd` te zetten.

- **OV-1 (B2)** — Een spec naar `gebouwd` alleen met `status: gebouwd # #<PR>; gevalideerd: <sha>`; een roadmap-vinkje met testpad, checknaam of PR-nummer.
- **OV-2 (B1)** — Het item noemt het spec-pad tussen backticks; precies één open item per spec. Twee mandaten op één branch mogen elk hun eigen item afvinken.
- **OV-3 (B1)** — Een optie in `pnpm docs:status … gebouwd` (`--roadmap`) zet vinkje en status in één stap, met dezelfde smalle controles.
- **OV-4 (B3)** — Twee `HOST_FILES`-lijsten plus een gelijkheidstest; `'compose.*.yaml'` gequote in `runner.sh`.
- **OV-5 (B3)** — `runner.sh` wordt in deze spec gelijkgetrokken met de hook: genegeerde en onveilige hostbestanden weigeren.
- **OV-6** — `docs/framework.md` §8 noemt de uitzondering in één zin, met verwijzing naar `docs/dod.md`.

## Open vragen voor de eigenaar

- **OV-7** — Het bewijs dat `--roadmap` achter het item zet: ` (#<nummer>)` aan het einde van de laatste regel van het item. Akkoord, of een andere vorm?
