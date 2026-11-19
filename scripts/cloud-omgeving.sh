#!/usr/bin/env bash
# Inhoud voor het veld "Setup script" van een cloudomgeving van Claude Code (docs/ENVIRONMENT.md, Opzetten). Het veld
# draait in de map boven de clone, dus dit script zoekt scripts/cloud-setup.sh onder de startmap: in de map zelf (gestart
# in de root van een repo) en één niveau dieper (<naam>/scripts/), niet in node_modules. Elk gevonden script draait, in
# vaste volgorde (LC_ALL=C). Exitcode: die van het eerste script dat faalt, anders 0; niets gevonden is exit 1.
# Er staat geen repo-naam in: één omgeving dient elke repo die dit script meebrengt.
set -uo pipefail
start="$PWD"
status=0
gevonden=0
while IFS= read -r script; do
  gevonden=1
  printf '→ %s\n' "$script"
  # stdin van /dev/null: anders leest een stap van het script (apt-get, pnpm) de rest van de lijst hieronder op.
  bash "$script" </dev/null || {
    code=$?
    ((status != 0)) || status=$code
  }
done < <(find "$start" -mindepth 2 -maxdepth 3 -path '*/scripts/cloud-setup.sh' -not -path '*/node_modules/*' | LC_ALL=C sort)
if ((gevonden == 0)); then
  printf '✗ scripts/cloud-setup.sh niet gevonden onder %s\n' "$start" >&2
  exit 1
fi
exit "$status"
