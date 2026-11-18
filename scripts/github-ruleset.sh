#!/usr/bin/env bash
# Zet de ruleset `main` op een app-repo (docs/nieuwe-app.md, fase 6.2), volgens framework §10 (R-REPO-02, ADR 0093 punt 2):
# geen delete of force push, PR-plicht zonder review van een code-eigenaar en met nul vereiste goedkeuringen,
# een goedkeuring vervalt bij een nieuwe push, opgeloste reviewgesprekken, merge en squash, geen bijgewerkte branch vereist,
# en als verplichte checks precies `requiredChecks` uit .claude/decisions.json (gelezen, hier niet herhaald;
# test/scripts/github-ruleset.test.ts houdt die lijst gelijk aan .github/workflows/).
# Draait de hoofdsessie na akkoord van de eigenaar, of de eigenaar zelf, met diens `gh`-login; opnieuw draaien werkt de
# bestaande ruleset bij. Wijzigt nooit de zichtbaarheid.
# `bypass_actors` is altijd leeg: ook de eigenaar passeert geen rode verplichte check. Wie een PR met een beschermd pad
# samenvoegt, bewaakt GitHub niet meer; dat doet het mergescript van de hoofdsessie op de padtabel (vangnet, geen grens).
# Gebruik: scripts/github-ruleset.sh <owner>/<repo> [--zonder-codeql]
set -euo pipefail

usage() {
  echo "Gebruik: scripts/github-ruleset.sh <owner>/<repo> [--zonder-codeql]" >&2
  echo "  --zonder-codeql  alleen de ruleset zonder CodeQL; wijzigt workflow en pr:verify niet" >&2
  exit 2
}

stop() {
  echo "✗ $1" >&2
  exit 1
}

repo="${1:-}"
[[ "$repo" =~ ^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9._-]+$ ]] || usage
shift
codeql=true
for optie in "$@"; do
  case "$optie" in
    --zonder-codeql) codeql=false ;;
    *) usage ;;
  esac
done
if ! $codeql; then
  echo 'Let op: --zonder-codeql wijzigt alleen de ruleset, niet codeql.yml of de verplichte checks van pr:verify.' >&2
  echo 'Dit is geen volledig CI-profiel; rond de setup niet af zonder een besloten en gecontroleerde appconfiguratie.' >&2
fi

# De verplichte checks zijn precies `requiredChecks` uit .claude/decisions.json (ADR 0068 punt 1): job-namen zoals ze op een
# PR staan. Zonder jq of node gelezen, zodat het script alleen bash en gh vraagt; een onleesbare of lege lijst stopt het script.
register="$(dirname "${BASH_SOURCE[0]}")/../.claude/decisions.json"
[[ -r "$register" ]] || stop "$register is niet te lezen; zonder requiredChecks geen ruleset."
# Regeleinden blijven staan: een regeleinde binnen een naam valt dan buiten de toegestane tekens en stopt het script.
inhoud=$(<"$register")
lijst_patroon='"requiredChecks"[[:space:]]*:[[:space:]]*\[([^]]*)\]'
naam_patroon='"([^"]*)"(.*)'
[[ "$inhoud" =~ $lijst_patroon ]] || stop "requiredChecks ontbreekt in $register."
rest="${BASH_REMATCH[1]}"
checks=()
while [[ "$rest" =~ $naam_patroon ]]; do
  naam="${BASH_REMATCH[1]}"
  rest="${BASH_REMATCH[2]}"
  # Alleen tekens die in een checknaam voorkomen: de naam gaat ongewijzigd de JSON-payload in.
  [[ "$naam" =~ ^[A-Za-z0-9\ _:().-]+$ ]] || stop "onverwachte checknaam in requiredChecks: $naam"
  if ! $codeql && [[ "$naam" == "codeql ("* ]]; then continue; fi
  checks+=("$naam")
done
((${#checks[@]} > 0)) || stop "requiredChecks in $register is leeg."

# 15368 = GitHub Actions: een status van een andere bron telt niet (anders is hij te vervalsen).
status_checks=""
for check in "${checks[@]}"; do
  status_checks+="${status_checks:+, }{ \"context\": \"$check\", \"integration_id\": 15368 }"
done

payload=$(
  cat <<JSON
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["merge", "squash"]
    } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [ $status_checks ]
    } }
  ]
}
JSON
)

# gh-fout naar stderr; rulesets op een private repo zonder Pro/Team krijgen een eigen melding.
fail() {
  if [[ "$1" == *"Upgrade to GitHub Pro"* ]]; then
    echo "✗ GitHub weigert rulesets op $repo: een private repo vraagt GitHub Pro of Team." >&2
    echo "  → de eigenaar kiest: Pro, een organisatie met Team, of public. Dit script wijzigt de zichtbaarheid niet." >&2
  else
    printf '✗ gh api faalde:\n%s\n' "$1" >&2
  fi
  exit 1
}

id=$(gh api "repos/$repo/rulesets" --jq '.[] | select(.name == "main") | .id' 2>&1) || fail "$id"
[[ "$id" =~ ^[0-9]*$ ]] || fail "onverwachte uitvoer bij het zoeken naar ruleset main: $id"
if [[ -n "$id" ]]; then
  out=$(gh api -X PUT "repos/$repo/rulesets/$id" --input - <<<"$payload" 2>&1) || fail "$out"
  echo "✓ ruleset main bijgewerkt op $repo (${#checks[@]} verplichte checks)"
else
  out=$(gh api -X POST "repos/$repo/rulesets" --input - <<<"$payload" 2>&1) || fail "$out"
  echo "✓ ruleset main gezet op $repo (${#checks[@]} verplichte checks)"
fi
