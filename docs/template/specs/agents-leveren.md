---
status: goedgekeurd
namespace: agents-leveren
---

# Agents leveren altijd en goedkoop (overnameplan golf 1)

## Doel

Elke subagentrun levert een rapport binnen een vast budget, de werkstraat leest geldige frontmatter, de developer laadt de
juiste skill, de reviewer krijgt zijn invoer in één bestand, en `pnpm meting` toont weigeringen, tokens en toolcalls per rol,
zodat de doelen uit §8 van het [overnameplan](../../reviews/2026-11-18-overnameplan-agentic.md) meetbaar worden (roadmap
"Overnameplan golf 1"; leerpunten #792, #676, #664).

## Rollen en wie wat ziet

- **Hoofdsessie:** bouwt elk punt in een eigen PR (R-REPO-05) en draait voor elke review `node scripts/kit/reviewpakket.mjs`
  (punt 1d). Ze geeft het pad uit de uitvoer mee in de opdracht aan de reviewer.
- **Developer en tester:** krijgen geen Agent-tool en geen `mcp__*` meer (punt 1c). De developer laadt per stap de skill uit
  de router (punt 1b).
- **Reviewer:** leest het reviewpakket in plaats van losse `git log`/`git diff`-aanroepen. Hij rapporteert na hooguit 25
  toolcalls (punt 1c), en toetst deze spec in spec-modus vóór de bouw van PR-1.
- **Architect:** schrijft het spec- of ADR-bestand na hooguit 15 toolcalls, eerst als skelet (punt 1c).
- **Docs:** krijgt geen Agent-tool (OV-3).
- **Eigenaar:** keurt elke PR goed. Elke PR raakt een beschermd pad, zie Raakt ook. De merge van PR-1 is het besluit over
  deze spec (ADR 0046).
- **`pnpm meting`:** iedereen die de meetbestanden kan lezen. Er staan alleen tellingen in, nooit prompt- of antwoordtekst.

## Volgorde

Eén spec, vijf PR's, elk met één onderwerp (R-REPO-05). De spec gaat mee in PR-1 (ADR 0062). Een volgende PR haalt `(nieuw)`
weg bij de AC's die hij bouwt. PR-5 zet `status: gebouwd` (ADR 0095). Punt 1a is vóór deze spec gebouwd en gemerged in #850
(eigenaar 2026-11-19); de AC's van PR-2 beschrijven wat daar staat, de toetsen voor AC-7 en AC-8 komen in PR-3.

| PR | Punt | AC's |
|---|---|---|
| PR-1 | Meting per rol (plan §8: "in de eerste PR van golf 1") | AC-1 t/m AC-4 |
| PR-2 (#850, gemerged) | 1a: frontmatter en drift in de agents | AC-5 t/m AC-8 |
| PR-3 | 1b: skillrouter in de developer, plus de toetsen van AC-7 en AC-8 | AC-7 t/m AC-10 |
| PR-4 | 1c: budget, skelet eerst, geen geneste Agent-tool of `mcp__*` | AC-11 t/m AC-13 |
| PR-5 | 1d: reviewpakket | AC-14 t/m AC-18 |

De punten hangen niet van elkaar af. De volgorde zet de meting eerst, zodat de nulmeting en elke volgende PR in dezelfde maat
geteld worden (OV-6).

## Kopieer de vorm van

- `rails/hooks/lib/meting.mjs` — `regel()` en `agentSleutel()`: alleen tellingen en vaste sleutels opslaan. `tok` en `tc`
  volgen die regel.
- `scripts/kit/meting.mjs` — `weigeringen()`, `tel()`, `prTabel()` en `prTabelTekst()`. De tellingen per rol komen naast
  `weigeringenPerSleutel`.
- `test/rails/meting-overzicht.test.ts` — fixtures als `.jsonl` in een tijdelijke `METING_DIR`, getoetst met `toMatchObject`.
- `test/hooks/agents.test.ts` — frontmatter van alle agents en skills lezen met `readdirSync`; sinds #850 ook `yamlFouten()`.
- `scripts/kit/leespad.mjs` — `basisVan`: de basis als `git merge-base origin/main HEAD`, git via `execFileSync` zonder shell.

## Hergebruik en UX

Geen UI. Hergebruik: `opslagmap`, `regel` en `sleutel` uit `rails/hooks/lib/meting.mjs`, en `overzicht`, `prTabel` en
`weigeringen` uit `scripts/kit/meting.mjs`. `.claude/hooks/meting.mjs` (de shim) en de hookregistratie in
`.claude/settings.json` blijven ongewijzigd. De meethook ontvangt `PostToolUse` al voor elke tool.

Teksten, letterlijk:

**Punt 1a** (gebouwd in #850; de teksten daar zijn de bron)

- De meldingen van de frontmattertoets staan in `yamlFouten()` in `test/hooks/agents.test.ts`.
- `.claude/agents/architect.md:3` en `.claude/agents/docs.md:3`: dezelfde `description`, tussen dubbele quotes.
- `.claude/agents/tester.md` punt 4: wat de SubagentStop-hook wel draait (typecheck, lint, Vitest op gewijzigde
  `*.test.ts(x)`) en niet (integratie, pgTAP, e2e).
- `.claude/agents/architect.md` punt 6 verwijst naar stap 6 van de skill `spec`, met `nieuwe-koppeling` en
  `feiten.mjs koppelingen`.
- `.claude/agents/docs.md` verwijst naar `schrijfrecht.docs` in `.claude/gates.json` in plaats van de padlijst.

**Punt 1b**

`.claude/agents/developer.md` krijgt na punt 2 de kop `## Welke skill je laadt` met deze inleiding en tabel:

`Laad de skill vóór de stap. Zonder Skill-tool lees je .claude/skills/<naam>/SKILL.md en draai je de feitenregel daarin zelf.`

| Stap | Skill |
|---|---|
| migratie, policy of grants | `migratie` |
| API-route, contract, permissie of foutcode | `nieuw-route` |
| nieuwe pagina of route in de frontend | `nieuw-scherm` |
| nieuw component of variant | `nieuw-component` |
| koppeling met een externe dienst | `nieuwe-koppeling` |
| ontwerp, huisstijl of thema overnemen | `ontwerp-overnemen` |

Punt 5 ("Regels uit AGENTS.md: …") wordt `5. Nooit pushen, mergen of rebasen; dat doet de hoofdsessie.`

**Punt 1c**

- `.claude/agents/reviewer.md`, direct na de eerste alinea:
  `Budget: rapporteer na hooguit 25 toolcalls. Zet eerst het skelet van je rapport neer (de koppen, met ## Bevindingen) en vul het daarna in. Is het budget op, lever dan wat je hebt en noem wat je niet hebt getoetst.`
- `.claude/agents/architect.md`, direct na de eerste alinea:
  `Budget: schrijf het spec- of ADR-bestand na hooguit 15 toolcalls, eerst als skelet (frontmatter en de koppen uit het sjabloon), en vul het daarna in. Lees alleen wat de opdracht raakt.`
- Frontmatter van developer, tester en docs: `disallowedTools: Agent, mcp__*`.

**Punt 1d**

- Uitvoer op stdout bij succes: één regel, het pad van het pakket ten opzichte van de repo-root.
- De koppen van het pakket staan in AC-15.
- Meldingen op stderr, met exitcode 1, behalve de laatste (exitcode 0):
  - `reviewpakket: ongeldige ref <waarde>`
  - `reviewpakket: <waarde> is geen voorouder van HEAD; geef de laatst gereviewde commit`
  - `reviewpakket: geen commits in <range>`
  - `reviewpakket: de werkmap heeft niet-gecommitte wijzigingen; die staan niet in het pakket`
- `.claude/agents/reviewer.md` stap 1 krijgt: `Krijg je een reviewpakket (.reviewpakket/…), lees dat met Read in plaats van git log en git diff.`

**Meting**

- Tekstuitvoer per sessie en per branch, onder de regel met `weigeringen`, alleen als er iets te tellen is:
  - `  weigeringen per rol: <rol> <n>, <rol> <n>`, aflopend op aantal en daarna op naam;
  - `  subagents: <rol> <runs> runs, <tokens> tokens, <toolcalls> toolcalls; <rol> …`, met `(<n> zonder telling)` achter een
    rol als er zulke runs zijn.
- In `--pr-tabel` komen twee rijen bij: `Weigeringen per rol` (waarde `<rol> <n> · <rol> <n>`, of `0`) en `Tokens per rol`
  (waarde `<rol> <tokens> (<runs> runs) · …`, of `onbekend` zonder enige telling).
- In `HELP` komen bij de teldefinities:
  - `weigeringen per rol: dezelfde weigeringen, naar de rol (a) van het geweigerde event; zonder rol: onbekend.`
  - `subagents per rol: PostToolUse en PostToolUseFailure van Agent of Task, naar het subagenttype; tokens en toolcalls uit totalTokens en totalToolUseCount van de tool_response; ontbreekt een telling, dan zonder telling, geen nul.`

## Acceptatiecriteria

**PR-1: meting per rol**

- **agents-leveren/AC-1** — Gegeven een `PostToolUse`-payload met `tool_name` `Agent`, `tool_input.subagent_type`
  `reviewer` en een `tool_response` met `totalTokens: 1234`, `totalToolUseCount: 17` en tekstvelden, wanneer `regel()` hem
  verwerkt, dan heeft de regel `k: 'agent reviewer'`, `tok: 1234` en `tc: 17`, en geen ander veld uit `tool_response`. Is een
  telling geen geheel getal ≥ 0, dan ontbreekt dat veld. Een andere tool of een ander event krijgt nooit `tok` of `tc`.
  Toets: `test/hooks/meting-per-rol.test.ts` (nieuw)
- **agents-leveren/AC-2** — Gegeven meetbestanden met weigeringen (een `PermissionDenied`, en een `PreToolUse` zonder Post)
  van de rollen `reviewer` (2), `hoofdsessie` (1) en een regel zonder `a` (1), wanneer `pnpm meting --json` draait, dan is
  `weigeringenPerRol` van die sessie `{ reviewer: 2, hoofdsessie: 1, onbekend: 1 }`. De tekstuitvoer bevat
  `  weigeringen per rol: reviewer 2, hoofdsessie 1, onbekend 1`. Zonder weigeringen ontbreekt die regel.
  Toets: `test/rails/meting-per-rol.test.ts` (nieuw)
- **agents-leveren/AC-3** — Gegeven twee `PostToolUse`-regels van `agent reviewer` (`tok` 100000 en 140000, `tc` 20 en 28),
  één `PostToolUseFailure` van `agent reviewer` zonder telling en één `PostToolUse` van `agent developer` met `tok` 50000 en
  `tc` 30, wanneer `pnpm meting --json` draait, dan is `subagentsPerRol`
  `{ reviewer: { runs: 3, tokens: 240000, toolcalls: 48, zonderTelling: 1 }, developer: { runs: 1, tokens: 50000, toolcalls: 30, zonderTelling: 0 } }`.
  De tekstuitvoer bevat
  `  subagents: reviewer 3 runs, 240000 tokens, 48 toolcalls (1 zonder telling); developer 1 runs, 50000 tokens, 30 toolcalls`.
  Een `PreToolUse` van een subagent telt niet als run. Toets: `test/rails/meting-per-rol.test.ts` (nieuw)
- **agents-leveren/AC-4** — Gegeven de meetbestanden uit AC-2 en AC-3 op één branch, wanneer
  `pnpm meting --pr-tabel --branch <naam>` draait, dan bevat de tabel de rijen `| Weigeringen per rol | reviewer 2 · hoofdsessie 1 · onbekend 1 |`
  en `| Tokens per rol | reviewer 240000 (3 runs) · developer 50000 (1 runs) |`. Met `--json` heeft `prTabel` de velden
  `weigeringenPerRol` en `subagentsPerRol`. Zonder enige `tok` is de waarde van de tokenrij `onbekend`.
  Toets: `test/rails/meting-per-rol.test.ts` (nieuw)

**PR-2: punt 1a** (gebouwd in #850; de toetsen voor AC-7 en AC-8 komen in PR-3)

- **agents-leveren/AC-5** — Gegeven een frontmatterfixture met een niet-gequote waarde die `: ` of ` #` bevat, een waarde die
  met een YAML-indicator begint of een quote die niet sluit, wanneer `yamlFouten()` hem leest, dan geeft het per regel een
  melding met `<pad>:<regel>`. Dezelfde waarde tussen dubbele quotes geeft geen melding.
  Toets: `test/hooks/agents.test.ts`
- **agents-leveren/AC-6** — Gegeven elke `.claude/agents/*.md` en elke `.claude/skills/*/SKILL.md`, wanneer `yamlFouten()`
  erop draait, dan is er geen melding. Vóór #850 was de toets rood op `.claude/agents/architect.md:3` en
  `.claude/agents/docs.md:3`. Toets: `test/hooks/agents.test.ts`
- **agents-leveren/AC-7** — Gegeven `.claude/agents/tester.md`, wanneer `subagentStop` uit `rails/hooks/lib/werkstraat.mjs`
  draait met `agent_type` `tester` en een gestubde `deps` waarvan `changed()` `a.test.ts`, `b.test.tsx`, `c.int.test.ts` en
  `e2e/d.spec.ts` geeft, dan krijgt de vitest-aanroep alleen `a.test.ts` en `b.test.tsx`, en noemt punt 4 van `tester.md`
  `*.int.test.ts` als niet gedraaid. Toets: `test/hooks/agent-teksten.test.ts` (nieuw)
- **agents-leveren/AC-8** — Gegeven `.claude/agents/architect.md` en `.claude/agents/docs.md`, wanneer de toets ze leest, dan
  verwijst punt 6 van de architect naar `.claude/skills/spec/SKILL.md`, zonder de opsomming met `check:migrations`. De
  docs-agent noemt `schrijfrecht.docs` en geen van de paden `docs/reviews/`, `docs/operations/` of `CHANGELOG.md`.
  `koppeling-agentlaag/AC-13` blijft groen zonder wijziging van zijn test.
  Toets: `test/hooks/agent-teksten.test.ts` (nieuw)

**PR-3: punt 1b**

- **agents-leveren/AC-9** — Gegeven `.claude/agents/developer.md`, wanneer de toets hem leest, dan staat onder
  `## Welke skill je laadt` een tabelrij voor elke skill in `.claude/skills/` behalve `spec`, `opleveren` en
  `security-review`. Elke skillnaam in die tabel bestaat als map in `.claude/skills/`. Een nieuwe skillmap die niet in de tabel
  en niet in die drie uitzonderingen staat, maakt de toets rood. Toets: `test/hooks/developer-skillrouter.test.ts` (nieuw)
- **agents-leveren/AC-10** — Gegeven `.claude/agents/developer.md`, wanneer de toets hem leest, dan bevat hij niet
  `Regels uit AGENTS.md`, `geen casts` of `eslint-disable`, en wel punt 5 zoals in Hergebruik en UX.
  Toets: `test/hooks/developer-skillrouter.test.ts` (nieuw)

**PR-4: punt 1c**

- **agents-leveren/AC-11** — Gegeven elke `.claude/agents/*.md`, wanneer de toets de frontmatter leest, dan heeft elke rol
  óf een `tools`-lijst zonder `Agent`, `Task` en zonder iets dat met `mcp__` begint, óf een `disallowedTools`-lijst met zowel
  `Agent` als `mcp__*`. Op de huidige `main` faalt de toets voor developer (geen van beide), tester en docs (geen `Agent`).
  Toets: `test/hooks/agent-budget.test.ts` (nieuw)
- **agents-leveren/AC-12** — Gegeven `.claude/agents/reviewer.md`, wanneer de toets hem leest, dan staat de budgetzin uit
  Hergebruik en UX met `25 toolcalls` vóór de eerste genummerde stap. De sectie `## Bevindingen` blijft de afsluiting.
  Toets: `test/hooks/agent-budget.test.ts` (nieuw)
- **agents-leveren/AC-13** — Gegeven `.claude/agents/architect.md`, wanneer de toets hem leest, dan staat de budgetzin uit
  Hergebruik en UX met `15 toolcalls` en `skelet` vóór de eerste genummerde stap.
  Toets: `test/hooks/agent-budget.test.ts` (nieuw)

**PR-5: punt 1d**

- **agents-leveren/AC-14** — Gegeven een tijdelijke git-repo met `origin/main` en twee commits op een branch `feat/x`, wanneer
  `node scripts/kit/reviewpakket.mjs` daar draait, dan is de exitcode 0. Stdout is één regel
  `.reviewpakket/feat-x-<sha7>.md`, dat bestand bestaat, en buiten `.reviewpakket/` is niets gewijzigd (`git status --porcelain`
  is leeg als `.reviewpakket/` genegeerd wordt). Toets: `test/scripts/reviewpakket.test.ts` (nieuw)
- **agents-leveren/AC-15** — Gegeven dezelfde repo, met in de diff een gewijzigde `docs/template/specs/a.md` (voorbeeld), een gewijzigde
  `src/a.ts` (voorbeeld) en een gewijzigde `pnpm-lock.yaml`, wanneer het pakket gemaakt wordt, dan staan de koppen in deze volgorde:
  `# Reviewpakket feat/x @ <sha7>`, de regel `Basis: <sha7 van de merge-base>`, `## Spec`, `## Log`, `## Stat` en `## Diff`.
  Onder `## Spec` staat `docs/template/specs/a.md`, zonder spec in de diff de regel `geen spec in de diff`, met `--spec <pad>`
  dat pad. `## Log` is gelijk aan `git log --oneline <basis>..HEAD` en `## Stat` aan `git diff --stat <basis>..HEAD`. `## Diff`
  bevat de diff van `src/a.ts` en niet die van `pnpm-lock.yaml`, wel de regel
  `Weggelaten (gegenereerd, staat in Stat): pnpm-lock.yaml`. Toets: `test/scripts/reviewpakket.test.ts` (nieuw)
- **agents-leveren/AC-16** — Gegeven dezelfde repo met een derde commit (de fix), wanneer
  `node scripts/kit/reviewpakket.mjs --sinds <sha van commit 2>` draait, dan heet het bestand
  `.reviewpakket/feat-x-<sha7>-fix-<sha7 van commit 2>.md`. De tweede regel is `Fixdiff sinds: <sha7 van commit 2>`, en Log,
  Stat en Diff bevatten alleen commit 3. Toets: `test/scripts/reviewpakket.test.ts` (nieuw)
- **agents-leveren/AC-17** — Gegeven dezelfde repo, wanneer het script draait met `--basis '-x'`, met `--basis 'a;b'`, met
  `--sinds <sha die geen voorouder van HEAD is>` of op een branch zonder commits na de basis, dan is de exitcode 1, staat de
  bijbehorende melding uit Hergebruik en UX op stderr en ontstaat er geen bestand. Een niet-gecommitte wijziging geeft de
  waarschuwing op stderr, exitcode 0 en een pakket zonder die wijziging. Toets: `test/scripts/reviewpakket.test.ts` (nieuw)
- **agents-leveren/AC-18** — Gegeven `.gitignore` en `.claude/agents/reviewer.md`, wanneer de toets ze leest, dan negeert
  `.gitignore` de map `.reviewpakket/` (`git check-ignore` op een bestand daarin slaagt), en staat de zin over het reviewpakket
  uit Hergebruik en UX in stap 1 van de reviewer. Toets: `test/scripts/reviewpakket.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Oude meetregel zonder `a` | rol `onbekend` (AC-2) | n.v.t. |
| `tool_response` zonder `totalTokens` (andere Claude Code-versie) | geen `tok`; de run telt als `zonderTelling`, niet als nul (AC-1, AC-3) | n.v.t. |
| Agent-aanroep zonder geldig `subagent_type` | sleutel `agent`, rol `onbekend` (bestaande `agentSleutel`) | n.v.t. |
| `tool_response` met prompt- of antwoordtekst | wordt nooit opgeslagen; alleen de twee gehele getallen (AC-1) | n.v.t. |
| Frontmatter in geldige YAML buiten de subset (bijv. een blokscalar `>`) | geweigerd; de subset is bewust strenger dan YAML (AC-5, OV-1) | n.v.t. |
| Nieuwe skill zonder rol voor de developer | rood tot hij in de router of in de uitzonderingen staat (AC-9) | n.v.t. |
| Reviewer heeft na 25 toolcalls nog niet alles gezien | levert het rapport met wat niet getoetst is; de hoofdsessie beslist over een vervolgronde | n.v.t. |
| Reviewpakket op een branch met gegenereerde bestanden (`db/schema.snapshot.sql`, `pnpm-lock.yaml`, `.github/CODEOWNERS`) | alleen in Stat, met de regel `Weggelaten …` (AC-15, OV-5) | n.v.t. |
| `--sinds` met een sha die al op `main` staat | als voorouder van HEAD geldig; het pakket bevat dan ook commits van anderen. De hoofdsessie geeft de laatst gereviewde commit | n.v.t. |
| Branchnaam met `/` | `-` in de bestandsnaam, `/` in de kop (AC-14, AC-15) | n.v.t. |
| Detached HEAD | branchdeel `detached` in bestandsnaam en kop | n.v.t. |

## Raakt ook

**Beschermde paden per PR** (niveaus uit `.claude/gates.json` → `paden`; `feiten.mjs pad` draaide niet in deze sandbox)

| PR | Pad | Schrijven | Besluit |
|---|---|---|---|
| PR-1 | `rails/hooks/lib/meting.mjs`, `scripts/kit/meting.mjs` | `voorReview` | — |
| PR-1 | `docs/operations/agent-doorloop.md` ("Metingen lezen") | — | eigenaar |
| PR-1 | `docs/template/specs/agents-leveren.md` | `gate` | eigenaar |
| PR-2 (#850), PR-3, PR-4 | `.claude/agents/*.md` | `voorReview` | eigenaar (`**/.*/**`) |
| PR-5 | `scripts/kit/reviewpakket.mjs` (nieuw) | `voorReview` | — |
| PR-5 | `.gitignore` | — | eigenaar (`**/.*`) |
| PR-5 | `.claude/agents/reviewer.md` | `voorReview` | eigenaar |
| PR-5 | `docs/operations/agent-doorloop.md` (reviewpakket in de doorloop) | — | eigenaar |
| alle | `test/**` | `gate` | — |

Niet geraakt: `.claude/settings.json`, `.claude/hooks/**`, `.claude/skills/**`, `.claude/gates.json`, `package.json` en
`pnpm-lock.yaml`. Kiest de eigenaar bij OV-1 de `yaml`-dependency of bij OV-2 de SubagentStop-route, dan raakt de PR wel
`altijdVragen`-paden.

**Checks en metingen**

- Geen migratie, route, permissie, policy of resource: niet `check:migrations`, `check:secdef`, `test:db` of
  `test/security/resources.ts`.
- `pnpm leespad`: `.claude/agents/architect.md` staat in het scenario voor volledig werk, `.claude/agents/developer.md` in
  `lichte-fix` (`scripts/kit/leespad.mjs`). PR-3 en PR-4 melden de verandering in bytes in de PR (PR-2: #850).
- `koppeling-agentlaag/AC-13` (`test/rails/koppeling-agentlaag.test.ts`) pint `nieuwe-koppeling` en
  `feiten.mjs koppelingen` in `architect.md`. De nieuwe punt-6-regel houdt die woorden (AC-8).
- `test/hooks/agents.test.ts`: #850 voegde het describe-blok met `yamlFouten()` toe (AC-5, AC-6). PR-3 en PR-4 laten het
  bestand ongewijzigd: `disallowedTools` behoudt `mcp__*`.
- `docs/template-changelog.md`: een regel per PR die een app raakt (agents, meting, reviewpakket). Een app hoeft niets te doen.

**Het plan getoetst tegen de repo** (basis van deze spec: werkmap op 2026-11-19)

1. De `SubagentStop`-matcher staat op `.claude/settings.json:176`, niet op `:174`; `:174` is de `Stop`-hook. De matcher
   `developer|tester|reviewer` dekt architect en docs inderdaad niet (golf 2).
2. De meting-store legt de rol al per event vast (`a`, `rails/hooks/lib/meting.mjs:133`). Voor weigeringen per rol is dus
   alleen een telling in `scripts/kit/meting.mjs` nodig, en die werkt ook op bestaande meetbestanden. Tokens en toolcalls legt
   de store nergens vast. De meethook staat niet op `SubagentStop`.
3. De niet-gequote `description` in `architect.md:3` en `docs.md:3` klopt. De andere drie agents en alle negen skills parsen
   met de regels van AC-5.
4. `developer.md` heeft geen `disallowedTools` en dus ook `mcp__*`. Tester en docs sluiten `mcp__*` uit, maar hebben de
   Agent-tool. Het rolhek weigert subagent-MCP niet helemaal, alleen tools buiten `mcpLezen` (`decideMcp` in
   `rails/hooks/lib/rolhek.mjs`). Het commentaar in `test/hooks/agents.test.ts:46` zegt meer dan het rolhek doet.
5. `developer.md` noemt geen skill (klopt). De "kopie van AGENTS.md" is punt 5 van `developer.md`.
6. `tester.md:14` zegt dat de hook de tests controleert; `testerStop` (`rails/hooks/lib/werkstraat.mjs:185`) draait alleen
   gewijzigde `*.test.ts(x)`, zonder `*.int.test.ts` en e2e (klopt met het plan).
7. Reviewer en architect hebben al `maxTurns: 40`. Een beurt is geen toolcall, dus het budget is een nieuwe, eigen grens.
8. In `pnpm-lock.yaml` staat geen YAML-parser; een strikte parse met een bibliotheek vraagt een nieuwe dependency (OV-1).

## Buiten scope

- Het statuscontract, de SubagentStop-matcher voor architect en docs en het reviewrapport als schema (golf 2).
- Hookhandhaving van het budget, en een lagere `maxTurns` (OV-7).
- Tokens van de hoofdsessie. De nulmeting telt die met de hand, zoals in #664.
- `pnpm meting --trend` per rol.
- De doelcijfers uit §8 als check: die zijn metingen over tien PR's, geen gedrag (ADR 0100).

## Testplan

- Unit, nieuw: `test/hooks/meting-per-rol.test.ts` (nieuw), `test/rails/meting-per-rol.test.ts` (nieuw),
  `test/hooks/agent-teksten.test.ts` (nieuw), `test/hooks/developer-skillrouter.test.ts` (nieuw),
  `test/hooks/agent-budget.test.ts` (nieuw) en `test/scripts/reviewpakket.test.ts` (nieuw; een tijdelijke git-repo, geen
  mock van git). AC-5 en AC-6 toetst `test/hooks/agents.test.ts` sinds #850.
- AC-11 toont in zijn PR dat de toets rood is op de basis (`main`) en groen na de wijziging; voor AC-6 deed #850 dat.
- Per PR: `pnpm ratchet` (ac-toets, check-docs), `pnpm gate:fast` en `pnpm test:unit` groen.
- Nulmeting, in de beschrijving van PR-1 na de bouw: `pnpm meting --trend`, `pnpm meting --pr-tabel` voor de laatste tien
  gemergde branches waarvan meetdata bestaan, weigeringen per rol uit de bestaande meetbestanden, en de handtelling van tokens
  uit #664 (277k van 634k voor de reviewer).
- Vóór het bouwen van PR-1: de hoofdsessie legt één echte `PostToolUse`-payload van een Agent-aanroep naast AC-1 (veldnamen
  `totalTokens` en `totalToolUseCount`) en noemt de Claude Code-versie in de PR (OV-2).
- Na golf 1: de doelen uit §8 van het plan over de volgende tien PR's (0 runs zonder rapport, reviewerweigeringen < 25 %,
  < 120k tokens per review). Dit is een meting in een PR-beschrijving of leerpunt, geen AC.

## Open vragen

- **OV-1 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling; gebouwd in #850 als `yamlFouten()` in
  `test/hooks/agents.test.ts`) — Frontmattertoets: een eigen strikte subset, of de `yaml`-bibliotheek
  als devDependency (drempel A2: ADR, akkoord, `package.json` en `pnpm-lock.yaml`). Aanbeveling: de eigen subset. Die vangt
  het echte defect, vraagt geen dependency en is strenger dan YAML. Dat laatste is voor vijf agents en negen skills geen last.
- **OV-2 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Bron van tokens en toolcalls: de `tool_response` van `PostToolUse` op de Agent-tool (alleen
  `rails/hooks/lib/meting.mjs`), of `SubagentStop` met een som uit het transcript (`.claude/settings.json`, `altijdVragen`).
  Aanbeveling: de `tool_response`, na de payloadcontrole uit het Testplan. Ontbreken de velden in de gepinde versie, dan komt
  de spec eerst terug bij de eigenaar.
- **OV-3 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Geen Agent-tool: alleen voor de bouwers (developer, tester), zoals het plan zegt, of voor alle vijf rollen.
  Aanbeveling: alle vijf. Architect en reviewer hebben hem nu al niet. Alleen de hoofdsessie start subagents, en een geneste
  docs-run is net zo onzichtbaar voor de meting.
- **OV-4 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Plek van het reviewpakket: `.reviewpakket/` in de werkmap (genegeerd door git), of
  `<git common dir>/reviewpakket/` zoals de meting. Aanbeveling: in de werkmap. De reviewer leest dan binnen zijn werkmap
  met Read, zonder permissievraag voor een pad erbuiten.
- **OV-5 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Gegenereerde bestanden in het pakket: weglaten uit `## Diff` (alleen in Stat), of volledig opnemen.
  Aanbeveling: weglaten (`db/schema.snapshot.sql`, `pnpm-lock.yaml`, `.github/CODEOWNERS`). Hun bron staat al in de diff, en
  alleen zo komt het doel van < 120k tokens binnen bereik.
- **OV-6 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Meting als eigen PR-1, of "in de eerste PR van golf 1 mee" (plan §8) samen met 1a. Aanbeveling: een eigen PR-1.
  R-REPO-05 eist één onderwerp per PR, en de roadmap zegt "elk punt een eigen PR".
- **OV-7 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Handhaving van het budget: alleen instructie plus meting (`tc` per rol, AC-3), of nu al een hook die na 25 of 15
  toolcalls blokkeert. Aanbeveling: alleen instructie plus meting. #792 haalde 3 van 3 met alleen de regel. Een hook volgt
  alleen als het doel na tien PR's niet gehaald is (golf 4c: eerst schaduwmodus).
- **OV-8 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Skillrouter: de developer laadt een skill met de Skill-tool, of leest het SKILL.md-bestand. Of een subagent de
  Skill-tool heeft, kon deze sandbox niet nagaan. Aanbeveling: de tekst uit Hergebruik en UX, die beide dekt.
