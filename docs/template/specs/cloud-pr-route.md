---
status: goedgekeurd
namespace: cloud-pr-route
---

# Cloudsessie: committen, pushen, PR en CI-bewijs

## Doel

Een cloudsessie op deze repo of een app uit de template kan een commit maken, pushen, een PR openen en het CI-bewijs
lezen. Daarvoor draaien vier commando's buiten de Bash-sandbox, lokaal en in de cloud (herziening van ADR 0061).

## Aanleiding en gemeten feiten

Aanleiding (framework §1): op 20 november 2026 kon een cloudsessie op deze repo niet committen en gaf `gh` op elke
aanroep 401. Elke regel noemt zijn bron; wat niet gemeten is, staat onder "Niet gemeten". Bron van F1 tot en met F12:
melding van de sessie van de eigenaar, 20 november 2026.

**Sessie op `main`, omgeving uit `docs/ENVIRONMENT.md`, sandbox actief**

| # | Feit |
|---|---|
| F1 | `echo "$GH_TOKEN"` geeft `proxy-injected`. `gh api "repos/{owner}/{repo}"`, `gh run list`, `gh pr list`, `gh pr view`, `gh pr checks` en `gh api graphql` geven alle `HTTP 401: Bad credentials`, in twee sessies. |
| F2 | `git commit -F <bestand>`: pre-commit (`format`, `secrets`) en commit-msg (`conventional-commit`) slagen. Daarna faalt het ondertekenen: `environment-runner code-sign` krijgt `dial tcp 127.0.0.1:39907: connect: connection refused`, gevolgd door `fatal: failed to write commit object`, exit 128. Een tweede poging geeft hetzelfde. |
| F3 | De MCP-tools `mcp__github__list_pull_requests`, `pull_request_read` (`get_check_runs`) en `actions_list` leveren de PR, de checks en de laatste workflow-run. `mcpLezen` in `.claude/gates.json` is `[]`; een aanroep die de eigenaar niet goedkeurt, eindigt met `Denied by user`. |

**Sessie op een lege repo zonder `.claude/settings.json`, omgeving Default**

| # | Feit |
|---|---|
| F4 | `gh api "repos/{owner}/{repo}" --jq .full_name` slaagt. |
| F5 | `gh pr list --limit 1` geeft `HTTP 403: GitHub GraphQL is not available from Claude Code sessions; use the REST API`, met als route voor een PR: `gh api repos/<owner>/<repo>/pulls -f title=… -f head=… -f base=… -f body=…`. |
| F6 | `git commit --allow-empty` en `git push origin HEAD` slagen. |
| F7 | `gh api repos/<owner>/<repo>/issues -f title=…` (schrijven via REST) slaagt en geeft het issuenummer. |

**Sessie op branch `test/cloud-sandbox`: `sandbox.excludedCommands` aangevuld met `git commit *`, `git push *`, `gh api *` en `pnpm pr:verify *`**

| # | Feit |
|---|---|
| F8 | `gh api "repos/{owner}/{repo}" --jq .full_name`, `git commit --allow-empty` en `git push origin HEAD` slagen, zonder prompt. Deze sessie had geen toolchain (Node v22.23.5, geen `node_modules`), dus lefthook draaide niet. |
| F9 | `gh api repos/{owner}/{repo}/pulls -f title=… -f head=… -f base=… -f body=… -F draft=true --jq '…'`, als één losse regel, geeft `HTTP 401: Bad credentials`. |
| F10 | `mcp__github__create_pull_request` opent draft-PR #864, na één prompt aan de eigenaar. |
| F11 | In een tweede sessie op dezelfde branch, met toolchain (Node v26.11.1, `node_modules` aanwezig): `pnpm pr:verify 864` start, noemt elf checks met hun uitslag en eindigt met `CI is rood; herstel de oorzaak en controleer de nieuwe commit`, exit 1. |
| F12 | CI op #864 is rood op één test, in `gate:fast` en `check:new-resource`: `test/rails/claude-sandbox-werkstraat.test.ts:60`, `expected [ 'pnpm pr:merge *', …(10) ] to deeply equal [ 'pnpm pr:merge *', …(6) ]`. |

**Uit deze repo**

| # | Feit | Bron |
|---|---|---|
| R1 | "pnpm/Git buiten de sandbox uitvoeren" is een afgewezen alternatief; de bestaande runneruitzonderingen blijven behouden. | ADR 0061, Alternatieven en punt 5 |
| R2 | De test vergelijkt `sandbox.excludedCommands` met een vastgelegde lijst. | `test/rails/claude-sandbox-werkstraat.test.ts:60`, `test/rails/fixtures/claude-sandbox-werkstraat/boundaries.json` |
| R3 | Het rolhek laat van `mcp__`-tools alleen de namen uit `mcpLezen` door; elke andere is een vraag (hoofdsessie) of een weigering (subagent). | `rails/hooks/lib/rolhek.mjs:341` |
| R4 | De doorloop en de allow-regels gebruiken `gh pr create`, `gh pr view`, `gh pr list`, `gh pr diff` en `gh pr checks`. | `.claude/settings.json`, `docs/operations/agent-doorloop.md` |
| R5 | `pnpm pr:verify` leest GitHub met `gh api <endpoint>` en draait code uit de werkmap (`scripts/`). | `scripts/kit/github-evidence.mjs:29` |
| R6 | `Bash(gh api *merge*)` staat in `deny`; het rolhek weigert het woord `merge` naast `gh` of `/pulls/` ook (bewuste valse melding). Een commando met het woord "mergen" in de PR-tekst werd geweigerd met `Permission to use Bash with command … has been denied`, zonder regel of reden. Welke van de twee het was, is niet gemeld. | `.claude/settings.json`; `docs/operations/agent-doorloop.md`, "Gewone commits, pushes en PR-aanmaak"; melding van de sessie |
| R7 | De zeven bestaande runneruitzonderingen staan alle in `ask`; R-TOOL-02 en ADR 0044 punt 5 laten alleen die buiten de sandbox draaien, "elk na goedkeuring". `git commit *`, `git push origin HEAD` en `pnpm pr:verify *` staan in `allow`. | `docs/framework.md` (R-TOOL-02), ADR 0044 punt 5, `.claude/settings.json` |
| R8 | ADR 0084 wijst "`pr:verify` in `sandbox.excludedCommands`" af: dan draait code uit de werkmap buiten de sandbox. Een excludedCommand beschermt alleen het rolhek vooraf (ADR 0082 punt 4). | ADR 0084, Alternatieven; ADR 0082 punt 4 |
| R9 | MCP-schrijfacties zijn verboden, op één uitzondering na: het leerpunt-issue in de cloud. | ADR 0078 punt 4; R-SEC-09, R-ROL-12 |
| R10 | Een subagent mag `gh api` alleen als GET op een leesbaar REST-endpoint, met `--jq`, `--paginate`, `--include`, `--silent` of een Accept-header; geen `--hostname`, geen GraphQL. | `rails/hooks/lib/rolhek.mjs` (`apiReads`) |

**Uit de documentatie van Claude Code (gelezen 20 november 2026)**

| # | Feit | Bron |
|---|---|---|
| D1 | De GitHub-proxy weigert GraphQL, dus ook `gh pr` en `gh issue`; `gh api` op REST werkt voor de gekoppelde repo met de plaatshouder `proxy-injected`. | [cloud-environments](https://code.claude.com/docs/en/cloud-environments), GitHub proxy |
| D2 | De toegangsniveaus heten in de documentatie None, Trusted, Full en Custom. De app van de eigenaar toont None, Limited en Full. | idem, Access levels; melding van de eigenaar |

**Gevolgtrekking.** F1 en F2 tegenover F4, F6 en F8: de Bash-sandbox uit `.claude/settings.json` schermt in de cloud de
voorzieningen van het platform af (de proxy die het token invult, de signeerdienst op de loopback). Buiten de sandbox
werken lezen, committen en pushen. Het verschil tussen de sessies is niet tot één instelling teruggebracht: de lege repo
had ook een andere omgeving en geen hooks.

**Niet gemeten; eerst meten (Testplan)**

- **M1** — Geeft `gh api` lokaal een prompt nu het buiten de sandbox draait en niet in `allow` staat? In de cloud gaf de
  GET geen prompt (F8); waarom niet, is niet vastgesteld.
- **M2** — Waarom geeft de POST uit F9 401 terwijl de GET uit F8 slaagt en schrijven via REST zonder sandbox werkt (F7)?
- **M3** — Slaagt een commit buiten de sandbox ook mét lefthook (toolchain aanwezig)? F8 mat het zonder hooks, F2 met
  hooks maar binnen de sandbox.
- **M4** — Krijgt een sessie op een andere branch of een andere repo de toolchain en `node_modules` uit de cache van de
  omgeving (meetpunt M6 van `docs/template/specs/cloud-zelfinstallatie.md`)? F11 zegt ja voor een andere branch; of het
  setup-script daar opnieuw draaide, is niet gemeten.
- **M5** — Welke omgeving gebruikte de sessie uit F8? Vermoeden: Default, door de keuze van de sessie ervoor.

## Rollen en wie wat ziet

Geen app-gebruikers. De hoofdsessie commit, pusht, opent de PR en leest het bewijs; subagents krijgen geen push- of
PR-recht (R-ROL-12, ongewijzigd). De eigenaar ziet één prompt per geopende PR (OV-2).

`excludedCommands` kent geen rollen: een subagent die `gh api` aanroept, draait die ook buiten de sandbox en buiten de
netwerk-allowlist. Daar is het rolhek de enige grens: alleen GET, alleen lezende opties, geen `--hostname` en geen GraphQL
(R10). Committen en pushen weigert het rolhek een subagent al (R-ROL-12).

## Kopieer de vorm van

- `test/scripts/cloud-setup.test.ts` — het setup-script met stubs op `PATH`, zonder netwerk
- `test/rails/claude-sandbox-werkstraat.test.ts` — een configuratietest tegen een vastgelegde grens
- `docs/template/specs/cloud-zelfinstallatie.md` — gemeten feiten met bron, daarna ontwerp en meetpunten

## Hergebruik en UX

Geen UI en geen nieuwe zichtbare tekst.

## Ontwerp

1. **Vier commando's draaien buiten de sandbox** (OV-1, besloten). `sandbox.excludedCommands` in `.claude/settings.json`
   krijgt `git commit *`, `git push origin HEAD`, `gh api *` en `pnpm pr:verify *`, en `boundaries.json` dezelfde vier.
   Gemeten in de cloud met de bredere vorm `git push *` (F8, F11); de smalle pushvorm is die uit ADR 0061 punt 3 en
   wordt in stap 0 gemeten. `deny`, `ask`, het rolhek, de hooks uit `main` en de ruleset blijven gelden: een uitgesloten
   commando loopt nog steeds langs de permissieregels.
   **Zonder prompt** (eigenaar, 20 november 2026, spec-review B1): `git commit *`, `git push origin HEAD` en
   `pnpm pr:verify *` blijven in `allow`; `gh api *` staat niet in `allow` en volgt de gewone permissieregels (M1, OV-5).
   Restrisico, aanvaard: lefthook (bij `git commit`) en `pr:verify` draaien code uit de werkmap buiten de sandbox, zonder
   vraag vooraf, ook op de machine van de eigenaar. Wat een subagent onder `scripts/` of `rails/` wijzigt, draait de
   hoofdsessie bij de volgende commit onbeschermd. Alleen het rolhek vooraf staat ertussen (R8); CI, de ruleset op `main`
   en de eigenaarmerge blijven de grens.
2. **De ADR's en het regelboek worden herzien** (drempel A3), elk met een regel `Herzien: 2026-11-20: …`:
   - ADR 0061: het alternatief "pnpm/Git buiten de sandbox uitvoeren of hooks overslaan" wordt "hooks overslaan"; punt 5
     noemt de vier nieuwe uitzonderingen met de reden: in een cloudsessie bereikt de sandbox de signeerdienst en de
     token-proxy van het platform niet (F1, F2). Gevolgen: het restrisico uit punt 1 van dit ontwerp.
   - ADR 0044 punt 5: "Overige opdrachten buiten de sandbox houden hun prompt" krijgt de uitzondering voor de vier
     commando's uit ADR 0061.
   - ADR 0084, Alternatieven: het afgewezen alternatief "`pr:verify` in `sandbox.excludedCommands`" is herzien door
     ADR 0061 (cloud); het restrisico staat daar.
   - ADR 0078 punt 4 (spec-review B2): naast de issuetool mag de hoofdsessie in de cloud één MCP-schrijfactie meer:
     `mcp__github__create_pull_request`, alleen voor een PR van de eigen werkbranch; in Claude Code blijft het rolhek vragen.
   - R-TOOL-02: de lijst buiten de sandbox noemt ook `git commit`, `git push origin HEAD` en `pnpm pr:verify` "zonder
     prompt (0061)", en `gh api` "volgens de permissieregels" (OV-5). R-SEC-09 en R-ROL-12: "behalve een leerpunt-issue of een PR aanmaken in de cloud".
     `AGENTS.md` (Repo en grenzen, MCP) volgt dezelfde tekst.
3. **Een PR openen gaat in de cloud via `mcp__github__create_pull_request`** (F10), in de vorm van de bestaande
   uitzondering voor het leerpunt-issue: het rolhek blijft vragen, de eigenaar keurt goed (OV-2). `gh pr create` werkt
   daar niet (F5, D1). Verklaart M2 de 401, dan kan de REST-vorm uit F5 de MCP-tool vervangen.
4. **Lezen gaat via `gh api` en `pnpm pr:verify`** (F8, F11). `mcpLezen` blijft leeg: de MCP-leestools zijn dan niet nodig.
5. **De documentatie zegt wat er gemeten is.** `docs/ENVIRONMENT.md`: `gh` op GraphQL werkt niet in de cloud, de route
   voor commit, push, PR en bewijs, het niveau "Limited" naast "Trusted", en de keuze van de omgeving bij het starten
   (M5); de zin "Geen nieuwe runneruitzondering" verdwijnt. `docs/operations/agent-doorloop.md`: de cloudvariant van
   PR-aanmaak. `docs/template/specs/claude-sandbox-werkstraat.md` blijft gebouwd en ongewijzigd; deze spec vult hem aan.
6. **De bestaande test verandert mee** (R-TEST-02): de test "alleen bestaande runneruitzonderingen" in
   `test/rails/claude-sandbox-werkstraat.test.ts` krijgt een naam die de cloudroute noemt, en
   `test/rails/excluded-commands.test.ts` laat precies `git commit *`, `git push origin HEAD` en `gh api *` toe als
   uitzondering zonder pnpm-script; reden: deze spec verandert de grens bewust.

## Acceptatiecriteria

- **cloud-pr-route/AC-1** — `sandbox.excludedCommands` in `.claude/settings.json` is gelijk aan de lijst in
  `boundaries.json`, en die bevat de zeven bestaande runneruitzonderingen (`pnpm pr:merge *`, `pnpm pr:resolve *`,
  `pnpm test:db *`, `pnpm ui:check *`, `pnpm gate:slow *`, `pnpm db:generate *`, `pnpm check:snapshot *`) plus precies
  `git commit *`, `git push origin HEAD`, `gh api *` en `pnpm pr:verify *`. Faalt op de huidige code.
  Toets: `test/rails/claude-sandbox-werkstraat.test.ts`
- **cloud-pr-route/AC-2** — Regressiebewaker, nieuwe assertie: de lijst bevat geen generieke uitsluiting (`git *`,
  `git push *`, `gh *`, `pnpm *` of `pnpm run *`). Toets: `test/rails/claude-sandbox-werkstraat.test.ts`
- **cloud-pr-route/AC-3** — `docs/ENVIRONMENT.md` noemt onder "Problemen" de 401 van `gh` binnen de sandbox en de 403 op
  GraphQL met hun letterlijke tekst, beschrijft de route voor commit, push, PR en bewijs in de cloud, en bevat de zin
  "Geen nieuwe runneruitzondering" niet meer. Toets: `test/docs/cloud-pr-route.test.ts` (nieuw)
- **cloud-pr-route/AC-4** — `docs/operations/agent-doorloop.md` noemt `mcp__github__create_pull_request` als cloudroute
  voor een PR, en R-SEC-09 en R-ROL-12 in `docs/framework.md` noemen het aanmaken van een PR in de cloud naast het
  leerpunt-issue. Toets: `test/docs/cloud-pr-route.test.ts` (nieuw)

Dat `deny`, `ask` en de sandboxvlaggen ongewijzigd blijven, toetst `test/rails/claude-sandbox-werkstraat.test.ts` al
(claude-sandbox-werkstraat/AC-7). De herzieningen van ADR 0044, 0061, 0078 en 0084 zijn procesbewijs (ADR 0100): de
reviewer toetst ze tegen Ontwerp punt 2.

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Een sessie op de omgeving Default | geen toolchain; `feiten.mjs` meldt `✗ toolchain ontbreekt` (F8) |
| PR-tekst of titel bevat "merge", "reviews", "statuses" of "check-runs" | een `gh api`-aanroep wordt geweigerd door `deny` of het rolhek (R6); geldt niet voor de MCP-tool |
| Een subagent roept `gh api` aan met `-f`, `-X POST` of `--hostname` | het rolhek weigert (R10); buiten de sandbox is dat de enige grens |
| De eigenaar keurt de prompt voor de PR niet goed | geen PR; de sessie meldt het en probeert geen andere route |

## Raakt ook

- ADR 0044, 0061, 0078 en 0084 (herzien, drempel A3, Ontwerp punt 2); ADR 0082 punt 4 blijft gelden en beschrijft het
  restrisico. `docs/template/specs/claude-sandbox-werkstraat.md` blijft ongewijzigd.
- Beschermde paden: `.claude/settings.json` (altijd vragen, besluit-PR; buiten de schrijfgrens van de sandbox, alleen via
  Edit in de hoofdsessie met akkoord), `boundaries.json`, `docs/framework.md` (voorReview), `AGENTS.md` en
  `docs/template/adr/**`. De eigenaar keurt de wijziging goed en merget.
- `docs/ENVIRONMENT.md`, "Dagelijks werken binnen de Claude Code-sandbox": de zin "Geen nieuwe runneruitzondering" klopt
  niet meer.
- R-TOOL-02, R-ROL-12 en R-SEC-09 in `docs/framework.md`, en de MCP-zin in `AGENTS.md`.
- `git commit` buiten de sandbox voert de lefthook-hooks van de branch uit, buiten de sandbox, ook op de machine van de
  eigenaar. De ruleset op `main` en de eigenaarmerge blijven de grens.

## Buiten scope

- De sandbox in de cloud uitzetten.
- Committen of pushen via MCP-tools: die schrijven om de git-hooks en de ondertekening heen.
- Een hook die in de cloud zelf installeert (`cloud-zelfinstallatie`, OV-1).

## Testplan

Stap 0 na de push van de bouw-PR en vóór de samenvoeging, door de eigenaar, op de branch van de PR, in een cloudsessie
met de omgeving uit `docs/ENVIRONMENT.md` en met toolchain:

1. M3: een commit; de uitvoer toont de lefthook-stappen en geen fout van `environment-runner code-sign`.
2. `git push origin HEAD` (de smalle vorm) slaagt.
3. M2: `gh api repos/{owner}/{repo}/pulls` als losse regel, met en zonder `--jq`; noteer de uitslag.
4. M4 en M5: `node --version` en `ls node_modules/.modules.yaml`; noteer de gekozen omgeving.
5. M1, lokaal: `gh api "repos/{owner}/{repo}" --jq .full_name` in een sessie op de laptop; noteer of er een prompt komt.

De uitslag staat in de PR vóór de samenvoeging. Faalt stap 1 (commit met lefthook) of stap 2 (smalle push), dan gaat de
PR terug naar spec-review en beslist de eigenaar opnieuw over OV-3 of het ontwerp. Over een prompt bij M1 beslist de
eigenaar onder OV-5.

Na de proeven van 20 november opruimen: PR #864 sluiten, branch `test/cloud-sandbox` verwijderen.

## Open vragen

- **OV-1 ✅ besloten** — De uitzondering komt in `.claude/settings.json`, met een herziening van ADR 0061 (eigenaar,
  20 november 2026: de ADR is te strikt). Afgewezen: een laag buiten de repo alleen voor de cloud (niet gemeten of Claude
  Code die samenvoegt) en alles via MCP (omzeilt hooks en ondertekening).
- **OV-2 ✅ besloten** — `create_pull_request` blijft een vraag aan de eigenaar (één tik per PR, geen wijziging aan het
  rolhek); herzien als het wrijving geeft (eigenaar, 20 november 2026, volgens aanbeveling).
- **OV-3 ✅ besloten** — `git push origin HEAD`, niet de bredere `git push *` (eigenaar, 20 november 2026, volgens
  aanbeveling).
- **OV-4 ✅ besloten** — Ja, een roadmap-item; de aanleiding is de meting van 20 november (eigenaar, 20 november 2026,
  volgens aanbeveling).
- **B1 ✅ besloten** (spec-review) — De nieuwe uitzonderingen blijven in `allow`, met het restrisico vastgelegd in ADR 0061
  (eigenaar, 20 november 2026). Afgewezen: `ask` voor commit en `pr:verify` (een prompt per commit, lokaal en in de cloud).
- **B2 ✅ besloten** (spec-review) — De PR-tool komt in een herziening van ADR 0078 punt 4, naast die van ADR 0061
  (eigenaar, 20 november 2026).
- **OV-5 ⚠ open** — Geeft `gh api` lokaal een prompt per aanroep (M1), komt er dan een allow-regel voor
  `gh api`-leesaanroepen? Aanbeveling: beslissen na stap 0, op de gemeten uitslag.
