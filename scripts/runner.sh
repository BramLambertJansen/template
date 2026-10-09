#!/usr/bin/env bash
# Draait door de agent geschreven tests en configs in de runner-container (ADR 0009): read-only repo, geen
# capabilities, alleen op het interne netwerk test-net met een eigen, verse test-database.
# Gebruik: scripts/runner.sh db|ui [--sta-wijzigingen-toe]   (via pnpm test:db en pnpm ui:check)
set -euo pipefail
cd "$(dirname "$0")/.."

# Wat de host vóór de container uitvoert of leest, moet gelijk zijn aan HEAD (ADR 0009). Alleen de eigenaar
# mag dat met --sta-wijzigingen-toe overslaan, na het lezen van de wijziging.
HOST_FILES=(scripts package.json pnpm-workspace.yaml .npmrc .pnpmfile.cjs mise.toml compose.yaml compose.*.yaml
  compose.override.yaml db/test.env db/docker)

suite="${1:-}"
case "$suite" in
  db) services=(runner test-pgtap) ;;
  ui) services=(ui-runner) ;;
  *) echo "Gebruik: scripts/runner.sh db|ui [--sta-wijzigingen-toe]" >&2; exit 2 ;;
esac

if [[ "${2:-}" != "--sta-wijzigingen-toe" ]]; then
  changed="$(git status --porcelain --untracked-files=all -- "${HOST_FILES[@]}")"
  if [[ -n "$changed" ]]; then
    printf '✗ Bestanden die de host uitvoert, wijken af van HEAD:\n%s\n' "$changed" >&2
    printf '  → commit ze eerst, of (alleen de eigenaar, na lezen) voeg --sta-wijzigingen-toe toe.\n' >&2
    exit 1
  fi
fi

# Geen invloed van de shell op compose: vaste bestanden, eigen projectnaam, nooit .env of .env.local.
while IFS= read -r name; do unset "$name"; done < <(compgen -e | grep '^COMPOSE_' || true)
export RUNNER_UID RUNNER_GID
RUNNER_UID="$(id -u)"
RUNNER_GID="$(id -g)"
project="$(basename "$PWD")-test"
compose() {
  docker compose -f compose.yaml --project-directory . --project-name "$project" --env-file db/test.env --profile test "$@"
}

mkdir -p .runner-output
trap 'compose down --volumes --remove-orphans >/dev/null 2>&1 || true' EXIT
compose down --volumes --remove-orphans >/dev/null 2>&1 || true
for service in "${services[@]}"; do
  if ! compose run --rm --build "$service"; then
    # Eerst laten zien waarom (migraties, pooler, Mailpit), dan pas opruimen via de trap.
    printf '\n✗ %s faalde. Logs van de testdiensten:\n' "$service" >&2
    compose logs --no-color --tail=60 test-db test-migrate test-pooler test-mailpit >&2 || true
    exit 1
  fi
done
