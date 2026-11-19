---
soort: toegevoegd
---

- `pnpm meting` telt weigeringen en subagent-runs per rol: `weigeringenPerRol` en `subagentsPerRol` (runs, toolcalls,
  zonder telling) per sessie en per branch, twee nieuwe rijen in `--pr-tabel` en velden onder `prTabel` in `--json`. De
  meethook slaat bij een afgeronde `Agent`-run alleen `tc` op, het aantal toolcalls uit `totalToolUseCount`; nooit tokens
  of tekst (spec `agents-leveren`, `rails/hooks/lib/meting.mjs`, `scripts/kit/meting.mjs`).
