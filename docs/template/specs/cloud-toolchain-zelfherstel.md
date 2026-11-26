---
status: goedgekeurd
namespace: cloud-toolchain-zelfherstel
---

# Cloud: de toolchain herstelt zichzelf na een pin-bump

## Doel

Een nieuwe cloudsessie op claude.ai/code start met de Node, pnpm en `node_modules` die de branch vraagt, ook als de
omgevingscache van vóór een verhoging van een pin is, zonder dat de eigenaar het veld "Setup script" hoeft te wijzigen.

## Aanleiding en gemeten feiten

Aanleiding (framework §1): op 25 november 2026 meldden cloudsessies op de omgeving "template"
`✗ toolchain ontbreekt: Node v26.11.1, verwacht 26.13.0 …; pnpm 11.28.2, verwacht exact 12.21.0`. Dit herziet het besluit
over OV-1 van [cloud-zelfinstallatie](cloud-zelfinstallatie.md) (optie a, 23 november): de eigenaar koos op 25 november
optie (b), een hook die alleen bij `startup` in de cloud installeert ([ADR 0112](../adr/0112-cloud-toolchain-herstel-bij-startup.md)).
Feiten F1–F14, D1–D9, R1–R8 en M1–M6 staan in die spec en gelden hier ook; hieronder alleen wat nieuw is.

**Gemeten in een cloudsessie (25 november 2026)**

| # | Feit | Bron |
|---|---|---|
| G1 | `~/.local/share/mise/installs/node` bevat alleen 26.11.1; `~/.local/bin/node` en `~/.local/bin/pnpm` wijzen naar 26.11.1 en 11.28.2 en zijn gedateerd 24 november 06:45. | `ls -l` in de sessie |
| G2 | De pins gingen daarna omhoog: pnpm 12.21.0 in commit `8b049e47` (24 november 20:46 UTC), Node 26.13.0 in `5a7969d0` (25 november). | `git log` |
| G3 | `scripts/cloud-setup.sh` werkte correct; de omgeving draaide het niet opnieuw. De cache vervalt alleen bij een wijziging van het veld of van de toegestane hosts (D2, `docs/ENVIRONMENT.md`, Opzetten), niet bij een pin-bump in de repo. | G1, G2 |
| G4 | Ook een nieuwe sessie na het toevoegen van `api.github.com` aan de hosts kreeg nog de oude container. | melding van die sessie |
| G5 | Agents wezen het script of het netwerk aan als oorzaak; de melding van `feiten.mjs` noemt de cache niet. | meldingen van die sessies |

Gevolg: elke Renovate-bump van Node of pnpm laat cloudsessies vastlopen tot de eigenaar het veld wijzigt.

**Gemeten op 25 november 2026 (Testplan, stap 1)**, met een tijdelijke SessionStart-hook (matcher `startup`, 60 s slaap)
op een meetbranch die niet is samengevoegd, in een nieuwe cloudsessie op de omgeving "template":

| Id | Uitkomst | Bron |
|---|---|---|
| M7 | De eerste beurt wacht op de hook: de hook liep van 14:49:32.286Z tot 14:50:32.291Z, het eerste commando van de agent volgde om 14:50:37.238Z, en de stdout van de hook (`M7-probe klaar om 14:50:32Z`) stond in de startcontext. De stopgrond vervalt. | `~/m7.log`, `date -u`, startcontext |
| M4 | De hook krijgt `CLAUDE_ENV_FILE` (`/root/.claude/session-env/<sessie>/sessionstart-hook-1.sh`). | `~/m7.log` |
| M9 | In de hook is `CLAUDE_CODE_REMOTE=true`, `source` is `startup`, de hook draait als root (`~` is `/root`) met `cwd` gelijk aan de clone (`/home/user/template`). | `~/m7.log` |

Een cloudsessie start op een eigen `claude/…`-branch van de gekozen basisbranch; een meting vraagt dus die basisbranch bij de
start (de eerste poging zonder gaf een sessie zonder de hook).

**Niet gemeten**

- **M5** (uit cloud-zelfinstallatie) — De koude duur van het hele script, inclusief Node van `nodejs.org` (Testplan, stap 3c).

## Rollen en wie wat ziet

Geen app-gebruikers. De sessie (agent en eigenaar) ziet één regel in de context van de start, alleen als de hook iets deed,
niets deed om een reden die herstel vraagt, of faalde; de volledige uitvoer van het script staat in een logbestand buiten
de repo.

## Kopieer de vorm van

- `rails/hooks/lib/werkstraat.mjs` — `sessionStart(deps)`: een hook met geïnjecteerde `deps` (`run`, `env`) zodat de test
  zonder netwerk en zonder echte installatie draait
- `test/hooks/werkstraat-cloudregel.test.ts` — een toets op de regel die alleen met `CLAUDE_CODE_REMOTE=true` verschijnt
- `test/hooks/laden-commondir.test.ts` — de lader draaien tegen een tijdelijke repo met een eigen anker en cache
- `test/scripts/cloud-setup.test.ts` — stubs voor `mise`, `pnpm` en `node` op `PATH`, zonder netwerk
- `test/scripts/toolchain.test.ts` — de meldingstekst van `scripts/kit/toolchain.mjs`

## Hergebruik en UX

Geen UI. Hergebruik: `scripts/cloud-setup.sh` (ongewijzigd, het enige installatiepad), de stub
`.claude/hooks/werkstraat.mjs` met een nieuw subcommando, en de lader `.claude/hooks/laden.mjs` (aangepast, ontwerp punt 2).
Zichtbare tekst, letterlijk (één regel, `<…>` ingevuld):

- Hersteld: `✓ toolchain hersteld in <s> s: Node <gevonden> → <pin>, pnpm <gevonden> → <pin> (omgevingscache van vóór een pin-bump; elke nieuwe sessie herhaalt dit tot het veld "Setup script" wijzigt, docs/ENVIRONMENT.md, Problemen)`.
  Een tool die al klopte, staat niet in de opsomming; ontbrak `node_modules`: `node_modules → geïnstalleerd`.
- Invoer wijkt af van `main`: `! toolchain niet hersteld: <paden> wijken af van main (<anker, 12 tekens>); wijzig het veld "Setup script" van de omgeving`.
  `<paden>` noemt hooguit drie paden, daarna `en <n> meer`.
- pnpm onbekend: `! toolchain niet hersteld: pnpm --version gaf binnen <s> s geen antwoord; de versie is onbekend`.
- Pin ongeldig: `! toolchain niet hersteld: packageManager moet een exacte pnpm@x.y.z-versie bevatten`.
- Script faalt: `✗ toolchain niet hersteld (scripts/cloud-setup.sh exit <code>, <s> s): omgevingscache van vóór een pin-bump? Log: <logpad> → zie docs/ENVIRONMENT.md, Problemen`.
- Afgebroken: `✗ toolchain niet hersteld: na <s> s afgebroken (procesgroep gestopt). Log: <logpad> → zie docs/ENVIRONMENT.md, Problemen`.
- Lader kan de hook niet starten: `! toolchain-herstel niet gestart (ADR 0045): <reden>`.
- Onverwachte fout in de hook zelf: `✗ toolchain-herstel faalde: <melding> (meld dit; de sessie start gewoon)`.
- Alles klopt, of geen cloud, of geen `startup`: geen uitvoer.
- `feiten.mjs` in de cloud bij een afwijkende Node- of pnpm-versie (één herstelroute; vervangt de herstelteksten per
  segment en de toevoeging ", in de cloud `bash scripts/cloud-setup.sh`"):
  `✗ toolchain ontbreekt: <reden>; <reden> → in de cloud waarschijnlijk een omgevingscache van vóór een pin-bump: start een nieuwe sessie (de startup-hook herstelt het), of de eigenaar wijzigt het veld "Setup script", zie docs/ENVIRONMENT.md`.

## Ontwerp

1. **Waar.** Een nieuw subcommando `toolchain-herstel` van `rails/hooks/werkstraat.mjs`, code in
   `rails/hooks/lib/toolchain-herstel.mjs`. Het draait via de bestaande stub en de lader, dus de code van het anker (`main`,
   R1), niet die van de branch. Een eigen SessionStart-entry in `.claude/settings.json` met matcher `startup` en
   `timeout: 600` (D5), naast de bestaande `session-start` (30 s, ongewijzigd). De twee draaien parallel (D5).
2. **De lader.** Vier aanpassingen in `.claude/hooks/laden.mjs`:
   - `werkstraat toolchain-herstel` ververst het anker zoals `session-start` (zonder anker zou de hook op een verse VM niet
     draaien, R8), maar ruimt de cache niet op (`ruimOp` blijft bij `session-start`);
   - `uitpakken` wist nooit een map die intact is. Twee parallelle runs pakken dezelfde tree uit; nu kan de ene de net
     hernoemde, intacte map van de andere wissen terwijl die hem laadt. Een niet-intacte doelmap wordt eerst hernoemd naar
     `<tree-oid>.tmp-<pid>-<tijd>`, een naam die op `OPRUIMBAAR` past, zodat `ruimOp` hem later opruimt; daarna komt de
     nieuwe versie er atomisch voor in de plaats. Faalt de hernoeming omdat een andere run al een intacte map neerzette,
     dan gebruikt hij die;
   - een fout van de lader bij `toolchain-herstel` geeft exit 0 en de `!`-regel uit Hergebruik en UX, niet "de hook faalt
     dicht": SessionStart kan niets tegenhouden, en de tekst misleidt dan;
   - `uitkomstBijGeplant` geeft voor `werkstraat toolchain-herstel` "meldt", zoals voor `session-start`: een geplant
     `.git/commondir` geeft dan een regel in de context en exit 0, geen blokkade.
3. **Wanneer.** Alleen als `CLAUDE_CODE_REMOTE=true` (D6) én `source` in de invoer `startup` is (de matcher plus een eigen
   controle). Lokaal, en bij `resume`, `clear`, `compact` en `fork`, doet de hook niets: daar is de werkmap door de agent
   beschreven (0085).
4. **Goedkope detectie zonder werkmapcode.** De hook leest `mise.toml` en `package.json` als tekst (geen import, geen
   uitvoering) en past dezelfde regels toe als `toolchainProbleemIn` in `scripts/kit/toolchain.mjs`:
   - Node: `process.version` van de hook zelf, die net als de Bash-tool en de git-hooks `node` via `PATH` start (R8, M3),
     tegen de pin met de regel van `passend`. Geen Node-pin in `mise.toml`: geen Node-probleem;
   - pnpm: `pnpm --version` met `cwd` `$HOME` (geen projectconfiguratie, geen zelfwissel naar de pin) en de timeout
     `PNPM_TIMEOUT_MS` (20 s), exact tegen `packageManager`. Timeout: versie onbekend, niet installeren, wel een regel. Pin
     ontbreekt of is ongeldig: niet installeren (het script lost dat niet op), wel een regel;
   - `node_modules`: dezelfde markeerbestanden als `INSTALLATIE`, met `existsSync`.

   De logica staat dubbel (de lader pakt alleen `rails/hooks/` uit); AC-3 houdt beide gelijk. Klopt alles, dan stopt de
   hook zonder netwerk en zonder uitvoer (vgl. F8: zelfs een tweede run van het script kost 2,8 s).
5. **Installeren alleen als de invoer gelijk is aan `main`.** Na een afwijking vergelijkt de hook de invoer van de
   installatie in de werkmap met de tree van het anker (`RAILS_ANKER`, dat de lader meegeeft):
   op inhoud, niet via de werkboom-diff van git (die volgt filters uit `.git/config` en `.gitattributes`, en vertrouwt de
   index, ook `--assume-unchanged` en `--skip-worktree`). De verwachte blob-oids komen uit `git ls-tree -r -z <anker> --
   <INVOER>`; de bestanden in de werkmap uit `git ls-files -z --cached --others -- <INVOER>` (ook genegeerde bestanden,
   zoals een `mise.local.toml`), gehasht met `git hash-object --no-filters --stdin-paths`. Beide verzamelingen moeten
   gelijk zijn; een symlink, een ander bestandstype of een geneste git-repo onder een `INVOER`-pad geldt als afwijking, en
   ook een symlink of niet-map op een vast voorvoegsel van een `INVOER`-patroon (`scripts`, `scripts/kit`, `mise`, `.mise`,
   `.config`, `.config/mise`, `.lefthook`, `patches`, …) of op een voorloopcomponent van een gevonden pad. De
   hook draait als root op een werkmap die een agent kan beschrijven, dus elke git-aanroep krijgt ook
   `-c core.fsmonitor= -c diff.external=`: geen programma uit de git-configuratie van de werkmap draait mee tijdens de
   vergelijking. `INVOER` is wat `scripts/cloud-setup.sh` werkelijk leest of
   uitvoert, als pathspecs met `:(glob)` vanaf de root:
   - `scripts/cloud-setup.sh` en `scripts/kit/` (het script draait `scripts/kit/pnpm-installeer.mjs` en importeert
     `scripts/kit/toolchain.mjs`);
   - mise (v2026.9.18, `MISE_VERSION` in het script) en de idiomatische versiebestanden: `mise.toml`, `mise.*.toml`,
     `.mise.toml`, `.mise.*.toml`, `mise/`, `.mise/`, `.config/mise*`, `.tool-versions`, `.nvmrc`, `.node-version`, en de
     lockfiles en rc-bestanden `mise*.lock`, `.mise*.lock`, `miserc.toml`, `.miserc.toml`;
   - pnpm: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.pnpmfile.cjs`, `.pnpmfile.mjs`, `patches/`;
   - lefthook (de versie uit `package.json`): `lefthook*`, `.lefthook*`, `.config/lefthook*`. Die patronen dekken elke
     extensie (`.yml`, `.yaml`, `.json`, `.jsonc`, `.toml`), de `-local`-varianten en de scriptmappen `.lefthook/` en
     `.lefthook-local/`.

   Wijkt iets af, dan installeert de hook niet en geeft hij de `!`-regel met de paden. AC-5 bewaakt de lijst tegen het
   script. Dan draait hij `bash scripts/cloud-setup.sh` uit de werkmap, `cwd` de projectroot: bij gelijkheid is dat
   inhoudelijk het script en de configuratie van `main`.

   **Waarom dat nodig en voldoende is.** Het veld "Setup script" draaide één keer, op de stand van toen, niet per sessie
   op de huidige branch. Een hook die bij elke nieuwe sessie de configuratie van de gekozen branch als root buiten de
   sandbox uitvoert, zou dus wél iets nieuws toevoegen: een branch die een agent eerder pushte, kan een gewijzigde
   `.npmrc`, pnpmfile, lefthook- of mise-configuratie of `scripts/kit/` dragen. Gelijkheid met het anker beperkt wat er
   draait tot wat op `main` staat: daar komt alleen werk dat door CI, de ruleset en de eigenaarmerge ging, en de lader
   controleert het anker tegen de remote (ADR 0045). De rest van de branch voert de installatie niet uit. Restrisico:
   `node_modules` en de mise-installaties komen uit de omgevingscache en worden niet vergeleken; `pnpm install` met de
   lockfile van `main` zet ze recht.
6. **Timeout en procesboom.** De hook start het script `detached` in een eigen procesgroep, met stdout en stderr naar
   `$HOME/.cache/werkstraat/toolchain-herstel.log` (per run overschreven, buiten de repo, niet in de context). Na een eigen
   deadline van 540 s, ruim binnen de 600 s van de entry, stuurt hij `SIGTERM` naar de hele groep en na 5 s `SIGKILL`
   (`rails/hooks/lib/run.mjs` stopt alleen het bovenste proces).
7. **Synchroon.** De hook wacht op het script: op de achtergrond liep de eerste `feiten.mjs` midden in de installatie. De
   wachttijd valt alleen in een sessie die anders niet kan werken.
8. **Node 22.** Elke module in de importboom van `rails/hooks/werkstraat.mjs` gebruikt alleen `node:`-modules en modules
   onder `rails/hooks/`: op een koude VM zonder ingestelde omgeving draait de hook op `/opt/node22` (F2, D7) en installeert
   hij dan alles (nul handwerk). CI draait geen Node 22; stap 3c meet het één keer.
9. **Falen.** De sessie start altijd (D5). De hook eindigt met exit 0 en de `✗`- of `!`-regel, ook bij een onverwachte
   fout: dan schrijft `rails/hooks/werkstraat.mjs` voor `toolchain-herstel` de `✗`-regel op stdout, zodat hij in de
   context komt (AC-13). `feiten.mjs` geeft daarna
   in de cloud de melding met de oorzaak "omgevingscache van vóór een pin-bump". `toolchainProbleem` blijft puur: een
   nieuwe parameter `cloud` (standaard `false`) kiest die tekst; alleen de ingang vult hem, `feiten.mjs` uit
   `CLAUDE_CODE_REMOTE`, doorgegeven via `toolchainProbleemIn`.

## Acceptatiecriteria

- **cloud-toolchain-zelfherstel/AC-1** — Gegeven `CLAUDE_CODE_REMOTE` niet `true`, of `source` anders dan `startup`, wanneer
  `toolchain-herstel` draait, dan start het geen proces, geeft het geen uitvoer en eindigt het met exit 0, ook als de pins
  afwijken. Toets: `test/hooks/toolchain-herstel.test.ts` (nieuw)
- **cloud-toolchain-zelfherstel/AC-2** — Gegeven cloud en `startup`, een Node die `passend` is, een `pnpm --version` gelijk aan
  `packageManager` en alle markeerbestanden aanwezig, wanneer de hook draait, dan is de enige gestarte opdracht
  `pnpm --version` met `cwd` `$HOME`, is er geen uitvoer en geen logbestand, en exit 0. Toets: `test/hooks/toolchain-herstel.test.ts` (nieuw)
- **cloud-toolchain-zelfherstel/AC-3** — Voor een tabel van Node-versies, `mise.toml` met en zonder Node-pin,
  `packageManager`-waarden (geldig, ontbrekend, ongeldig) en aan- of afwezige markeerbestanden, met een `pnpm`-stub op
  `PATH` die een vaste versie geeft ongeacht zijn `cwd`, en de Node-versie aan beide kanten ingespoten op dezelfde manier,
  geeft de detectie van de hook "klopt" precies dan als `toolchainProbleemIn` `null` geeft; dat de hook `pnpm` in `$HOME`
  start en `toolchainProbleemIn` in de projectroot, verandert de uitkomst niet. Een stub die niet antwoordt binnen de
  timeout geeft in de hook de regel `! toolchain niet hersteld: pnpm --version gaf binnen` en geen installatie.
  Toets: `test/hooks/toolchain-herstel.test.ts` (nieuw)
- **cloud-toolchain-zelfherstel/AC-4** — Elke module in de importboom van `rails/hooks/werkstraat.mjs` (statische en
  dynamische imports, recursief) importeert alleen `node:`-modules en modules onder `rails/hooks/`, niets onder `scripts/`,
  `src/` of `node_modules`. Toets: `test/hooks/toolchain-herstel.test.ts` (nieuw)
- **cloud-toolchain-zelfherstel/AC-5** — De lijst `INVOER` dekt: elk pad onder de repo dat `scripts/cloud-setup.sh` noemt,
  de volledige importboom van `scripts/kit/pnpm-installeer.mjs` en `scripts/kit/toolchain.mjs`, en elke configuratienaam
  die de documentatie van de gepinde versies noemt. De test zet die namen letterlijk in een tabel, per naam met de bron, en
  eist voor elke naam dat een pathspec uit `INVOER` hem matcht:
  - lefthook, de versie uit `package.json` (bron: lefthook.dev, Configuration, "Config file", en de README van het
    npm-pakket in die versie): `lefthook.yml`, `lefthook.yaml`, `lefthook.json`, `lefthook.jsonc`, `lefthook.toml`, dezelfde
    met een punt ervoor, met `-local` erin, en onder `.config/`, plus de scriptmappen `.lefthook/` en `.lefthook-local/`;
  - mise v2026.9.18 (bron: mise.jdx.dev, Configuration, "mise.toml" en "Idiomatic version files", in die versie):
    `mise.toml`, `mise.local.toml`, `mise.<env>.toml`, `mise.<env>.local.toml`, dezelfde met een punt ervoor,
    `mise/config.toml`, `.mise/config.toml`, `.config/mise.toml`, `.config/mise/config.toml`, `.config/mise/conf.d/*.toml`,
    `.tool-versions`, `.nvmrc`, `.node-version`, `mise.lock`, `mise.<env>.lock`, `.mise.lock`, `miserc.toml`,
    `.miserc.toml`, `.config/miserc.toml`;
  - pnpm: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.pnpmfile.cjs`, `.pnpmfile.mjs`, `patches/`. Een naam die de bouwer in die
    documentatie vindt en die hier ontbreekt, komt in de tabel én in `INVOER`. Toets: `test/hooks/toolchain-herstel.test.ts` (nieuw)
- **cloud-toolchain-zelfherstel/AC-6** — Gegeven een tijdelijke repo met een anker-commit, een afwijkende pin en elk van:
  een gewijzigd `pnpm-workspace.yaml`, een gewijzigd bestand onder `scripts/kit/`, een ongetrackte `.npmrc`, een genegeerde
  `mise.local.toml`, wanneer de hook draait, dan start hij het script niet en geeft hij precies één regel die begint met
  `! toolchain niet hersteld:` en dat pad noemt, en `wijzig het veld "Setup script" van de omgeving` maar geen
  terminalcommando. Hetzelfde geldt voor een `INVOER`-bestand dat met `--assume-unchanged` of `--skip-worktree` gemarkeerd
  en daarna gewijzigd is, een `INVOER`-pad dat een symlink is, een geneste git-repo onder `.mise/` of `.lefthook/`, een
  symlink op de plek van een `INVOER`-map (`.config`, `mise`, `.mise`, `.lefthook`, `scripts/kit`, ook naar een map met
  dezelfde inhoud) en een symlink als voorloopcomponent van een gevonden pad (bijvoorbeeld `scripts`). Een
  gewijzigd bestand buiten `INVOER` (bijvoorbeeld onder `src/`) houdt het herstel niet tegen. Elke git-aanroep van de
  vergelijking bevat `-c core.fsmonitor=` en `-c diff.external=`; een werkmap met `core.fsmonitor`, of met een clean-filter
  (`filter.<naam>.clean` of `.process`) op alle bestanden, naar een script dat een markeerbestand schrijft, laat dat
  bestand na de hook afwezig. Toets: `test/hooks/toolchain-herstel.test.ts` (nieuw)
- **cloud-toolchain-zelfherstel/AC-7** — Gegeven een afwijkende Node- en pnpm-pin, invoer gelijk aan het anker en een stub voor
  `scripts/cloud-setup.sh` die exit 0 geeft, wanneer de hook draait, dan start hij `bash scripts/cloud-setup.sh` met `cwd`
  de projectroot, schrijft hij de uitvoer van het script in het logbestand en niet naar stdout, en is zijn stdout precies
  één regel die begint met `✓ toolchain hersteld in` en `Node <gevonden> → <pin>` en `pnpm <gevonden> → <pin>` bevat.
  Met een stub die exit 3 geeft, is de stdout precies één regel die begint met
  `✗ toolchain niet hersteld (scripts/cloud-setup.sh exit 3,` en het logpad noemt, en eindigt de hook met exit 0.
  Toets: `test/hooks/toolchain-herstel.test.ts` (nieuw)
- **cloud-toolchain-zelfherstel/AC-8** — Gegeven een stub die een kindproces start dat blijft draaien, en een deadline die
  de test klein zet, wanneer de deadline verstrijkt, dan leeft na de hook geen proces uit die procesgroep meer, ook het
  kleinkind niet, en is de stdout één regel die begint met `✗ toolchain niet hersteld: na`. Toets: `test/hooks/toolchain-herstel.test.ts` (nieuw)
- **cloud-toolchain-zelfherstel/AC-9** — `.claude/settings.json` heeft onder `SessionStart` een entry met matcher precies
  `startup`, `timeout` 600 en het commando `node "$CLAUDE_PROJECT_DIR/.claude/hooks/werkstraat.mjs" toolchain-herstel`; de
  bestaande entry voor `session-start` is ongewijzigd (matcher en `timeout: 30`). De deadline in de hookcode is kleiner dan
  die 600 s. Toets: `test/hooks/toolchain-herstel.test.ts` (nieuw)
- **cloud-toolchain-zelfherstel/AC-10** — De lader: (a) twee parallelle runs van `werkstraat toolchain-herstel` en
  `werkstraat session-start` op een lege cache, twintig keer herhaald, eindigen elk met de uitvoer en exitcode van het
  script, en na afloop is de map van de tree intact; (b) `uitpakken` met een al intacte doelmap wist en herschrijft niets,
  en een niet-intacte doelmap staat daarna onder een naam die op `OPRUIMBAAR` past (`<tree-oid>.tmp-<pid>-<tijd>`), naast
  een intacte nieuwe versie; (c) zonder anker ververst `toolchain-herstel` het anker, en `ruimOp` draait na
  `toolchain-herstel` niet; (d) een laderfout bij `toolchain-herstel` geeft exit 0 en stdout
  `! toolchain-herstel niet gestart (ADR 0045):`, zonder "faalt dicht"; (e) met een geplant `.git/commondir` geeft
  `toolchain-herstel` exit 0 en de melding op stdout, zoals `session-start`. Toets: `test/hooks/laden-parallel.test.ts` (nieuw)
- **cloud-toolchain-zelfherstel/AC-11** — `toolchainProbleem` zonder de parameter `cloud` geeft voor elke invoer dezelfde
  tekst als vóór deze spec. Met `cloud: true` en een afwijkende Node- of pnpm-versie eindigt de melding met
  `→ in de cloud waarschijnlijk een omgevingscache van vóór een pin-bump: start een nieuwe sessie (de startup-hook herstelt het), of de eigenaar wijzigt het veld "Setup script", zie docs/ENVIRONMENT.md`,
  staat er geen andere herstelroute in (geen `scripts/bootstrap.sh`, geen `bash scripts/cloud-setup.sh`), en ontbreekt
  alleen `node_modules`, dan is de tekst gelijk aan die zonder `cloud`. `feiten.mjs` geeft `cloud` alleen mee als
  `CLAUDE_CODE_REMOTE=true`. Toets: `test/scripts/toolchain-cloudoorzaak.test.ts` (nieuw)
- **cloud-toolchain-zelfherstel/AC-12** — `docs/ENVIRONMENT.md` zegt onder "Opzetten" dat de cache niet vervalt bij een
  pin-bump en dat de startup-hook dan herstelt als de invoer gelijk is aan `main`, en "Problemen" heeft een kop voor
  `✗ toolchain ontbreekt` in de cloud met de oorzaak (cache van vóór een pin-bump), de regels van de hook en het herstel
  (nieuwe sessie; blijvend: het veld "Setup script" wijzigen). `docs/framework.md` noemt bij R-TOOL-01 ADR 0112.
  Toets: `test/docs/cloud-toolchain-zelfherstel.test.ts` (nieuw)
- **cloud-toolchain-zelfherstel/AC-13** — Gegeven een fout die de hook niet verwacht (bijvoorbeeld een `deps.run` die een
  uitzondering gooit), wanneer `werkstraat toolchain-herstel` draait, dan is de stdout precies één regel die begint met
  `✗ toolchain-herstel faalde:`, is de exitcode 0, en staat de melding niet alleen op stderr (anders dan de huidige
  `catch` in `rails/hooks/werkstraat.mjs`, die voor andere events dan `stop` en `subagent-stop` alleen naar stderr schrijft).
  Toets: `test/hooks/toolchain-herstel.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Lokaal (WSL), elke bron | niets (AC-1) |
| Cloud, `resume`, `clear`, `compact`, `fork` | niets (AC-1); `feiten.mjs` meldt een afwijking met de cloudoorzaak (AC-11) |
| Cloud, cache klopt | alleen `pnpm --version`, geen uitvoer (AC-2) |
| Cloud, cache van vóór een pin-bump, invoer gelijk aan `main` | script draait, `✓`-regel (AC-7); elke nieuwe sessie herhaalt dat tot het veld wijzigt |
| Branch met een pin-bump die nog niet op `main` staat (Renovate-branch) | invoer wijkt af: `!`-regel, geen installatie (AC-6) |
| Branch van vóór de bump, cache klopt met de branch | detectie "klopt": niets |
| Geen Node-pin in `mise.toml` | geen Node-probleem, zoals `toolchainProbleemIn` (AC-3) |
| `packageManager` ontbreekt of is ongeldig | `!`-regel, geen installatie (AC-3) |
| `pnpm --version` antwoordt niet binnen 20 s | versie onbekend: `!`-regel, geen installatie (AC-3) |
| Echte pnpm zou in de projectroot naar de pin wisselen, in `$HOME` niet | hook ziet een afwijking die `feiten.mjs` misschien niet ziet; het script is idempotent, dus hooguit één onnodige run |
| Koude VM zonder ingestelde omgeving (Node 22) | hook draait op Node 22 en installeert alles; koude duur niet gemeten (M5) |
| Geen anker en `main` niet bereikbaar | de lader start de hook niet: `!`-regel van de lader, exit 0 (AC-10); daarna de melding van `feiten.mjs` |
| `session-start` en `toolchain-herstel` verversen en pakken parallel uit | beide schrijven hetzelfde anker; `uitpakken` wist geen intacte map (AC-10) |
| `CLAUDE_ENV_FILE` ontbreekt (M4) | het script slaat route 2 over; route 1 bereikt Bash-tool en hooks (M3) |
| Script hangt | procesgroep gestopt na 540 s (AC-8) |
| Een proces in het script start zelf een nieuwe sessie (`setsid`) | het ontsnapt aan de procesgroep en loopt door na de deadline. Restrisico, aanvaard: het script en wat het start (mise, pnpm, apt-get, lefthook) doen dat niet; de VM is wegwerpbaar |
| Sessie met meerdere repo's of Project-thread | geen repo-hooks (D4); niets |

## Raakt ook

- Beschermd (niveau per pad: `node scripts/kit/feiten.mjs pad <pad>`):
  - `.claude/settings.json` (nieuwe SessionStart-entry) en `.claude/hooks/laden.mjs` (ontwerp punt 2): de Bash-sandbox kan
    ze niet schrijven, dus Edit in de hoofdsessie met akkoord van de eigenaar;
  - `rails/hooks/**` (`werkstraat.mjs`, nieuw `lib/toolchain-herstel.mjs`);
  - `scripts/kit/toolchain.mjs` (parameter `cloud`) en `scripts/kit/feiten.mjs` (geeft hem mee);
  - `docs/framework.md` (R-TOOL-01), ADR 0061 en 0085 (`Herzien:`-regels in deze PR, R-CI-05), ADR 0112.
  Geen wijziging aan `scripts/cloud-setup.sh` of `scripts/cloud-omgeving.sh`.
- Een gewijzigde hook en lader werken pas na de samenvoeging (R1): het herstel helpt vanaf de eerste nieuwe sessie daarna.
- Spec `cloud-werkmap-herstel`, "Raakt ook" (de regel dat `scripts/kit/toolchain.mjs` niet verandert): herzien door deze
  spec; de toets daar dat de herstelmelding in de hoofdcheckout het worktree-script niet noemt, blijft gelden.
- Spec `cloud-zelfinstallatie`: OV-1, de afweging onder "Wat deze spec niet bouwt" en "Buiten scope" verwijzen naar deze spec.
- `docs/ENVIRONMENT.md` (Opzetten, Problemen), `README.md` (Cloud) als die de cache beschrijft.
- `CHANGELOG.md` en `docs/template-changelog.md`: een app krijgt de hook met een template-update.
- `docs/roadmap.md`: het item "Cloud: toolchain herstelt zichzelf na een pin-bump" wordt afgevinkt met het PR-nummer
  (`pnpm check:roadmap`).
- `pnpm ratchet`, `pnpm test:unit`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`.

## Buiten scope

- Herstel bij `resume`, `clear`, `compact` of `fork` (0085), en lokaal.
- Herstel op een branch waarvan de installatie-invoer afwijkt van `main`.
- Een sessie die zelf `bash scripts/cloud-setup.sh` draait zonder te vragen (OV-2 van cloud-zelfinstallatie blijft vervallen).
- De omgevingscache vanuit de repo laten vervallen: daar is geen route voor (D1, D2).
- Wijzigingen aan `scripts/cloud-setup.sh` of `scripts/cloud-omgeving.sh`.
- Een CI-job op Node 22 (OV-4).
- Andere tools uit `mise.toml` als aanleiding voor herstel (dbmate, betterleaks, osv-scanner): `feiten.mjs` toetst ze niet;
  het script installeert ze wel mee zodra Node, pnpm of `node_modules` afwijkt.

## Testplan

**Stap 1 — meten, vóór de bouw** (gedaan op 25 november 2026; uitslag hierboven, M7 en M4 positief): M7 met een tijdelijke SessionStart-hook (matcher `startup`) die de
tijd, `source` en `CLAUDE_ENV_FILE` (M4) naar een bestand schrijft en 60 s slaapt, in een nieuwe cloudsessie; noteer of de
eerste beurt wacht. **Stopgrond:** wacht de beurt niet, dan gaat de bouw niet verder en beslist de eigenaar opnieuw over
OV-2 (synchroon) en de timeout.

**Stap 2 — bouwen**: eerst stubs met de definitieve signaturen van `rails/hooks/lib/toolchain-herstel.mjs` (detectie,
vergelijking met het anker, herstel met `deps` en deadline) en van de parameter `cloud`, zodat elke test op een assertie
faalt en niet op een import. Daarna AC-1 tot en met AC-13 met stubs, zonder netwerk; elke negatieve test faalt op de huidige
code (R-PRINC-04).

**Stap 3 — na de samenvoeging, in de cloud**: (a) een omgeving met een cache van vóór een pin-bump: een nieuwe sessie op
een branch gelijk aan `main` geeft de `✓`-regel en `feiten.mjs` geen `✗ toolchain ontbreekt`; (b) een tweede nieuwe sessie
op een vernieuwde cache: geen regel; (c) een omgeving zonder setup-script (Node 22): de duur (M5) en of de hook op Node 22
draait.

Uitslag op 26 november 2026, na de samenvoeging van #1008, op de omgeving "template":

| Stap | Uitkomst |
|---|---|
| 3a | Gemeten. De omgeving had een cache van vóór de bumps. De startcontext gaf `✓ toolchain hersteld in 44 s: Node v26.11.1 → 26.13.0, pnpm 11.28.2 → 12.21.0 (…)`; `node --version` gaf v26.13.0. In het log: `mise install` kreeg een 403 van de GitHub-API voor pnpm, en de terugval haalde pnpm 12.21.0 via npm. `pnpm install` trok `node_modules` uit de cache gelijk met de lockfile van `main`. |
| 3b | Gemeten. Na een wijziging van het veld "Setup script" stond er in een nieuwe sessie geen regel van de hook in de context. `~/.cache/werkstraat/` bestond niet, `feiten.mjs` gaf geen `✗ toolchain ontbreekt` en `~/.local/bin/node` wees naar 26.13.0. |
| 3c | Niet gemeten (besluit van de eigenaar, 26 november 2026). Dat de hook op Node 22 laadt, toetst AC-4 alleen statisch: de importboom bevat alleen `node:`-modules. De koude duur (M5) blijft onbekend. |

## Open vragen

Alle besloten door de eigenaar op 25 november 2026, na de spec-review.

- **OV-1 ✅ besloten** — Welk `scripts/cloud-setup.sh` draait de hook? Vervallen: de hook installeert alleen als de invoer
  gelijk is aan het anker (ontwerp punt 5), dus werkmap en ankerkopie zijn dan inhoudelijk gelijk.
- **OV-2 ✅ besloten** — Synchroon (ontwerp punt 7); M7 is een stopgrond in het Testplan.
- **OV-3 ✅ besloten** — Alleen `startup`, alleen in de cloud (OV-1 optie b van cloud-zelfinstallatie).
- **OV-4 ✅ besloten** — Geen CI-job op Node 22; AC-4 toetst de hele importboom van `rails/hooks/werkstraat.mjs`.
- **OV-5 ✅ besloten** — Eén roadmap-item met het incident van 25 november als aanleiding, dat naar deze spec wijst.
