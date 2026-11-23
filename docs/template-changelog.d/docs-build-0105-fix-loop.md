---
soort: gewijzigd
---

- De reviewfixlus is begrensd (ADR 0105): elke reviewbevinding is `blokkerend` of `klein`; kleine bevindingen gaan als
  lijst in de PR en niet in de lus; na een fix toetst de reviewer alleen de fixdiff; daarna krijgt een verse developer de
  open bevindingen, en wat dan nog openstaat, beslist de eigenaar in één vraag. Zie `CLAUDE.md` ("Stoppen en vragen"),
  `docs/framework.md` (R-WERK-11, R-WERK-20), `.claude/agents/reviewer.md`, `.claude/agents/developer.md`,
  `.claude/skills/opleveren/SKILL.md` en `docs/operations/review-checklists.md`.
