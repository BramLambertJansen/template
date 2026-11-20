---
soort: gewijzigd
---

- Een cloudsessie kan committen, pushen, een PR openen en CI-bewijs lezen (spec `cloud-pr-route`): `git commit *`,
  `git push origin HEAD`, `gh api *` en `pnpm pr:verify *` draaien buiten de Bash-sandbox (`.claude/settings.json`,
  ADR 0061 herzien); in de cloud opent de hoofdsessie een PR met `mcp__github__create_pull_request` (ADR 0078 herzien).
  De route en de foutmeldingen staan in `docs/ENVIRONMENT.md`, "Cloud: commit, push, PR en bewijs".

### Bij een update

- Neem `.claude/settings.json` over met de vier nieuwe regels in `sandbox.excludedCommands`. Lefthook en `pnpm pr:verify`
  draaien daarna code uit de werkmap buiten de sandbox, zonder vraag vooraf, ook lokaal; het restrisico staat in ADR 0061.
