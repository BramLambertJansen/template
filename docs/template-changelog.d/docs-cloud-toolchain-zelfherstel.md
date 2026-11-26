---
soort: toegevoegd
---

- Cloud: de toolchain herstelt zichzelf na een pin-bump (spec `cloud-toolchain-zelfherstel`, ADR 0112). Een nieuwe
  SessionStart-hook `werkstraat toolchain-herstel` (matcher `startup`, timeout 600 s,
  `rails/hooks/lib/toolchain-herstel.mjs`) draait alleen met `CLAUDE_CODE_REMOTE=true`: wijken Node, pnpm of
  `node_modules` af van de pins en is de invoer van de installatie gelijk aan `main`, dan draait hij
  `scripts/cloud-setup.sh` met een deadline van 540 s voor de hele procesgroep, met de uitvoer in
  `~/.cache/werkstraat/toolchain-herstel.log` en één regel in de context. De lader ververst daarvoor het anker en wist bij
  parallel uitpakken geen intacte map meer. In de cloud noemt `feiten.mjs` bij een afwijkende versie de omgevingscache als
  oorzaak, met één herstelroute (`scripts/kit/toolchain.mjs`, optie `cloud`). Zie `docs/ENVIRONMENT.md`, Problemen.
