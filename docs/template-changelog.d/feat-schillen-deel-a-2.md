---
soort: gewijzigd
---

- `ToastProvider` rendert de meldingen zelf, één keer voor de hele app; ze overleven een schilwissel en verschijnen nu ook op
  `/login` en `/uitnodiging` (spec `docs/template/specs/schillen.md`). `Toaster` is geen export meer van
  `src/core/web/ui/toast.tsx` en `src/web/ui/index.ts`.

### Bij een update

- `Toaster` is geen export meer; verwijder een eigen `<Toaster />` (de typecheck wijst hem aan).
