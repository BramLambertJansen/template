# 0023 — Tokenzuinige werkstraat: meten, sessiebudget en gerichte context

Status: voorgesteld

## Context

Meting van de grootste sessie van de template-PR-reeks (transcript in `~/.claude/projects`): 3.215 beurten, gemiddeld 368k tokens
context per beurt (250k–700k), samen ≈ 1,17 miljard cache-read tokens. Alle tool-uitvoer bij elkaar was maar ≈ 350k tokens en de
altijd-geladen basis (`AGENTS.md` + `CLAUDE.md`) ≈ 2,5k. De kosten zijn dus **context × aantal beurten**; wat we lezen weegt veel minder dan
hoe lang een sessie doorloopt. Daarbovenop: 550 losse Bash-aanroepen met `cd … &&`, 121 `gh pr`-aanroepen, 148 reads in
`node_modules/better-auth` in de hoofdsessie, en `roadmap.md`/`framework.md`/ADR's samen ≈ 350k tekens in 158 volledige reads. Er was één subagent-aanroep.

Framework §9 noemt een tokenbudget, maar alleen voor altijd-geladen bestanden; de sessielengte, onderzoek in de hoofdsessie en grote
referentiedocumenten zijn niet gemeten of afgedwongen. Regels in proza (`CLAUDE.md` "Zuinig met context") worden in een lange sessie niet gevolgd.

## Besluit

Eerst meten, dan afdwingen waar een hook of check het kan; de rest blijft een afspraak. Geen enkele maatregel zwakt een gate, het
rolhek, de onafhankelijke reviewer of een test af. Alles hieronder komt onder `scripts/**` en `.claude/**` (gate-paden, dus label `gate-wijziging`).

**1. Meten — `pnpm tokens`** (`scripts/kit/tokens.mjs`). Leest de transcripten van dit project en rapporteert per sessie: beurten, gemiddelde en
maximale context, cache-read totaal, herhaalde volledige reads per bestand, tool-uitvoer per commandoprefix, aantal subagent-aanroepen.
Alleen getallen en bestandsnamen in de uitvoer, nooit inhoud. Dit is de nulmeting en de bewijslast voor elke volgende maatregel
(framework §10 "Meten"): een regel blijft alleen als de cijfers verbeteren zonder meer blokkerende reviewbevindingen per PR.

**2. Sessiebudget — ingebouwde grens plus melding.** De Claude Code-documentatie noemt geen tokendrempel waarboven kwaliteit daalt
(wel "context rot", zonder getal) en compact standaard pas rond 967k. De grens is daarom een keuze, gemeten met `pnpm tokens`:
- `autoCompactWindow: 200000` in `.claude/settings.json` (instelbaar van 100k tot 1M): de harde grens, zonder eigen hook.
- Hook `context-budget` (UserPromptSubmit, in `werkstraat.mjs`) schat de context uit het laatste `usage`-blok in `transcript_path` (de docs
  bieden geen veld voor context-gebruik in een hook). Vanaf 150k meldt hij als `additionalContext`: "rond het lopende onderdeel af,
  schrijf de overdracht (`pnpm stand`) en stel een verse sessie voor". Een nette overdracht verliest minder dan auto-compact. Fail-open.
- De drempel staat in `.claude/gates.json` (`tokenBudget`), niet in de hook. De 150k/200k zijn een eerste keuze; `pnpm tokens` stuurt bij.

**3. Overdracht in de repo, niet in het geheugen — `pnpm stand`** (`scripts/kit/stand.mjs`). Eén compacte uitvoer (≤ 40 regels): branch, PR
en checkstatus (`gh pr view`/`checks` in één keer), `git diff --stat main...HEAD`, open reviewbevindingen, spec en acceptatiecriteria,
volgende stap. SessionStart gebruikt dit in plaats van losse regels. Het agent-geheugen houdt alleen werkafspraken; de projectstand
staat in de PR en in de roadmap. Vervangt de ~120 losse `gh`-aanroepen.

**4. Grote documenten alleen gericht lezen.**
- `feiten.mjs` krijgt `adr` met één regel samenvatting per ADR en `sectie <doc> <nummer>` voor `framework.md`, `roadmap.md`, `nieuwe-app.md`.
- `check-docs` krijgt een documentbudget (regels per `##`-sectie en per bestand, §9-tabel uitgebreid); bestaande overschrijdingen komen in
  `.kit/baseline.json` (ratchet): geen nieuwe of groeiende overschrijding. Overschrijding betekent: splitsen of een gate maken.
- Een `Read` zonder `offset`/`limit` op `docs/framework.md`, `docs/roadmap.md` of `docs/nieuwe-app.md` krijgt een melding
  (`additionalContext`) met het alternatief; geen weigering. De documentatie bevestigt niet dat een hook `offset`/`limit` van Read ziet, en
  de volledige reads wegen weinig (≈ 350k tekens op 1,17 miljard cache-read tokens). De echte afdwinging is het documentbudget.

**5. Onderzoek via subagent — agent `onderzoek`** (read-only: Read, Grep, Glob, `git log/show`; sonnet, `maxTurns: 30`). Levert een conclusie
van ≤ 40 regels met `bestand:regel`. Het rolhek weigert in de hoofdsessie (niet in subagents, herkenbaar aan `agent_type`) `Read`/`Grep`/Bash-leesacties in
`node_modules/` en `.pnpm/` met verwijzing naar deze agent.

**6. Minder beurten.** `SessionStart` meldt als de werkmap niet de repo-root is (geen `cd … &&` meer nodig). `AGENTS.md`/`CLAUDE.md`
verwijzen naar `pnpm stand` en `pnpm tokens`; "Zuinig met context" in `CLAUDE.md` wordt een verwijzing naar framework §9 (de regel
is nu een gate: haal de proza weg, framework §9).

**7. Model per rol, met kwaliteitsrem.** `developer` op `sonnet` voor goedgekeurde specs (de Claude Code-docs: Sonnet "handles most coding tasks well"; de modelgids
begint juist bij Opus en er zijn geen benchmarks, dus de eigen meting beslist). Voor migraties, RLS en auth geeft de hoofdsessie
`model: opus` mee aan de aanroep (vastgelegd in de skills `migratie` en `nieuw-route`); pgTAP en de reviewer blijven het vangnet.
`tester` blijft sonnet, `reviewer` opus, `onderzoek` sonnet. Terugvalcriterium na 10 PR's: stijgt het aantal blokkerende reviewbevindingen per PR of het aantal
correctiepogingen per PR, dan gaat `developer` terug naar `inherit`. (Aanpassing aan een rol is een gate-wijziging.)

**8. Bouwen via de developer-agent in het volledige pad.** Meting: één Agent-aanroep in de grote sessie; de Opus-hoofdsessie bouwde zelf, dus
de modelkeuze in punt 7 en de schone context van de developer bleven ongebruikt (framework §8 laat "hoofdsessie of developer-agent" toe).
- Volledig pad (goedgekeurde spec met migratie, route of permissie): het rolhek weigert de hoofdsessie (geen `agent_type`) schrijven in
  `src/**` en `db/migrations/**` zolang de branch een goedgekeurde spec heeft; de developer-agent krijgt de spec als enige opdracht.
- Lichte pad (geen migratie, route of permissie): de hoofdsessie mag zelf bouwen.
- De skills `migratie`, `nieuw-route` en `nieuw-scherm` noemen de aanroep, inclusief de `model`-override voor migraties, RLS en auth.
- Valkuil: een geblokkeerde hoofdsessie kan om het hek heen werken via Bash; de bestaande schrijfdoel-detectie van het rolhek dekt dat, en de
  diff-guard blijft de grens in CI.

**9. Eén sessie per branch.** De grote sessie bouwde tientallen PR's in één context. De hook `context-budget` onthoudt de branch bij de
eerste prompt van de sessie (in de scratchpad, per `session_id`) en meldt als `additionalContext` wanneer de branch daarna verandert:
"nieuwe branch, nieuwe sessie: schrijf de overdracht (`pnpm stand`) en stel `/clear` voor". Alleen melden; kost geen kwaliteit.

**10. Wanneer aanscherpen of terugdraaien.** Na 10 gemergde PR's onder dit ADR beoordeelt de eigenaar met `pnpm tokens`:
- mediane context > 150k → `autoCompactWindow` omlaag;
- de hoofdsessie schrijft > 30% van de gewijzigde regels in `src/` via het lichte pad → verplichte developer-agent uitbreiden (punt 8);
- meer blokkerende reviewbevindingen of correctierondes per PR dan in de nulmeting → de laatste besparing terugdraaien, ook als dat tokens kost.
Strenger maken zonder deze signalen gebeurt niet: een lagere grens (100k) wint ≈ 7 procentpunt tegen twee keer zoveel overdrachten, en de
reviewer en architect blijven op opus omdat zij het vangnet zijn voor de andere besparingen.

Elke hook en elk script krijgt een tabeltest (`test/hooks/`, `test/rails/`) volgens de bestaande conventie, inclusief de omzeiling
(Read met `offset` tot 1 regel; `node_modules` via `cat` in Bash).

## Doelen (gemeten met `pnpm tokens`)

| Maat | Nu | Doel |
|---|---|---|
| Mediane context per beurt | ≈ 370k | ≤ 150k |
| p95 context | ≈ 650k | ≤ 300k |
| Cache-read per gemerged PR | niet gemeten | −60% t.o.v. nulmeting |
| Volledige reads van de drie grote documenten | 158 | < 10 per PR-reeks |
| Subagent-aanroepen voor onderzoek en review | 1 | ≥ 1 per PR |
| Blokkerende reviewbevindingen per PR | nulmeting | niet hoger |

## Alternatieven

- **Alleen proza in `CLAUDE.md`**: wordt in een lange sessie niet gevolgd en voldoet niet aan §9 ("regel in proza die een check kan zijn").
- **Hard `/clear` forceren**: niet mogelijk vanuit een hook; `autoCompactWindow` is de harde grens, de melding en meting doen de rest.
- **Documenten inkorten of regels schrappen**: bespaart weinig (basis is 2,5k) en riskeert kwaliteit; het probleem is sessielengte.
- **Alles op een goedkoper model**: tast de reviewkwaliteit aan; daarom alleen de rollen waar de reviewer het vangnet is.

## Gevolgen

- Vier PR's: (1) `pnpm tokens` + nulmeting + documentbudget in `check-docs`; (2) `pnpm stand`, `feiten.mjs` ADR-index en `sectie`, SessionStart;
  (3) `autoCompactWindow`, hook `context-budget`, leesmelding, agent `onderzoek` met tests; (4) rolmodellen, hoofdsessiehek voor het volledige pad (punt 8), framework §8/§9, `CLAUDE.md`, roadmap-stuk.
- Dit is een gate-wijziging: label `gate-wijziging`, ADR eerst geaccepteerd door de eigenaar.
- Prompt caching maakt een cache-hit 0,05× (Sonnet 5.5, Opus 5.5) van de invoerprijs: de besparing in geld is kleiner dan in tokens; op een
  abonnement telt vooral de limiet en de kwaliteit bij lange context. `pnpm tokens` rapporteert beide.
- `pnpm tokens` leest alleen de transcriptmap van dit project (de sandbox laat `~/.claude/projects` standaard lezen) en drukt nooit inhoud af.
- Keuzes (aanbeveling, de eigenaar beslist): **OV-1** `autoCompactWindow` 200k en melding vanaf 150k; **OV-2** developer op sonnet met opus-override
  en het terugvalcriterium; **OV-3** alleen melden bij volledige reads; **OV-4** transcripten lezen toegestaan, alleen dit project;
  **OV-5** verplichte developer-agent in het volledige pad (punt 8), lichte pad vrij.
