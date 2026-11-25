---
soort: gewijzigd
---

- De reviewer-SubagentStop (`rails/hooks/lib/werkstraat.mjs`) eist bij een diff in `db/`, `test/security/` of `e2e/` per
  check een regel `Runnerbewijs: <check> groen op <sha van HEAD>`, of "goedgekeurd onder voorbehoud van runnerchecks" met
  de checks in een codeblok (spec ci-bewijs, leerpunt #683).
- `pnpm pr:log <nr>` zet foutmarkeringen van falende tests (vitest, Playwright, TAP) vooraan in het uittreksel, hooguit
  20 (spec ci-bewijs, leerpunt #961).
- De CI-job `secrets` scant buiten een PR alleen de geschiedenis van HEAD, niet meer alle gefetchte refs: een achtergebleven
  branch maakt `main` niet meer rood (spec ci-bewijs/AC-4, leerpunt #758).
- `pnpm pr:verify` verwijst bij rode CI naar `pnpm pr:log <nr>` (spec ci-bewijs/AC-7).
