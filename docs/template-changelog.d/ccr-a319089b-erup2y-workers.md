---
soort: gewijzigd
---

- Bij weinig geheugen (`scripts/kit/geheugen.mjs`) draait Vitest met hooguit twee workers in plaats van vier
  (`vitestWorkers`, `vitest.config.ts`), zoals Playwright daar al met één worker draait. Dat halveert de geheugendruk
  waardoor web-tests in `gate:fast` op hun limiet van 5 s afliepen (leerpunt #866; het effect is niet apart gemeten). Met
  genoeg geheugen verandert niets.
