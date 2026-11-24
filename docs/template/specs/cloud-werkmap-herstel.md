---
status: goedgekeurd
namespace: cloud-werkmap-herstel
---

# Cloudsessie: node_modules herstellen en CI-bewijs zonder werkmap

## Doel

Een agent in een cloudsessie herstelt een verouderde `node_modules` in de hoofdcheckout zelf, en haalt CI-bewijs op een
PR-head ook als de werkmap daar niet op kan staan, zonder een ronde met de eigenaar die in de cloud geen terminal heeft.

## Aanleiding

- Leerpunt #944 (drie keer gemeld: #942, #943 en een derde sessie): in een cloudsessie loopt `node_modules` in de
  hoofdcheckout achter op `pnpm-lock.yaml`. Elke pnpm-hook faalt met `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`.
  `scripts/kit/worktree-install.mjs` weigert in de hoofdcheckout (ADR 0085 punt 1). Een kale `pnpm install` faalt in de
  sandbox op de store (`ERR_SQLITE_ERROR`), en met `--store-dir` op `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. Met
  akkoord van de eigenaar werkte het telkens met de store onder de scratchpad en `--config.confirm-modules-purge=false`
  (20 tot 21 s).
- Leerpunt #789 (comments van 24 november 2026): na de merge van een PR kan `git switch --no-track -c <naam> origin/main`
  in de cloud niet, omdat de branchnaam vast is en al bestaat. En als de eigenaar `main` met "Update branch" op GitHub in de
  PR merget en die stap `.claude/skills` raakt, kan de werkmap niet naar de nieuwe head. `pnpm pr:verify` weigert dan
  ("PR, branch of werkmap wijkt af"), zodat er geen bewijs uit komt. Het script dat `main` merget zonder de werkmap (#789,
  eerste voorstel) valt buiten deze spec (zie Buiten scope).

## Rollen en wie wat ziet

Alleen de hoofdsessie en de eigenaar; geen gebruikersrollen. Het rolhek verandert niet.

## Kopieer de vorm van

- `scripts/kit/worktree-install.mjs` — pure kern `worktreeInstallBesluit` en `worktreeInstallCommando`, feiten apart.
- `scripts/kit/pr-verify.mjs` — `checkProgress` en de pure helpers met eigen test.
- `scripts/kit/recepten.mjs` — cloud via `CLAUDE_CODE_REMOTE === 'true'`.

## Hergebruik en UX

Geen UI. Teksten van de scripts letterlijk:

- `worktree-install` in de hoofdcheckout buiten de cloud blijft weigeren met de bestaande melding:
  `✗ worktree-install geweigerd: dit is de hoofdcheckout; die richt de eigenaar in met scripts/bootstrap.sh (docs/ENVIRONMENT.md)`.
- `pr:verify` met `--zonder-werkmap` begint met de regel `PR #<nr> · <sha> (alleen CI-bewijs op de PR-head; werkmap niet getoetst)`.
- Gebruik: `Gebruik: pnpm pr:verify <nummer> [--watch] [--zonder-werkmap]`.

## Acceptatiecriteria

- **cloud-werkmap-herstel/AC-1** — Gegeven de hoofdcheckout (geen gekoppelde worktree) in een cloudsessie, met
  `node_modules` als map of afwezig en geen beheerd bestand dat afwijkt van HEAD, wanneer `worktreeInstallBesluit` beslist,
  dan is de uitkomst `installeren`. Buiten de cloud geeft dezelfde invoer de bestaande hoofdcheckout-weigering.
  Toets: `test/scripts/cloud-werkmap-herstel.test.ts` (nieuw)
- **cloud-werkmap-herstel/AC-2** — Gegeven de hoofdcheckout in de cloud, wanneer `node_modules` een symlink is of een beheerd
  bestand afwijkt van HEAD, dan weigert `worktreeInstallBesluit` met dezelfde melding als in een worktree.
  `worktreeInstallFeiten` toetst de beheerde bestanden in de cloud ook in de hoofdcheckout.
  Toets: `test/scripts/cloud-werkmap-herstel.test.ts` (nieuw)
- **cloud-werkmap-herstel/AC-3** — Gegeven een cloudsessie, wanneer `worktreeInstallCommando` het commando bouwt, dan bevat
  het `--config.confirm-modules-purge=false`; buiten de cloud niet, en de overige argumenten blijven gelijk.
  Toets: `test/scripts/cloud-werkmap-herstel.test.ts` (nieuw)
- **cloud-werkmap-herstel/AC-4** — Gegeven `pr:verify` met de argumenten `<nr> --zonder-werkmap` (ook met `--watch`, in elke
  volgorde), wanneer de argumenten gelezen worden, dan staat de modus aan; een onbekende of dubbele vlag of meer dan drie
  argumenten geeft de gebruiksmelding. Toets: `test/scripts/cloud-werkmap-herstel.test.ts` (nieuw)
- **cloud-werkmap-herstel/AC-5** — Gegeven `--zonder-werkmap`, wanneer de PR open is en zijn branch gelijk is aan de branch
  van de vertrouwde context, dan toetst `pr:verify` de verplichte checks op de head-SHA van de PR (niet op de lokale HEAD) en
  toetst het lokale HEAD en werkmap niet. Is de PR niet open of heeft hij een andere branch, dan weigert het met
  `PR of branch wijkt af; bewijs opnieuw ophalen`. Toets: `test/scripts/cloud-werkmap-herstel.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Cloud, bestaande `node_modules` van een andere store | install verwijdert en vult de map zonder TTY-vraag (AC-3) |
| Cloud, gekoppelde worktree | ongewijzigd, plus de vlag uit AC-3 |
| `--zonder-werkmap` terwijl de PR-head gelijk is aan HEAD | zelfde CI-toets; de eerste regel zegt dat de werkmap niet is getoetst |
| `--zonder-werkmap` en een head-SHA zonder geldige vorm | bestaande fout `Geen vertrouwde verplichte checks of geldige commit` |

## Raakt ook

- ADR 0085 punt 1: een regel `Herzien:` (de hoofdcheckout in de cloud installeert de agent zelf).
- `docs/ENVIRONMENT.md` (toolchain-melding), `docs/operations/agent-doorloop.md` (nieuw werk beginnen), `docs/operations/recepten.md`
  (twee rijen: de vaste cloudbranch bijwerken met `git merge --ff-only origin/main`, en `pr:verify --zonder-werkmap`).
  `pnpm ratchet` toetst de receptrijen tegen het rolhek (`docs:recept-rolhek`).
- Bestaande tests op deze scripts: `test/scripts/worktree-install-real-pnpm.test.ts`, `test/rails/claude-sandbox-werkstraat.test.ts`,
  `test/scripts/pr-verify-werkmap.test.ts`, `test/scripts/pr-verify-diagnostics.test.ts`, `test/hooks/pr-evidence.test.ts`.
- Kritiek werk (pr:verify is bewijs voor de oplevering): eigenaar keurt de PR goed.

## Buiten scope

- Een script dat `main` in een PR-branch merget zonder de werkmap (#789, eerste voorstel). Gemeten op 24 november 2026:
  `git commit-tree -S` faalt in de sandbox, omdat de signeerdienst daar niet bereikbaar is. Dat vraagt een eigen ontwerp en PR.
- De SessionStart-hook en het rolhek (`.claude/hooks`, `rails/hooks`).
- Lokaal blijft de hoofdcheckout bij de eigenaar (besluit eigenaar, 24 november 2026).

## Testplan

Unit-tests op de pure functies, met cloud als expliciete invoer (geen `process.env` in de test). Daarna één keer in deze
cloudsessie `node scripts/kit/worktree-install.mjs` in de hoofdcheckout, en `pnpm pr:verify <nr> --zonder-werkmap` op de PR
van deze spec; de uitvoer gaat in de PR-sectie Bewijs.

## Open vragen

- **OV-1 ✅ besloten** — Alleen in de cloud, niet lokaal (eigenaar, 24 november 2026): lokaal heeft de eigenaar een terminal
  en zijn eigen store.
- **OV-2 ✅ besloten** — Het merge-script uit #789 krijgt een eigen PR (eigenaar, 24 november 2026).
