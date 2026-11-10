---
status: goedgekeurd
namespace: tests-naar-vermogen
model: opus
---

# Tests naar vermogen: overslaan waar de kooi niet kan starten, nooit in CI

## Doel

Tests die de kooi of schrijfrechten in systeemmappen nodig hebben, slaan over waar een proef laat zien dat dat vermogen
ontbreekt (de sandbox van Claude Code), met één melding; in CI is elke overgeslagen test rood
([ADR 0087](../adr/0087-tests-naar-vermogen.md), leerpunt #607).

Kritiek werk (ADR, A3/A4): deze besluit-PR bevat alleen `docs/adr/` en `docs/specs/`; de bouw is een tweede PR.

## Rollen en wie wat ziet

n.v.t. — testinfrastructuur voor hoofdsessie, subagents, eigenaar en CI; geen app-gebruikers. De tien bestaande testbestanden
wijzigt de hoofdsessie (het rolhek weigert tester en developer een extra skip; deze merge is het eigenaarakkoord, R-TEST-02).

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Koppeling

n.v.t. — geen externe dienst.

## Kopieer de vorm van

- `test/setup/tmp-root.ts` — globale setup die één keer per run draait en na afloop opruimt
- `scripts/kit/kooi.mjs` — `proef()` en `beoordeelProef()`: de proef van de kooi en de meldingen
- `scripts/kit/gate-fast.mjs` — gebufferde uitvoer per gate en de slotregel
- `test/scripts/kooi.test.ts` — tests die de kooi aanroepen

## Hergebruik en UX

n.v.t. — geen UI. Letterlijke teksten (`<…>` wordt ingevuld):

- lokaal, per vermogen, aan het eind van de run: `⚠ overgeslagen: <n> tests, want <vermogen> ontbreekt hier (<reden>); ze draaien in CI, waar overslaan rood is (ADR 0087)`
- in CI, per overgeslagen test: `✗ overgeslagen in CI: <bestand> > <testnaam>; in CI slaat geen test over (ADR 0087)`
- in CI bij een ontbrekend vermogen, in de setup: `✗ vermogen <vermogen> ontbreekt in CI (<reden>); in CI slaat geen test over (ADR 0087)`
- skipnotitie per test: `<vermogen> ontbreekt hier; draait in CI`

`<reden>` is voor `kooi` de melding van `beoordeelProef` (`✗ kooi: bubblewrap start niet …` of de melding zonder bubblewrap).

## Acceptatiecriteria

- **tests-naar-vermogen/AC-1** — Eén module `test/setup/vermogen.ts` kent precies twee vermogens: `kooi` (de proef van
  `scripts/kit/kooi.mjs` geeft `goed`, of een andere melding dan "bubblewrap start niet" of "bubblewrap ontbreekt") en
  `systeemmappen` (een map aanmaken en weghalen lukt in `/tmp`, `/var/tmp` en de thuismap). De proef draait één keer per
  vitest-run als globale setup ná `test/setup/tmp-root.ts` en geeft de uitslag aan de tests via `provide`/`inject`. Geen
  omgevingsvariabele, omgevingsnaam of CLI-optie verandert de uitslag. Test: met een kooi die niet start is `kooi` afwezig;
  met `MELDING_PROEF` (kooi start, schermt niet af) is `kooi` aanwezig.
- **tests-naar-vermogen/AC-2** — De helper `vermogen(naam)` uit dezelfde module geeft `{ ontbreekt, melding }`. Een testbestand
  zet de voorwaarde met één zichtbare `ctx.skip(<ontbreekt>, <melding>)`-aanroep (in een `beforeEach` van het kleinste
  bestaande `describe`-blok, of in de test zelf), met voorwaarde en tekst alleen uit `vermogen(naam)`. `testChangeRisk` geeft
  op die wijziging van een bestaand bestand `'skip'` (bestaand gedrag, ongewijzigd).
- **tests-naar-vermogen/AC-3** — De tien bestanden uit #607 krijgen de voorwaarde: `kooi` in `test/hooks/rolhek-padcorpus.test.ts`,
  `test/hooks/rolhek-effect.test.ts`, `test/hooks/rolhek-effect-hoofdsessie.test.ts`, `test/hooks/rolhek-specarchief-effect.test.ts`,
  `test/docs/start-nieuwe-app.test.ts`, `test/rails/ci-scan.test.ts`, `test/rails/document-status-lokaal-config.test.ts`,
  `test/scripts/runner-trusted-base.test.ts` en `test/scripts/kooi.test.ts`; `kooi` en `systeemmappen` voor de kanarietests
  van kooi/AC-4; voor `test/scripts/cloud-setup.test.ts` en de test "zonder bubblewrap" in `kooi.test.ts` volgens OV-1. Geen
  assertie, testnaam of aantal testgevallen verandert. De PR noemt per bestand het aantal overgeslagen tests in de sandbox
  naast het aantal dat nu faalt; meer overgeslagen dan faalt heeft een reden per bestand.
- **tests-naar-vermogen/AC-4** — In de sandbox van Claude Code (zonder `GITHUB_ACTIONS`) eindigt `pnpm test:unit` met exitcode 0
  en drukt het per ontbrekend vermogen precies één regel `⚠ overgeslagen: …` af.
- **tests-naar-vermogen/AC-5** — Een reporter in `test/setup/` (in `vitest.config.ts` naast de standaardreporter) telt na elke
  run de overgeslagen en `todo`-tests. Met `GITHUB_ACTIONS=true` en minstens één zo'n test is de exitcode van vitest niet 0
  en noemt de uitvoer elke test met de CI-melding. Bewijs: een test draait vitest op een fixture met één `ctx.skip` en
  verwacht met `GITHUB_ACTIONS=true` exit ≠ 0 met de melding, zonder die variabele exit 0 met de `⚠`-regel (R-PRINC-04).
- **tests-naar-vermogen/AC-6** — Met `GITHUB_ACTIONS=true` en een ontbrekend vermogen faalt de globale setup met de CI-melding
  en draait geen test. Test met een geïnjecteerde proef.
- **tests-naar-vermogen/AC-7** — `gate:fast` toont onder elke groene gate de uitvoerregels die met `⚠ ` beginnen, vóór de
  lijst; een groene gate zonder zulke regels toont niets extra. Test in de bestaande tabeltest van `gateFast`.
- **tests-naar-vermogen/AC-8** — Op de head van de bouw-PR is de CI-job `gate:fast` groen met 0 overgeslagen tests in
  `test-1` en `test-2` (AC-5 actief); het bestaande `test.skipIf(IS_ROOT)` in `test/hooks/laden-commondir.test.ts` slaat in CI
  niet over. Lukt dat niet, dan stopt de bouw en vraagt de eigenaar.
- **tests-naar-vermogen/AC-9** — Docs: `docs/operations/testuitvoering.md` (nieuwe sectie: vermogens, melding, CI rood bij
  overslaan), `docs/operations/agent-doorloop.md` (lokaal groen met `⚠ overgeslagen` is geen bewijs; CI via `pnpm pr:verify`),
  `docs/operations/sandbox-bewijs.md` (geen geneste kooi in de sandbox), de randgevalregel in `docs/specs/kooi.md` en
  `CHANGELOG.md`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Sandbox van Claude Code: bubblewrap mag geen namespace maken | `kooi` ontbreekt; tests slaan over met melding (AC-4) | n.v.t. |
| Kooi start, schrijft toch buiten de werkmap (`MELDING_PROEF`) | `kooi` aanwezig; tests falen, ook lokaal (AC-1) | n.v.t. |
| Lokaal zonder bubblewrap | `kooi` ontbreekt; melding noemt de installatie (OV-2) | n.v.t. |
| CI zonder werkende kooi | setup faalt (AC-6); de bestaande workflowstap `kooi.mjs --proef` faalt al eerder | n.v.t. |
| `ctx.skip(true, …)` in een bestand dat al een voorwaarde had | teller ziet geen stijging; CI rood (AC-5) | n.v.t. |
| Lokaal eigen `--reporter` | geen `⚠`-regel; CI gebruikt de vaste aanroep | n.v.t. |
| Agent zet `GITHUB_ACTIONS=true` lokaal | strenger: kooitests rood; het rolhek hoeft dat niet te weigeren | n.v.t. |
| Nieuwe kooitest zonder voorwaarde | rood in de sandbox: valt op | n.v.t. |
| `test:db` in de runner (geen `GITHUB_ACTIONS` in de container) | AC-5 niet actief; daar bestaan geen skips | n.v.t. |
| AC-4-test "de timeout stopt het commando" | slaagt nu in de sandbox om de verkeerde reden (`inKooi` gooit al bij de proef); krijgt de voorwaarde mee | n.v.t. |

## Raakt ook

`vitest.config.ts` (voorReview: globale setup en reporter), `test/setup/vermogen.ts` en de reporter (gate: hoofdsessie),
`scripts/kit/gate-fast.mjs` en zijn test (voorReview), de tien testbestanden (gate: hoofdsessie, reden in de PR), een fixture
voor AC-5. Ongewijzigd: `lefthook.yml`, `.github/workflows/ci.yml`, `rails/hooks/**`, `scripts/kit/kooi.mjs`. In dezelfde
besluit-PR zet de hoofdsessie, zodra het PR-nummer bekend is, een herzieningsregel in ADR 0072 en ADR 0085 (ADR 0074).
`check:migrations`, `check:secdef`, `test:db`/policies, `test/security/resources.ts` en permissietests: n.v.t. (geen database,
route of permissie).

## Buiten scope

Leerpunt #658 (runnermelding), de pre-commit-job `secrets`/mise trust, CI-logs ophalen in de sandbox (#626), de Stop-hook die
"pnpm start niet" van "check rood" onderscheidt (restpunt #621), de testteller uitbreiden.

## Testplan

`test/setup/vermogen.test.ts`: AC-1 en AC-6 met een geïnjecteerde proef (start niet, ontbreekt, schermt niet af, goed). Een
railtest voor AC-5 op een fixture onder `test/rails/fixtures/`. De bestaande tabeltest van `gate-fast` voor AC-7. AC-2 met
`testChangeRisk` op een voor/na-paar. AC-4 en AC-8 als uitslag in de PR (sandbox lokaal, CI via `pnpm pr:verify`).

## Open vragen

- **OV-1** — `test/scripts/cloud-setup.test.ts` (2 tests) en de kooi/AC-3-test "zonder bubblewrap" falen alleen omdat de test
  een kindproces start zonder `TMPDIR`, zodat `mktemp`/`mkdtemp` naar `/tmp` schrijft (`EROFS`). Opties: voorwaarde
  `systeemmappen`, of `TMPDIR: tmpdir()` meegeven. Aanbeveling: `TMPDIR` meegeven; dan draaien ze overal en slaat niets over.
  Dat wijzigt de testopzet (geen assertie) en valt buiten het akkoord "alleen de voorwaarde"; de merge van deze PR is dat akkoord.
- **OV-2** — Telt een ontbrekende `bwrap` (ENOENT) lokaal als ontbrekend vermogen? Aanbeveling: ja, met de installatiemelding
  in `<reden>`; CI blijft dicht (AC-5, AC-6).
- **OV-3** — Geldt AC-5 voor elke overgeslagen test of alleen voor tests met een vermogen-notitie? Aanbeveling: elke; geen lijst,
  vangt ook een uitgezette voorwaarde, en vandaag slaat in CI niets over (AC-8 bewijst het).
