---
soort: opgelost
---

- `pnpm lint` en `pnpm lint:prune` geven ESLint een heap van 4096 MB (`package.json`, test `test/rails/lint-heap.test.ts`).
  ESLint piekte op 2379 MB tegen de standaardlimiet van 2144 MB en brak in een cloudsessie af met "JavaScript heap out of
  memory"; daardoor faalden ook `pnpm gate:fast` en de pre-push-hook.

### Bij een update

- Neem in `package.json` de scripts `lint` en `lint:prune` over als
  `node --max-old-space-size=4096 node_modules/eslint/bin/eslint.js . …`. De vlag staat op `node` en niet in
  `NODE_OPTIONS`, zodat hij alleen voor ESLint geldt en de `NODE_OPTIONS` van de gebruiker blijft staan.
