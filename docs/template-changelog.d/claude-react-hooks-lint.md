---
soort: toegevoegd
---

- `pnpm lint` vangt nu een React-hook na een vroege `return` of in een voorwaarde: `react-hooks/rules-of-hooks` uit
  `eslint-plugin-react-hooks` (7.1.1) staat in `eslint.config.js` voor `src/web` en `src/core/web` (leerpunt #1031; bewijs
  `test/rails/eslint-react-hooks.test.ts`). Alleen die regel, niet de React Compiler-regels van de recommended-set.

### Bij een update

- `pnpm lint` kan nu falen op app-code in `src/web` die een hook na een vroege `return` of in een voorwaarde aanroept. Zet de
  hook boven de eerste `return` (vorm: `src/web/features/layout/app-layout.tsx`); onderdruk de regel niet.
