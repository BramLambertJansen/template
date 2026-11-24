---
soort: toegevoegd
---

- Eigen schillen en meerdere schillen per app (spec `docs/template/specs/schillen.md`, deel B): `pnpm check:schillen` in
  `gate:fast` eist een `shellContract`-suite voor elke schil op `ShellFrame`, een geregistreerde schil onder elke
  layoutroute (`/_<naam>`) en `ShellFrame` alleen in een schil in `src/core/web/ui/` of `src/web/ui/`. Nieuw recept
  "Een tweede schil" in `docs/gouden-pad.md`; `shellContractCases` in `src/core/web/ui/testing.tsx` geeft de gevallen van
  de contracttest los.

### Bij een update

- Draai `pnpm check:schillen`. Rendert een eigen layoutroute geen `SidebarShell`, `TopbarShell` of eigen schil met een
  `shellContract`-suite, of rendert een feature `ShellFrame` zelf, dan faalt hij met het bestand en een verwijzing naar
  het recept.
- `src/web/features/layout/twee-schillen.test.tsx` gebruikt `navItems` uit `src/web/lib/nav.ts` en `guard` uit
  `src/web/lib/session.ts`, geen vaste itemnamen of thema's; pas hem aan als je die exports hernoemt.
