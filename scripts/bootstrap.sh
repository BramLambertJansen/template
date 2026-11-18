#!/usr/bin/env bash
# Eenmalig na het clonen, door de eigenaar (framework §8: de toolchain installeert de eigenaar, niet de agent).
# Vooraf: de machine uit docs/nieuwe-app.md (Ubuntu 24.04 of 26.04, native of WSL2, Docker Engine, mise, gh, bubblewrap, socat).
# Schrijft de uitslag per stap naar .template/bootstrap.json (spec nieuwe-app-script, werking 9), ook bij een fout (trap op
# EXIT): de falende stap `fout`, de stappen erna `overgeslagen`. Met printf, zonder Node of jq: bij een falende
# `mise install` is er geen Node. Bij de start gaan het eigen oude bestand en dat van de machinecontrole weg.
set -euo pipefail
cd "$(dirname "$0")/.."

step_ids=(mise-trust mise-install pnpm-install lefthook doctor-machine)
step_texts=(
  'mise trust'
  'mise install (toolchain uit mise.toml)'
  'pnpm install --frozen-lockfile'
  'lefthook install (git-hooks)'
  'scripts/doctor.sh --machine'
)
step_fixes=(
  'lees de fout hierboven en draai scripts/bootstrap.sh opnieuw'
  'lees de fout hierboven (netwerk, mise.toml) en draai scripts/bootstrap.sh opnieuw'
  'lees de fout hierboven (netwerk, lockfile) en draai scripts/bootstrap.sh opnieuw'
  'lees de fout hierboven en draai scripts/bootstrap.sh opnieuw'
  'lees de ✗-regels hierboven en .template/doctor-machine.json; herstel en draai scripts/bootstrap.sh opnieuw'
)
done_steps=0

write_result() {
  local code="$1" head uitslag=ok json="" status herstel i
  if ((code != 0)); then uitslag=fout; fi
  for i in "${!step_ids[@]}"; do
    status=overgeslagen
    herstel=null
    if ((i < done_steps)); then
      status=ok
    elif ((i == done_steps && code != 0)); then
      status=fout
      herstel="\"${step_fixes[$i]}\""
    fi
    json+="${json:+,}{\"id\":\"${step_ids[$i]}\",\"status\":\"$status\",\"melding\":\"${step_texts[$i]}\",\"herstel\":$herstel}"
  done
  head="$(git rev-parse HEAD 2>/dev/null || true)"
  if [[ "$head" =~ ^[0-9a-f]{40,64}$ ]]; then head="\"$head\""; else head=null; fi
  mkdir -p .template 2>/dev/null || return 0
  printf '{"schema":1,"commando":"bootstrap","tijd":"%s","head":%s,"dryRun":false,"uitslag":"%s","stappen":[%s],"gegevens":{}}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$head" "$uitslag" "$json" >.template/bootstrap.json 2>/dev/null || true
}

rm -f .template/bootstrap.json .template/doctor-machine.json
trap 'write_result $?' EXIT

mise trust
done_steps=1
mise install
done_steps=2
mise exec -- pnpm install --frozen-lockfile
done_steps=3
# lefthook heeft geen postinstall (pnpm-workspace.yaml: allowBuilds); de hooks komen alleen hier.
mise exec -- pnpm exec lefthook install
done_steps=4
scripts/doctor.sh --machine
done_steps=5
