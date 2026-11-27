#!/usr/bin/env bash
# Controleert de machine (framework §11). Zonder vlag ook de stack; --machine controleert alleen installatie en git-hooks.
# --quick: alleen de status van de lokale stack, voor de SessionStart-hook (nooit Docker, nooit netwerk buiten 127.0.0.1).
# Exit 1 bij een fout in de volledige of machine-modus; --quick meldt alleen en eindigt altijd met 0.
# De volledige en de machine-modus schrijven hun uitslag naar .template/doctor-<full|machine>.json (spec nieuwe-app-script,
# werking 9): bij de start weg, aan het eind geschreven, ook bij een afbreking (trap op EXIT). --quick schrijft en verwijdert niets.
set -euo pipefail
cd "$(dirname "$0")/.."

mode="${1:-full}"
if (($# > 1)); then
  echo 'Gebruik: scripts/doctor.sh [--machine|--quick]' >&2
  exit 2
fi
case "$mode" in
  full|--machine|--quick) ;;
  *) echo 'Gebruik: scripts/doctor.sh [--machine|--quick]' >&2; exit 2 ;;
esac
failures=0
steps=0
steps_json=""

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/ }"
  s="${s//$'\r'/ }"
  s="${s//$'\t'/ }"
  printf '%s' "$s"
}

# Een stap voor het resultaatbestand: record <ok|fout|overgeslagen> <melding> [herstel].
record() {
  local herstel=null
  steps=$((steps + 1))
  if (($# >= 3)); then herstel="\"$(json_escape "$3")\""; fi
  steps_json+="${steps_json:+,}{\"id\":\"controle-$steps\",\"status\":\"$1\",\"melding\":\"$(json_escape "$2")\",\"herstel\":$herstel}"
}

ok() {
  printf '✓ %s\n' "$1"
  record ok "$1"
}
fail() {
  printf '✗ %s\n  → %s\n' "$1" "$2"
  failures=$((failures + 1))
  record fout "$1" "$2"
}
skip() {
  printf '· %s\n' "$1"
  record overgeslagen "$1"
}

# Schrijft het resultaatbestand met printf (geen Node of jq: die kunnen ontbreken). Uitslag fout bij een exitcode ≠ 0.
write_result() {
  local code="$1" head uitslag=ok
  if ((code != 0)); then uitslag=fout; fi
  if ((code != 0 && failures == 0)); then
    record fout "doctor brak af vóór de telling (exitcode $code)" "lees de uitvoer hierboven en draai scripts/doctor.sh opnieuw"
  fi
  head="$(git rev-parse HEAD 2>/dev/null || true)"
  if [[ "$head" =~ ^[0-9a-f]{40,64}$ ]]; then head="\"$head\""; else head=null; fi
  mkdir -p .template 2>/dev/null || return 0
  printf '{"schema":1,"commando":"doctor-%s","tijd":"%s","head":%s,"dryRun":false,"uitslag":"%s","stappen":[%s],"gegevens":{}}\n' \
    "$result_name" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$head" "$uitslag" "$steps_json" >".template/doctor-$result_name.json" 2>/dev/null || true
}

# Poort uit .env.local (zonder het bestand uit te voeren), anders de standaard uit .env.example.
port() {
  local value=""
  [[ -f .env.local ]] && value="$(grep -E "^$1=[0-9]+$" .env.local | tail -1 | cut -d= -f2 || true)"
  printf '%s' "${value:-$2}"
}

listening() { timeout 1 bash -c "exec 3<>/dev/tcp/127.0.0.1/$1" 2>/dev/null; }

check_stack() {
  local name port_number
  for entry in "Postgres:$(port PG_PORT 54322)" "Mailpit:$(port MAIL_UI_PORT 54324)" "API:$(port API_PORT 8787)" "Web:$(port WEB_PORT 5173)"; do
    name="${entry%%:*}"
    port_number="${entry#*:}"
    if listening "$port_number"; then ok "$name luistert op 127.0.0.1:$port_number"; else fail "$name niet bereikbaar op 127.0.0.1:$port_number" "de eigenaar start de stack met \`pnpm dev\`"; fi
  done
}

if [[ "$mode" == --quick ]]; then
  check_stack
  exit 0
fi

result_name=full
if [[ "$mode" == --machine ]]; then result_name=machine; fi
rm -f ".template/doctor-$result_name.json"
trap 'write_result $?' EXIT

# Samenhang van de poorten in .env.local (spec nieuwe-app-script, werking 9): de poort in elke URL hoort bij zijn poortsleutel,
# dezelfde sleutels als `nieuwe-app.mjs poorten`. Alleen sleutelnamen tonen, nooit een waarde. Een URL-sleutel die ontbreekt,
# kan niet afwijken.
url_port() { sed -nE "s|^$1=[a-zA-Z][a-zA-Z0-9+.-]*://([^@/]*@)?[^:/?#]*:([0-9]+).*|\2|p" .env.local 2>/dev/null | tail -1 || true; }
check_env_ports() {
  local pair key port_key default mismatches=0
  if [[ ! -f .env.local ]]; then return 0; fi
  if [[ ! -r .env.local ]]; then
    skip ".env.local niet leesbaar: poortsamenhang overgeslagen"
    return 0
  fi
  for pair in DATABASE_URL:PG_PORT:54322 AUTH_DATABASE_URL:PG_PORT:54322 JOBS_DATABASE_URL:PG_PORT:54322 MIGRATOR_DATABASE_URL:PG_PORT:54322 \
    SMTP_URL:SMTP_PORT:54325 APP_ORIGIN:WEB_PORT:5173 AUTH_BASE_URL:WEB_PORT:5173; do
    IFS=: read -r key port_key default <<<"$pair"
    if ! grep -q "^$key=" .env.local; then continue; fi
    if [[ "$(url_port "$key")" != "$(port "$port_key" "$default")" ]]; then
      fail ".env.local: poort in $key past niet bij $port_key" "node scripts/kit/nieuwe-app.mjs poorten; .env.local alleen met akkoord van de eigenaar aanpassen"
      mismatches=$((mismatches + 1))
    fi
  done
  if ((mismatches == 0)); then ok ".env.local: de poorten in de URL's passen bij de poortsleutels"; fi
}

expect_version() {
  local label="$1" expected="$2" actual
  shift 2
  if ! actual="$("$@" 2>/dev/null)"; then
    fail "$label ontbreekt" "scripts/bootstrap.sh (mise install)"
  elif [[ "$actual" == *"$expected"* ]]; then
    ok "$label $expected"
  else
    fail "$label is '$actual', verwacht $expected" "mise install (versie uit mise.toml)"
  fi
}

# Ondersteunde Ubuntu-versies (framework §11). Gelezen, niet uitgevoerd; DOCTOR_OS_RELEASE alleen voor test/scripts/doctor.test.ts.
os_release="${DOCTOR_OS_RELEASE:-/etc/os-release}"
os_field() { sed -nE "s/^$1=[\"']?([^\"']*)[\"']?$/\1/p" "$os_release" 2>/dev/null | head -1 || true; }
os_id="$(os_field ID)"
os_version="$(os_field VERSION_ID)"
if [[ "$os_id" == ubuntu && ("$os_version" == 24.04 || "$os_version" == 26.04) ]]; then
  ok "Ubuntu $os_version"
else
  fail "besturingssysteem '${os_id:-onbekend} ${os_version:-onbekend}' is niet ondersteund (Ubuntu 24.04 of 26.04)" \
    "stop en vraag de eigenaar (docs/nieuwe-app.md, Standaardwaarden)"
fi

# Niet op een Windows-schijf (R-WERK-25): via 9p is alles veel trager en werkt file-watching niet. DOCTOR_REPO_PATH alleen voor test/scripts/doctor.test.ts.
repo_path="${DOCTOR_REPO_PATH:-$(pwd -P)}"
if [[ "$repo_path" == /mnt/[a-zA-Z] || "$repo_path" == /mnt/[a-zA-Z]/* ]]; then
  fail "de repo staat op een Windows-schijf ($repo_path)" "kloon naar ext4, bijvoorbeeld ~/code/<slug> (docs/nieuwe-app.md, Fout → oorzaak)"
else
  ok "de repo staat niet op een Windows-schijf"
fi

mise_version() { sed -nE "s/^$1 = \"([^\"]+)\"/\1/p" mise.toml; }
expect_version node "v$(mise_version node)" mise exec -- node --version
expect_version pnpm "$(sed -nE 's/.*"packageManager": "pnpm@([^"]+)".*/\1/p' package.json)" mise exec -- pnpm --version
expect_version dbmate "$(mise_version dbmate)" mise exec -- dbmate --version
expect_version betterleaks "$(mise_version betterleaks)" mise exec -- betterleaks version
expect_version osv-scanner "$(mise_version osv-scanner)" mise exec -- osv-scanner --version

for tool in git gh jq bwrap socat; do
  if command -v "$tool" >/dev/null; then ok "$tool aanwezig"; else fail "$tool ontbreekt" "sudo apt-get install -y $tool (docs/nieuwe-app.md)"; fi
done

watches="$(sysctl -n fs.inotify.max_user_watches 2>/dev/null || echo 0)"
if ((watches >= 524288)); then ok "inotify max_user_watches $watches"; else fail "inotify max_user_watches $watches" "fs.inotify.max_user_watches=524288 (docs/nieuwe-app.md)"; fi

if [[ "$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" == "1" ]]; then
  fail "AppArmor beperkt user namespaces: de sandbox van Claude Code start niet" "niet zelf wijzigen; melden (docs/nieuwe-app.md)"
elif bwrap --ro-bind / / --unshare-all true 2>/dev/null; then
  ok "bubblewrap start een sandbox"
else
  fail "bubblewrap start geen sandbox" "docs/nieuwe-app.md, probleemtabel"
fi
# De kooi voor destructieve en overgenomen commando's (ADR 0072): dezelfde proef als vóór elk kooicommando.
if mise exec -- node scripts/kit/kooi.mjs --proef >/dev/null 2>&1; then
  ok "de kooi schermt af (node scripts/kit/kooi.mjs --proef)"
else
  fail "de kooi schermt niet af" "node scripts/kit/kooi.mjs --proef toont de oorzaak (docs/ENVIRONMENT.md)"
fi

# Minimale Claude Code-versie (ADR 0045 punt 3): vanaf daar valt het rolhek dicht bij storing (`onFailure: "block"`). Dezelfde
# grens staat als MIN_CLAUDE_VERSIE in rails/hooks/lib/claude-versie.mjs (test/scripts/doctor-claude-versie.test.ts).
min_claude=2.1.295
if ! command -v claude >/dev/null; then
  skip "Claude Code niet gevonden: versiecontrole overgeslagen"
else
  claude_versie="$(claude --version 2>/dev/null | sed -nE '1s/^([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' || true)"
  if [[ -z "$claude_versie" ]]; then
    fail "Claude Code-versie onleesbaar: het rolhek valt pas vanaf $min_claude dicht bij storing" "werk Claude Code bij"
  elif [[ "$(printf '%s\n%s\n' "$min_claude" "$claude_versie" | sort -V | head -1)" != "$min_claude" ]]; then
    fail "Claude Code $claude_versie is te oud: het rolhek valt pas vanaf $min_claude dicht bij storing" "werk Claude Code bij"
  else
    ok "Claude Code $claude_versie"
  fi
fi

if docker info >/dev/null 2>&1; then ok "Docker draait"; else fail "Docker draait niet of je zit niet in de groep docker" "sudo systemctl start docker (docs/nieuwe-app.md)"; fi

if [[ -x .git/hooks/pre-commit ]] && grep -q lefthook .git/hooks/pre-commit; then ok "git-hooks (lefthook) geïnstalleerd"; else fail "git-hooks ontbreken" "pnpm exec lefthook install"; fi

check_env_ports

if [[ "$mode" != --machine ]]; then check_stack; fi

if ((failures > 0)); then
  printf '\n%d probleem/problemen.\n' "$failures"
  exit 1
fi
