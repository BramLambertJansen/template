---
soort: toegevoegd
---

- `node scripts/kit/reviewpakket.mjs [--basis <ref>] [--sinds <sha>] [--spec <pad>]` schrijft een reviewpakket (spec, log,
  stat en diff tegenover de merge-base, of met `--sinds` alleen de fixcommits) naar `.reviewpakket/` en zet het pad op
  stdout. Gegenereerde bestanden staan alleen in Stat. De hoofdsessie draait het vóór elke review (spec `agents-leveren`,
  `docs/operations/agent-doorloop.md`).
