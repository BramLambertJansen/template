#!/bin/sh
# Inhoud voor het veld "Setup script" van een cloudomgeving van Claude Code (docs/ENVIRONMENT.md, Opzetten). Het veld
# draait in de map boven de clone, dus dit script zoekt scripts/cloud-setup.sh onder de startmap: in de map zelf (gestart
# in de root van een repo) en één niveau dieper (<naam>/scripts/), niet in node_modules. Elk gevonden script draait, in
# vaste volgorde (LC_ALL=C). Exitcode: die van het eerste script dat faalt, anders 0; niets gevonden is exit 1.
# Er staat geen repo-naam in: één omgeving dient elke repo die dit script meebrengt. POSIX-sh: niet gemeten is of het
# veld zijn tekst met bash of met sh draait.
set -u
start="$PWD"
status=0
gevonden=0
lijst="$(find "$start" -mindepth 2 -maxdepth 3 -path '*/scripts/cloud-setup.sh' -not -path '*/node_modules/*' | LC_ALL=C sort)"
while IFS= read -r script; do
  [ -n "$script" ] || continue
  gevonden=1
  printf '→ %s\n' "$script"
  # stdin van /dev/null: een stap van het script (apt-get, pnpm) leest anders de rest van de lijst hieronder op.
  bash "$script" </dev/null
  code=$?
  if [ "$code" -ne 0 ] && [ "$status" -eq 0 ]; then status=$code; fi
done <<EOF
$lijst
EOF
if [ "$gevonden" -eq 0 ]; then
  printf '✗ scripts/cloud-setup.sh niet gevonden onder %s\n' "$start" >&2
  exit 1
fi
exit "$status"
