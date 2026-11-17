@AGENTS.md

Dit bestand bevat aanvullingen voor Claude Code. De platformneutrale werkstraat en projectregels staan in `AGENTS.md` en `docs/framework.md`; runtime-specifieke hooks, tools en agentconfiguratie gelden alleen in Claude Code.

Wat een gate kan afdwingen, staat hier niet. Groeit dit bestand of `AGENTS.md` over zijn budget (framework §9), dan ontbreekt er een gate.

## Werkstraat (verplicht)

Licht alleen voor beperkte fixes binnen bestaand gedrag; anders volledig, met eigenaarmerge; zelf mergen alleen via `pnpm pr:merge`, zonder pad van een code-eigenaar (ADR 0069, 0089) — framework §8.
Docs gaan mee in dezelfde PR als de code
(`check:docs-drift` waarschuwt); een aparte docs-stap na de merge bestaat niet.
Ook wanneer je een bestaande test mag wijzigen: framework §8.

## Stoppen en vragen

- Een beslissing ontbreekt, de spec spreekt zichzelf tegen, of een regel staat de opdracht in de weg.
- Een check faalt en de fix zou een regel, check, hook of test afzwakken.
- Na twee mislukte correctiepogingen: stop, vat samen wat je probeerde, vraag om richting. Uitzondering: de CI-lus van de skill `opleveren` (R-WERK-12) loopt door tot groen; daar gelden alleen de stopgronden uit die skill.

## Sandbox en rolhek

- Werk in je eigen werkmap. Nieuwe werkmap: eerst `node scripts/kit/worktree-install.mjs`; zonder toolchain falen `feiten.mjs`, lint, de git-hooks en de Stop-hook. Vóór de eerste commit vertrouwt de eigenaar daar `mise.toml` (`docs/operations/agent-doorloop.md`, "Nieuw werk beginnen").
- Eén eenvoudig commando per Bash-aanroep. Het rolhek weigert een variabele of `$(…)` als commandowoord, vaak accolades of tekenklassen, en het woord `merge` naast `gh` of in de titel of body van een PR. Tekst voor commit of PR via `-F` of `--body-file`; een script dat alleen leest of rekent, zet je in `$TMPDIR` en draai je met `node`.
- De Bash-sandbox kan `.claude/settings.json` (ook settings.local.json), `.claude/hooks/` en `.claude/skills/` niet schrijven: wijzigen alleen met Edit in de hoofdsessie met akkoord van de eigenaar, of de eigenaar doet het zelf (`docs/ENVIRONMENT.md`, "Grens van de sandbox"). Een branchwissel die ze raakt kan halverwege afbreken: vergelijk eerst (`docs/operations/agent-doorloop.md`, "Branchwissels in een sandbox").
- Bij een weigering: lees de reden en kies een toegestane vorm; omzeil niets (R-PRINC-09).

## Zuinig met context

- Vraag alleen taakrelevante secties van `feiten.mjs`; `componenten` alleen bij UI-werk, `adr --alle` voor historie of een geldig ADR buiten de tien; van het regelboek alleen de geraakte hoofdstukken (`feiten.mjs hoofdstuk <n>`, R-DOC-05).
- Lees met de Read-tool en zoek met Grep en Glob als de sessie ze heeft, anders met `git grep -n -F -e '<tekst>'`, dat voor elke rol werkt (R-WERK-21).
- Besteed onderzoek uit als dat zelfstandig nuttig werk oplevert; overdracht volgens R-WERK-14, vraag een compacte conclusie.
- Lees `db/schema.snapshot.sql` in plaats van alle migraties.

Subagents (`.claude/agents/`), skills en hooks staan er (R-WERK-17, R-ROL-01): gebruik voor vereiste rollen de bijbehorende agents, of een ad-hoc subagent met dezelfde schone, afgebakende context (die mag alleen lezen, R-ROL-02). Wanneer die als onafhankelijk telt en wanneer de eigenaar reviewt, staat in framework §8 (eisen aan de rollen).
