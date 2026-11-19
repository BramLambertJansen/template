---
soort: opgelost
---

- De toolchain-voorcontrole wacht 20 s in plaats van 5 s op `pnpm --version` (`PNPM_TIMEOUT_MS` in
  `scripts/kit/toolchain.mjs`, tests in `test/scripts/toolchain-pnpm-runtime.test.ts`). Onder een volle testsuite met veel
  parallelle `feiten.mjs`-processen liep de oude limiet af en meldde de voorcontrole ten onrechte "pnpm ontbreekt of start
  niet"; daardoor faalden wisselende tests in de Stop-hook en pre-push. Een timeout heeft nu een eigen melding
  (`pnpm reageert niet binnen 20 s`) met een eigen herstel in plaats van de bootstrap. `docs/ENVIRONMENT.md` beschrijft
  de vermoedelijke oorzaak: een globale mise-pin voor pnpm die afwijkt van `packageManager`.
