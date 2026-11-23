---
soort: toegevoegd
---

- Schaduwmodus met tijdgrens (ADR 0106, spec `schaduwmodus`, R-PRINC-13): een nieuwe controle mag hoogstens 14 dagen alleen
  loggen en staat dan in `.kit/schaduw.json`. `pnpm ratchet` heeft twee strikte modules, `schaduw-register` (schema,
  `ALTIJD_HARD`, geen verlenging tegenover de merge-base) en `schaduw-termijn` (rood na de einddatum volgens de commitdatum
  van HEAD, of bij een uitvoerder die skipt), plus de meldingen `schaduw-termijn` en `schaduw` (`scripts/kit/schaduw.mjs`,
  map `schaduw` in `scripts/kit/ratchet.mjs`). De groene regel van `pnpm ratchet` noemt ook de strikte modules.
  `pnpm meting --schaduw` telt de meetregels `Schaduw` per controle (`scripts/kit/meting-schaduw.mjs`).
  `pnpm template:release` weigert een gevuld register. In een app doen de checks niets.
