#!/usr/bin/env bash
# Controleert de productie-image (ADR 0049) zonder API-database: eerst dat de image stopt zonder jobs-verbinding
# (opstartcontrole), dan start met APP_ENV=staging, geldige, niet-demo geheimen en een eigen Postgres voor app_jobs;
# daarna: niet als root, liveness 200, readiness 503 (geen database), SPA met CSP, API-fout als { code, requestId },
# en na SIGTERM netjes gestopt (exitcode 0). Voor CI en de eigenaar; de agent gebruikt geen docker.
# Met SMOKE_BROWSER=1 daarna ook de browser-smoke (e2e/*.smoke.spec.ts, playwright.smoke.config.ts): de bundel laadt en
# router en foutscherm renderen, zonder CSP-schending, ongevangen JS-fout, mislukte asset of onverwachte console.error.
# Vraagt node_modules
# (pnpm install) en draait in het Playwright-image van compose.yaml (ui-runner), zonder internet, met beperkte broninvoer.
# GET /api/health toont de templateversie uit src/core/shared/template-version.ts. Met EXPECT_BUILD_SHA=<sha> (de image is
# gebouwd met --build-arg BUILD_SHA=<sha>) toont hij ook die build; zonder die variabele hoort build te ontbreken.
# Gebruik: [SMOKE_BROWSER=1] [EXPECT_BUILD_SHA=<sha>] scripts/check-image.sh <image>
set -euo pipefail

image="${1:?Gebruik: scripts/check-image.sh <image>}"
name="check-image-$$"
net="${name}-net"
port=18080
secret="$(head -c 48 /dev/urandom | base64 | tr -d '\n/+=')"
dbpass="$(head -c 24 /dev/urandom | base64 | tr -d '\n/+=')"
jobspass="$(head -c 24 /dev/urandom | base64 | tr -d '\n/+=')"
# Eigen Postgres voor de rol app_jobs (spec achtergrondtaken, AC-17): de opstartcontrole (ADR 0049 punt 3) laat de image
# anders niet starten. Een gewone bridge (niet --internal), zodat de poort van de app op de host bereikbaar blijft.
dbname="${name}-jobs-db"
dbnet="${name}-jobs-net"
repo="$(cd "$(dirname "$0")/.." && pwd)"
smoke_input=""

cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker rm -f "$dbname" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  docker network rm "$dbnet" >/dev/null 2>&1 || true
  if [[ -n "$smoke_input" ]]; then rm -rf -- "$smoke_input"; fi
}
trap cleanup EXIT

fail() { printf '✗ %s\n' "$1" >&2; docker logs "$name" >&2 || true; exit 1; }

# De versie die de image moet tonen, uit het bronbestand (spec release-versie).
version_file="src/core/shared/template-version.ts"
expected_version="$(sed -n "s/^export const TEMPLATE_VERSION = '\([^']*\)';\$/\1/p" "$repo/$version_file" 2>/dev/null || true)"
[[ -n "$expected_version" && "$expected_version" != *$'\n'* ]] || fail "geen TEMPLATE_VERSION in $version_file"

# Alleen zelfstandige smoke-tests en hun configuratie, nooit de hele werkmap (ADR 0044).
check_smoke_path() {
  local prefix="$repo/$1"
  while [[ -n "$prefix" ]]; do
    [[ ! -L "$prefix" ]] || fail "symlink in smoke-invoer: $1"
    [[ "$prefix" == */* ]] || break
    prefix="${prefix%/*}"
  done
}

prepare_smoke_input() {
  local input seen_smoke=""
  check_smoke_path node_modules
  smoke_input="$(mktemp -d "${TMPDIR:-/tmp}/template-image-smoke.XXXXXXXX")"
  git -C "$repo" ls-files --cached --others --exclude-standard -z -- \
    package.json playwright.smoke.config.ts 'e2e/*.smoke.spec.ts' > "$smoke_input/files"
  while IFS= read -r -d '' input; do
    case "/$input/" in */.env*/*) continue ;; esac
    check_smoke_path "$input"
    [[ -e "$repo/$input" ]] || continue
    [[ -f "$repo/$input" ]] || fail "geen regulier smoke-bestand: $input"
    (cd "$repo" && cp --parents --no-dereference -- "$input" "$smoke_input/")
    case "$input" in e2e/*.smoke.spec.ts) seen_smoke=1 ;; esac
  done < "$smoke_input/files"
  rm -- "$smoke_input/files"
  [[ -f "$smoke_input/package.json" && -f "$smoke_input/playwright.smoke.config.ts" && -n "$seen_smoke" ]] \
    || fail "onvolledige smoke-invoer"
  mkdir -p "$smoke_input/node_modules"
}

uid="$(docker run --rm --entrypoint id "$image" -u)"
[[ "$uid" != "0" ]] || fail "image draait als root"
echo "✓ niet als root (uid $uid)"

# De omgeving van de app: staging met geldige, niet-demo geheimen. De API-database bestaat niet (.invalid).
app_env=(
  -e APP_ENV=staging
  -e APP_ORIGIN=https://app.example.test
  -e AUTH_BASE_URL=https://app.example.test
  -e AUTH_SECRET="$secret"
  -e DATABASE_URL="postgres://api_user:${dbpass}@db.invalid:5432/app"
  -e AUTH_DATABASE_URL="postgres://auth_service:${dbpass}x@db.invalid:5432/app"
  -e SMTP_URL=smtp://mail.invalid:25
  -e CLIENT_IP_HEADER=x-forwarded-for
)

# Opstartcontrole (ADR 0049 punt 3, spec achtergrondtaken AC-17): kan de image niet als app_jobs verbinden, dan start de
# server niet en stopt het proces met een fout. In de voorgrond, begrensd zodat een image die toch start niet blijft hangen.
if startup_out="$(timeout --kill-after=10s 60 docker run --rm --name "${name}-zonder-jobs" "${app_env[@]}" \
  -e JOBS_DATABASE_URL="postgres://app_jobs:${jobspass}@db.invalid:5432/app" "$image" 2>&1)"; then
  fail "de image start zonder werkende jobs-verbinding (opstartcontrole ontbreekt)"
fi
# Gestopt om de goede reden: de melding van de opstartcontrole, zonder het adres van de database (R-SEC-02).
grep -q 'opstartcontrole: geen verbinding als app_jobs' <<<"$startup_out" \
  || fail "de image stopte zonder jobs-verbinding, maar niet met de melding van de opstartcontrole"
! grep -q 'db.invalid' <<<"$startup_out" || fail "de stopmelding van de opstartcontrole noemt het adres van de database"
echo "✓ zonder jobs-verbinding stopt de image bij opstart"

# De Postgres-sidecar: het gepinde image uit db/docker/Dockerfile (dat bouwt daar alleen pgTAP bij), rol app_jobs als
# eigenaar van een lege database. Elke pull begrensd, zoals het Playwright-image hieronder.
pg_image="$(sed -n 's/^FROM \(postgres:[^ ]*\)$/\1/p' "$repo/db/docker/Dockerfile")"
[[ -n "$pg_image" && "$pg_image" != *$'\n'* ]] || fail "geen eenduidig Postgres-image in db/docker/Dockerfile"
pg_pulled=""
for attempt in 1 2 3; do
  if timeout --kill-after=10s 300 docker pull --quiet "$pg_image" >/dev/null; then pg_pulled=1 && break; fi
  printf '✗ Postgres-image binnenhalen: poging %s van 3 faalde of hing langer dan 300 s.\n' "$attempt" >&2
done
[[ -n "$pg_pulled" ]] || fail "Postgres-image binnenhalen faalde na 3 pogingen; draai de job later opnieuw"
docker network create "$dbnet" >/dev/null
docker run -d --name "$dbname" --network "$dbnet" -e POSTGRES_USER=app_jobs -e POSTGRES_PASSWORD="$jobspass" \
  -e POSTGRES_DB=app "$pg_image" >/dev/null
# Via TCP: de tijdelijke init-server luistert alleen op de socket (zoals de healthcheck in compose.yaml).
pg_ready=""
for _ in $(seq 1 30); do
  if docker exec "$dbname" pg_isready -h 127.0.0.1 -U app_jobs -d app >/dev/null 2>&1; then pg_ready=1 && break; fi
  sleep 1
done
[[ -n "$pg_ready" ]] || fail "de Postgres-sidecar voor app_jobs wordt niet gereed"

# De API-database bestaat niet (.invalid): readiness moet dan 503 geven, het proces mag niet stoppen. De taken falen per ronde
# (gelogd), de server blijft draaien.
docker run -d --name "$name" --network "$dbnet" -p "127.0.0.1:${port}:8080" "${app_env[@]}" \
  -e JOBS_DATABASE_URL="postgres://app_jobs:${jobspass}@${dbname}:5432/app" \
  "$image" >/dev/null

base="http://127.0.0.1:${port}"
for _ in $(seq 1 30); do
  curl -fsS "$base/api/health" >/dev/null 2>&1 && break
  sleep 1
done

status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

health="$(curl -fsS "$base/api/health")" || fail "GET /api/health faalt"
[[ "$health" == *"\"version\":\"${expected_version}\""* ]] \
  || fail "GET /api/health toont niet version ${expected_version} uit $version_file: $health"
expected_health="{\"ok\":true,\"version\":\"${expected_version}\""
if [[ -n "${EXPECT_BUILD_SHA:-}" ]]; then
  expected_health+=",\"build\":\"${EXPECT_BUILD_SHA}\"}"
  [[ "$health" == "$expected_health" ]] || fail "GET /api/health toont niet build ${EXPECT_BUILD_SHA}: $health"
  echo "✓ liveness 200, version ${expected_version}, build ${EXPECT_BUILD_SHA}"
else
  expected_health+="}"
  [[ "$health" == "$expected_health" ]] \
    || fail "GET /api/health is niet ${expected_health} (build hoort te ontbreken zonder EXPECT_BUILD_SHA): $health"
  echo "✓ liveness 200, version ${expected_version}, zonder build"
fi
[[ "$(status "$base/api/ready")" == "503" ]] || fail "GET /api/ready zonder database geeft geen 503"
echo "✓ readiness 503 zonder database"
headers="$(curl -fsS -D - -o /dev/null "$base/admin/accounts")" || fail "GET /admin/accounts faalt"
grep -qi "^content-security-policy: default-src 'self'" <<<"$headers" || fail "SPA zonder CSP"
grep -qi '^cache-control: no-cache' <<<"$headers" || fail "index.html zonder cache-control: no-cache"
echo "✓ SPA met CSP op een schermroute"
index="$(curl -fsS "$base/")" || fail "GET / faalt"
asset="$(grep -o '/assets/[^"]*\.js' <<<"$index" | head -n 1 || true)"
[[ -n "$asset" ]] || fail "index.html verwijst naar geen script in /assets/"
asset_headers="$(curl -fsS -D - -o /dev/null "$base$asset")" || fail "GET $asset faalt"
grep -qi 'immutable' <<<"$asset_headers" || fail "$asset zonder immutable cache"
echo "✓ asset $asset met immutable cache"
body="$(curl -s "$base/api/bestaat-niet")" || fail "GET /api/bestaat-niet faalt"
grep -q '"code":"NOT_FOUND"' <<<"$body" || fail "onbekende API-route geeft geen NOT_FOUND: $body"
echo "✓ API-fout als { code, requestId }"
[[ "$(docker inspect -f '{{.Config.Env}}' "$image")" != *AUTH_SECRET* ]] || fail "AUTH_SECRET in de image"

# Browser-smoke: hetzelfde Playwright-image als ui:check (één bron in compose.yaml, Renovate houdt het gelijk met
# @playwright/test). Een intern netwerk (geen internet) tussen smoke en app; de smoke bereikt de app via de containernaam.
if [[ "${SMOKE_BROWSER:-}" == "1" ]]; then
  prepare_smoke_input
  [[ -d "$repo/node_modules/@playwright/test" ]] || fail "SMOKE_BROWSER=1 zonder node_modules: draai eerst pnpm install"
  pw_image="$(sed -n 's/^ *image: \(mcr\.microsoft\.com\/playwright:[^ ]*\)$/\1/p' "$repo/compose.yaml")"
  [[ -n "$pw_image" && "$pw_image" != *$'\n'* ]] || fail "geen eenduidig Playwright-image in compose.yaml"
  # Elke pull begrensd (zoals scripts/runner.sh): een hangende registry at anders de time-out van de job op.
  pulled=""
  for attempt in 1 2 3; do
    if timeout --kill-after=10s 300 docker pull --quiet "$pw_image" >/dev/null; then pulled=1 && break; fi
    printf '✗ Playwright-image binnenhalen: poging %s van 3 faalde of hing langer dan 300 s.\n' "$attempt" >&2
  done
  [[ -n "$pulled" ]] || fail "Playwright-image binnenhalen faalde na 3 pogingen; draai de job later opnieuw"
  docker network create --internal "$net" >/dev/null
  docker network connect "$net" "$name"
  docker run --rm --network "$net" --shm-size 1gb --read-only --tmpfs /tmp --cap-drop ALL \
    --security-opt no-new-privileges:true --user "$(id -u):$(id -g)" \
    -v "$smoke_input:/repo:ro" -v "$repo/node_modules:/repo/node_modules:ro" -w /repo \
    -e HOME=/tmp -e CI=true -e SMOKE_BASE_URL="http://${name}:8080" -e SMOKE_OUTPUT_DIR=/tmp/smoke \
    "$pw_image" node node_modules/@playwright/test/cli.js test --config playwright.smoke.config.ts \
    || fail "browser-smoke van de productie-SPA faalt"
  echo "✓ productie-SPA in de browser: / en /admin/accounts tonen het foutscherm, zonder CSP-schending, JS-fout, mislukte asset of onverwachte console.error"
fi

docker stop -t 15 "$name" >/dev/null
code="$(docker inspect -f '{{.State.ExitCode}}' "$name")"
[[ "$code" == "0" ]] || fail "na SIGTERM exitcode $code in plaats van 0"
echo "✓ na SIGTERM netjes gestopt"
