---
soort: opgelost
---

- `node scripts/kit/feiten.mjs hoofdstuk <n>` en `feiten.mjs pad <pad>` werken ook als de toolchain-voorcontrole faalt
  (bijvoorbeeld na een nieuwe pnpm-pin die lokaal nog niet geïnstalleerd is). Ze laden geen dependencies; alleen de
  andere secties stoppen nog met `✗ toolchain ontbreekt`. Een agent kan zo het regelboek en de padtabel lezen terwijl de
  eigenaar de toolchain herstelt (test in `test/scripts/feiten-zonder-toolchain.test.ts`).
