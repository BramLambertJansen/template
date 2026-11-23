---
status: goedgekeurd
namespace: cloud-zelfinstallatie
---

# Cloudomgeving: één setup voor elke repo

## Doel

Wie op claude.ai/code deze repo of een app uit de template kiest, krijgt een sessie met de toolchain uit `mise.toml`, na
één keer instellen per account in plaats van per repo, en zonder dat één geweigerde stap de hele setup stopt.

## Aanleiding en gemeten feiten

Aanleiding (framework §1): op 19 november 2026 startte een cloudsessie op deze repo zonder toolchain, twee keer achter
elkaar om een andere reden. Elke regel hieronder noemt zijn bron; wat niet gemeten is, staat onder "Niet gemeten".

**Gemeten in de sessie van de eigenaar (schermafbeelding en melding van die sessie, 19 november 2026)**

| # | Feit | Bron |
|---|---|---|
| F1 | Het setup-script van de omgeving, `bash scripts/cloud-setup.sh`, eindigt met `bash: scripts/cloud-setup.sh: No such file or directory`, exit 127: het draait in de map bóven de clone. | startscherm; de sessie bevestigde het na `get environment` |
| F2 | Na het mislukte setup-script start Claude Code toch ("Started Claude Code"); de sessie heeft dan Node v22.23.5 en geen pnpm 11.28.2. | startscherm, melding van de sessie |
| F3 | Met de hand gedraaid vanuit de Bash-tool stopt het script op `scripts/cloud-setup.sh:123` (`touch "$HOME/.bashrc"`): `Read-only file system`. mise staat dan al in `/root/.local/bin`; `mise trust`, `mise install` en `pnpm install` zijn niet gedraaid. | melding van de sessie |
| F4 | `git status` toont in die sessie de ongetrackte paden `.bash_profile`, `.bashrc`, `.claude/commands` en `.claude/launch.json` (voorbeeld): de plaatshouders van de Bash-sandbox (ADR 0084). | melding van de sessie, `rails/hooks/lib/sandbox-plaatshouders.mjs` |
| F5 | De startmelding zegt tegelijk: `sandbox.failIfUnavailable is set, but this session runs in Anthropic's cloud container, which has no command sandbox […] Commands run without a sandbox`. | startscherm |
| F13 | In een andere cloudsessie van dezelfde dag, mét geïnstalleerde toolchain, draaien de pre-commit-hook en de Stop-hook op de Node 22 en pnpm uit `/opt/node22`: de mise-shims staan niet op het `PATH` van hooks. De Stop-hook meldt `toolchain ontbreekt: Node v22.23.5`; via `mise exec --` slagen de hooks. | melding van die sessie |
| F14 | In die sessie kan de Bash-tool niet schrijven in `/root/.local/share/pnpm` (alleen-lezen). | melding van die sessie |

F4 en F14 spreken F5 tegen; zie M2. F13 laat zien dat `~/.bashrc` hooks niet bereikt: alleen een map die al op `PATH` staat doet dat.

**Gemeten in een tweede cloudsessie (zelfde dag, verse clone van `main` op `bcc2541`, andere netwerkinstelling)**

| # | Feit | Meting |
|---|---|---|
| F6 | Zonder Node 26 breekt het script af bij de terugval voor node (`nodejs.org` gaf daar 403; die host staat wel op de lijst van Trusted, zie D7). Eén geweigerde download stopt alles. | `bash scripts/cloud-setup.sh`, exit 22 na 1 min 8 s (inclusief `apt-get update`) |
| F7 | Met Node 26.11.1 aanwezig slaagt het hele script: `mise install` faalt op de GitHub-API (403), de terugval levert pnpm, dbmate, betterleaks en osv-scanner, daarna `pnpm install` (18,1 s), lefthook en de slotcontrole. | exit 0 na 1 min 37 s |
| F8 | Een tweede run verandert niets en vraagt het netwerk niet. | exit 0 na 2,8 s, geen 403 in de uitvoer |
| F9 | Alleen de voorcontrole uit `scripts/kit/toolchain.mjs` duurt 0,64 s. | `mise exec -- node -e …toolchainProbleemIn` |
| F10 | `bubblewrap` en `socat` staan niet in de VM; `apt-get` installeert ze. | uitvoer van de eerste run |
| F11 | Het standaard-`PATH` is `…:/root/.local/bin:/root/.cargo/bin:/usr/local/go/bin:/opt/node22/bin:…`: `~/.local/bin` staat vóór de voorgeïnstalleerde Node 22. | `echo $PATH` vóór het script |
| F12 | `node scripts/kit/feiten.mjs` meldt in die sessie `⚠ bewaking niet actief`: geen meting, map boven de repo schrijfbaar. Die sessie koppelde de repo pas na de start; ze zegt dus niets over een sessie die met de repo begint. | `feiten.mjs` |

**Uit de documentatie van Claude Code (gelezen 19 november 2026)**

| # | Feit | Bron |
|---|---|---|
| D1 | Het setup-script staat in de omgeving op claude.ai/code, niet in de repo; het draait vóór Claude Code start, als root, alleen in de cloud. Het veld neemt ook de tekst van een bestand tot 64 KB over ("Choose file"). | [cloud-environments, Setup scripts](https://code.claude.com/docs/en/cloud-environments#setup-scripts) |
| D2 | Klaar binnen ongeveer vijf minuten: de schijf wordt als momentopname hergebruikt en het script draait niet opnieuw, tot het script of de toegestane hosts wijzigen of de cache na ongeveer zeven dagen verloopt. | idem, Environment caching |
| D3 | De documentatie zegt dat een setup-script met een andere exitcode dan 0 de sessie tegenhoudt. F2 laat het tegendeel zien. | idem, Script requirements |
| D4 | SessionStart-hooks uit `.claude/settings.json` van de repo draaien in een cloudsessie met één repository, na de start van Claude Code, bij elke sessie (ook hervat). Niet in een sessie met meerdere repositories en niet in een cloud-thread van een Project; die laatste laadt alleen `CLAUDE.md`, `.claude/CLAUDE.md` (voorbeeld) en `.claude/rules/`. | idem, Setup scripts vs. SessionStart hooks; What carries over |
| D5 | Een SessionStart-hook houdt de sessie nooit tegen; stdout bij exit 0 komt in de context. De hooks van één gebeurtenis draaien parallel. `timeout` is in seconden, standaard 600 voor een `command`-hook. | [hooks, SessionStart](https://code.claude.com/docs/en/hooks) |
| D6 | Een SessionStart-hook krijgt `CLAUDE_ENV_FILE`; `export`-regels daarin gaan vóór elk later Bash-commando. `CLAUDE_CODE_REMOTE` is `true` in de cloud en lokaal nooit. `CLAUDE_PROJECT_DIR` is de root van het project. | idem; cloud-environments |
| D7 | Voorgeïnstalleerd: Node 20, 21 en 22 (22 op `PATH`). Netwerk Trusted laat onder meer `nodejs.org`, de npm-registry en GitHub toe; Full laat alles toe. | cloud-environments, Installed tools, Access levels |
| D8 | Cloudsessies starten sinds een recente versie ondanks `sandbox.failIfUnavailable`. | [changelog](https://code.claude.com/docs/en/changelog) |
| D9 | Omgevingen zijn van het account, niet van een repo; de kiezer bij het starten bepaalt welke geldt. `remote.defaultEnvironmentId` zet de standaard voor sessies vanuit de CLI, ook vanuit de projectinstellingen van een repo. | cloud-environments, Select an environment from the CLI |

**Uit deze repo**

| # | Feit | Bron |
|---|---|---|
| R1 | De hooks in `.claude/hooks/` zijn stubs die `rails/hooks/` draaien zoals die op `main` van de remote staat. Een gewijzigde hook werkt dus pas na de samenvoeging. | ADR 0045 punt 3, `.claude/hooks/laden.mjs` |
| R2 | Hooks draaien buiten de Bash-sandbox (gemeten op 4 november 2026, lokaal). | ADR 0082, Context |
| R3 | Op 3 november 2026 draaiden in twee cloudsessies zonder setup-script de projecthooks en de sandbox niet. | leerpunt #462, spec bewaking-zichtbaar |
| R4 | `werkstraat session-start` heeft een timeout van 30 s en draait `scripts/doctor.sh --quick`. | `.claude/settings.json:177`, `rails/hooks/lib/werkstraat.mjs` |
| R5 | `docs/ENVIRONMENT.md` schrijft als setup-script "precies" `bash scripts/cloud-setup.sh` voor en zegt dat een sessie zonder bubblewrap faalt met `Sandbox required but unavailable`. Beide kloppen niet meer (F1, F5, D8). | `docs/ENVIRONMENT.md:10`, `docs/ENVIRONMENT.md:27`, `docs/ENVIRONMENT.md:211` |
| R6 | ADR 0085 wees "installeren vanuit een SessionStart-hook buiten de sandbox" af: lifecycle-scripts en pnpm-configuratie komen uit een werkmap die de agent beschrijft, de hook draait ook bij hervatten, en het botst met 0061 ("normale sessies vragen geen nieuwe toolchaininstallatie"). R-TOOL-01 legt de toolchain bij de eigenaar. | `docs/template/adr/0085-worktree-installatie-in-de-sandbox.md:37`, `docs/template/adr/0061-claude-sandbox-werkstraat.md:60`, `docs/framework.md:255` |
| R7 | `scripts/cloud-setup.sh` voert zelf configuratie uit de werkmap uit: `mise trust` en `mise install` op `mise.toml`, `pnpm install`, lefthook uit `node_modules` en een import van `scripts/kit/toolchain.mjs`. | `scripts/cloud-setup.sh:98`, `:126`, `:130`, `:144`, `:146` (vóór de bouw-PR) |
| R8 | Zonder geldig anker start `rails/hooks/werkstraat.mjs` niet: de lader weigert met exit 2. De hooks starten `node` via `PATH`. | `.claude/hooks/laden.mjs:284`, `.claude/settings.json:165` |

**Niet gemeten; eerst meten (Testplan, stap 1; M4 hoort bij de vervolgspec)**

- **M1** — Draaien de projecthooks in een verse cloudsessie die met deze ene repo start? D4 zegt ja, R3 mat nee. De
  startmelding van 19 november ("Sessie gestart op branch …") lijkt op de uitvoer van `werkstraat session-start`, maar dat is
  een aanwijzing, geen meting.
- **M2** — Is de Bash-sandbox in zo'n sessie actief (F4) of niet (F5)? En mag een commando uit de Bash-tool schrijven in
  `~/.local`, `~/.cache` en `/usr/local/bin`?
- **M3** — Staat `~/.local/bin` in een sessie van de eigenaar ook vóór `/opt/node22/bin` op `PATH` (F11 komt uit een
  andere sessiesoort)? En krijgen hooks en git-hooks datzelfde `PATH`? F13 zegt alleen dat de shims er niet op staan.
- **M4** — Krijgt een SessionStart-hook in de cloud een `CLAUDE_ENV_FILE`, en mag hij `~/.bashrc` schrijven?
- **M5** — Hoe lang duurt het hele script koud in een omgeving met Trusted, inclusief Node van `nodejs.org`? F6 en F7
  samen geven een ondergrens van ruim twee minuten.
- **M6** — Bevat een sessie die uit de cache van de omgeving start (D2) de `node_modules` van de repo, of alleen wat
  buiten de clone staat? En deelt één omgeving haar cache over meerdere repo's?

**Uitslag van de metingen (19 november 2026, verse sessie van de eigenaar op de omgeving met `scripts/cloud-omgeving.sh`)**

| # | Uitslag | Meting |
|---|---|---|
| M1 | De projecthooks draaien. | `.git/agent-meting/` bevat een meting en `.claude/hooks/.cache/` bevat `main` en een uitgepakte commit; `feiten.mjs` geeft geen `⚠ bewaking niet actief` |
| M2 | De Bash-sandbox is actief: `~/.local` en de map boven de repo zijn alleen-lezen voor de Bash-tool. F5 beschrijft deze sessies dus niet. | `command -v bwrap` geeft `/usr/bin/bwrap`; `touch "$HOME/.local/proef"` en `touch ../proef` geven `Read-only file system` |
| M3 | Voor de Bash-tool staat `/root/.local/bin` vóór `/opt/node22/bin`; `node` is v26.11.1 en `pnpm` 11.28.2 via de koppelingen, die naar `…/mise/installs/node/26.11.1/bin/node` en `…/mise/installs/pnpm/11.28.2/pnpm` wijzen. De shims-map staat niet op `PATH`. | `echo "$PATH"`, `type -a node`, `ls -l ~/.local/bin/node ~/.local/bin/pnpm` |
| M6 | In de eerste sessie na het instellen staat `node_modules` er en geeft `feiten.mjs` geen `✗ toolchain ontbreekt`. | `ls node_modules/.modules.yaml`, `node scripts/kit/feiten.mjs fase` |

Nog niet gemeten: op welke Node hooks en git-hooks draaien (M3, tweede helft), de koude duur (M5), en of een sessie uit de
cache `node_modules` bevat en of de cache over repo's gedeeld wordt (M6). M4 hoort bij een vervolgspec.

## Rollen en wie wat ziet

Geen app-gebruikers. De eigenaar ziet op het startscherm of het setup-script slaagde; de sessie ziet de uitslag via
`node scripts/kit/feiten.mjs`.

## Kopieer de vorm van

- `test/scripts/cloud-setup.test.ts` — het script met stubs voor `mise`, `curl` en `apt-get` op `PATH`, zonder netwerk
- `scripts/bootstrap.sh` — een setup-script dat per stap een leesbare regel met herstel geeft
- `test/docs/start-nieuwe-app.test.ts` — een docstest op letterlijke tekst in de setup-documentatie

## Hergebruik en UX

Geen UI. Zichtbare tekst, letterlijk:

- Route overgeslagen: `! ~/.bashrc niet te schrijven; PATH loopt via <route>` (met `~/.local/bin` of `CLAUDE_ENV_FILE`).
- Geen route: `✗ node op PATH is <versie>, verwacht <pin>: ~/.local/bin staat niet vóór de systeem-node en CLAUDE_ENV_FILE
  en ~/.bashrc zijn niet te schrijven → zie docs/ENVIRONMENT.md, Problemen`.
- Alleen route 2 of 3: `! ~/.local/bin staat niet vóór de systeem-node: hooks en git-hooks blijven op <versie>`.
- Systeempakketten: `! bubblewrap en socat niet geïnstalleerd (apt-get exit <code>); de kooi kan niet starten`.
- Omgevingsbestand, niets gevonden: `✗ scripts/cloud-setup.sh niet gevonden onder <map>`.
- Omgevingsbestand, per repo: `→ <map>/scripts/cloud-setup.sh`, daarna de uitvoer van dat script.

## Ontwerp

**Wat deze spec bouwt.** Vier dingen, alle zonder wijziging aan hooks, permissies of het regelboek.

1. **Eén omgeving voor elke repo uit de template.** `scripts/cloud-omgeving.sh` is de tekst voor het veld "Setup script"
   van een omgeving (D1). Het zoekt `scripts/cloud-setup.sh` onder de map waarin het start (F1) en draait elk gevonden
   script. Er staat geen repo-naam in. De eigenaar laadt het één keer in één omgeving en kiest die omgeving voortaan
   (D9); elke repo uit de template installeert zich daarna vóór de start. Of dat ook geldt als de omgeving al een
   cache van een andere repo heeft, is niet gemeten (M6): deelt de omgeving haar cache over repo's, dan wordt het één
   omgeving per repo met hetzelfde bestand, en blijft alleen het bestand gedeeld.
2. **Het script stopt niet meer op één route naar `PATH`.** Drie routes, in deze volgorde:
   - koppelingen `~/.local/bin/node` en `~/.local/bin/pnpm` naar het pad dat `mise which` geeft, dus naar de binaire
     zelf en niet naar een mise-shim: een shim weigert in een map met een niet-vertrouwde `mise.toml`, en de hooks starten
     `node` via `PATH` (R8);
   - een `export PATH=`-regel in `CLAUDE_ENV_FILE`, als die variabele gezet is (D6);
   - dezelfde regel in `~/.bashrc`.

   In die regel staat `$HOME/.local/bin` vóór de shims-map, zodat de koppeling ook daar wint. Alleen de eerste route
   bereikt hooks en git-hooks (F13); de andere twee gelden voor de Bash-tool.

   Een route die niet te schrijven is, geeft een `!`-regel en geen fout (F3). Het script faalt alleen als de eerste route
   met het `PATH` van vóór zijn eigen aanpassing niet de gepinde Node geeft én geen van de andere twee geschreven is.
3. **`bubblewrap` en `socat` blijven een stap, maar zijn niet meer fataal.** De sessie start zonder (F5, D8); de kooi meldt
   zelf dat bubblewrap ontbreekt (`scripts/kit/kooi.mjs:15`).
4. **De documentatie zegt wat er gemeten is.** `docs/ENVIRONMENT.md` krijgt de nieuwe opzet, F1 en F5.

**Wat deze spec niet bouwt: nul handwerk via de repo.** Dat een verse sessie zich installeert zonder dat er ooit een omgeving
is ingesteld, kan alleen via een SessionStart-hook (D4) of doordat de sessie het zelf doet. Beide botsen met geldende
besluiten (R6) en hangen aan metingen die er niet zijn (M1, M2). Ze zijn daarom een besluit van de eigenaar (OV-1, OV-2) en
een eigen spec met ADR. Wat die spec moet oplossen, is uit de spec-review al bekend:

| Punt | Waarom | Bron |
|---|---|---|
| De hook draait als root, buiten de sandbox, en voert configuratie uit de werkmap uit, ook als hij het script zelf van het anker neemt | het script leest `mise.toml`, de pnpm-configuratie en `node_modules` van de branch | R2, R7, R6 |
| Na `/clear`, compactie of hervatten is de werkmap door de agent beschreven | de matcher van SessionStart dekt die alle | `.claude/settings.json:177` |
| De hook kan niet zien of de toolchain ontbreekt zonder code uit de werkmap te laden | de voorcontrole staat in `scripts/kit/`, de lader pakt alleen `rails/hooks/` uit; de hook zelf draait op de Node van `PATH` | `.claude/hooks/laden.mjs:104`, `scripts/kit/toolchain.mjs:120` |
| Zonder anker draait de hook niet en komt er geen regel in de context | de lader weigert | R8 |
| Hookcode moet op Node 22 draaien, CI toetst alleen 26 | een koude VM heeft Node 22 | F2, D7 |
| Een afgebroken run laat `mise`, `pnpm` en `apt-get` doorlopen | een timeout stopt alleen het bovenste proces | `rails/hooks/lib/run.mjs:27` |
| De timeout van SessionStart is 30 s en het script duurt koud minuten | | R4, F6, F7, M5 |

In de cloud weegt het eerste punt anders dan lokaal: ingang 1 hierboven draait hetzelfde script ook als root, vóór de
sessie, op de configuratie van de gekozen branch. Een hook die alleen bij `startup` installeert, op een verse clone, voegt
daar niets aan toe; een hook die dat ook bij hervatten doet wel. Dat is de afweging voor OV-1.

## Acceptatiecriteria

- **cloud-zelfinstallatie/AC-1** — Gegeven een `$HOME` waarin `.bashrc` een koppeling is naar een pad in een map die niet
  bestaat, en een start-`PATH` waarop `$HOME/.local/bin` vóór elke andere `node` staat, wanneer `scripts/cloud-setup.sh`
  draait, dan eindigt het met exit 0 en bevat de uitvoer `! ~/.bashrc niet te schrijven; PATH loopt via ~/.local/bin`. De regel
  noemt de eerste route in de volgorde van het ontwerp die wel werkt.
  Faalt op de huidige code (F3). Toets: `test/scripts/cloud-zelfinstallatie.test.ts`
- **cloud-zelfinstallatie/AC-2** — Na een geslaagde run zijn `$HOME/.local/bin/node` en `$HOME/.local/bin/pnpm` symbolische
  koppelingen naar precies het pad dat `mise which node` en `mise which pnpm` geven, en niet naar een pad onder de
  shims-map van mise. Een tweede run laat ze ongemoeid; geeft `mise which` daarna een ander pad, dan wijzen ze na de run
  naar dat pad. Een bestaand gewoon bestand op die plek wordt niet overschreven, en een lege of mislukte `mise which`
  maakt geen koppeling: het script geeft dan een `!`-regel en telt de route als niet geschreven. De test breidt de mise-stub
  uit met `which`, naar een node-stub die de versie van `mise current node` geeft. Toets: `test/scripts/cloud-zelfinstallatie.test.ts`
- **cloud-zelfinstallatie/AC-3** — Gegeven `CLAUDE_ENV_FILE` wijst naar een bestand, wanneer het script slaagt, dan bevat dat
  bestand precies één `export PATH=`-regel met `$HOME/.local/bin` vóór de shims-map, ook na een tweede run, en blijven andere
  regels in dat bestand staan; zonder de variabele maakt het script geen bestand aan. De regel die het script aan `~/.bashrc` toevoegt heeft dezelfde
  volgorde. Toets: `test/scripts/cloud-zelfinstallatie.test.ts`
- **cloud-zelfinstallatie/AC-4** — Gegeven een start-`PATH` zonder `$HOME/.local/bin`, geen `CLAUDE_ENV_FILE` en een
  `.bashrc` als in AC-1, wanneer het script klaar is met installeren, dan eindigt het met exit 1 en de tekst
  `✗ node op PATH is` met de gevonden versie en de versie van `mise current node`. Met dezelfde opstelling en een schrijfbare `.bashrc` eindigt
  het met exit 0 en de regel `! ~/.local/bin staat niet vóór de systeem-node: hooks en git-hooks blijven op <versie>`
  (F13). Toets: `test/scripts/cloud-zelfinstallatie.test.ts`
- **cloud-zelfinstallatie/AC-5** — Gegeven `apt-get update` of `apt-get install` eindigt met een fout, wanneer het script draait, dan bevat de
  uitvoer `! bubblewrap en socat niet geïnstalleerd (apt-get exit`, draaien de latere stappen en bepalen die de exitcode.
  Faalt op de huidige code. Toets: `test/scripts/cloud-zelfinstallatie.test.ts`
- **cloud-zelfinstallatie/AC-6** — Gegeven een map met `<a>/scripts/cloud-setup.sh` en `<b>/scripts/cloud-setup.sh`, wanneer
  `scripts/cloud-omgeving.sh` in die map start, dan draait het beide, gesorteerd met `LC_ALL=C`, elk met een regel
  `→ <pad>` ervoor, en is de exitcode die van het eerste script dat faalt, anders 0; een script in `node_modules` of dieper
  dan `<naam>/scripts/` telt niet. Start het in de root van een repo, dan draait het `./scripts/cloud-setup.sh` van die
  repo. Vindt het niets, dan eindigt het met exit 1 en
  `✗ scripts/cloud-setup.sh niet gevonden onder <map>`. Het bestand noemt geen repo-naam en is kleiner dan 64 KB.
  Faalt op de huidige opzet (F1). Toets: `test/scripts/cloud-omgeving.test.ts`
- **cloud-zelfinstallatie/AC-7** — `docs/ENVIRONMENT.md` noemt onder "Opzetten" het bestand `scripts/cloud-omgeving.sh` als
  inhoud van het veld, één omgeving voor alle repo's uit de template, en nergens meer `bash scripts/cloud-setup.sh` als
  tekst voor dat veld. De tabel "Wat het script doet" noemt de drie routes naar `PATH`. De regel en het probleem over
  `Sandbox required but unavailable` zijn vervangen door de startmelding uit F5, en "Problemen" noemt exit 127 met de
  oorzaak uit F1. `README.md` (Cloud) en de kopcommentaar van `scripts/cloud-setup.sh` zeggen hetzelfde.
  Toets: `test/docs/cloud-zelfinstallatie.test.ts`

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Omgeving met één repo | het omgevingsbestand vindt één script |
| Sessie met meerdere repo's uit de template | elk script draait (AC-6); de koppelingen in `~/.local/bin` wijzen naar de laatste; `mise exec` blijft per repo juist en `feiten.mjs` meldt een verschil in pin |
| Repo zonder `scripts/cloud-setup.sh` in dezelfde omgeving | exit 1 met de tekst "niets gevonden"; op 19 november startte de sessie dan toch (F2), de documentatie zegt van niet (D3) |
| Script met de hand in de sessie, `.bashrc` alleen-lezen | AC-1 |
| `~/.local/bin` niet op `PATH` (M3 valt anders uit) | route 2 of 3; faalt alleen als die er ook niet zijn (AC-4) |
| Pin in `mise.toml` of `package.json` wijzigt | de volgende run zet de koppelingen om (AC-2); tot dan meldt `feiten.mjs` `✗ toolchain ontbreekt` |
| Sessie start uit de cache zonder `node_modules` (M6) | `feiten.mjs` meldt het; herstel is `bash scripts/cloud-setup.sh`, 18 s voor `pnpm install` (F7) |
| Omgeving met een cache van een andere repo (M6) | niet gemeten; zie Ontwerp punt 1 |
| Lokaal (WSL) | geen wijziging: `scripts/bootstrap.sh` blijft de weg en roept dit script niet aan |

## Raakt ook

- `scripts/**` staat op `voorReview`, `test/**` op `gate` (`.claude/gates.json`): geen kritiek werk, de eigenaar voegt samen.
  Geen wijziging aan `.claude/settings.json`, `rails/hooks/**`, `docs/framework.md` of een ADR.
- `test/scripts/cloud-setup.test.ts`: de bestaande tests blijven groen; de opstelling zet `$HOME/.local/bin` nu niet op
  het start-`PATH` (`test/scripts/cloud-setup.test.ts:102`), dus de nieuwe tests krijgen een eigen opstelling.
- De hooks en git-hooks starten `node` via `PATH` (`.claude/settings.json:165`). Met de koppeling draaien ze in de cloud
  op Node 26 in plaats van 22, zoals CI; dat herstelt F13. Tijdens een herhaalde run met terugval is de koppeling kort
  kapot (`scripts/cloud-setup.sh:81` wist de doelmap eerst).
- `pnpm ratchet` (check-docs: paden en links), `pnpm test:unit`, `pnpm lint`, `pnpm format:check`.
- `CHANGELOG.md` en `docs/template-changelog.md`: een app neemt dit over met een template-update en stelt daarna zijn
  omgeving opnieuw in.
- `docs/roadmap.md`: zie OV-4.

## Buiten scope

- Installeren via een SessionStart-hook, en een sessie die de setup draait zonder te vragen: zie Ontwerp en OV-1, OV-2.
- Of de sandbox en het rolhek in de cloud afschermen (#462, spec bewaking-zichtbaar). Deze spec maakt de toolchain
  aanwezig; ze claimt geen bewaking.
- Een Project-thread: daar draait geen hook uit de repo (D4); het omgevingsbestand werkt er wel.
- Een andere bron voor Node. In de tweede sessie was `node-linux-x64@26.11.1` uit de npm-registry de enige bereikbare
  bron (sha512 uit de registry); onder Trusted is `nodejs.org` bereikbaar (D7).
- De omgeving zelf vanuit de repo aanmaken of vullen: daar is geen route voor (D1).
- Een eigen basisimage, een zelfgehoste omgeving, of de lokale stack in de cloud.

## Testplan

**Stap 0 — nu, zonder code.** De eigenaar zet in het veld "Setup script" van zijn omgeving de tekst uit de PR-beschrijving
(het omgevingsbestand in zijn eerste vorm) en start een nieuwe sessie. Verwacht: "Setup script" groen en
`node scripts/kit/feiten.mjs` zonder `✗ toolchain ontbreekt`. Dit herstelt F1; F3 doet zich dan niet voor, omdat het
script vóór de sessie draait.

**Stap 1 — meten in die sessie**, uitslag in de PR-beschrijving:

1. M3: `echo "$PATH"` en `type -a node`; en na een commit en het einde van een beurt: draaien de pre-commit-hook en
   de Stop-hook nog op Node 22 (F13)?
2. M2: `command -v bwrap`, `touch "$HOME/.local/proef"`, `touch ../proef`, `grep -c ' ro,' /proc/self/mountinfo`.
3. M1: `ls .git/agent-meting .claude/hooks/.cache` na een paar tool-aanroepen.
4. M5: de duur van "Setup script" op het startscherm.
5. M6: een tweede nieuwe sessie op dezelfde omgeving; `ls node_modules/.modules.yaml` en of "Setup script" is overgeslagen.

**Stap 2 — bouwen** (AC-1 tot en met AC-7): unit-tests met stubs zoals de bestaande, daarna dezelfde proef als stap 0 met
het bestand uit de repo, en één keer `bash scripts/cloud-setup.sh` met de hand in een sessie zonder ingestelde omgeving
(F3 mag zich niet herhalen).

**Stap 3 — een app.** Een nieuwe app uit de template (`START-NIEUWE-APP.md`) in dezelfde omgeving: zelfde uitslag zonder
iets in te stellen.

De uitslag van stap 0 en 1 staat in de PR vóór de samenvoeging: M3 en M6 kunnen punt 1 en 2 van het ontwerp wijzigen.

Elke negatieve test faalt op de huidige code (R-PRINC-04).

## Open vragen

OV-1 t/m OV-4 besloten volgens de aanbeveling (eigenaar, 23 november 2026): geen hook die in de cloud zelf installeert, de vraag
van OV-2 vervalt, `bubblewrap` en `socat` blijven niet-fataal, en het roadmap-item onder Besluiten is daarmee afgehandeld.

- **OV-1** — Komt er daarna een hook die in de cloud zelf installeert (nul handwerk)? Opties: (a) nee, één omgeving per
  account volstaat; (b) ja, alleen bij `startup` in de cloud, met een ADR dat 0085 (afgewezen alternatief) en 0061 herziet;
  (c) ja, bij elke sessiestart. Aanbeveling na de metingen: (a). De hooks draaien (M1), dus (b) kan, maar de omgeving
  levert de toolchain al en (b) vraagt een herziening van twee ADR's; (c) niet, om de reden waarom 0085 het afwees.
- **OV-2** — Mag een cloudsessie `bash scripts/cloud-setup.sh` draaien zonder het te vragen als `feiten.mjs`
  `✗ toolchain ontbreekt` meldt? Dat wijzigt R-TOOL-01 en claude-sandbox-werkstraat/AC-12 (drempel A3). Aanbeveling: ja,
  alleen met `CLAUDE_CODE_REMOTE=true`, in dezelfde vervolgspec als OV-1: de VM is wegwerpbaar en het script is hetzelfde
  als wat het omgevingsbestand draait. Aanbeveling na de metingen: de vraag vervalt. In de gemeten sessie is de sandbox
  actief en `~/.local` alleen-lezen voor de Bash-tool (M2); een sessie kan de toolchain daar niet installeren, met of
  zonder akkoord. Op 19 november kwam mise eerder die dag wel in `/root/.local/bin` (F3); dat verschil is niet verklaard.
- **OV-3** — Blijven `bubblewrap` en `socat` in het script nu de sessie zonder start? Aanbeveling: ja, niet-fataal (punt 3):
  de kooi (ADR 0072) heeft bubblewrap nodig en in de cache kost de stap niets.
- **OV-4** — Komt hier een roadmap-item voor (R-PRINC-08)? Aanbeveling: ja, één item dat naar deze spec wijst; de
  aanleiding is het incident van 19 november. De eigenaar kiest de plek.
