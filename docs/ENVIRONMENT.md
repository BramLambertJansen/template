# Omgeving opzetten (cloudsessies)

Dit document legt vast wat een cloudomgeving van Claude Code nodig heeft om met deze repo te werken, en hoe je hem opzet.
De opzet zelf staat als code in `scripts/cloud-omgeving.sh` (het veld van de omgeving) en `scripts/cloud-setup.sh` (de
installatie per repo); dit document is de uitleg erbij. Wijzigt een van beide, werk dan dit document bij in dezelfde PR.

## Opzetten

Eén omgeving voor alle repo's uit de template, één keer per account:

1. Maak op claude.ai/code een omgeving met netwerktoegang **Trusted** (de standaard; de app toont vermoedelijk hetzelfde als **Limited**).
2. Zet in het veld "Setup script" de inhoud van het bestand `scripts/cloud-omgeving.sh`: plak de tekst, of kies het
   bestand met "Choose file". Er staat geen repo-naam in.
3. Kies die omgeving voortaan bij elke sessie, voor deze repo en voor elke app uit de template.
4. Start elke sessie met één repo, zodat de hooks en permissieregels uit `.claude/settings.json` gelden.

Het veld draait in de map **boven** de clone, als root, vóór Claude Code start. Daarom zoekt `scripts/cloud-omgeving.sh`
`scripts/cloud-setup.sh` onder die map (`<repo>/scripts/`, niet in `node_modules`), draait elk gevonden script met een
regel `→ <pad>` ervoor en eindigt met de exitcode van het eerste script dat faalt. Vindt het niets, dan eindigt het met
`✗ scripts/cloud-setup.sh niet gevonden onder <map>` en exit 1. Klaar binnen ongeveer vijf minuten betekent dat de omgeving
wordt gecachet; het script draait dan niet opnieuw tot het veld of de toegestane hosts wijzigen. In de eerste sessie na het instellen staan de
toolchain en `node_modules` er (gemeten op 19 november 2026). Niet gemeten: of een
sessie uit de cache de `node_modules` van de repo bevat, en of één omgeving haar cache over meerdere repo's deelt (spec
`cloud-zelfinstallatie`, M6). Deelt ze die wel, dan wordt het één omgeving per repo met hetzelfde bestand.

## Wat het script doet

`scripts/cloud-setup.sh` is idempotent: opnieuw draaien verandert niets als alles er al staat. Het doet, in deze volgorde:

| Stap | Waarom |
|---|---|
| `bubblewrap` en `socat` installeren via `apt-get`, alleen als ze ontbreken; mislukt dat, dan een `!`-regel en verder | De kooi (`scripts/kit/kooi.mjs`, ADR 0072) heeft bubblewrap nodig: ze draait overgenomen commando's in tests en valt zonder bubblewrap dicht. Kan de kooi niet starten, dan slaat `gate:fast` die tests lokaal over met een `⚠`-regel; in CI is dat rood (ADR 0088, `docs/operations/testuitvoering.md`). Een cloudsessie start ook zonder; zie de startmelding onder Problemen. |
| `mise` ophalen als release-binary van github.com (gepinde versie) | `mise.run` staat niet op de allowlist van netwerktoegang Trusted. |
| `mise install` | Toolchain uit `mise.toml`. |
| Terugval per ontbrekende tool (zie Terugval) | De proxy van een cloudsessie weigert de GitHub-API, die `mise install` voor pnpm, dbmate, betterleaks en osv-scanner nodig heeft. |
| Stoppen als `mise ls --missing` nog iets noemt | Een tool zonder terugval valt meteen op, niet pas bij de eerste check of commit. |
| Route 1 naar `PATH`: `~/.local/bin/node` en `~/.local/bin/pnpm` als koppeling naar het pad dat `mise which` geeft | De binaire zelf, geen mise-shim (een shim weigert bij een niet-vertrouwde `mise.toml`). `~/.local/bin` stond in twee gemeten cloudsessies vóór de voorgeïnstalleerde Node 22, waaronder een sessie van de eigenaar (spec `cloud-zelfinstallatie`, F11 en M3; voor hooks nog niet gemeten); dit is de enige route die ook hooks en git-hooks kan bereiken, die `node` via `PATH` starten. Een gewoon bestand op die plek blijft staan; een lege of mislukte `mise which` maakt geen koppeling. Beide geven een `!`-regel. |
| Route 2: één eigen `export PATH=`-regel in `CLAUDE_ENV_FILE`, als die variabele gezet is | Claude Code zet die regel vóór elk Bash-commando. Idempotent op de eigen regel; andere regels, ook een `export PATH=` van iets anders, blijven staan. Niet te schrijven is een `!`-regel. |
| Route 3: dezelfde regel in `~/.bashrc` | Voor de Bash-tool. Niet te schrijven (bijvoorbeeld alleen-lezen in de sessie) is een `!`-regel, geen fout. |
| `pnpm install --frozen-lockfile` | Dependencies exact volgens het lockfile. |
| `pnpm exec lefthook install` | Git-hooks (lefthook heeft geen postinstall). |
| Voorcontrole uit `scripts/kit/toolchain.mjs` | Bewijst aan het eind van de setup dezelfde exacte Node- en pnpm-versie en `node_modules` die elke sessie eerst controleert. |
| Slotcontrole op `PATH` | Route 1 telt als het `PATH` van vóór het script de versie van `mise current node` geeft én beide koppelingen (node en pnpm) staan. Telt route 1 niet en is route 2 noch 3 geschreven, dan exit 1. Werkt alleen route 2 of 3, dan exit 0 met een waarschuwing dat hooks en git-hooks op de systeem-node blijven. |

In de `PATH`-regel van route 2 en 3 staat `$HOME/.local/bin` vóór `$HOME/.local/share/mise/shims`, zodat de koppeling ook
daar wint.

Het script bevat geen geheimen en vraagt er geen. Het draait zonder root via `sudo` als dat nodig is.

## Terugval

`mise install` haalt node van nodejs.org, maar voor de aqua-tools (pnpm, dbmate, betterleaks, osv-scanner) vraagt het
eerst de GitHub-API (`api.github.com/repos/<repo>/releases/tags/<versie>`). De proxy van een cloudsessie weigert die API
voor repo's die niet aan de sessie hangen (403); release-downloads van `github.com`, `nodejs.org` en `registry.npmjs.org`
gaan wel door. Daarom vult `scripts/cloud-setup.sh:76` (`terugval`) elke tool aan waarvoor `mise where` faalt:

| Tool | Bron | Controle op de inhoud |
|---|---|---|
| node | `nodejs.org/dist/v<versie>/` | `SHASUMS256.txt` van dezelfde release |
| pnpm, dbmate | npm-registry (`npm install --global --prefix`) | npm controleert de integriteit (sha512) uit de registry |
| betterleaks | release-download op `github.com` | `checksums.txt` van dezelfde release |
| osv-scanner | release-download op `github.com` | `osv-scanner_SHA256SUMS` van dezelfde release |

Waarom zo:

- **Exact dezelfde versie.** De versie komt uit `mise current <tool>`, dus uit `mise.toml` (pnpm via `packageManager` in
  `package.json`). Er staat geen tweede versienummer in het script; een Renovate-update werkt ook voor de terugval.
- **Geen stille afwijking.** Klopt een checksum niet of ontbreekt hij, dan stopt het script vóór er iets geïnstalleerd is.
  De slotcontrole met `scripts/kit/toolchain.mjs` faalt bij elke andere Node- of pnpm-versie.
- **Voor mise onzichtbaar.** `mise link` registreert de map (`~/.local/share/mise-terugval/<tool>-<versie>`) als die
  versie, zodat `mise exec`, de shims en de pre-commit-hook (`mise exec -- betterleaks`) werken alsof mise hem installeerde.
  `MISE_EXEC_AUTO_INSTALL=false` geldt alleen tijdens het script.
- **Alleen waar nodig.** Lokaal en in CI installeert mise alles zelf, met zijn eigen attestatiecontroles; de terugval draait
  alleen voor een tool die na `mise install` ontbreekt, en het script draait alleen in de cloud.
- **Uitbreidbaar.** Een nieuwe tool in `mise.toml` zonder terugval laat de setup stoppen met de naam van de tool
  (`mise ls --missing`); voeg dan een tak toe aan `terugval` met een bron en een controle op de inhoud.

De tests staan in `test/scripts/cloud-setup.test.ts`: versie en bron per tool, `mise link`, weigering bij een verkeerde
checksum, een mislukte download en een tool die blijft ontbreken.

## Wat de omgeving verder nodig heeft

- Netwerk: alleen de standaard-allowlist (Trusted); `github.com`, `nodejs.org`, de npm-registry en de pakketbron van
  `apt-get` volstaan. De GitHub-API is niet nodig (zie Terugval).
- Geen lokale stack: in een cloudsessie draaien `pnpm gate:slow` en `pnpm test:db` in CI. De GitHub-proxy beperkt niet naar welke branch gepusht wordt, dus de ruleset op `main` is daar de grens.
- Geen secrets in de omgeving; `.env*` blijft buiten beeld (`AGENTS.md`, Repo en grenzen).

## Minimale Claude Code-versie

Claude Code 2.1.295 of nieuwer, lokaal en in de cloud. Vanaf die versie bestaat `onFailure: "block"`, waarmee het rolhek
een aanroep tegenhoudt als het zelf crasht, niet start of zijn timeout haalt (ADR 0045 punt 3). Een oudere versie laat de
aanroep dan door of verwerpt de sleutel; wat precies, is niet gemeten. `scripts/doctor.sh` (volledig en `--machine`) geeft
bij een oudere of onleesbare versie een ✗ en exit 1, ook als `claude --version` faalt; `werkstraat session-start` zet dezelfde
melding in de context (`rails/hooks/lib/claude-versie.mjs`), maar zwijgt als `claude --version` faalt of ontbreekt. Zonder
`claude` op het pad, zoals in CI, slaat de doctor de controle over. Beide kijken naar de `claude` op het pad; met meerdere
installaties kan dat een andere zijn dan die de sessie draait. In een cloudsessie zonder projecthooks draait het rolhek
niet (#462); `node scripts/kit/feiten.mjs` meldt dat dan op stderr met `⚠ bewaking niet actief in deze sessie:`
(`scripts/kit/bewaking.mjs`, spec bewaking-zichtbaar): geen recente meting van de meethook in `.git/agent-meting/` (of
`METING_DIR`), of de map boven de repository is schrijfbaar, dus de Bash-sandbox schermt niet af. De melding blokkeert niets;
de sessie claimt dan geen rolhek of sandbox (R-WERK-23), draait destructieve of overgenomen commando's alleen
in de kooi (R-TOOL-03) en noemt het in de PR-tekst.

## Eerst controleren in een sessie

Een sessie controleert dit eerst en stopt bij een fout, voordat ze iets verkent:

| Vereiste | Controle | Bij een fout |
|---|---|---|
| Node, exacte pnpm-pin en installatiebestanden aanwezig | `node scripts/kit/feiten.mjs` geeft geen `✗ toolchain ontbreekt` (`scripts/kit/toolchain.mjs`) | setup-script niet gedraaid of mislukt; zie Problemen |
| Netwerk vanuit de Bash-tool | `pnpm install --frozen-lockfile` slaagt | zie Problemen, proxy |
| Branch | `git branch --show-current` | zie Branchnaam |
| Projecthooks en Bash-sandbox actief | `node scripts/kit/feiten.mjs` geeft geen `⚠ bewaking niet actief in deze sessie` | geen stop: werk door zonder op rolhek of sandbox te leunen, zie de alinea over #462 hierboven |

Zonder de Node uit `mise.toml` en dependencies draait geen enkele check die bewijs levert (`pnpm gate:fast`, `pnpm pr:verify`, `pnpm meting`).
Een overdracht aan een cloudsessie begint daarom met een blok **Vereisten** met deze drie punten.

De voorcontrole valideert ook de exacte `packageManager`-pin en vergelijkt die met de werkelijke uitvoer van
pnpm op `PATH`. Een verkeerde versie met exitcode 0 telt als fout; een waarschuwing over een SQLite-cache gevolgd door
een andere versie is geen geslaagde versiewissel. Reageert pnpm niet binnen 20 s (`PNPM_TIMEOUT_MS`), dan noemt de
melding dat apart in plaats van een ontbrekende pnpm. Deze controle bewijst geen synchronisatie van dependencies.
Voor `pnpm run` en `pnpm exec`
controleert pnpm zelf of de installatie bij de huidige workspace past (`verifyDepsBeforeRun: error` in
`pnpm-workspace.yaml`). Past een verouderde of gekopieerde installatie niet bij de workspace, dan stopt pnpm met
`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` vóór het werkcommando, zonder dependencies automatisch bij te werken. Herstel de installatie expliciet met `pnpm install --frozen-lockfile`
volgens de setup. De regressieproef in `test/scripts/dependency-readiness.test.ts` draait de gepinde pnpm met lokale
fixtures en controleert ook dat een weigering installatiebestanden ongemoeid laat.

## Dagelijks werken binnen de Claude Code-sandbox

Volgens [ADR 0061](template/adr/0061-claude-sandbox-werkstraat.md) selecteert `mise.toml` rechtstreeks de exacte pnpm-versie
uit `package.json`. De bestaande setup installeert die vooraf, zodat de shell en Git-hooks dezelfde pnpm gebruiken.
Er staat geen tweede versienummer in mise en dagelijks werk hoeft geen globale pnpm-cache te wijzigen.
Na een template-update met een andere pin hoort de passende toolchain bij de eenmalige inrichting; een ontbrekende
versie blijft een installatiefout, geen aanleiding om de sandbox uit te zetten.

`autoAllowBashIfSandboxed` staat expliciet aan. De hoofdsessie kan normale wijzigingen stagen en committen en de
huidige featurebranch pushen met `git push origin HEAD`. Deze vorm schrijft geen upstreaminstelling in de
afgeschermde Git-config. Bij PR-aanmaak noemt de hoofdsessie de werkbranch met `--head` en gebruikt zij `--body-file`,
zodat gh geen extra pushkeuze hoeft te vragen. De volledige pre-commit-, commit-msg- en pre-push-hooks blijven draaien.
De [agentdoorloop](operations/agent-doorloop.md#ontwikkelen-en-runnerchecks) beschrijft de overdracht aan CI.

`ask`, `deny`, het rolhek uit main en de verplichte GitHub-checks blijven leidend. Subagents krijgen geen push- of
PR-schrijfrechten; main-push, force, hookoverslaan, PR-merge en zelfreview blijven geweigerd. De bestaande lokale
merge van main en veilige taakbranchopruiming blijven beschikbaar. Geen Git-allowWrite of schrijfbare globale
pnpm-opslag is nodig. Naast de zeven runneruitzonderingen draaien `git commit *`, `git push origin HEAD`, `gh api *`,
`pnpm pr:verify *` en `pnpm meting *` buiten de sandbox, lokaal en in de cloud, en `pnpm pr:log *` onder de ankertoets (ADR 0061 en 0102; zie
[Cloud: commit, push, PR en bewijs](#cloud-commit-push-pr-en-bewijs)). Lefthook en `pr:verify` draaien daardoor code uit de
werkmap zonder sandbox en zonder vraag vooraf; alleen het rolhek vooraf staat ertussen, CI en de eigenaarmerge blijven de
grens (aanvaard restrisico). Dat geldt ook voor `pnpm meting`, dat alleen leest en `gh` start; `METING_GH` kiest welk
programma (`scripts/kit/meting.mjs:306`).

Regressies staan in `test/scripts/mise-pnpm-selection.test.ts`, `test/scripts/toolchain-pnpm-runtime.test.ts`,
`test/rails/claude-sandbox-werkstraat.test.ts` en `test/hooks/rolhek-sandbox-werkstraat.test.ts`.
Configuratietests bewijzen niet dat een native Claude-sessie werkt: de implementatie-PR legt afzonderlijk de
werkelijke versie, prompts, commit-hooks, featurepush, PR-aanmaak en CI vast, in hoofdcheckout én worktree.

## Grens van de sandbox

De Bash-sandbox (`sandbox` in `.claude/settings.json`) kan niet schrijven naar `.claude/settings.json`,
`.claude/settings.local.json`, `.claude/hooks/**` en `.claude/skills/**`. Dat is een grens van Claude Code, niet van deze repo,
en hij geldt lokaal en in de cloud. In de cloud is ook `.claude/agents/**` alleen-lezen (gemeten op 22 november 2026:
`EROFS`; leerpunten #789 en #895). Een wijziging daar gaat alleen via de Edit-tool in de hoofdsessie, met een prompt die de
eigenaar accepteert; het rolhek weigert een developer-subagent op die paden. Een taak die die paden raakt, vraagt dus een
sessie waarin de eigenaar aanwezig is, of de eigenaar voert de wijziging zelf uit. De sandbox ruimer zetten is een
eigenaarsbesluit (beschermd pad, `docs/framework.md` §10).

De sandbox leest `sandbox.excludedCommands` uit de `.claude/settings.json` en `.claude/settings.local.json` van de map waarin
de sessie startte (`CLAUDE_PROJECT_DIR`), niet uit de worktree waarin je werkt, tenzij de sessie daar startte. Het rolhek eist de commit- en pushvorm uit de settings van
`main` (het anker). Loopt die projectmap achter op `main` (een hoofdcheckout met oude settings terwijl je in een worktree
werkt), dan draait ook de geëiste vorm in de sandbox. Session-start meldt die drift ("wijkt af van main in
sandbox.excludedCommands"), en een netwerkvorm-weigering noemt de ontbrekende patronen (spec rolhek-leerpunten/AC-6, AC-7;
`lokaleNetwerkvormen` in `rails/hooks/lib/rolhek-context.mjs`). Settings op gebruikersniveau (`~/.claude/settings.json`) en
managed settings leest het rolhek niet; staat het patroon alleen daar, dan is de melding vals. Zonder `CLAUDE_PROJECT_DIR`
(geen Claude Code-sessie) komt er geen melding. De oplossing is een eigenaarstap: werk de hoofdcheckout bij naar `main`.

1. Eigen terminal, in de hoofdcheckout (de map waarin de sessie startte, zonder openstaande wijzigingen): ga naar `main`
   en haal hem op. Verwacht: `Switched to branch 'main'` en een fast-forward, of `Already up to date`.
2. Start daarna een nieuwe sessie. Verwacht: session-start meldt geen "wijkt af van main" meer.

```bash
git switch main
git fetch origin main
git merge --ff-only origin/main
```

De broncode van de hooks staat daarom in `rails/hooks/`, buiten die grens (ADR 0045 punt 3). In `.claude/hooks/` staan alleen
stubs die de versie van `main` op de remote draaien, uitgepakt in `.claude/hooks/.cache/`: binnen de grens, zodat Bash die code
niet kan vervangen. Wie `rails/hooks/` op een branch wijzigt, verandert de lopende sessie niet. Het anker (de SHA van `main` op de
remote) legt de start van een sessie vast en vraagt netwerk; weigert het rolhek alles met "geen geldig anker", probeer de actie opnieuw (de meethook legt het anker dan meestal vast) of start één sessie
met netwerk.

Het anker staat per werkmap in `.claude/hooks/.cache/main` (een worktree heeft zijn eigen) en wordt, zolang het geldig is, alleen bij de
start van een sessie ververst: nieuw, hervat, na `/clear`, na compactie of bij een fork (`bron` in `.claude/hooks/laden.mjs`).
Tijdens een sessie beweegt het niet mee met `main`. Dat merk je bij `pnpm pr:merge <nummer>` en `pnpm pr:resolve <nummer>`
(ADR 0098; daar eindigt de weigering op "(ADR 0098)"): het rolhek laat ze alleen door als `scripts/`, `rails/` en
de hostbestanden (`package.json`, `.npmrc`, …) in de werkmap gelijk zijn aan de merge-base met het anker (`trustedMerge` in
`rails/hooks/lib/runner-authority.mjs`). Komt er ná de sessiestart een PR op `main` die een van die paden wijzigt, en staat de
werkmap op of voorbij die nieuwe `main`, dan weigert het rolhek met "scripts, rails en hostbestanden … gelijk aan het anker
(ADR 0069)", ook vanaf een schone kopie van `main`. Is de werkmap gelijk aan `origin/main` en loopt alleen het anker achter,
dan zegt de weigering dat ("het anker loopt achter op origin/main", leerpunt #888); een nieuwe sessie, `/clear` of `/compact`
zet het anker opnieuw. Opnieuw proberen helpt niet. Vergelijk het anker met de remote:

1. In de sessie of een eigen terminal, in de root van de werkmap die de weigering gaf (bij een worktree de worktree zelf, niet
   de hoofdcheckout): vraag de remote om `main`. Verwacht: één regel met een SHA en `refs/heads/main`.
2. Zelfde terminal en werkmap: lees het anker. Verwacht: één commit-SHA, zonder regeleinde erachter.

```sh
git ls-remote origin refs/heads/main
cat .claude/hooks/.cache/main
```

Verschillen de twee SHA's, dan loopt het anker achter: start of hervat de sessie met netwerk, zodat de sessiestart het ververst
(zonder netwerk blijft het oude anker staan, zonder melding). Zijn ze gelijk, kijk dan of de branch zelf een van die paden
wijzigt (een beschermd pad: de eigenaar voegt samen), of er lokale of genegeerde bestanden of een symlink onder die paden
staan, of er een `gh`, `git` of `node` in `node_modules/.bin` staat, of `merge` in `.claude/gates.json` in het anker (dus op
`main`) nog `niet-kritiek` is, en of het commando vanuit de repo-root draait.

## Branchnaam

Een cloudsessie start op een branch die het platform kiest (`claude/<naam>`). Een overdracht schrijft daarom geen
branchnaam voor; de PR komt van de opgelegde branch. Is een vaste naam nodig, dan start de eigenaar de sessie op die branch.

## Cloud: commit, push, PR en bewijs

Gemeten op 20 november 2026 (spec `cloud-pr-route`): binnen de Bash-sandbox bereikt een cloudsessie de token-proxy en de
signeerdienst van het platform niet. `gh` geeft dan op elke aanroep 401 en het ondertekenen van een commit faalt. Daarom
draaien vier commando's buiten de sandbox (`sandbox.excludedCommands` in `.claude/settings.json`), plus `pnpm meting *`: de
trend van `pnpm meting --trend` haalt PR's en CI-runs met `gh` op en was in de sandbox altijd "onbekend" (leerpunt #899). Ook
voor `pnpm meting` geldt de netwerkvorm: alleen als los commando, niet in een pipe of keten. De route:

| Stap | Commando | Opmerking |
|---|---|---|
| Commit | `git commit -F <bestand>` | buiten de sandbox; lefthook draait mee, nooit `--no-verify` |
| Push | `git push origin HEAD` | de smalle vorm; `deny` en het rolhek weigeren push naar `main` en force |
| PR openen | `mcp__github__create_pull_request` | `gh pr create` werkt niet in de cloud (GraphQL); Claude Code vraagt de eigenaar één keer per PR (gemeten: één prompt, spec `cloud-pr-route` F10; ADR 0078 punt 4, herzien) |
| Bewijs lezen | `pnpm pr:verify <nummer>`, `gh api "repos/{owner}/{repo}/…"` (endpoint tussen aanhalingstekens) | alleen REST; `gh pr …` en `gh issue …` gebruiken GraphQL en werken niet |

Lokaal blijft `gh pr create --head <branch> --body-file <bestand>` de route (zie Dagelijks werken). Elke handeling met git,
gh en CI per runtime staat in de [receptenkaart](operations/recepten.md) (`node scripts/kit/feiten.mjs recepten`).

Het rolhek weigert, lokaal en in de cloud, voor elke rol een commando dat een patroon uit `excludedCommands` raakt maar er
niet in zijn geheel op past: `git commit -F m 2>&1 | tail`, `git push -u origin <branch>`, `pnpm run test:db`. De reden noemt
de vorm die wel buiten de sandbox draait (`rails/hooks/lib/rolhek.mjs:2601`, spec `cloud-netwerkvorm`). De lijst komt uit
`.claude/settings.json` in het anker (`rails/hooks/lib/rolhek-context.mjs:71`); een wijziging werkt in het rolhek pas na de
merge. Een remote branch verwijder je met `gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/<branch>"` (endpoint tussen aanhalingstekens, zie de receptenkaart); `main` verwijderen
of verzetten via `gh api` is voor elke rol verboden (`rails/hooks/lib/rolhek.mjs:2492`). `mcp__github__push_files`,
`create_or_update_file` en `delete_file` slaan lefthook over: de hoofdsessie krijgt een vraag, een subagent een weigering
(`rails/hooks/lib/rolhek.mjs:115`). Een cloudsessie (`CLAUDE_CODE_REMOTE=true`) toont de route bij de start in één regel
(`rails/hooks/lib/werkstraat.mjs:363`).

Kies bij het starten van de sessie de omgeving uit Opzetten. De omgeving Default heeft geen toolchain:
`node scripts/kit/feiten.mjs` meldt dan `✗ toolchain ontbreekt` en lefthook draait niet. Netwerktoegang heet in de
documentatie van Claude Code **Trusted**; de app toont vermoedelijk hetzelfde niveau als **Limited** (niet gemeten).

Gemeten op 20 november 2026 in een cloudsessie op deze route, met toolchain (spec `cloud-pr-route`, stap 0): een
commit en `git push origin HEAD` slagen zonder prompt en zonder fout van de signeerdienst, met de lefthook-hooks aan (bij
een lege commit slaan de stappen over). `gh api` werkt voor GET, en een POST komt door de authenticatie: een POST naar
`…/pulls` voor een branch met een open PR gaf `HTTP 422` ("A pull request already exists"), geen 401. Een geslaagde
schrijfactie via `gh api` is niet gemeten. Waarom een eerdere POST 401 gaf, is niet
vastgesteld. Of `gh api` lokaal een prompt geeft, is niet gemeten.

## Problemen

- **`✗ toolchain ontbreekt`** (bijvoorbeeld `Node v22…, verwacht 26…` of `node_modules ontbreekt of is onvolledig`): het setup-script is niet
  gedraaid, mislukt of de omgeving is gecachet van vóór het script. Controleer in claude.ai/code dat het veld "Setup script"
  de inhoud van `scripts/cloud-omgeving.sh` heeft en ververs de omgevingscache; in de sessie zelf herstelt
  `bash scripts/cloud-setup.sh` het. Elk probleem in de melding noemt zijn eigen herstel. In een
  gekoppelde worktree (`.git` is een bestand) zonder `node_modules` is dat `node scripts/kit/worktree-install.mjs`: frozen
  install met `--package-import-method=copy` en store, cache en state onder `os.tmpdir()`, binnen de sandbox (een
  bestaande, ook lege of halve map `node_modules` wordt afgemaakt). Het draait vanuit de worktree-root en weigert in de
  hoofdcheckout, als `node_modules` een symlink is en als een van `package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, `.npmrc`, `.pnpmfile.cjs` of `.pnpmfile.mjs` afwijkt van HEAD (gewijzigd, verwijderd of
  untracked; vergeleken op inhoud met HEAD, dus ook bij `--assume-unchanged` of `--skip-worktree`;
  [ADR 0085](template/adr/0085-worktree-installatie-in-de-sandbox.md)); commit of herstel zo'n bestand eerst, of vraag de
  eigenaar. Die weigering is geen beveiligingsgrens: CI en de eigenaarmerge zijn de grens. Open aandachtspunt (niet
  gemeten): hoort een bestaande `node_modules` bij een andere store (andere `TMPDIR` bij een eerdere run, of eerder een
  handmatige `pnpm install`), dan kan pnpm zonder TTY afbreken met een fout over het verwijderen van de modules-map
  (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). Volgende stap: vraag de eigenaar; wis `node_modules` niet zelf en
  voeg geen pnpm-vlag toe. In een cloudsessie (`CLAUDE_CODE_REMOTE=true`) draait het script ook in de hoofdcheckout en geeft
  het zelf `--config.confirm-modules-purge=false` mee: daar herstelt de agent een achterlopende `node_modules` met
  `node scripts/kit/worktree-install.mjs`, want de eigenaar heeft er geen terminal (spec cloud-werkmap-herstel). Node en pnpm blijven bij `scripts/bootstrap.sh`; ook een ontbrekende of ongeldige
  `packageManager`-pin wijst daarheen.
- **`✗ toolchain ontbreekt: pnpm reageert niet binnen 20 s`**, of wisselend falende tests die `feiten.mjs` starten: de
  voorcontrole wacht hoogstens `PNPM_TIMEOUT_MS` op `pnpm --version` (`scripts/kit/toolchain.mjs`). Traag wordt dat
  vooral als de pnpm op `PATH` niet de pin is: dan wisselt pnpm bij elke aanroep eerst van versie, en parallelle wissels
  wachten op elkaar. Controleer met `pnpm --version` in de repo; een melding `Cannot use the pnpm version this project
  pins` of een andere versie dan `packageManager` betekent dat een globale mise-pin (`~/.config/mise/config.toml`) via
  `mise activate` vóór de shims op `PATH` staat. Zet die globale pin gelijk aan `packageManager` en start de terminal of
  editor opnieuw.
- **`! mise install onvolledig`** gevolgd door `✓ <tool> <versie> via terugval`: verwacht in een cloudsessie (zie Terugval).
- **`✗ checksum van … klopt niet`**: de download wijkt af van het checksumbestand van de release; er is niets geïnstalleerd.
  Draai het script opnieuw; blijft het, meld het als leerpunt en ga niet zonder controle verder.
- **`✗ tools uit mise.toml ontbreken, ook na de terugval`**: een tool zonder terugval; voeg een tak toe aan `terugval` in
  `scripts/cloud-setup.sh`.
- **Toolchain installeren vanuit de sessie lukt niet**: in de gemeten sessie met actieve sandbox was `~/.local`
  alleen-lezen (spec `cloud-zelfinstallatie`, M2); `bash scripts/cloud-setup.sh` vanuit de Bash-tool kan de toolchain daar
  dan niet neerzetten. Stel het veld van de omgeving in (Opzetten) en start een nieuwe sessie.
- **`✗ mise ophalen van github.com mislukt`** (of een download van de terugval, `pnpm install`): geen netwerk. Controleer dat netwerktoegang
  op Trusted staat. Meldt curl `Failed to connect to localhost port 3128`, dan antwoordt de proxy uit `HTTPS_PROXY` niet.
- **Proxy in de Bash-tool**: het setup-script draait in een ander proces dan de sandboxed Bash-tool van de sessie. Dat het
  script slaagt, bewijst niet dat de Bash-tool het netwerk bereikt; controleer beide (zie Eerst controleren).
- **`bash: scripts/cloud-setup.sh: No such file or directory`, exit 127** bij "Setup script": het veld bevat
  `bash scripts/cloud-setup.sh`, maar het script van de omgeving start in de map boven de clone, waar dat pad niet bestaat.
  Zet in het veld de inhoud van `scripts/cloud-omgeving.sh` (zie Opzetten). Op 19 november 2026 startte de sessie daarna
  toch, zonder toolchain (Node 22, geen pnpm).
- **`✗ scripts/cloud-setup.sh niet gevonden onder <map>`**: de gekozen repo heeft geen `scripts/cloud-setup.sh`, of de clone
  staat dieper dan één map onder de startmap.
- **`✗ node op PATH is <versie>, verwacht <pin>`**: geen van de drie routes naar `PATH` werkt (zie Wat het script doet):
  `~/.local/bin` staat niet vóór de systeem-node, `CLAUDE_ENV_FILE` is niet gezet of niet te schrijven en `~/.bashrc` ook
  niet. Controleer `echo "$PATH"` en `ls -l ~/.local/bin/node`; `mise exec -- <commando>` werkt in de tussentijd wel.
- **`! ~/.local/bin staat niet vóór de systeem-node: hooks en git-hooks blijven op <versie>`**: de Bash-tool krijgt de
  gepinde Node via `CLAUDE_ENV_FILE` of `~/.bashrc`, maar hooks en git-hooks niet. Een hook die `✗ toolchain ontbreekt`
  meldt, slaagt dan via `mise exec --`.
- **`! bubblewrap en socat niet geïnstalleerd (apt-get exit <code>); de kooi kan niet starten`**: de sessie werkt, maar
  tests die de kooi nodig hebben slaan lokaal over (`⚠`). Draai het script opnieuw als de pakketbron weer bereikbaar is.
- **Startmelding over de sandbox**: verwacht in een cloudsessie. De melding zegt dat de sessie zonder Bash-sandbox
  start, maar in een sessie op de omgeving uit Opzetten was de sandbox wel actief: `~/.local` en de map boven de repo
  waren alleen-lezen voor de Bash-tool (spec `cloud-zelfinstallatie`, M2). Ga uit van `node scripts/kit/feiten.mjs`, niet
  van de melding. De melding luidt:
  `sandbox.failIfUnavailable is set, but this session runs in Anthropic's cloud container, which has no command sandbox […] Commands run without a sandbox`. Wanneer een sessie geen sandbox claimt, staat onder Minimale Claude Code-versie (`⚠ bewaking niet
  actief`).
- **`HTTP 401: Bad credentials`** op elke `gh`-aanroep, met `echo "$GH_TOKEN"` gelijk aan `proxy-injected`: `gh` draait
  binnen de Bash-sandbox en bereikt de token-proxy niet. Alleen `gh api` staat buiten de sandbox; gebruik dat (zie
  [Cloud: commit, push, PR en bewijs](#cloud-commit-push-pr-en-bewijs)).
- **`HTTP 403: GitHub GraphQL is not available from Claude Code sessions; use the REST API`**: `gh pr …` en
  `gh issue …` gebruiken GraphQL, dat de GitHub-proxy weigert. Lees via `gh api` (REST) of `pnpm pr:verify`, open een PR
  met `mcp__github__create_pull_request`.
- **`environment-runner code-sign` … `connection refused`, dan `fatal: failed to write commit object`**: de commit draaide
  binnen de sandbox en bereikt de signeerdienst niet. Controleer dat `git commit *` in `sandbox.excludedCommands` staat
  en dat de sessie op een branch met die regel startte.
- **Sandbox uitzetten** is bewust geen standaard: `.claude/settings.json` blijft `sandbox` aan houden. Wie dat toch wil, doet dat per
  omgeving buiten de repo en met eigenaarakkoord (beschermd pad, `docs/framework.md` §10).
