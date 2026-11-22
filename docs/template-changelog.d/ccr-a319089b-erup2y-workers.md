---
soort: gewijzigd
---

- Bij weinig geheugen (`scripts/kit/geheugen.mjs`) draait Vitest met hooguit twee workers in plaats van vier
  (`vitestWorkers`, `vitest.config.ts`), zoals Playwright daar al met één worker draait. Zo lopen web-tests in
  `gate:fast` niet meer af op hun limiet van 5 s door geheugendruk (leerpunt #866). Met genoeg geheugen verandert niets.
