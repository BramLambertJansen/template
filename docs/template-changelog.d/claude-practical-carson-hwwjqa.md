---
soort: toegevoegd
---

- Rail op de kit (spec `app-thema`, deel B): de lintregel `rails/klassen-kit` (`rails/eslint/klassen-kit.mjs`) geldt
  voor `src/core/web/ui` en `src/web/ui` en weigert arbitrary values (ook met `var()`), `x-(--y)`, hex- en oklch-kleuren,
  `!`, `dark:` en `style` met een vaste waarde in `className`, `cn(…)`, `cva(…)` en constanten die daarin gelezen worden.
  Dialog en QrCode gebruiken daarvoor nieuwe `@utility`-klassen in `src/core/web/styles/index.css` (zelfde berekende stijl).
  R-UI-04 noemt de kit; `rails/klassen` voor `features/` en `routes/` blijft ongewijzigd.

### Bij een update

- Draai `pnpm lint`. Meldt `rails/klassen-kit` iets in `src/web/ui`, maak van die maat of kleur een token met een klasse
  via `@utility` in de app-laag (`src/web/styles/`) of kies een bestaande token-klasse; arbitrary variants zoals
  `data-[state=open]:` mogen blijven.
