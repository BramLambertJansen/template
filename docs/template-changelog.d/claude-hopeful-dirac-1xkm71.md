---
soort: toegevoegd
---

- Setupscript bouwstap 2 (spec `nieuwe-app-script`): `node scripts/kit/nieuwe-app.mjs repo-instellingen --repo
  <owner>/<slug> [--beschrijving <tekst>] [--controleer] [--dry-run]` zet de repo-instellingen van playbook 6.2 (merge-methoden,
  workflow-rechten, Actions) na een controle van `origin` en de vorm van `main`. `--controleer` schrijft niets en toetst de
  ruleset `main` tegen de payload van `scripts/github-ruleset.sh` en de instellingen tegen 6.2, met de nieuwe alleen-lezende
  module `scripts/kit/ruleset-controle.mjs` (begin van `check-github`, roadmap ST-01). `docs/nieuwe-app.md` 6.2 noemt het
  deelcommando in plaats van de `gh`-blokken.
