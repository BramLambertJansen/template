---
soort: gewijzigd
---

- De descriptions van `.claude/agents/architect.md` en `docs.md` staan tussen quotes: de niet-gequote `: ` weigerde strikte
  YAML. `test/hooks/agents.test.ts` toetst de frontmatter van alle agents en skills (overnameplan golf 1a).
- Architect stap 6 verwijst naar de afsluitcheck van de skill `spec` (stap 6), die nu ook de checks op padparameters,
  voor-stappen en `Toets:` per AC meebrengt; de docs-agent verwijst naar `schrijfrecht.docs` in `.claude/gates.json`.
- `.claude/agents/tester.md` stap 4 zegt wat de SubagentStop-hook draait: typecheck, lint en Vitest over gewijzigde
  unittests; niet of een test faalt, en geen integratie-, pgTAP- of e2e-tests.
