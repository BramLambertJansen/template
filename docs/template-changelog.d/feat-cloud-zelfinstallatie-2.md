---
soort: toegevoegd
---

- `scripts/cloud-omgeving.sh` (spec `cloud-zelfinstallatie`): de tekst voor het veld "Setup script" van een cloudomgeving.
  Het start in de map boven de clone, draait `scripts/cloud-setup.sh` van elke repo eronder (`→ <pad>` per script) en
  eindigt met de exitcode van het eerste script dat faalt; zonder treffer `✗ scripts/cloud-setup.sh niet gevonden onder
  <map>`. Eén omgeving dient zo elke repo uit de template.
