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

**2. Sessiebudget — hook `context-budget`** (UserPromptSubmit en Stop, in `werkstraat.mjs`). Schat de context uit het laatste
`usage`-blok in `transcript_path`.
- ≥ 150k: `additionalContext` "rond het lopende onderdeel af; schrijf de overdracht (`pnpm stand`) en stel een verse sessie voor".
- ≥ 250k: de Stop-hook blokkeert één keer met dezelfde boodschap, tenzij `stop_hook_active`. De hook kan `/clear` niet forceren; de
  afdwinging is dat elke beurt boven de drempel de melding krijgt en `pnpm tokens` het zichtbaar maakt. Fail-open bij een leesfout.
- Drempels staan in `.claude/gates.json` (`tokenBudget`), niet in de hook.

**3. Overdracht in de repo, niet in het geheugen — `pnpm stand`** (`scripts/kit/stand.mjs`). Eén compacte uitvoer (≤ 40 regels): branch, PR
en checkstatus (`gh pr view`/`checks` in één keer), `git diff --stat main...HEAD`, open reviewbevindingen, spec en acceptatiecriteria,
volgende stap. SessionStart gebruikt dit in plaats van losse regels. Het agent-geheugen houdt alleen werkafspraken; de projectstand
staat in de PR en in de roadmap. Vervangt de ~120 losse `gh`-aanroepen.

**4. Grote documenten alleen gericht lezen.**
- `feiten.mjs` krijgt `adr` met één regel samenvatting per ADR en `sectie <doc> <nummer>` voor `framework.md`, `roadmap.md`, `nieuwe-app.md`.
- `check-docs` krijgt een documentbudget (regels per `##`-sectie en per bestand, §9-tabel uitgebreid); bestaande overschrijdingen komen in
  `.kit/baseline.json` (ratchet): geen nieuwe of groeiende overschrijding. Overschrijding betekent: splitsen of een gate maken.
- PreToolUse-regel in `rolhek` voor `Read` zonder `offset`/`limit` op `docs/framework.md`, `docs/roadmap.md`, `docs/nieuwe-app.md` en
  `docs/adr/*` (behalve het ADR waaraan de rol werkt): weigeren met "gebruik `feiten.mjs sectie …` of `offset`/`limit`".

**5. Onderzoek via subagent — agent `onderzoek`** (read-only: Read, Grep, Glob, `git log/show`; sonnet, `maxTurns: 30`). Levert een conclusie
van ≤ 40 regels met `bestand:regel`. Het rolhek weigert in de hoofdsessie (niet in subagents) `Read`/`Grep`/Bash-leesacties in
`node_modules/` en `.pnpm/` met verwijzing naar deze agent. Spiegelt het bestaande onderscheid hoofdsessie/subagent.

**6. Minder beurten.** `SessionStart` meldt als de werkmap niet de repo-root is (geen `cd … &&` meer nodig). `AGENTS.md`/`CLAUDE.md`
verwijzen naar `pnpm stand` en `pnpm tokens`; "Zuinig met context" in `CLAUDE.md` wordt een verwijzing naar framework §9 (de regel
is nu een gate: haal de proza weg, framework §9).

**7. Model per rol, met kwaliteitsrem.** `developer` op `sonnet` voor goedgekeurde specs; `tester` blijft sonnet, `reviewer` blijft opus,
`onderzoek` sonnet. Terugvalcriterium na 10 PR's: stijgt het aantal blokkerende reviewbevindingen per PR of het aantal
correctiepogingen per PR, dan gaat `developer` terug naar `inherit`. (Aanpassing aan een rol is een gate-wijziging.)

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
- **Hard `/clear` forceren**: niet mogelijk vanuit een hook; de melding per beurt plus meting is het maximaal haalbare.
- **Documenten inkorten of regels schrappen**: bespaart weinig (basis is 2,5k) en riskeert kwaliteit; het probleem is sessielengte.
- **Alles op een goedkoper model**: tast de reviewkwaliteit aan; daarom alleen de rollen waar de reviewer het vangnet is.

## Gevolgen

- Vier PR's: (1) `pnpm tokens` + nulmeting + documentbudget in `check-docs`; (2) `pnpm stand`, `feiten.mjs` ADR-index en `sectie`, SessionStart;
  (3) hooks `context-budget`, leesgrens, agent `onderzoek` met tests; (4) rolmodellen, framework §8/§9, `CLAUDE.md`, roadmap-stuk.
- Dit is een gate-wijziging: label `gate-wijziging`, ADR eerst geaccepteerd door de eigenaar.
- De leesgrens kan een legitieme volledige read hinderen; de weigering noemt het alternatief en `offset`/`limit` blijft mogelijk.
- `pnpm tokens` leest transcripten buiten de repo; het rapport bevat nooit inhoud, alleen aantallen en bestandsnamen.
- Open voor de eigenaar: **OV-1** drempels 150k/250k; **OV-2** `developer` op sonnet met het terugvalcriterium; **OV-3** harde weigering van volledige
  reads (alternatief: alleen melden); **OV-4** mag `pnpm tokens` de transcripten lezen (sandbox)?
