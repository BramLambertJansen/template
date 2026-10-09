# 0009 — Tests buiten de sandbox

Status: voorgesteld — door de agent, ter goedkeuring van de eigenaar. De eigenaar kiest; hieronder een aanbeveling.

## Context

De sandbox van Claude Code is op Linux/WSL2 de beveiligingsgrens (framework §8). `pnpm test:db`, `pnpm db:reset`, `pnpm db:types`,
`pnpm ui:check` en `pnpm gate:slow` staan in `excludedCommands`, omdat ze de lokale stack nodig hebben. Volgens de docs draait een
uitgesloten commando "outside the sandbox, which means no filesystem restrictions and no network proxy". `test:db`, `ui:check` en
`gate:slow` voeren testbestanden en configs uit (Vitest, Playwright) die de agent zelf schrijft. Daarmee draait door de agent
geschreven code alsnog buiten de sandbox, met de rechten van de eigenaar: `~/.ssh`, het `gh`-token, de Docker-socket, het netwerk.
CODEOWNERS op de scripts helpt niet, want het risico zit in de bestanden die het script laadt, niet in het script.

Feiten uit de Claude Code-docs ([sandboxing](https://code.claude.com/docs/en/sandboxing),
[settings](https://code.claude.com/docs/en/settings-reference); geraadpleegd 2026-10-09, pagina's zonder datum, nieuwste genoemde versie v2.1.285):

- "Linux and WSL2: the command runs in a separate network namespace that has no connection to your network." Een directe verbinding
  met `localhost` of `127.0.0.1` bereikt de host niet; `allowLocalBinding` werkt alleen op macOS.
- `allowedDomains: ["localhost"]` geldt alleen voor verkeer via de proxy; "most database drivers … can't connect, even to an allowed host".
- `allowUnixSockets` wordt op Linux genegeerd; `allowAllUnixSockets` is daar "the only way to permit Unix sockets" en opent dan álle sockets.
- `excludedCommands` matcht op de tekst van de aanroep (geen wildcard = exacte match); kinderprocessen van een uitgesloten commando
  draaien volgens de docs mee "with your full access".
- Een read-only mount is geen documenteerde sandboxinstelling; er zijn alleen `allowWrite`, `denyWrite`, `denyRead` en `allowRead`.

## Opties

**(a) Tests in een container op het compose-netwerk.** Het uitgesloten script (`scripts/test-db`, `ui-check`, `gate-slow`) start een
gepinde runner-container (`node` voor Vitest, de gepinde Playwright-image voor e2e/`ui:check`) op een eigen compose-netwerk met
`internal: true`: wel Postgres en Mailpit, geen internet, geen host-netwerk. De repo en `node_modules` read-only gemount, schrijven alleen
in tmpfs (caches, rapporten) en één uitvoermap. Geen Docker-socket, geen home-map, geen `gh`-token, alleen test-env-waarden.
Buiten de sandbox draait dan alleen het beschermde script; de door de agent geschreven code draait in de container.
- Voor: sluit het gat echt; lokaal = CI (CI draait hetzelfde script); past bij "screenshot-baselines alleen in de gepinde Playwright-image" (§11).
- Tegen: trager (container-start, ~2–5 s), Vite en Hono voor e2e draaien ook in de container; `node_modules` moet Linux-binaries
  voor dezelfde architectuur hebben (op de beoogde machines zo); het script gebruikt `docker`, terwijl de agent dat niet mag — het
  script is daarom CODEOWNERS en `ask`, en het enige pad.

**(b) Bewust risico, alleen review.** Laten zoals het is; de eigenaar leest elke nieuwe of gewijzigde test vóór hij een uitgesloten
commando goedkeurt (de aanroep loopt wel door de permissieflow).
- Voor: geen werk, snelste lus.
- Tegen: de review moet gebeuren vóór het draaien, niet bij de PR; in de praktijk keurt een mens de prompt goed zonder de testcode te lezen.
  Tegenstrijdig met "permissieregels zijn geen grens, de sandbox wel" (§8). Een kwaadaardige of foute test (prompt-injectie via een
  dependency of document) heeft volledige toegang tot de machine.

**(c) De lokale Postgres binnen de sandbox bereiken.** TCP naar `localhost` kan niet (zie docs). Wel kan Postgres een Unix-socket
in een gemounte map aanbieden en de sandbox die met `allowAllUnixSockets: true` gebruiken.
- Voor: tests draaien in de sandbox, zonder Docker in het script.
- Tegen: `allowAllUnixSockets` opent ook `/var/run/docker.sock`, en toegang tot de Docker-socket is root op de host — erger dan nu.
  Of `denyWrite` op de socket `connect()` tegenhoudt, staat niet in de docs. Lost `ui:check` en e2e niet op (de browser moet Vite op
  `localhost` bereiken via TCP). Een eigen proxy via `socksProxyPort` helpt niet: `pg` gebruikt geen proxy.

## Besluit (aanbeveling)

**Optie (a).** Het is de enige optie waarin door de agent geschreven code nergens buiten een isolatielaag draait, en hij dekt
`test:db`, `ui:check` en `gate:slow` met één mechanisme. Voor `db:reset` en `db:types` geldt het gat niet: die voeren alleen
beschermde scripts en gegenereerde SQL uit, en blijven direct in `excludedCommands`.

Uitwerking (roadmap, "rails afdwingen"):
- compose-profiel `test` met netwerk `test-net` (`internal: true`) en de runner-services; Postgres zit op beide netwerken.
- `scripts/test-db.sh`, `ui-check.sh`, `gate-slow.sh` roepen alleen `docker compose --env-file .env.local --profile test run --rm …` aan,
  met `read_only: true`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, tmpfs, repo `:ro`.
- Een test bewijst de isolatie: vanuit de runner faalt een verbinding naar internet en naar de host, en een schrijfpoging in de repo.
- Ook beschermd, omdat pnpm ze bij elk script laadt: `.npmrc` en `.pnpmfile.cjs` (nu nog niet in §10).

## Gevolgen

- `excludedCommands` blijft dezelfde lijst; wat erachter draait, verandert.
- CI draait dezelfde scripts (Docker staat op `ubuntu-24.04`-runners), dus één uitkomst lokaal en in CI.
- Tot (a) gebouwd is, geldt (b): de eigenaar keurt een uitgesloten commando pas goed na het lezen van nieuwe tests en configs.
  Dat staat in de PR-beschrijving van elke PR die tests toevoegt.
