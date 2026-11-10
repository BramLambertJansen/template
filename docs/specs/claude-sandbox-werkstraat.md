---
status: gebouwd # #372
namespace: claude-sandbox-werkstraat
model: sonnet
---

# Dagelijks werk in de Claude Code-sandbox

## Doel

Claude Code voert op Ubuntu/WSL snelle pnpm-checks, gewone commits, featurebranch-pushes en PR-aanmaak uit zonder
terugkerende eigenaarstaken, binnen de bestaande sandbox en kwaliteitsgrenzen.

[ADR 0061](../adr/0061-claude-sandbox-werkstraat.md) besluit over de beperkte rechtenwijziging. Dit is een docs-only
besluitvoorstel: de bedoelde status hierboven activeert niets vóór eigenaarmerge op `main`; implementatie volgt daarna.
De aanleiding en afweging staan in het ADR, niet in een nieuw roadmap-item.

## Rollen en wie wat ziet

- Eigenaar: beoordeelt en merget besluit en implementatie. Bestaande setup blijft de inrichting van de toolchain.
- Hoofdsessie: coördineert tester, bouwer en onafhankelijke reviewer; pusht de featurebranch, opent de PR en verzamelt CI-bewijs.
- Architect: alleen dit besluit en deze spec. Tester: tests vóór implementatie. Bouwer: uitsluitend toegestane paden.
- Bestaande rolbeperkingen blijven gelden; een subagent krijgt geen push, PR-aanmaak, eigen goedkeuring of ruimer taakmandaat.

## Datawijzigingen (met grants)

n.v.t. — geen databasewijziging, grants of migratie.

## Routes en foutcodes

n.v.t. — geen API-contract, route, app-permissie of foutcode.

## Kopieer de vorm van

Geen functioneel accountbeheerpad uit `docs/gouden-pad.md` past: dit betreft de bestaande werkstraat, zonder product-UI.

- `test/rails/sandbox-settings.test.ts` — behoud van sandboxgrenzen en gerichte instellingenregressies.
- `test/scripts/cloud-setup.test.ts` — setupvolgorde, idempotentie en expliciet stoppen bij fouten.
- `scripts/kit/toolchain.mjs` — bestaande toolchaindiagnose, zonder nieuwe dependency of parallelle controlepijplijn.

## Hergebruik en UX

- Bestaande componenten: n.v.t. — geen UI; hergebruik mise, bootstrap, cloud-setup, Lefthook, rolhek en `pr:verify`.
- Staten per scherm, focus en toetsenbord: n.v.t. — terminalwerk.
- Alle zichtbare tekst: bestaande uitvoer blijft; bij een verkeerde pin of werkelijke versie noemt de diagnose verwacht
  en aangetroffen versie en verwijst naar de bestaande setup. Native pnpm- en Git-fouten worden niet als succes gemeld.
- Dagelijkse push: `git push origin HEAD`, zonder upstreamregistratie. PR-aanmaak gebruikt altijd een expliciete
  `--head` met de werkbranch en `--body-file`; geen impliciete pushkeuze door gh.

### Werking

`packageManager` blijft de enige pnpm-versiebron. De shellvrije mise-afleiding moet dezelfde exacte pin selecteren.
Het prototype hieronder selecteerde met mise 2026.10.4 aantoonbaar 11.28.2, toen nog niet geïnstalleerd in mise;
compatibiliteit met de bestaande cloudpin 2026.9.18 is nog te bewijzen tijdens implementatie:

```toml
pnpm = '''{{ read_file(path='package.json') | split(pat='"packageManager"') | last | split(pat='"') | nth(n=1) | split(pat='@') | last }}'''
```

De bestaande setup installeert de geselecteerde exacte versie vooraf. De werkelijke versie moet overeenkomen met een
geldige exacte `pnpm@x.y.z`-pin; automatische download of stille terugval mag een ontbrekende of verkeerde installatie
niet verhullen. Geen nieuwe dependency, globale cacheopening of projectstoremigratie. Als het prototype niet voldoet,
eerst een passende shellvrije afleiding bewijzen; geen ongeteste templatefunctie of automatische mise-upgrade.

`autoAllowBashIfSandboxed` wordt expliciet `true`. Gerichte regels ondersteunen gewone `git add` en `git commit`,
featurepushes en gh-aanmaak/lezen. Voorbeelden van bestaande of gerichte toestemmingen zijn `feat/`, `fix/`, `docs/`,
`chore/`, `test/`, `refactor/`, `claude/`, `codex/` en `feature/`; dit introduceert geen verplicht branchnaamformaat.
De bestaande HEAD-maincheck blijft gelden; geen nieuwe prefixweigering of rolheklogica. Bestaande verboden en
rolbeperkingen blijven leidend.

Git-metadata blijft bij Claude's ingebouwde ondersteuning. Alleen als de echte gh-logproef een cacheblokkade bewijst,
komt exact `~/.cache/gh` in `allowWrite`. Geen bredere caches, Git-config/hookrechten of credentialwrites.

### Runnermelding bij een onleesbare remote (leerpunt #658)

`excludedCommands` haalt een runnercommando volgens de documentatie van Claude Code alleen uit de sandbox als elk commando
in de Bash-aanroep op de lijst past. Meting 2026-11-10: kaal `pnpm db:generate` en `pnpm check:snapshot` draaiden buiten de
sandbox; met een pipe erachter (`pnpm check:snapshot | tail -5`) startte de runner in de sandbox; met `cd <wortel> &&`
ervoor of `2>&1` erachter draaide hij er toch buiten. De kale vorm is de enige die zeker werkt. Gemeten in de sandbox: de
omgeving bevat `GIT_CONFIG_PARAMETERS='http.proxyAuthMethod=basic' 'credential.http://127.0.0.1:3128.helper='`;
`env -u GIT_CONFIG_PARAMETERS git ls-remote origin refs/heads/main` gaf `fatal: unable to access ...: Proxy CONNECT aborted`,
`env -u GIT_CONFIG_COUNT git ls-remote ...` slaagde. De proxy komt uit `HTTPS_PROXY`, die de runner laat staan; wat wegvalt
is de auth-methode uit `GIT_CONFIG_PARAMETERS`, die de runner wist. Het advies `git fetch origin main` helpt dan niet. ADR 0044
(runner buiten de sandbox) blijft. De runner vult de melding van ADR 0044 punt 3 aan met de kale vorm; hij vervangt niets
(geen A4), verandert geen recht of check (geen A3) en gooit de stderr van de lezing weg zoals nu.

## Acceptatiecriteria

- **claude-sandbox-werkstraat/AC-1** — De geldige exacte `packageManager`-pin bepaalt de mise-selectie; zowel de lokale
  mise-versie als de bestaande cloudpin selecteren dezelfde versie, zonder tweede versieliteral of mise-upgrade.
- **claude-sandbox-werkstraat/AC-2** — Na bestaande setup gebruiken een nieuwe shell en de echte Git-hooks de exacte
  pin. Een ongeldige, ontbrekende of verkeerde installatie stopt met diagnose; exitcode 0 met een andere versie faalt.
- **claude-sandbox-werkstraat/AC-3** — In native Claude Code slagen een bestaande snelle pnpm-check en een normale
  commit met werkelijk uitgevoerde opmaak-, lint-, Betterleaks- en commit-msgcontrole, zonder nieuwe eigenaarstaak.
- **claude-sandbox-werkstraat/AC-4** — Vanuit een featurebranch slaagt `git push origin HEAD`, met de echte
  pre-push en `gate:fast`; daarna slagen PR-aanmaak met expliciete head/bodyfile en het ophalen van werkelijke CI.
- **claude-sandbox-werkstraat/AC-5** — De native proef van AC-3/4 werkt in hoofdcheckout en gekoppelde worktree zonder
  `.git`-allowWrite; upstreamvarianten krijgen geen nieuwe automatische toestemming.
- **claude-sandbox-werkstraat/AC-6** — Negatieve tests blijven `main`-push, ook via HEAD, main-verwijdering, force,
  `--all`, `--mirror`, hookoverslaan, PR-merge via gh/API, zelfreview en directe Docker weigeren. Lokale
  `git merge origin/main`, fast-forward en bestaande veilige taakbranchopruiming blijven toegestaan, zonder nieuwe
  beperkingen. Subagents blijven push en PR-aanmaak weigeren.
- **claude-sandbox-werkstraat/AC-7** — Sandbox verplicht, fail-closed en zonder ontsnappingsmogelijkheid; bestaande
  `ask`/`deny`, runneruitzonderingen, netwerkdomeinen en `allowRead` blijven behouden. Alleen bewezen noodzakelijk
  `~/.cache/gh`-schrijfrecht is toegestaan; pnpm-opslag, mise-installaties en credentials blijven onschrijfbaar.
- **claude-sandbox-werkstraat/AC-8** — Supplychaininstellingen en `verifyDepsBeforeRun: error` blijven intact; een
  afwijkende dependency-installatie stopt nog steeds vóór run/exec. Geen installatiereparatie via lokaal `CI=true`.
- **claude-sandbox-werkstraat/AC-9** — Vergelijkbare native Claude-metingen vóór/na noemen runtime/toolchainversies,
  checkoutvorm, opdracht, exitcode, promptaantal en hook-/CI-bewijs. Onuitgevoerde stappen blijven expliciet onbewezen.
- **claude-sandbox-werkstraat/AC-10** (nog niet gebouwd) — `node scripts/kit/worktree-install.mjs` ([ADR 0085](../adr/0085-worktree-installatie-in-de-sandbox.md))
  draait in een gekoppelde worktree zonder `node_modules`, binnen de sandbox, `pnpm install --frozen-lockfile` met store,
  cache en state onder `os.tmpdir()`; daarna slagen `node scripts/kit/feiten.mjs` en `pnpm typecheck` met
  `verifyDepsBeforeRun: error`. Het weigert met een melding en zonder install in de hoofdcheckout, als `node_modules` een
  symlink is, en als `pnpm-lock.yaml`, `package.json` of `pnpm-workspace.yaml` niet-gecommitte wijzigingen hebben ten
  opzichte van HEAD; de lockfile verandert niet.
- **claude-sandbox-werkstraat/AC-11** (nog niet gebouwd) — `.claude/settings.json` staat `node scripts/kit/worktree-install.mjs`
  letterlijk toe; `pnpm install *`, `pnpm i *` en de andere installatievormen blijven op `ask`, en geen globale pnpm-map komt
  in `allowWrite`.
- **claude-sandbox-werkstraat/AC-12** (nog niet gebouwd) — De melding van `scripts/kit/toolchain.mjs` noemt per probleem
  apart het herstel. Ontbreekt `node_modules` in een gekoppelde worktree, dan is dat herstel letterlijk
  `node scripts/kit/worktree-install.mjs` en niet `scripts/bootstrap.sh`; een afwijkende Node- of pnpm-versie blijft ook
  in een worktree naar `scripts/bootstrap.sh` wijzen, ook als `node_modules` tegelijk ontbreekt (dan staan beide er). In de
  hoofdcheckout blijft elk herstel `scripts/bootstrap.sh`.
- **claude-sandbox-werkstraat/AC-13** — Faalt in `scripts/runner.sh` de lezing
  `git ls-remote origin refs/heads/main` (exit ≠ 0, ook bij een timeout van die lezing), dan stopt de runner met exit 1 en
  zet op stderr de bestaande regel ongewijzigd
  (`✗ main bij de remote is niet te lezen, dus de host-bestanden zijn niet te vergelijken: draai git fetch origin main.`)
  en direct daarna, met twee spaties ingesprongen, de regel
  `→ Agent in Claude Code: draai het runnercommando kaal, als enige commando in de aanroep, vanuit de wortel, zonder cd, &&, pipe, omleiding of omhulsel; anders blijft het in de sandbox.`
  De stderr van git blijft weggegooid. Toets 1: origin `https://127.0.0.1:<poort>/repo.git` in `.git/config`, waarbij de test
  de poort neemt door te binden en weer te sluiten. Toets 2 (timeout): een `timeout`-stub vooraan op `PATH` (de runner zoekt
  `timeout` met `command -v`) die meteen met exit 124 stopt; dezelfde twee regels, zonder 30 s te wachten. Zonder de
  aanvulling falen beide.
- **claude-sandbox-werkstraat/AC-14** — Regressiepin, op de huidige code al groen (geen rode test
  vereist): een aanroeper met `GIT_CONFIG_PARAMETERS="'remote.origin.url=<andere bare>'"` krijgt dezelfde exitcode en basis
  als zonder, zoals in `test/scripts/runner-trusted-base-bypass.test.ts`; en een vaste toets stelt vast dat `scripts/runner.sh`
  geen toewijzing aan `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_*` of `GIT_CONFIG_VALUE_*` bevat (ook
  niet als tijdelijke toewijzing vóór een commando), geen `git -c` en geen `--config-env`; `GIT_CONFIG_NOSYSTEM=1` blijft. De bestaande runnertests blijven ongewijzigd groen.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Pin ongeldig, exacte versie ontbreekt of runtime wijkt af | stoppen; bestaande setup als herstel | n.v.t. |
| Cloud-mise kan afleiding niet evalueren | implementatie niet opleveren; geen stille upgrade | n.v.t. |
| Huidige branch is main of HEAD is detached | bestaande main-weigering of geen branchpush mogelijk | n.v.t. |
| gh-logcache is al schrijfbaar | geen extra allowWrite toevoegen | n.v.t. |
| Native Git weigert beschermde metadata | blokkade melden; geen brede Git-rechten | n.v.t. |
| Native Claude-proef ontbreekt | geen claim dat de dagelijkse flow werkt | n.v.t. |
| Runnercommando samengesteld aangeroepen | runner in de sandbox; melding van AC-13 noemt de kale vorm | n.v.t. |
| Remote-lezing hangt | na 30 s gestopt; dezelfde melding als AC-13 | n.v.t. |
| Sha ontbreekt lokaal na een geslaagde lezing | bestaande melding met `git fetch origin main` | n.v.t. |

## Raakt ook

Implementatie beperkt tot `mise.toml`, `.claude/settings.json`, noodzakelijke bestaande toolchain-/setupcontrole en hun
tests, met gebruiksdocumentatie in `docs/ENVIRONMENT.md` en `docs/operations/agent-doorloop.md`. Wijzig setupscripts
alleen wanneer de versiecontrole dat vereist. Bestaande sandboxtests wijzigen uitsluitend voor het besloten gedrag,
met reden in de PR. Beschermde paden, rolhek uit main, CI en eigenaarmerge blijven gelden; geen nieuw broncodemandaat,
behalve voor AC-10 tot en met AC-12: het nieuwe script `scripts/kit/worktree-install.mjs` met zijn test
`test/scripts/worktree-install.test.ts`, plus `scripts/kit/toolchain.mjs` en `.claude/settings.json` met hun tests.

AC-13 en AC-14 (route volledig, R-WERK-04: vertrouwensgrens van de runner): `scripts/runner.sh` en een nieuw testbestand
onder `test/scripts/`; bestaande runnertests ongewijzigd. Docs in dezelfde PR: `docs/operations/sandbox-bewijs.md` (punt
`excludedCommands`: alleen als elk commando in de aanroep op de lijst past, meting 2026-11-10; de verouderde verwijzingen
naar `.claude/settings.json` op regel 3, 13, 43 en 45 bijwerken), `docs/operations/agent-doorloop.md` (de bestaande passage "zonder … samengestelde
shellopdracht" in "Ontwikkelen en runnerchecks" aanvullen, geen nieuwe alinea; de verwijzingen naar `scripts/runner.sh`
bijwerken) en `docs/operations/runner-invoer.md` (alinea over de basis: de aanvullende regel). R-RUNNER-02 en ADR 0044
blijven waar. `.claude/hooks/laden.mjs` en `rails/hooks/lib/runner-authority.mjs`: geen wijziging. De PR sluit #658 (sectie
`## Leerpunt` in de PR-body). `check:migrations`, `check:secdef`, `test:db`/policies, `test/security/resources.ts` en
permissietests: n.v.t. — geen database, route of permissie.

## Buiten scope

Codexinstellingen, modelkeuze, provider/dependencywijzigingen, runner- of netwerkverruiming, nieuwe pijplijn,
projectstore/cache/stateherinrichting (behalve de worktree-installatie van AC-10), globale pnpm-writes, Git-upstreamregistratie, nieuwe rolheklogica en PR-mergen.
AC-13 en AC-14 verruimen niets. Bewust buiten scope, elk met een eigen besluit: (a) het rolhek dat de samengestelde
vorm van een runnercommando vooraf weigert met dezelfde aanwijzing (`rails/hooks/**` is `besluit-pr`; nu kijkt
`rails/hooks/lib/rolhek.mjs` naar `ctx.cwd === ctx.root && automaticRunner(command)`); (b) de kale vorm in `.claude/agents/`
en skills (beschermd pad). Ook buiten scope: leerpunt #607 en de pre-commit-job `secrets`/mise trust.

## Testplan

Een aparte tester schrijft eerst falende regressies voor de versieafleiding, settings, negatieve Git-/rolgevallen en
behoud van dependencycontrole. Setupfixtures bewijzen de volgorde, maar vervangen de echte installatieproef niet.
De bouwer controleert gericht; een onafhankelijke reviewer toetst daarna diff, criteria en testinhoud. De hoofdsessie
laat pre-push en volledige CI draaien en wacht met `pr:verify` op echte uitslagen.

Nulmeting: in een gerichte bwrap-proef met alleen eigen tijdelijke opslag schrijfbaar gaf native pnpm 11.28.5 een
SQLite-waarschuwing bij omschakeling en vervolgens 11.28.5 met exit 0; rechtstreeks native 11.28.2 gaf 11.28.2 met
exit 0; die exacte pnpm gaf met `exec prettier --version` in dezelfde proef 3.9.9 met exit 0.
`mise exec -- betterleaks version` gaf 1.9.0 met exit 0. Dit bewijst uitsluitend die probes. Leg vóór en na
implementatie daarnaast AC-9 vast in echte Claude Code-sessies; echte commits/pushes/PR-aanmaak en hooks horen bij
die proef, geen gemockte vervanging of overslaan van controles.

AC-13 en AC-14: een aparte tester schrijft eerst de unittests onder `test/scripts/`, met echte git en de echte runner
(rood voor AC-13; AC-14 is een regressiepin). Omdat de PR hostcode wijzigt, krijgen `test:db` en `ui:check` hun bewijs via
de wegwerp-CI en `pnpm pr:verify` (R-RUNNER-03).

## Open vragen

Geen onbesliste productkeuzes. Compatibiliteit en native uitvoer zijn expliciete bewijsverplichtingen uit AC-1/9,
geen verondersteld behaalde resultaten. De eigenaar besluit met zijn merge; dit voorstel bevat geen implementatie.
