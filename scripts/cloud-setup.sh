#!/usr/bin/env bash
# Installatie van de toolchain in een cloudomgeving van Claude Code (README, Cloud): wat scripts/bootstrap.sh lokaal doet,
# zonder de machinecontrole (in de VM draait geen lokale stack). Het veld "Setup script" van de omgeving bevat niet dit
# script maar scripts/cloud-omgeving.sh: dat start in de map boven de clone en draait dit script van elke repo eronder, dus
# één omgeving voor alle repo's uit de template. Met de hand in een sessie: bash scripts/cloud-setup.sh.
# Idempotent, zonder geheimen. Netwerk alleen via de standaard-allowlist van de omgeving ("Trusted"): mise van github.com,
# daarna wat mise install en pnpm install ophalen. mise.run staat niet op die allowlist, daarom de release-binary. Weigert
# de proxy de GitHub-API (mise install), dan haalt een terugval per tool exact dezelfde versie met controle op checksum.
# Node en pnpm komen op PATH via drie routes, geen ervan op zichzelf fataal: koppelingen in ~/.local/bin (de enige die ook
# hooks en git-hooks bereikt), een regel in CLAUDE_ENV_FILE en dezelfde regel in ~/.bashrc. bubblewrap en socat (voor de
# kooi) zijn niet fataal: de sessie start ook zonder. Zie docs/ENVIRONMENT.md.
set -euo pipefail
# PATH van vóór de eigen aanpassing: de slotcontrole kijkt welke node hooks en git-hooks daarop vinden.
PATH_VOOR="$PATH"
cd "$(dirname "$0")/.."

# Systeempakketten voor de kooi, alleen als ze ontbreken (idempotent). Zonder root via sudo. Niet fataal: de sessie start
# zonder, en de kooi meldt zelf dat bubblewrap ontbreekt (scripts/kit/kooi.mjs).
pakketten=()
command -v bwrap >/dev/null || pakketten+=(bubblewrap)
command -v socat >/dev/null || pakketten+=(socat)
if ((${#pakketten[@]} > 0)); then
  as_root=()
  [[ "$(id -u)" -eq 0 ]] || as_root=(sudo)
  apt_status=0
  "${as_root[@]}" apt-get update || apt_status=$?
  ((apt_status != 0)) || "${as_root[@]}" apt-get install -y "${pakketten[@]}" || apt_status=$?
  if ((apt_status != 0)); then
    printf '! bubblewrap en socat niet geïnstalleerd (apt-get exit %s); de kooi kan niet starten\n' "$apt_status" >&2
  fi
fi

# Stap die het netwerk nodig heeft: bij een fout een leesbare diagnose in plaats van alleen de fout van het commando (set -e).
netwerk() {
  local stap="$1"
  shift
  "$@" && return 0
  local status=$?
  # Alleen host en poort: een proxy-URL kan inloggegevens bevatten.
  local proxy="${HTTPS_PROXY:-${https_proxy:-leeg}}"
  proxy="${proxy#*://}"
  proxy="${proxy##*@}"
  {
    printf '✗ %s mislukt (exit %s): waarschijnlijk geen netwerk.\n' "$stap" "$status"
    printf '  → staat netwerktoegang van de omgeving op Trusted (claude.ai/code)? Is de proxy bereikbaar (HTTPS_PROXY=%s)?\n' "$proxy"
    printf '  → zie docs/ENVIRONMENT.md, Problemen.\n'
  } >&2
  exit "$status"
}

# Terugval voor één tool uit mise.toml: exact de versie die mise zou installeren (mise current leest mise.toml en voor
# pnpm package.json), uit een bron die de proxy doorlaat, met een controle op de inhoud. Daarna mise link, zodat mise exec,
# de shims en lefthook de tool vinden alsof mise hem zelf installeerde.
TERUGVAL="$HOME/.local/share/mise-terugval"

# Inhoud vergelijken met het checksumbestand van de bron zelf; geen regel of een andere hash: stoppen, niets linken.
controleer_sha256() {
  local bestand="$1" sums="$2" naam="$3" verwacht
  verwacht="$(awk -v n="$naam" '$2 == n || $2 == "*" n { print $1; exit }' "$sums")"
  if [[ -z "$verwacht" ]] || ! printf '%s  %s\n' "$verwacht" "$bestand" | sha256sum -c --status; then
    printf '✗ checksum van %s klopt niet of ontbreekt in %s; niets geïnstalleerd.\n' "$naam" "${sums##*/}" >&2
    exit 1
  fi
}

# Bestand en checksumbestand ophalen naar een tijdelijke map en de inhoud controleren; echo't het pad van het bestand.
ophalen() {
  local basis="$1" naam="$2" sums="$3" tmp
  tmp="$(mktemp -d)"
  netwerk "$naam ophalen" curl -fsSL -o "$tmp/$naam" "$basis/$naam"
  netwerk "$sums ophalen" curl -fsSL -o "$tmp/$sums" "$basis/$sums"
  controleer_sha256 "$tmp/$naam" "$tmp/$sums" "$naam" >&2
  printf '%s\n' "$tmp/$naam"
}

terugval() {
  local tool="$1" versie doel bestand
  versie="$(mise current "$tool" 2>/dev/null)"
  [[ -n "$versie" ]] || { printf '✗ geen versie voor %s in mise.toml\n' "$tool" >&2; exit 1; }
  doel="$TERUGVAL/$tool-$versie"
  rm -rf "$doel"
  mkdir -p "$doel"
  case "$tool" in
    # nodejs.org staat op de allowlist; SHASUMS256.txt van dezelfde release.
    node)
      bestand="$(ophalen "https://nodejs.org/dist/v$versie" "node-v$versie-linux-$arch.tar.gz" SHASUMS256.txt)"
      tar -xzf "$bestand" -C "$doel" --strip-components=1 ;;
    # registry.npmjs.org gaat buiten de proxy om; npm controleert de integriteit (sha512) uit de registry.
    pnpm | dbmate)
      netwerk "$tool $versie via npm" mise exec node -- npm install --global --prefix "$doel" --no-fund --no-audit \
        "$tool@$versie" ;;
    # Release-downloads van github.com gaan wel door de proxy, de API niet; checksumbestand van dezelfde release.
    betterleaks)
      bestand="$(ophalen "https://github.com/betterleaks/betterleaks/releases/download/v$versie" \
        "betterleaks_${versie}_linux_$arch.tar.gz" checksums.txt)"
      tar -xzf "$bestand" -C "$doel" betterleaks ;;
    osv-scanner)
      bestand="$(ophalen "https://github.com/google/osv-scanner/releases/download/v$versie" \
        "osv-scanner_linux_${arch/x64/amd64}" osv-scanner_SHA256SUMS)"
      install -m 0755 "$bestand" "$doel/osv-scanner" ;;
    *) printf '✗ geen terugval voor %s; voeg er een toe in scripts/cloud-setup.sh\n' "$tool" >&2; exit 1 ;;
  esac
  [[ -z "${bestand:-}" ]] || rm -rf "${bestand%/*}"
  MISE_LOG_LEVEL=error mise link --force "$tool@$versie" "$doel"
  printf '✓ %s %s via terugval\n' "$tool" "$versie"
}

# Voorcontrole uit scripts/kit/toolchain.mjs, dezelfde die feiten.mjs aan het begin van elke sessie draait.
CONTROLE="const { toolchainProbleemIn } = await import('./scripts/kit/toolchain.mjs'); "
CONTROLE+="const probleem = toolchainProbleemIn(process.cwd()); "
CONTROLE+="if (probleem !== null) { console.error(probleem); process.exit(1); } "
CONTROLE+="console.log('✓ toolchain compleet (scripts/kit/toolchain.mjs)');"

case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) echo "✗ onbekende architectuur $(uname -m)" >&2; exit 1 ;;
esac

# Zelfde versie als jdx/mise-action in .github/workflows/.
MISE_VERSION=v2026.9.18
export PATH="$HOME/.local/bin:$PATH"

if ! command -v mise >/dev/null; then
  mkdir -p "$HOME/.local/bin"
  netwerk "mise ophalen van github.com" curl -fsSL -o "$HOME/.local/bin/mise" \
    "https://github.com/jdx/mise/releases/download/$MISE_VERSION/mise-$MISE_VERSION-linux-$arch"
  chmod +x "$HOME/.local/bin/mise"
fi

mise trust
# mise install vraagt voor de aqua-tools (pnpm, dbmate, betterleaks, osv-scanner) de GitHub-API; de proxy van een
# cloudsessie weigert die voor repo's die niet aan de sessie hangen. Dan vult de terugval hieronder aan; wat dan nog
# ontbreekt, stopt het script.
if ! mise install; then
  printf '! mise install onvolledig: terugval voor de ontbrekende tools (docs/ENVIRONMENT.md, Terugval).\n' >&2
fi
# Geen stille installatiepoging bij elke mise exec voor een tool die hier al mislukte.
export MISE_EXEC_AUTO_INSTALL=false
for tool in node pnpm dbmate betterleaks osv-scanner; do
  mise where "$tool" >/dev/null 2>&1 || terugval "$tool"
done
ontbreekt="$(mise ls --missing 2>/dev/null)"
if [[ -n "$ontbreekt" ]]; then
  printf '✗ tools uit mise.toml ontbreken, ook na de terugval:\n%s\n  → zie docs/ENVIRONMENT.md, Terugval.\n' "$ontbreekt" >&2
  exit 1
fi

# Route 1: ~/.local/bin/<tool> als koppeling naar de binaire die `mise which` geeft, niet naar een mise-shim (een shim
# weigert in een map met een niet-vertrouwde mise.toml). In de cloud staat ~/.local/bin vóór de systeem-node op PATH, ook
# voor hooks en git-hooks, die node via PATH starten. Een koppeling die al goed staat, blijft ongemoeid.
koppel() {
  local tool="$1" pad link="$HOME/.local/bin/$1"
  pad="$(mise which "$tool" 2>/dev/null)" || pad=""
  if [[ -z "$pad" ]]; then
    printf '! geen koppeling ~/.local/bin/%s: mise which %s gaf geen pad\n' "$tool" "$tool" >&2
    return 1
  fi
  if [[ -e "$link" && ! -L "$link" ]]; then
    printf '! geen koppeling ~/.local/bin/%s: daar staat al een bestand\n' "$tool" >&2
    return 1
  fi
  [[ "$(readlink "$link" 2>/dev/null)" != "$pad" ]] || return 0
  if ! { mkdir -p "$HOME/.local/bin" && ln -sfn "$pad" "$link"; } 2>/dev/null; then
    printf '! geen koppeling ~/.local/bin/%s: niet te schrijven\n' "$tool" >&2
    return 1
  fi
}
koppelingen=1
koppel node || koppelingen=0
koppel pnpm || koppelingen=0
pin="$(mise current node 2>/dev/null)" || pin=""

# Route 2 en 3: dezelfde regel in CLAUDE_ENV_FILE (als gezet) en in ~/.bashrc, voor de Bash-tool. ~/.local/bin vóór de
# shims, zodat de koppeling ook daar wint. Enkele aanhalingstekens: $HOME en $PATH worden pas bij het laden ingevuld.
REGEL='export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$PATH"'
schrijf_regel() {
  { grep -qxF "$REGEL" "$1" || printf '%s\n' "$REGEL" >>"$1"; } 2>/dev/null
}
env_bestand=0
if [[ -n "${CLAUDE_ENV_FILE:-}" ]]; then
  if schrijf_regel "$CLAUDE_ENV_FILE"; then
    env_bestand=1
  else
    printf '! CLAUDE_ENV_FILE (%s) niet te schrijven\n' "$CLAUDE_ENV_FILE" >&2
  fi
fi
bashrc=0
schrijf_regel "$HOME/.bashrc" && bashrc=1

netwerk "pnpm install (of lockfile ongeldig)" mise exec -- pnpm install --frozen-lockfile
# lefthook heeft geen postinstall (pnpm-workspace.yaml: allowBuilds); de hooks komen alleen hier.
mise exec -- pnpm exec lefthook install
# Bewijs: dezelfde voorcontrole als elke sessie (exacte Node- en pnpm-versie, node_modules), nu meteen bij de setup.
mise exec -- node --input-type=module -e "$CONTROLE"

# Slotcontrole: welke node vinden hooks en git-hooks op het PATH van vóór dit script? Route 1 werkt alleen als dat de
# gepinde versie is en beide koppelingen staan. Faalt alleen als ook route 2 en 3 niet geschreven zijn.
gevonden="$( (PATH="$PATH_VOOR" && node --version) 2>/dev/null)" || gevonden=""
gevonden="${gevonden:-geen}"
route1=0
[[ "$koppelingen" -eq 0 || -z "$pin" || "${gevonden#v}" != "$pin" ]] || route1=1
if ((bashrc == 0)); then
  via=""
  if ((route1)); then via='~/.local/bin'; elif ((env_bestand)); then via=CLAUDE_ENV_FILE; fi
  [[ -z "$via" ]] || printf '! ~/.bashrc niet te schrijven; PATH loopt via %s\n' "$via" >&2
fi
if ((route1 == 0)); then
  if ((env_bestand == 0 && bashrc == 0)); then
    printf '✗ node op PATH is %s, verwacht %s: ~/.local/bin staat niet vóór de systeem-node en CLAUDE_ENV_FILE en ~/.bashrc zijn niet te schrijven → zie docs/ENVIRONMENT.md, Problemen\n' \
      "$gevonden" "$pin" >&2
    exit 1
  fi
  printf '! ~/.local/bin staat niet vóór de systeem-node: hooks en git-hooks blijven op %s\n' "$gevonden" >&2
fi
