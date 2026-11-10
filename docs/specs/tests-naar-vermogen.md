---
status: goedgekeurd
namespace: tests-naar-vermogen
model: sonnet
---

# Tests naar vermogen: overslaan waar de kooi niet kan starten, nooit in CI

## Doel

Tests die de kooi nodig hebben, slaan over waar een proef laat zien dat de kooi hier niet kan starten (de sandbox van Claude
Code), met één melding; in CI is elke overgeslagen test rood ([ADR 0088](../adr/0088-tests-naar-vermogen.md), leerpunt #607).

Kritiek werk (ADR, A3/A4): deze besluit-PR bevat alleen `docs/adr/` en `docs/specs/`; de bouw is een tweede PR.

## Rollen en wie wat ziet

n.v.t. — testinfrastructuur voor hoofdsessie, subagents, eigenaar en CI; geen app-gebruikers. De bestaande testbestanden
wijzigt de hoofdsessie: het rolhek weigert tester en developer een extra skip en vraagt de hoofdsessie per testbestand om
akkoord; deze merge is dat eigenaarakkoord (R-TEST-02). `verifyTestwijzigingen` in `scripts/kit/check-document-status.mjs`
draait alleen in de feature-lane met een open besluit en blokkeert de bouw-PR dus niet.

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

- lokaal, aan het eind van de run: `⚠ overgeslagen: <n> tests, want de kooi kan hier niet starten (<reden>); ze draaien in CI, waar overslaan rood is (ADR 0088)`
- in CI, per overgeslagen test: `✗ overgeslagen in CI: <bestand> > <testnaam>; in CI slaat geen test over (ADR 0088)`
- in CI bij een ontbrekende kooi, in de setup: `✗ kooi ontbreekt in CI (<reden>); in CI slaat geen test over (ADR 0088)`
- skipnotitie per test: `kooi ontbreekt hier; draait in CI`

`<reden>` is de melding uit de proef van `scripts/kit/kooi.mjs` (`✗ kooi: bubblewrap start niet …` of `MELDING_GEEN_BWRAP`).

## Acceptatiecriteria

- **tests-naar-vermogen/AC-1** — `scripts/kit/kooi.mjs` geeft naast de melding een gestructureerde uitslag van de proef met
  een geëxporteerde soort: `goed`, `start-niet` (bubblewrap ontbreekt of start niet) of `schermt-niet-af` (`MELDING_PROEF`).
  Eén module `test/setup/vermogen.ts` kent één vermogen, `kooi`: afwezig alleen bij `start-niet`; bij `schermt-niet-af` is het
  aanwezig en falen de tests. Geen variabele, omgevingsnaam of optie schakelt overslaan rechtstreeks; de proef meet de omgeving.
  De proef draait één keer per vitest-run als globale setup van de projecten `unit` en `web` (niet `int`), ná
  `test/setup/tmp-root.ts`, en geeft de uitslag door via `provide`/`inject`.
- **tests-naar-vermogen/AC-2** — Dicht vallen in de setup: gooit de proef zelf een uitzondering, dan faalt de run met die fout
  (geen overslaan). De helper `vermogen('kooi')` geeft `{ ontbreekt, melding }`; levert `inject` niets op (een project zonder
  deze globale setup), dan gooit `vermogen()` een fout met de projectnaam, nooit `ontbreekt: true`.
- **tests-naar-vermogen/AC-3** — Een testbestand zet de voorwaarde met één zichtbare `ctx.skip(<ontbreekt>, <melding>)` in een
  `beforeEach` van het kleinste bestaande `describe`-blok of in de test zelf, met waarden alleen uit `vermogen('kooi')`.
  Terugval als `ctx.skip(voorwaarde, notitie)` in vitest 5.0.3 niet bestaat: `describe.skipIf(vermogen('kooi').ontbreekt)` of
  `test.skipIf(…)` op dezelfde plek (de teller in `rails/hooks/lib/testteller.mjs` telt `skipIf` als skip); de melding komt dan
  alleen uit de setup (AC-5).
- **tests-naar-vermogen/AC-4** — De voorwaarde `kooi` komt in `test/hooks/rolhek-padcorpus.test.ts`,
  `test/hooks/rolhek-effect.test.ts`, `test/hooks/rolhek-effect-hoofdsessie.test.ts`, `test/hooks/rolhek-specarchief-effect.test.ts`,
  `test/docs/start-nieuwe-app.test.ts`, `test/rails/ci-scan.test.ts`, `test/rails/document-status-lokaal-config.test.ts`,
  `test/scripts/runner-trusted-base.test.ts` en `test/scripts/kooi.test.ts` (ook de kanarietests van kooi/AC-4). In
  `test/scripts/cloud-setup.test.ts` en in de kooi/AC-3-test "zonder bubblewrap" krijgt het kindproces `TMPDIR: tmpdir()` mee,
  zonder voorwaarde. Geen assertie, testnaam of aantal testgevallen verandert. De PR noemt per bestand het aantal overgeslagen
  tests in de sandbox naast het aantal dat nu faalt; meer overgeslagen dan faalt heeft een reden per bestand.
- **tests-naar-vermogen/AC-5** — In de sandbox van Claude Code (zonder `GITHUB_ACTIONS` en `CI`) eindigt `pnpm test:unit` met
  exitcode 0, slagen `cloud-setup.test.ts` en de test "zonder bubblewrap", en drukt de run precies één regel `⚠ overgeslagen: …`
  af.
- **tests-naar-vermogen/AC-6** — CI is `GITHUB_ACTIONS` of `CI` met een niet-lege waarde anders dan `false` of `0`. Een reporter in
  `test/setup/` (in `vitest.config.ts` naast de standaardreporter) telt na elke run de overgeslagen en `todo`-tests; in CI met
  minstens één zo'n test is de exitcode van vitest niet 0 en staat elke test in de uitvoer met de CI-melding. Terugval als
  een reporter de exitcode niet kan zetten: de reporter drukt de CI-melding af en `scripts/kit/gate-fast.mjs` maakt `test:unit`
  rood zodra de uitvoer een regel `✗ overgeslagen in CI:` bevat (in CI is `pnpm gate:fast` de enige aanroep van `test:unit`).
- **tests-naar-vermogen/AC-7** — In CI met een ontbrekende kooi faalt de globale setup met de CI-melding en draait geen test.
- **tests-naar-vermogen/AC-8** — `gate:fast` toont onder elke groene gate de uitvoerregels die met `⚠` en een spatie beginnen,
  vóór de lijst; een groene gate zonder zulke regels toont niets extra.
- **tests-naar-vermogen/AC-9** — Op de head van de bouw-PR zijn de CI-jobs `gate:fast (test-1)`, `gate:fast (test-2)`,
  `check:new-resource (test-1)` en `check:new-resource (test-2)` groen met AC-6 actief en 0 overgeslagen tests; dat bewijst ook
  dat `describe.skipIf(!bashAanwezig)` in `test/hooks/shell-glob-klasse-bash.test.ts` en de vier `test.skipIf(IS_ROOT)` in
  `test/hooks/laden-commondir.test.ts` in CI niet overslaan. Lukt dat niet, dan stopt de bouw en vraagt de eigenaar.
- **tests-naar-vermogen/AC-10** — Docs in de bouw-PR: `docs/operations/testuitvoering.md` (de voorwaarde, de melding, rood in CI),
  `docs/operations/agent-doorloop.md` (lokaal groen met `⚠ overgeslagen` is geen bewijs; CI via `pnpm pr:verify`),
  `docs/operations/sandbox-bewijs.md` (geen geneste kooi in de sandbox), `CHANGELOG.md`, en in `docs/specs/kooi.md` de
  randgevalregel "Test heeft de kooi nodig maar bubblewrap ontbreekt" naar: slaat over met melding waar de kooi niet kan
  starten, nooit in CI; een kooi die start maar niet afschermt: test faalt.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Sandbox van Claude Code: bubblewrap mag geen namespace maken | `kooi` ontbreekt; tests slaan over met melding (AC-5) | n.v.t. |
| Kooi start, schrijft toch buiten de werkmap (`schermt-niet-af`) | `kooi` aanwezig; tests falen, ook lokaal (AC-1) | n.v.t. |
| Lokaal zonder bubblewrap, of `PATH` zonder `bwrap` | `kooi` ontbreekt; melding noemt de installatie; aanvaard restrisico (ADR 0088) | n.v.t. |
| De proef gooit zelf een uitzondering | run faalt, niets slaat over (AC-2) | n.v.t. |
| Project zonder de globale setup (`int`) roept `vermogen()` aan | fout met projectnaam, niet overslaan (AC-2) | n.v.t. |
| CI zonder werkende kooi | setup faalt (AC-7); de workflowstap `kooi.mjs --proef` faalt al eerder | n.v.t. |
| Bestaande voorwaarde inhoudelijk uitgezet (`ctx.skip(true, …)`) | teller ziet geen stijging; CI rood (AC-6) | n.v.t. |
| Lokaal eigen `--reporter` | geen `⚠`-regel; CI gebruikt de vaste aanroep | n.v.t. |
| Agent zet lokaal `CI` of `GITHUB_ACTIONS` | strenger: kooitests rood | n.v.t. |
| Nieuwe kooitest zonder voorwaarde | rood in de sandbox: valt op | n.v.t. |
| kooi/AC-4-test "de timeout stopt het commando" | slaagt nu in de sandbox om de verkeerde reden (`inKooi` gooit al bij de proef); krijgt de voorwaarde mee | n.v.t. |

## Raakt ook

`scripts/kit/kooi.mjs` (gestructureerde uitslag, AC-1; voorReview), `vitest.config.ts` (globale setup per project en reporter;
voorReview), `test/setup/vermogen.ts` en de reporter (gate: hoofdsessie), `scripts/kit/gate-fast.mjs` en zijn test
(voorReview), de tien testbestanden (gate: hoofdsessie, reden in de PR), een fixture onder `test/rails/fixtures/`. Ongewijzigd:
`lefthook.yml`, `.github/workflows/ci.yml`, `rails/hooks/**`. `check:migrations`, `check:secdef`, `test:db`/policies,
`test/security/resources.ts` en permissietests: n.v.t. (geen database, route of permissie).

## Buiten scope

Leerpunt #658 (runnermelding), de pre-commit-job `secrets`/mise trust, CI-logs ophalen in de sandbox (#626), de Stop-hook die
"pnpm start niet" van "check rood" onderscheidt (restpunt #621), de testteller uitbreiden.

## Testplan

`test/setup/vermogen.test.ts`: AC-1, AC-2 en AC-7 met een geïnjecteerde proef (`goed`, `start-niet`, `schermt-niet-af`, de
proef gooit) en een ontbrekende `inject`. `test/scripts/kooi.test.ts`: de soort van de uitslag per tak. Een railtest voor AC-6
die vitest draait op een fixture met één skip: met `CI=true` exit niet 0 en de CI-melding, zonder exit 0 en de `⚠`-regel
(R-PRINC-04); bij de terugval dezelfde toets op `gate:fast`. De bestaande tabeltest van `gate-fast` voor AC-8. AC-5 en AC-9
als uitslag in de PR (sandbox lokaal, CI via `pnpm pr:verify`).

## Open vragen

- **OV-1 ✅ besloten** — `cloud-setup.test.ts` en de test "zonder bubblewrap" krijgen `TMPDIR` mee in plaats van een voorwaarde
  (AC-4); daarmee vervalt het vermogen voor schrijfbare systeemmappen.
- **OV-2 ✅ besloten** — Een ontbrekende `bwrap` telt lokaal als ontbrekende kooi, met de installatiemelding (AC-1, AC-5).
- **OV-3 ✅ besloten** — In CI maakt elke overgeslagen test de run rood, niet alleen een test met de kooinotitie (AC-6).
