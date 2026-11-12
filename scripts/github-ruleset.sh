#!/usr/bin/env bash
# Zet de ruleset `main` op een app-repo (docs/nieuwe-app.md, fase 6.2), volgens framework §10 (R-REPO-02, ADR 0089 punt 2):
# geen delete of force push, PR-plicht met review van een code-eigenaar (.github/CODEOWNERS) en nul vereiste goedkeuringen,
# een goedkeuring vervalt bij een nieuwe push, opgeloste reviewgesprekken, merge en squash, geen bijgewerkte branch vereist,
# en als verplichte checks precies `requiredChecks` uit .claude/decisions.json (gelezen, hier niet herhaald;
# test/scripts/github-ruleset.test.ts houdt die lijst gelijk aan .github/workflows/).
# Draait de eigenaar, met de eigen `gh`-login; opnieuw draaien werkt de bestaande ruleset bij. Wijzigt nooit de zichtbaarheid.
# `bypass_actors` is leeg, behalve met --bypass-beheerder: dan mag alleen de beheerdersrol (RepositoryRole 5) de regels
# passeren, en alleen bij het mergen van een pull request. LET OP: die optie mag pas als het token van de eigenaar uit de
# agentomgeving is (spec templateregime AC-6); anders kan een agent met dat token zelf langs de review.
# Na het zetten vraagt het script bij GitHub de fouten in CODEOWNERS op (repos/<owner>/<repo>/codeowners/errors) en eindigt
# rood als er een is of als het antwoord niet te lezen is: GitHub slaat een regel met een ongeldige eigenaar stil over.
# Gebruik: scripts/github-ruleset.sh <owner>/<repo> [--zonder-codeql] [--bypass-beheerder]
set -euo pipefail

usage() {
  echo "Gebruik: scripts/github-ruleset.sh <owner>/<repo> [--zonder-codeql] [--bypass-beheerder]" >&2
  echo "  --zonder-codeql     alleen de ruleset zonder CodeQL; wijzigt workflow en pr:verify niet" >&2
  echo "  --bypass-beheerder  de beheerder mag de regels passeren, alleen via een pull request;" >&2
  echo "                      pas gebruiken als het token van de eigenaar uit de agentomgeving is" >&2
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
bypass=false
for optie in "$@"; do
  case "$optie" in
    --zonder-codeql) codeql=false ;;
    --bypass-beheerder) bypass=true ;;
    *) usage ;;
  esac
done
if ! $codeql; then
  echo 'Let op: --zonder-codeql wijzigt alleen de ruleset, niet codeql.yml of de verplichte checks van pr:verify.' >&2
  echo 'Dit is geen volledig CI-profiel; rond de setup niet af zonder een besloten en gecontroleerde appconfiguratie.' >&2
fi
if $bypass; then
  echo 'Let op: --bypass-beheerder laat de beheerder de ruleset passeren bij het mergen van een pull request.' >&2
  echo 'Gebruik dit pas als het token van de eigenaar uit de agentomgeving is (spec templateregime AC-6).' >&2
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

# 5 = de vaste repositoryrol admin (beheerder). Nooit een App (Integration): de agent pusht als App.
bypass_actors=""
if $bypass; then
  bypass_actors='{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }'
fi

payload=$(
  cat <<JSON
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [ $bypass_actors ],
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
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

# GitHub slaat een regel in CODEOWNERS met een ongeldige eigenaar stilzwijgend over (bijvoorbeeld een handle zonder
# schrijfrecht). Dan heeft geen pad een eigenaar en is, met nul vereiste goedkeuringen, elke PR zonder review mergebaar.
# Daarom na het zetten van de ruleset de fouten opvragen; een niet-lege lijst, een mislukte aanroep of onleesbare uitvoer is rood.
codeowners_fout() {
  echo "✗ CODEOWNERS op $repo: $1" >&2
  echo "  Let op dat GitHub regels met een fout overslaat (bijvoorbeeld een handle zonder schrijfrecht): dan heeft geen pad" >&2
  echo "  een eigenaar en is met nul vereiste goedkeuringen elke PR zonder review mergebaar. De ruleset staat er al." >&2
  echo "  → zet in goedkeurders (.claude/gates.json) een account met schrijfrecht, draai" >&2
  echo "    node scripts/kit/codeowners.mjs --schrijf, merge dat naar main en draai dit script opnieuw." >&2
  [[ -z "${2:-}" ]] || printf '%s\n' "$2" >&2
  exit 1
}

leeg_patroon='^[[:space:]]*\{[[:space:]]*"errors"[[:space:]]*:[[:space:]]*\[[[:space:]]*\][[:space:]]*\}[[:space:]]*$'
lijst_begin='^[[:space:]]*\{[[:space:]]*"errors"[[:space:]]*:[[:space:]]*\['
fouten=$(gh api "repos/$repo/codeowners/errors" 2>&1) || codeowners_fout "de fouten zijn niet op te vragen." "$fouten"
if [[ "$fouten" =~ $leeg_patroon ]]; then
  echo "✓ CODEOWNERS op $repo is zonder fouten volgens GitHub"
elif [[ "$fouten" =~ $lijst_begin ]]; then
  codeowners_fout "GitHub meldt fouten." "$fouten"
else
  codeowners_fout "het antwoord van GitHub is niet te lezen." "$fouten"
fi
