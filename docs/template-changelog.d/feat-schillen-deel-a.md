---
soort: toegevoegd
---

- Twee schillen op een gedeeld frame (spec `docs/template/specs/schillen.md`, deel A): `SidebarShell` (de bestaande schil;
  `AppShell` blijft als naam ervoor bestaan) en `TopbarShell` (navigatie in de topbalk, de rest in "Meer"), beide op
  `ShellFrame` met skip-link, één `main`, focus naar de `h1`, offline-melding en afdrukstijl. Schiltokens
  `--shell-sidebar-width`, `--shell-topbar-height`, `--shell-content-max`, `--shell-content-padding`, `--shell-nav-gap` en
  `--shell-border-width`; de contracttest `shellContract` in `src/core/web/ui/testing.tsx`; `NavLink` is ook actief bij een
  `href` met zoekparameters; voorbeelden op `/design-system` (vak "Schillen", `?schil=topbalk&items=9`).
- Na inloggen, of bij een wissel naar een andere schil, staat de focus op de `h1` van het eerste scherm.

### Bij een update

- Zet `<ShellSessionProvider>` (uit `#core/web/ui/shell-frame.tsx`) om de `RouterProvider` in `src/web/main.tsx`, zoals in de template; zonder
  provider gaat de focus alleen bij een routewissel binnen één schil naar de `h1`.
