---
status: goedgekeurd
namespace: pnpm-sandbox
---

# Eén installatiepad voor pnpm, getoetst in een strenge kooi

## Doel

Een nieuwe versie van pnpm of Node die buiten de werkmap wil schrijven, valt op in `gate:fast` van de PR die de versie
ophoogt. Dat gebeurt niet pas in een cloudsessie. Daarvoor installeren `worktree-install.mjs`, `cloud-setup.sh` en
`bootstrap.sh` via één module.

## Aanleiding

- pnpm 12 (#984) legt zijn store-vergrendeling in `$XDG_RUNTIME_DIR`, en zonder die variabele in `/tmp` (ADR 0110).
  `worktree-install.mjs` kreeg daarvoor een eigen `XDG_RUNTIME_DIR`. `cloud-setup.sh` kreeg die niet, en faalde binnen de
  sandbox van een cloudsessie met `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK` (hersteld in #997).
- De majorchecklist (`.github/pull_request_template.md`, punt 3) vroeg om `cloud-setup.sh` in een verse cloudsessie.
  Dat ving dit niet, want bij de containerstart draait het script buiten de sandbox. Een regel in proza is geen check
  (R-DOC-02).
- `cloud-setup.sh` meldde de vergrendelfout als "waarschijnlijk geen netwerk". Die melding stuurde de diagnose de verkeerde
  kant op.
- De bestaande kooi (`scripts/kit/kooi.mjs:76`, `:83`) maakt `/tmp`, `/run`, `/var/run` en de thuismap een schrijfbare tmpfs
  en zet `TMPDIR=/tmp` (`:94`). Een test in die kooi ziet schrijven naar die plekken dus niet (spec-review, B1).

## Rollen en wie wat ziet

Alleen ontwikkelomgeving en CI; geen app-rollen. De eigenaar ziet het resultaat als rode of groene `gate:fast` op een PR.

## Kopieer de vorm van

- `scripts/kit/worktree-install.mjs`: de pure kern `worktreeInstallCommando` (pnpm-argumenten en XDG-mappen onder één
  basismap), het aanmaken van `XDG_RUNTIME_DIR` (0700) vóór de start van pnpm en de melding als pnpm niet start.
- `scripts/kit/kooi.mjs`: `bwrapArgs` en `inKooi`, uitgebreid met een optie in plaats van een tweede kooi.
- `test/rails/ci-scan.test.ts`: een kooitest met `ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding)`. Lokaal
  zonder bubblewrap wordt hij overgeslagen; in CI is overslaan rood (ADR 0088).
- `test/support/absence.ts`: `expectAbsent` met `AbsenceExamples` (`recognizes`, `allows`) voor de tekstregel van AC-5.

## Hergebruik en UX

- Geen UI. Bestaande scripts: `scripts/kit/worktree-install.mjs`, `scripts/cloud-setup.sh`, `scripts/bootstrap.sh`,
  `scripts/kit/kooi.mjs`.
- **Kooi.** `inKooi(commando, { werkmap, env, timeout, streng })`. Met `streng: true` worden `/tmp`, `/run`, `/var/run`, de
  thuismap en `XDG_RUNTIME_DIR` een lege map die alleen-lezen is: `--tmpfs <map>`, dan de bind van de werkmap, dan
  `--remount-ro <map>`. Zo blijven de thuismap en sockets onder `/run` onzichtbaar (kooi/AC-4 blijft gelden), en faalt elke
  schrijfpoging buiten de werkmap. De werkmap is de enige schrijfbare plek en `TMPDIR` is `<werkmap>/tmp` (aangemaakt).
  Zonder `streng` blijft het gedrag precies zoals nu. CLI: `--streng` vóór `--werkmap`.
- **Installatiemodule.** Nieuw: `scripts/kit/pnpm-installeer.mjs`, zonder dependencies. De pure kern
  `pnpmInstallCommando(basis, { modus, cloud })` geeft `{ command: 'pnpm', args, env }`:
  - `modus: 'werkmap'`: argumenten `install --frozen-lockfile --package-import-method=copy --store-dir <basis>/store --cache-dir <basis>/cache`,
    omgeving `XDG_DATA_HOME=<basis>/data`, `XDG_CACHE_HOME=<basis>/xdg-cache`, `XDG_STATE_HOME=<basis>/xdg-state`,
    `XDG_RUNTIME_DIR=<basis>/xdg-run`. Dat zijn precies de waarden van `worktreeInstallCommando` (`worktree-install.mjs:63-79`).
  - `modus: 'setup'` (hoofdcheckout en cloudcontainer): argumenten `install --frozen-lockfile`, omgeving alleen
    `XDG_RUNTIME_DIR=<basis>/xdg-run`. De gewone store, cache en state blijven (besluit eigenaar, OV-1).
  - `cloud: true` voegt als laatste argument `--config.confirm-modules-purge=false` toe.
- De module exporteert ook `installeer({ modus, cloud })`, de enige plek die pnpm voor een installatie start. Die functie
  maakt de basismap en de mappen aan (`xdg-run` met 0700), schoont de omgeving op (verwijdert `npm_config_*` en
  `NODE_OPTIONS`, zoals nu `pnpmOmgeving`), start pnpm in de huidige map (`process.cwd()`), stuurt de uitvoer door, deelt een
  fout in en geeft de exitcode van pnpm terug. `veiligeBasismap`, `pnpmOmgeving` en `miseMappen` verhuizen van
  `worktree-install.mjs` naar de module; `worktree-install.mjs` importeert de module, nooit andersom. De basismap is
  `veiligeBasismap()` voor `werkmap`, en een nieuwe `mkdtemp` onder `os.tmpdir()` voor `setup`, die na afloop wordt opgeruimd.
- CLI `node scripts/kit/pnpm-installeer.mjs --modus werkmap|setup [--cloud]` roept `installeer` aan.
- `worktree-install.mjs` houdt zijn weigeringen en roept daarna `installeer({ modus: 'werkmap', cloud })` aan. `cloud-setup.sh`
  roept `mise exec -- node scripts/kit/pnpm-installeer.mjs --modus setup --cloud` aan, zonder de wrapper `netwerk` eromheen;
  `bootstrap.sh` roept `mise exec -- node scripts/kit/pnpm-installeer.mjs --modus setup` aan. De `export XDG_RUNTIME_DIR` en
  `trap` uit #997 vervallen in `cloud-setup.sh`.
- Meldingen van `installeer`, letterlijk:
  - netwerkfout (uitvoer bevat `ERR_PNPM_FETCH_`, `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND` of `EAI_AGAIN`):
    `✗ pnpm install mislukt (exit <n>): waarschijnlijk geen netwerk → docs/ENVIRONMENT.md, Problemen.`; met `cloud` volgt een
    tweede regel, ingesprongen met twee spaties: `→ staat netwerktoegang van de omgeving op Trusted (claude.ai/code)? Is de proxy bereikbaar?`
  - anders: `✗ pnpm install mislukt (exit <n>): zie de pnpm-fout hierboven → docs/ENVIRONMENT.md, Problemen.`
  - basismap niet aan te maken: `✗ pnpm-installeer: <map> niet aan te maken (<reden>); controleer TMPDIR`, exit 1.

## Acceptatiecriteria

- **pnpm-sandbox/AC-1** — Gegeven `inKooi` met `streng: true`, dan faalt `: > /tmp/x`, faalt schrijven in `/run` en in de
  thuismap, is een bestand dat de test vooraf in de echte thuismap van de aanroeper zet niet leesbaar, is een unix-socket die de
  test vooraf onder `XDG_RUNTIME_DIR` opent niet bereikbaar, slaagt schrijven in de werkmap, en is `$TMPDIR` gelijk aan
  `<werkmap>/tmp`. Zonder `streng` slaagt `: > /tmp/x` zoals nu. Toets: `test/scripts/kooi.test.ts`
- **pnpm-sandbox/AC-2** — Gegeven een fixtureproject in de werkmap met de `packageManager`-pin van de repo, nul dependencies en
  een `pnpm-lock.yaml`, wanneer `pnpm-installeer.mjs --modus werkmap` vanuit die projectmap het project in de strenge kooi installeert (timeout 120 s), dan is de
  status 0 en bestaat `node_modules/.modules.yaml`. De test zoekt buiten de kooi de echte pnpm-binary (`mise which pnpm`, anders
  `which pnpm` na realpath), zet die map vooraan in `PATH` en is rood, niet overgeslagen, als `pnpm --version` afwijkt van de pin.
  Toets: `test/scripts/pnpm-installeer.test.ts` (nieuw)
- **pnpm-sandbox/AC-3** — Gegeven hetzelfde project in de strenge kooi, wanneer `pnpm install` start met de omgeving van
  `modus: 'werkmap'` maar zonder `XDG_RUNTIME_DIR`, dan is de status niet 0. Dat bewijst dat de kooi het gedrag uit ADR 0110
  naspeelt. Herstelt een latere pnpm de terugval naar `/tmp`, dan vervalt deze AC via de besluitroute; AC-1 blijft het bewijs voor de kooi.
  Toets: `test/scripts/pnpm-installeer.test.ts` (nieuw)
- **pnpm-sandbox/AC-4** — `pnpmInstallCommando` geeft voor `werkmap`, `setup` en elk van beide met `cloud: true` precies de
  argumenten en omgeving uit "Hergebruik en UX". Toets: `test/scripts/pnpm-installeer.test.ts` (nieuw)
- **pnpm-sandbox/AC-5** — In `scripts/` start alleen `scripts/kit/pnpm-installeer.mjs` een pnpm-installatie, en
  `scripts/kit/worktree-install.mjs` importeert `installeer` uit die module. Als aanroep telt:
  - in een `.sh`-bestand: na het weghalen van commentaar (`#` tot regeleinde, buiten aanhalingstekens) en van tekst tussen
    aanhalingstekens, een commandowoord `pnpm` met als volgend woord `install`. Een commandowoord is het eerste woord aan het
    begin van de regel, na `;`, `&&`, `||`, `|`, `then`, `do` of na `mise exec --`;
  - in een `.mjs`- of `.ts`-bestand: de tekst `'pnpm'` of `"pnpm"` met binnen 200 tekens `'install'` of `"install"`.
  Herkend: `mise exec -- pnpm install --frozen-lockfile`, `cd x && pnpm install` en `command: 'pnpm', args: ['install']`.
  Toegestaan: `# pnpm install`, `printf '✗ pnpm install mislukt'`, `'pnpm install --frozen-lockfile'` (stapnaam in
  `scripts/bootstrap.sh`) en `fail "draai eerst pnpm install"` (`scripts/check-image.sh`). De test draait de regel ook op de
  huidige `scripts/` en verwacht als enige treffer `scripts/kit/pnpm-installeer.mjs`. Toets: `test/scripts/pnpm-installeer.test.ts` (nieuw)
- **pnpm-sandbox/AC-6** — Gegeven een pnpm-stub op `PATH` die `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK` schrijft en met 1 stopt,
  wanneer de CLI draait, dan is de exitcode 1 en staat de melding "zie de pnpm-fout hierboven" op stderr, zonder "waarschijnlijk geen
  netwerk". Met `ERR_PNPM_FETCH_404` staat er "waarschijnlijk geen netwerk". Toets: `test/scripts/pnpm-installeer.test.ts` (nieuw)
- **pnpm-sandbox/AC-7** — Gegeven een `TMPDIR` onder een map die niet te schrijven is (bijvoorbeeld `/proc/nee`), wanneer de
  CLI start met `--modus werkmap` en ook met `--modus setup`, dan is de exitcode telkens 1 met de basismapmelding en is pnpm niet gestart. Toets: `test/scripts/pnpm-installeer.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Lokaal zonder bubblewrap, of binnen de Claude Code-sandbox (geen geneste namespace) | AC-1 tot en met AC-3 worden overgeslagen met de melding van `vermogen('kooi')`; CI draait ze (ADR 0088). |
| De pin in `package.json` wijzigt (Renovate, major) | De kooitest gebruikt de pin van de head; een nieuwe pnpm die buiten de werkmap schrijft, maakt `gate:fast` rood op die PR. |
| pnpm op `PATH` wijkt af van de pin | AC-2 is rood met de gevonden en de verwachte versie; in de kooi zou pnpm zonder netwerk een andere versie willen ophalen. |
| `cloud-setup.sh` bij de containerstart als root, `TMPDIR` leeg | `setup` maakt `mkdtemp` onder `/tmp`, alleen voor de vergrendeling; de store blijft de gewone, dus de sessie gebruikt dezelfde store. |
| `XDG_RUNTIME_DIR` bestaat al in de omgeving | De CLI overschrijft hem met zijn eigen map, net als `worktree-install.mjs` nu. |
| pnpm ontbreekt op `PATH` | Dezelfde melding als nu in `worktree-install.mjs` (`pnpm ontbreekt of start niet … zie scripts/bootstrap.sh`), exit 1. |

## Raakt ook

- Risicowerk (installatiepad van dependencies, kooi als grens; R-WERK-04): de tester schrijft de tests na de spec-review.
- De bestaande afschermtests van kooi/AC-4 in `test/scripts/kooi.test.ts` draaien ook met `streng: true`.
- Beschermd, `voorReview`, eigenaarreview: `scripts/kit/kooi.mjs`, `scripts/kit/worktree-install.mjs`, `scripts/kit/pnpm-installeer.mjs` (nieuw),
  `scripts/cloud-setup.sh`, `scripts/bootstrap.sh`.
- Bestaande tests die veranderen (reden: het installatiepad en de melding verhuizen naar de module):
  `test/scripts/worktree-install.test.ts` (import van de kern), `test/docs/cloud-zelfinstallatie.test.ts` (de ADR 0110-test uit #997
  toetst nu de aanroep van de module), `test/scripts/cloud-setup.test.ts` (de `mise`-stub ziet `node … pnpm-installeer.mjs`; de
  verwachting "melding met Trusted" bij elke mislukte install op `:309` en de verwachtingen op `:145`, `:271` en `:295` volgen de nieuwe
  meldingen), `test/scripts/cloud-zelfinstallatie.test.ts` (stub-`PATH`).
- Docs: `docs/ENVIRONMENT.md` (tabel "Wat het script doet", Problemen), `docs/operations/agent-doorloop.md` (worktree-install),
  ADR 0110 (gevolg: één pad, getoetst in de strenge kooi), `docs/template/specs/kooi.md` (de optie `streng`), majorchecklist punt 3 in
  `.github/pull_request_template.md` blijft, met de opmerking dat `gate:fast` het sandboxgedrag toetst.
- Geen migratie, route, permissie of `test/security/resources.ts`; geen wijziging in `.github/workflows/`.

## Buiten scope

- Dat een lokale terminal een nieuwe Node-pin van `main` niet volgt (gezien bij #997: Node 26.11.1 lokaal, 26.13.0 op main).
  De voorcontrole meldt dat al met de oplossing (`mise install`, `scripts/bootstrap.sh`).
- Timeouts van `gate:fast` onder belasting: leerpunt #1000.
- Een sandbox-uitzondering voor `cloud-setup.sh` in `.claude/settings.json`: de eigenaar koos daar niet voor.
- `cloud-setup.sh` met de hand binnen de sandbox van een sessie: daar is `~/.local` alleen-lezen, dus de gewone store ook. Het herstel
  in een sessie blijft `node scripts/kit/worktree-install.mjs` (modus `werkmap`), dat AC-2 toetst.

## Testplan

- Na de spec-review zet de developer de stub `scripts/kit/pnpm-installeer.mjs` en de optie `streng` met de definitieve signaturen
  neer; de tester schrijft de tests (rood op een assertie); daarna de bouw.
- Lokaal: `pnpm exec vitest run test/scripts/pnpm-installeer.test.ts test/scripts/kooi.test.ts test/scripts/cloud-setup.test.ts test/scripts/worktree-install.test.ts`;
  de kooitests worden binnen de sandbox overgeslagen en draaien buiten de sandbox of in CI.
- CI: `gate:fast` groen met de kooitests uitgevoerd, niet overgeslagen (bewijs via `pnpm pr:verify`). Of `jdx/mise-action` pnpm als
  shim of als binary op `PATH` zet, blijkt uit AC-2 in CI; een shim lost de test op via `mise which pnpm`.
- In de PR: een meting buiten de sandbox op de lokale machine van AC-1 tot en met AC-3.

## Open vragen

- **OV-1 ✅ besloten** — De cloud houdt zijn gewone store; alleen de vergrendeling (`XDG_RUNTIME_DIR`) komt uit de module. Reden:
  containerstart (root, geen `TMPDIR`) en sessie (andere `TMPDIR`) zouden anders een andere store hebben (eigenaar, 2026-11-25).
- **OV-2 ✅ besloten** — Een test in `gate:fast`, geen aparte CI-job. CI installeert bubblewrap daar al voor de kooi
  (`.github/workflows/ci.yml`).
- **OV-3 ✅ besloten** — De kooi krijgt een optie `streng` in `inKooi`, geen tweede functie (eigenaar, 2026-11-25).
- **OV-4 ✅ besloten** — `bootstrap.sh` installeert ook via de module (`modus: 'setup'`), zonder uitzondering in AC-5 (eigenaar, 2026-11-25).
- **OV-5 ✅ besloten** — In `streng` worden de afgeschermde mappen leeg en alleen-lezen (`--tmpfs` plus `--remount-ro`), niet
  zichtbaar via `--ro-bind /`. Reden: kooi/AC-4 (thuismap onleesbaar, geen sockets) blijft zo ook in `streng` gelden; het
  alternatief zou die eis laten vervallen (spec-review N1).
