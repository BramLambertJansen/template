---
soort: gewijzigd
---

- Developer, tester en docs hebben `disallowedTools: Agent, mcp__*`: alleen de hoofdsessie start subagents. De reviewer
  rapporteert na hooguit 25 toolcalls en de architect schrijft het spec- of ADR-bestand na hooguit 15, beide eerst als
  skelet. `test/hooks/agent-budget.test.ts` toetst dit (overnameplan golf 1c, spec `agents-leveren`).
