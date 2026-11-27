---
status: goedgekeurd
namespace: nachtrun
---

# Nachtrun: een opdracht afmaken zonder de eigenaar

## Doel

De eigenaar geeft 's avonds een opdracht, beantwoordt één vragenronde, en vindt 's ochtends groene PR's plus één lijst
keuzes die hij later kan herzien ([ADR 0115](../adr/0115-nachtrun.md)).

## Rollen en wie wat ziet

- **Eigenaar:** start een nachtrun (skill `nachtrun`), beantwoordt de vragenronde, leest het ochtendrapport, herziet
  voorlopige keuzes per OV-id en merget beschermde PR's.
- **Hoofdsessie:** stelt de vragen vooraf, werkt daarna zonder vragen door, kiest voorlopig of parkeert, opent PR's van
  haar eigen werkbranch zonder vraag, schrijft het ochtendrapport.
- **Subagents:** ongewijzigd; geen PR-recht (rolhek: deny).

## Kopieer de vorm van

- `test/hooks/rolhek-leerpunt-bijwerken.test.ts` — tabeltest voor een doorlaat van het rolhek per rol.
- `scripts/kit/recepten.mjs` — een pure feitensectie die de aanroeper voedt met bestandsinhoud.

## Hergebruik en UX

Geen UI. Hergebruikt: de open vragen van een spec (`- **OV-n …** — …`), de skill `opleveren`, de mergeregels van ADR 0069
en de cloudroute uit `docs/ENVIRONMENT.md`.

- **Rolhek** (`rails/hooks/lib/rolhek.mjs`, `eigenPr`): op `mcp__<server>__create_pull_request` geeft het rolhek allow voor de
  hoofdsessie als `head` precies de huidige branch is, die branch niet `main`, `HEAD` of leeg is, en `base` gezet is en
  verschilt van `head`. Anders: hoofdsessie ask, subagent deny (ongewijzigd).
- **Instellingen:** geen MCP-tool in `permissions.allow` (zonder hook blijft de vraag); `.tmp/` in `.gitignore` en in de
  `globalIgnores` van `eslint.config.js`.
- **Feiten:** `node scripts/kit/feiten.mjs besluiten` (`scripts/kit/besluiten.mjs`) leest `docs/template/specs/*.md` en
  `docs/specs/*.md` (niet `_*.md`) en toont per regel `<soort> <spec>:<regel> <OV-id> — <tekst>`, eerst geparkeerd, dan
  voorlopig; kop `<n> geparkeerd, <m> voorlopig; herzien: zet de markering op ✅ besloten`; zonder treffers
  `geen voorlopige of geparkeerde besluiten`. Alleen de eerste regel van een punt telt, en alleen in de vorm
  `- **OV-<n> ⏳ voorlopig** — …` of `- **OV-<n> ⏸ geparkeerd** — …` (ook met `-` of `–`).
- **Regels:** R-WERK-20 en R-ROL-12 in `docs/framework.md`, een regel in `CLAUDE.md` ("Stoppen en vragen") en
  `.tmp/` in plaats van `$TMPDIR` in `CLAUDE.md` ("Sandbox en rolhek").

## Acceptatiecriteria

- **nachtrun/AC-1** — Gegeven de hoofdsessie op branch `feat/x`, wanneer ze `mcp__github__create_pull_request` (of dezelfde
  tool onder een andere servernaam) aanroept met `head` `feat/x` en `base` `main`, een andere branch of als draft, dan allow
  van het rolhek. Toets: `test/hooks/rolhek-nachtrun-pr.test.ts`
- **nachtrun/AC-2** — Gegeven de hoofdsessie, wanneer `head` een andere branch is, de vorm `eigenaar:branch` heeft, ontbreekt
  of geen tekst is, `base` ontbreekt of gelijk is aan `head`, of de sessie op `main`, een losse HEAD of een onbekende branch
  staat, dan ask; een andere MCP-schrijftool blijft ask. Toets: `test/hooks/rolhek-nachtrun-pr.test.ts`
- **nachtrun/AC-3** — Gegeven een subagent (developer, tester, reviewer, architect, docs, onbekend), wanneer hij de PR-tool
  aanroept met zijn eigen werkbranch, dan deny. Toets: `test/hooks/rolhek-nachtrun-pr.test.ts`
- **nachtrun/AC-4** — Gegeven een spec met `✅ besloten`, `⏳ voorlopig` en `⏸ geparkeerd`, een vervolgregel, een punt
  zonder vette markering en een codespan, wanneer `besluitenIn` leest, dan alleen de voorlopige en geparkeerde punten met
  id, soort, tekst en regelnummer. Toets: `test/scripts/feiten-besluiten.test.ts`
- **nachtrun/AC-5** — Gegeven meerdere specs, wanneer `besluitenSectie` draait, dan eerst geparkeerd en dan voorlopig met de
  telling in de kop, zonder treffers één regel, `specBestanden` leest beide specmappen zonder `_*.md`, de sectie vindt
  OV-5 t/m OV-10 van deze spec, en `besluiten` is de laatste sectie in `VOLGORDE`.
  Toets: `test/scripts/feiten-besluiten.test.ts`
- **nachtrun/AC-6** — Gegeven de repo, dan staat geen `mcp__`-tool in `permissions.allow` van `.claude/settings.json`, `.tmp/` in `.gitignore` en in de `globalIgnores` van `eslint.config.js`, en noemt `CLAUDE.md`
  `.tmp/<bestand>` en niet langer "zet je in `$TMPDIR`". Toets: `test/rails/nachtrun-instellingen.test.ts`
- **nachtrun/AC-7** — Gegeven de skill `nachtrun`, dan noemt hij de vragenronde, beide markeringen in de OV-vorm,
  `feiten.mjs besluiten` en het ochtendrapport, en noemen R-WERK-20 in `docs/framework.md` en `CLAUDE.md` de nachtrun.
  Toets: `test/rails/nachtrun-instellingen.test.ts`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `base` is een branch van een open PR | Het rolhek laat de PR-tool door; de ruleset op `main` blijft de grens. Een branch vanaf die branch maken weigert het rolhek (verse `origin/main`), dus een afhankelijke taak wordt geparkeerd (OV-10) | — |
| Een vraag van Claude Code of het rolhek tijdens de nachtrun | Niemand antwoordt; de stap wordt geparkeerd | — |
| Een spec zonder `## Open vragen` | Keuzes in de PR onder `## Voorlopige keuzes` en `## Geparkeerd`; `besluiten` ziet ze niet | — |

## Buiten scope

- `--dangerously-skip-permissions` of een devcontainer voor lokaal onbeheerd werk (ADR 0115, alternatieven).
- Een limiet op kosten of beurten vanuit de repo.
- `pr:resolve`, `pr:log` en de trage checks uit `ask` halen (ankertoets, ADR 0102).

## Testplan

Unit-tests per AC; `pnpm ratchet` en de volledige CI groen. De eerste echte nachtrun in een cloudsessie meet OV-8 en meldt
de uitslag in zijn ochtendrapport.

## Open vragen

- **OV-1 ✅ besloten** — Wat mag de agent zelf? Omkeerbaar zelf kiezen, de rest parkeren (eigenaar, 2026-11-27).
- **OV-2 ✅ besloten** — Merges: niet-beschermde PR's zelf mergen, op beschermde stapelen (eigenaar, 2026-11-27); het stapelen zelf is OV-10.
- **OV-3 ✅ besloten** — PR openen in de cloud zonder vraag (eigenaar, 2026-11-27).
- **OV-4 ✅ besloten** — Omvang: cloud plus de kleine WSL-punten (eigenaar, 2026-11-27).
- **OV-5 ⏳ voorlopig** — Moeten `pr:resolve`, `pr:log` en de trage checks naar `allow`? gekozen: nee, omdat hun vraag de ankertoets van ADR 0102 is en het rolhek ze al zonder vraag doorlaat als de runnercode gelijk is aan main (agent, 2026-11-27)
- **OV-6 ⏳ voorlopig** — Waar staat het ochtendrapport? gekozen: in het eindbericht van de sessie en per PR in de beschrijving, geen apart bestand of issue, omdat `gh issue` in de cloud niet werkt en een bestand een extra PR vraagt (agent, 2026-11-27)
- **OV-7 ⏳ voorlopig** — Een apart besluitenregister? gekozen: nee, markeringen in de bestaande open vragen van de spec, gelezen door `feiten.mjs besluiten` (agent, 2026-11-27)
- **OV-8 ⏳ voorlopig** — Vraagt Claude Code in auto mode in de cloud nog bij de PR-tool of bij een ankertoets? gekozen: niet vooraf meten, de eerste nachtrun meet het en meldt het in zijn ochtendrapport (agent, 2026-11-27)
- **OV-9 ⏳ voorlopig** — Een limiet op duur of kosten? gekozen: geen, omdat de repo dat niet kan afdwingen; de noodrem is de sessie stoppen in de app (agent, 2026-11-27)
- **OV-10 ⏸ geparkeerd** — Stapelen op een PR die op de eigenaar wacht (OV-2) botst met de regel dat een nieuwe branch van een verse `origin/main` start (`rails/hooks/lib/verse-main.mjs`, spec rolhek-herstel AC-4; gevonden door de Codex-review op PR #1034). Die regel versoepelen is een besluit van de eigenaar; tot dan parkeert een nachtrun een afhankelijke taak; nodig: mag het rolhek in een nachtrun een branch vanaf de eigen werkbranch toestaan? (agent, 2026-11-27)
