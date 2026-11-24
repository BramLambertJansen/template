---
status: goedgekeurd
namespace: cloud-werkmap-herstel
---

# Cloudsessie: node_modules herstellen en CI-bewijs zonder werkmap

## Doel

Een agent in een cloudsessie herstelt een verouderde `node_modules` in de hoofdcheckout zelf. Ook haalt hij CI-bewijs op een
PR-head als de werkmap daar niet op kan staan. Zo is geen ronde nodig met de eigenaar, die in de cloud geen terminal heeft.

## Aanleiding

- Leerpunt #944, drie keer gemeld (#942, #943 en een derde sessie):
  - In een cloudsessie loopt `node_modules` in de hoofdcheckout achter op `pnpm-lock.yaml`. Elke pnpm-hook faalt dan met
    `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`.
  - `scripts/kit/worktree-install.mjs` weigert in de hoofdcheckout (ADR 0085 punt 1).
  - Een kale `pnpm install` faalt in de sandbox op de store (`ERR_SQLITE_ERROR`). Met `--store-dir` faalt hij op
    `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.
  - Met akkoord van de eigenaar werkte het telkens: store onder de scratchpad en `--config.confirm-modules-purge=false`
    (20 tot 21 s).
- Leerpunt #789, comments van 24 november 2026:
  - Na de merge van een PR kan `git switch --no-track -c <naam> origin/main` in de cloud niet, want de branchnaam is vast en
    bestaat al.
  - De eigenaar kan `main` met "Update branch" op GitHub in de PR mergen. Raakt die stap `.claude/skills`, dan kan de werkmap
    niet naar de nieuwe head en weigert `pnpm pr:verify` ("PR, branch of werkmap wijkt af"). Er komt dan geen bewijs.
  - Het script dat `main` merget zonder de werkmap (#789, eerste voorstel) valt buiten deze spec (zie Buiten scope).
- Gemeten op 24 november 2026 in deze cloudsessie:
  - Na een eigenaarmerge met merge-commit (#963) bracht `git fetch origin main` plus `git merge --ff-only origin/main` de
    vaste branch twee keer zonder fout op `main`.
  - `git merge --no-commit origin/main` met daarna `git commit -F <bestand>` gaf een ondertekende merge-commit.
  - `git commit-tree -S` faalt in de sandbox: de signeerdienst is daar niet bereikbaar.

## Rollen en wie wat ziet

Alleen de hoofdsessie en de eigenaar; er zijn geen gebruikersrollen. Het rolhek verandert niet.

## Kopieer de vorm van

- `scripts/kit/worktree-install.mjs`: de pure kern `worktreeInstallBesluit` en `worktreeInstallCommando`, met de feiten apart.
- `scripts/kit/pr-verify.mjs`: `checkProgress` en de pure helpers, met een eigen test.
- `scripts/kit/recepten.mjs`: de cloud herkennen aan `CLAUDE_CODE_REMOTE === 'true'`.

## Hergebruik en UX

Er is geen UI. Signaturen (definitief; alleen de scripts lezen `process.env`):

- `worktreeInstallBesluit({ worktree, nodeModules, gewijzigd, cloud })`, met `cloud: boolean` (ontbreekt het, dan geldt `false`).
- `worktreeInstallFeiten(root, cloud = false)`. Die toetst de beheerde bestanden in een worktree, en met `cloud` ook in de
  hoofdcheckout.
- `worktreeInstallCommando(tmp, cloud = false)`.
- `argumentsFor(args, cloud)` (nu geëxporteerd) geeft `{ number, watch, zonderWerkmap }`.
- `prHeadKlopt(pr, { branch, head })` geeft `boolean`: de PR is open, `pr.branch === branch` en `pr.headSha === head`.

De scripts lezen `cloud` als `process.env['CLAUDE_CODE_REMOTE'] === 'true'`.

Teksten letterlijk:

- De bestaande melding in de hoofdcheckout buiten de cloud blijft:
  `✗ worktree-install geweigerd: dit is de hoofdcheckout; die richt de eigenaar in met scripts/bootstrap.sh (docs/ENVIRONMENT.md)`.
- Gebruiksmelding: `Gebruik: pnpm pr:verify <nummer> [--watch] [--zonder-werkmap]`.
- `--zonder-werkmap` buiten de cloud: `--zonder-werkmap werkt alleen in een cloudsessie (CLAUDE_CODE_REMOTE=true)`.
- Eerste uitvoerregel met `--zonder-werkmap`: `PR #<nr> · <sha> (alleen CI-bewijs op de PR-head; werkmap niet getoetst)`.
- Afwijkende PR met `--zonder-werkmap`: `PR, branch of head wijkt af van de gecontroleerde commit; bewijs opnieuw ophalen`.

## Acceptatiecriteria

- **cloud-werkmap-herstel/AC-1**: Gegeven de hoofdcheckout (geen gekoppelde worktree) met `cloud: true`, `node_modules` als
  map of afwezig en een lege `gewijzigd`. Wanneer `worktreeInstallBesluit` beslist, dan is de uitkomst `installeren`. Met
  `cloud: false` of zonder `cloud` geeft dezelfde invoer de bestaande hoofdcheckout-weigering.
  Toets: `test/scripts/cloud-werkmap-herstel.test.ts` (nieuw)
- **cloud-werkmap-herstel/AC-2**: Gegeven de hoofdcheckout met `cloud: true`, wanneer `node_modules` een symlink is of
  `gewijzigd` niet leeg is, dan weigert `worktreeInstallBesluit` met dezelfde melding als in een worktree.
  Toets: `test/scripts/cloud-werkmap-herstel.test.ts` (nieuw)
- **cloud-werkmap-herstel/AC-3**: Gegeven `cloud: true`, wanneer `worktreeInstallCommando` het commando bouwt, dan staat
  `--config.confirm-modules-purge=false` als laatste argument. Zonder `cloud` zijn de argumenten gelijk aan nu.
  Toets: `test/scripts/cloud-werkmap-herstel.test.ts` (nieuw)
- **cloud-werkmap-herstel/AC-4**: Gegeven een git-fixture als hoofdcheckout waarin `package.json` afwijkt van HEAD. Wanneer
  `worktreeInstallFeiten(root, true)` de feiten leest, dan noemt `gewijzigd` `package.json`. `worktreeInstallFeiten(root)`
  geeft daar een lege lijst. Toets: `test/scripts/cloud-werkmap-herstel.test.ts` (nieuw)
- **cloud-werkmap-herstel/AC-5**: Gegeven het script als subproces in een hoofdcheckout-fixture met een nep-pnpm. Wanneer
  `CLAUDE_CODE_REMOTE=true` in de omgeving staat, dan roept het script pnpm aan met de vlag uit AC-3. Zonder die variabele
  weigert het en roept het pnpm niet aan. Toets: `test/scripts/cloud-werkmap-herstel.test.ts` (nieuw)
- **cloud-werkmap-herstel/AC-6**: Gegeven `argumentsFor`. Het nummer staat altijd eerst; daarna komen `--watch` en
  `--zonder-werkmap` elk hooguit één keer, in elke volgorde. Een andere vlag, een dubbele vlag, een nummer na een vlag of
  meer dan drie argumenten geeft de gebruiksmelding. `--zonder-werkmap` met `cloud: false` geeft de cloudmelding.
  Toets: `test/scripts/cloud-werkmap-herstel.test.ts` (nieuw)
- **cloud-werkmap-herstel/AC-7**: Gegeven `prHeadKlopt`. Het resultaat is alleen `true` als de PR open is, de branch gelijk is
  en de head-SHA gelijk is aan de SHA die bij de start is vastgelegd. Zo geeft een PR waarvan de head tussen twee lezingen
  verandert `false`. Toets: `test/scripts/cloud-werkmap-herstel.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Cloud, bestaande `node_modules` van een andere store | install verwijdert en vult de map zonder TTY-vraag (AC-3) |
| Cloud, gekoppelde worktree | ongewijzigd, plus de vlag uit AC-3 |
| `--zonder-werkmap`: de head-SHA staat vast bij de start | vóór en na elke checkronde (ook met `--watch`) `prHeadKlopt`; bij `false` de afwijkingsmelding |
| `--zonder-werkmap` met een head-SHA zonder geldige vorm | bestaande fout `Geen vertrouwde verplichte checks of geldige commit` |
| Lokaal `CLAUDE_CODE_REMOTE=true` gezet | het script gedraagt zich als in de cloud. Dit is een procesgrens die geen check afdwingt (R-ROL-05, eigenaarbesluit 24 november 2026); een rolhek-weigering op die toewijzing staat als roadmap-item |

## Raakt ook

- ADR 0085: een regel `Herzien:`. In de cloud installeert de agent ook in de hoofdcheckout. Gevolg (zie de Gevolgen van ADR
  0085): de Stop-hooks draaien daar `pnpm exec` op een `node_modules` die de agent kan beschrijven.
- `docs/ENVIRONMENT.md` (toolchain-melding). Alleen de doc verandert, `scripts/kit/toolchain.mjs` niet:
  `test/scripts/toolchain.test.ts` eist dat de herstelmelding in de hoofdcheckout het worktree-script niet noemt.
- `docs/operations/agent-doorloop.md`: nieuw werk beginnen op de vaste cloudbranch, en "Als pr:verify niet start of de
  werkmap weigert": wanneer `--zonder-werkmap` als opleverbewijs telt.
- `.claude/skills/opleveren/SKILL.md` stap 2, dezelfde regel als bewijs. Beschermd pad: Edit in de hoofdsessie met akkoord van
  de eigenaar.
- `docs/operations/recepten.md`, twee rijen:
  - de vaste cloudbranch na een merge: eerst `git merge --ff-only origin/main`; gaat dat niet (squash-merge), dan de rij
    "`main` bijhalen";
  - `pnpm pr:verify <nr> --zonder-werkmap`.

  `pnpm ratchet` toetst die rijen tegen het rolhek (`docs:recept-rolhek`).
- `docs/roadmap.md`: een open item voor een rolhek-weigering op een toewijzing `CLAUDE_CODE_REMOTE=`.
- Bestaande tests:
  - `test/scripts/worktree-install.test.ts` voegt `CLAUDE_CODE_REMOTE` toe aan `EIGEN_ENV`. Reden: in een cloudsessie lekt
    de variabele anders naar de subprocestests, en die falen dan (R-TEST-02).
  - `test/scripts/worktree-install-real-pnpm.test.ts`, `test/rails/claude-sandbox-werkstraat.test.ts`,
    `test/scripts/pr-verify-werkmap.test.ts`, `test/scripts/pr-verify-diagnostics.test.ts` en `test/hooks/pr-evidence.test.ts`
    blijven ongewijzigd groen.
- Kritiek werk: `pr:verify` staat in de padtabel en is opleverbewijs. De eigenaar keurt de PR goed.

## Buiten scope

- Een script dat `main` in een PR-branch merget zonder de werkmap (#789, eerste voorstel). Dat krijgt een eigen ontwerp en PR.
- De SessionStart-hook en het rolhek (`.claude/hooks`, `rails/hooks`).
- Lokaal blijft de hoofdcheckout bij de eigenaar.

## Testplan

Unit-tests op de pure functies, met `cloud` als expliciete invoer. Een git-fixture voor AC-4 en een subproces met nep-pnpm
voor AC-5, in dezelfde vorm als `test/scripts/worktree-install.test.ts`. Daarna in deze cloudsessie:

- één keer `node scripts/kit/worktree-install.mjs` in de hoofdcheckout;
- `pnpm pr:verify <nr> --zonder-werkmap` op de PR van deze spec.

De uitvoer van beide gaat in de PR-sectie Bewijs.

## Open vragen

- **OV-1 ✅ besloten**: `worktree-install` in de hoofdcheckout alleen in de cloud, niet lokaal (eigenaar, 24 november 2026).
  Lokaal heeft de eigenaar een terminal en een eigen store.
- **OV-2 ✅ besloten**: het merge-script uit #789 krijgt een eigen PR (eigenaar, 24 november 2026).
- **OV-3 ✅ besloten**: `--zonder-werkmap` alleen in de cloud (eigenaar, 24 november 2026).
- **OV-4 ✅ besloten**: de cloudherkenning via `CLAUDE_CODE_REMOTE` is nu een procesgrens. Een rolhek-weigering komt in een
  eigen kritieke PR (eigenaar, 24 november 2026).
- **OV-5 ✅ besloten**: de uitvoer van `--zonder-werkmap` telt als opleverbewijs, onder drie voorwaarden: de gewone
  `pr:verify` weigert op de werkmap, de hoofdsessie draait het zelf, en de PR vermeldt het (eigenaar, 24 november 2026).
