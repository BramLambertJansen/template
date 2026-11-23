---
soort: toegevoegd
---

- De lintregel `rails/korte-ref` weigert in `rails/` en `scripts/kit/` de korte naam `origin/main` als git-argument
  (ook `origin/main^{commit}`, `origin/main:pad`, `HEAD..origin/main`) en eist `refs/remotes/origin/main`: een lokale
  branch `origin/main` kan de vertrouwde ref zo niet schaduwen. Tekst in meldingen blijft toegestaan; de scripts van
  `pnpm pr:verify`, `pr:merge`, `pr:resolve`, `pr:log` en de check-* lezen nu de volle naam (leerpunt #934,
  `eslint.config.js`).
