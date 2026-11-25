---
status: goedgekeurd
namespace: pnpm-sandbox
---

# Eén installatiepad voor pnpm, getoetst in een sandbox

## Doel

Een nieuwe versie van pnpm of Node die buiten de repo wil schrijven, valt op in `gate:fast` van de PR die de versie
ophoogt. Dat gebeurt niet pas in een cloudsessie. Daarvoor installeren `worktree-install.mjs` en `cloud-setup.sh` via
hetzelfde pad.

## Aanleiding

- pnpm 12 (#984) legt zijn store-vergrendeling in `$XDG_RUNTIME_DIR`, en zonder die variabele in `/tmp` (ADR 0110).
  `worktree-install.mjs` kreeg daarvoor een eigen `XDG_RUNTIME_DIR`. `cloud-setup.sh` kreeg die niet, en faalde binnen de
  sandbox van een cloudsessie met `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK` (hersteld in #997).
- De majorchecklist (`.github/pull_request_template.md`, punt 3) vroeg om `cloud-setup.sh` in een verse cloudsessie.
  Dat ving dit niet, want bij de containerstart draait het script buiten de sandbox. Een regel in proza is geen check
  (R-DOC-02).
- `cloud-setup.sh` meldde de vergrendelfout als "waarschijnlijk geen netwerk". Die melding stuurde de diagnose de verkeerde
  kant op.

## Rollen en wie wat ziet

Alleen ontwikkelomgeving en CI; geen app-rollen. De eigenaar ziet het resultaat als rode of groene `gate:fast` op een PR.

## Kopieer de vorm van

- `scripts/kit/worktree-install.mjs`: de pure kern `worktreeInstallCommando` (pnpm-argumenten en XDG-mappen onder één
  basismap) en het aanmaken van `XDG_RUNTIME_DIR` (0700) vóór de start van pnpm.
- `scripts/kit/kooi.mjs`: `inKooi` voor een commando met het hele bestandssysteem alleen-lezen en één schrijfbare werkmap.
- `test/rails/ci-scan.test.ts`: een kooitest met `ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding)`. Lokaal
  zonder bubblewrap wordt hij overgeslagen; in CI is overslaan rood (ADR 0088).

## Hergebruik en UX

- Geen UI. Bestaande scripts: `scripts/kit/worktree-install.mjs`, `scripts/cloud-setup.sh`, `scripts/kit/kooi.mjs`.
- Nieuwe module `scripts/kit/pnpm-installeer.mjs`, zonder dependencies (zoals `worktree-install.mjs`). Hij exporteert de pure
  kern `pnpmInstallCommando(basis, opties)`, die `worktreeInstallCommando` vervangt (zelfde argumenten en XDG-mappen). Als CLI
  maakt hij de mappen aan en start hij `pnpm install --frozen-lockfile` met die omgeving:
  `node scripts/kit/pnpm-installeer.mjs [--cloud]`.
- `worktree-install.mjs` houdt zijn eigen weigeringen (hoofdcheckout, symlink, gewijzigde beheerde bestanden) en installeert via
  `pnpm-installeer.mjs`. `cloud-setup.sh` roept `mise exec -- node scripts/kit/pnpm-installeer.mjs --cloud` aan in plaats van
  zijn eigen `pnpm install`.
- Melding in `cloud-setup.sh` als de installatie faalt zonder netwerkfout, letterlijk:
  `✗ pnpm install mislukt (exit <n>): zie de pnpm-fout hierboven → docs/ENVIRONMENT.md, Problemen.`
  De bestaande netwerkmelding blijft voor een uitvoer met `ERR_PNPM_FETCH_`, `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND` of
  `EAI_AGAIN`.

## Acceptatiecriteria

- **pnpm-sandbox/AC-1** — Gegeven een project zonder dependencies met de `packageManager`-pin van de repo, wanneer
  `pnpm-installeer.mjs` het installeert in de kooi (alles alleen-lezen behalve de werkmap, `TMPDIR` in de werkmap), dan is de
  status 0 en bestaat `node_modules/.modules.yaml`. Toets: `test/scripts/pnpm-installeer.test.ts` (nieuw)
- **pnpm-sandbox/AC-2** — Gegeven datzelfde project in de kooi, wanneer `pnpm install` start met de omgeving van
  `pnpmInstallCommando` maar zonder `XDG_RUNTIME_DIR`, dan is de status niet 0. Zo blijkt dat de kooi het pnpm-gedrag uit ADR 0110
  echt naspeelt; wordt dit groen bij een latere pnpm, dan vervalt deze AC via de besluitroute. Toets:
  `test/scripts/pnpm-installeer.test.ts` (nieuw)
- **pnpm-sandbox/AC-3** — `pnpmInstallCommando(basis)` geeft dezelfde argumenten en dezelfde vier XDG-mappen onder `basis` als
  `worktreeInstallCommando` vóór deze spec, en met `{ cloud: true }` als laatste argument
  `--config.confirm-modules-purge=false`. Toets: `test/scripts/pnpm-installeer.test.ts` (nieuw)
- **pnpm-sandbox/AC-4** — In `scripts/` start alleen `scripts/kit/pnpm-installeer.mjs` het commando `pnpm install`;
  `scripts/cloud-setup.sh` en `scripts/kit/worktree-install.mjs` roepen die module aan. Een tweede plek met `pnpm install`
  (ook in een `.sh`-bestand) maakt de test rood. Toets: `test/scripts/pnpm-installeer.test.ts` (nieuw)
- **pnpm-sandbox/AC-5** — Gegeven `cloud-setup.sh` met een pnpm-stub die met `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK` en exit 1
  stopt, dan is de exitcode 1 en staat de melding uit "Hergebruik en UX" in stderr, zonder "waarschijnlijk geen netwerk".
  Toets: `test/scripts/cloud-setup.test.ts`
- **pnpm-sandbox/AC-6** — Gegeven dezelfde stub die met `ERR_PNPM_FETCH_404` stopt, dan staat "waarschijnlijk geen netwerk" in
  stderr. Toets: `test/scripts/cloud-setup.test.ts`

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Lokaal zonder bubblewrap, of binnen de Claude Code-sandbox (geen geneste namespace) | AC-1 en AC-2 worden overgeslagen met de melding van `vermogen('kooi')`; CI draait ze (ADR 0088). |
| De pin in `package.json` wijzigt (Renovate, major) | De kooitest gebruikt de pin van de head; een nieuwe pnpm die buiten de werkmap schrijft, maakt `gate:fast` rood op die PR. |
| `XDG_RUNTIME_DIR` bestaat al in de omgeving | `pnpm-installeer.mjs` overschrijft hem met zijn eigen map, net als `worktree-install.mjs` nu. |
| pnpm ontbreekt op `PATH` | Dezelfde melding als nu in `worktree-install.mjs` (`pnpm ontbreekt of start niet … zie scripts/bootstrap.sh`). |

## Raakt ook

- `scripts/cloud-setup.sh` en `scripts/kit/*` (beschermd, `voorReview`): eigenaarreview.
- Bestaande tests: `test/scripts/worktree-install.test.ts` (import van `worktreeInstallCommando` verhuist), `test/docs/cloud-zelfinstallatie.test.ts`
  (de ADR 0110-test uit #997 toetst nu de aanroep van `pnpm-installeer.mjs`), `test/scripts/cloud-setup.test.ts` en
  `test/scripts/cloud-zelfinstallatie.test.ts` (stubs: `node` start de installeer-CLI).
- Docs: `docs/ENVIRONMENT.md` (tabel "Wat het script doet", Problemen), `docs/operations/agent-doorloop.md` (worktree-install),
  ADR 0110 (gevolg: één pad), majorchecklist punt 3 in `.github/pull_request_template.md`: de cloudsessie blijft, met de opmerking dat
  `gate:fast` het sandboxgedrag toetst.
- Geen migratie, route, permissie of `test/security/resources.ts`.

## Buiten scope

- Dat een lokale terminal een nieuwe Node-pin van `main` niet volgt (gezien bij #997: Node 26.11.1 lokaal, 26.13.0 op main).
  De voorcontrole meldt dat al met de oplossing (`mise install`, `scripts/bootstrap.sh`).
- Timeouts van `gate:fast` onder belasting: leerpunt #1000.
- Een sandbox-uitzondering voor `cloud-setup.sh` in `.claude/settings.json`: de eigenaar koos daar niet voor.

## Testplan

- Eerst de stub `scripts/kit/pnpm-installeer.mjs` met de definitieve signaturen, daarna de tests (rood op een assertie), daarna de bouw.
- Lokaal: `pnpm exec vitest run test/scripts/pnpm-installeer.test.ts test/scripts/cloud-setup.test.ts test/scripts/worktree-install.test.ts`;
  de kooitests worden binnen de sandbox overgeslagen en draaien buiten de sandbox of in CI.
- CI: `gate:fast` groen met de kooitests uitgevoerd, niet overgeslagen (bewijs via `pnpm pr:verify`).
- In de PR: de meting van AC-1 en AC-2 buiten de sandbox op de lokale machine (zonder `XDG_RUNTIME_DIR` rood, met groen).

## Open vragen

- **OV-1** — Ook de standaard-store van `cloud-setup.sh` verhuist naar de tijdelijke basismap (`--store-dir`, `--package-import-method=copy`), net als in een worktree.
  Aanbeveling: ja; één pad betekent dezelfde vlaggen, en met `copy` hangt `node_modules` niet af van een store die bij een
  herstart verdwijnt. Kosten: een koude install in een nieuwe container duurt iets langer (geen gedeelde store).
- **OV-2 ✅ besloten** — Een aparte CI-job of een test in `gate:fast`: een test in `gate:fast`. CI installeert bubblewrap daar al voor
  de kooi (`.github/workflows/ci.yml`), dus er komt geen nieuwe job en geen wijziging in `.github/`.
