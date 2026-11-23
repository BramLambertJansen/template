---
soort: toegevoegd
---

- Receptenkaart `docs/operations/recepten.md` met per git-, gh- en CI-handeling het commando dat lokaal en in de cloud werkt,
  te lezen met `node scripts/kit/feiten.mjs recepten` (`--alle` voor beide kolommen). `pnpm ratchet` toetst nu elk commando
  dat een agentinstructie (`.claude/skills`, `.claude/agents`, `.claude/rules`, `AGENTS.md`, `CLAUDE.md`) of de kaart
  voorschrijft tegen het rolhek en `permissions.deny` (`docs:recept-rolhek`). De skill `opleveren` haalt CI-logs en de
  mergestatus via `gh api` op en dient een leerpunt in bij `template.repository` (spec `agent-recepten`).

### Bij een update

- Draai `pnpm ratchet`: een commando in een eigen skill, agentbestand of padregel dat het rolhek weigert, of een `gh api`-endpoint
  met `{owner}` zonder aanhalingstekens, wordt nu rood (`docs:recept-rolhek`). Pas de instructie aan naar de vorm uit de
  receptenkaart.
