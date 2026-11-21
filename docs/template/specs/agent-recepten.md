---
status: gebouwd
namespace: agent-recepten
---

# Receptenkaart voor git, gh en CI, en voorgeschreven commando's tegen het rolhek

## Doel

Een agent vindt in één aanroep het commando voor een git-, gh- of CI-handeling dat in zijn runtime werkt (lokaal of cloud),
en `check-docs` faalt als een agentinstructie of de kaart een commando voorschrijft dat het rolhek of `permissions.deny`
weigert (leerpunten #893, #679 en #807).

## Rollen en wie wat ziet

- **Hoofdsessie:** `node scripts/kit/feiten.mjs recepten` toont de kaart voor de eigen runtime; `pnpm ratchet` (en dus
  `gate:fast` en CI) meldt een voorgeschreven commando dat geweigerd wordt.
- **Subagents:** lezen dezelfde kaart; de kaart zegt welke leesvormen een subagent heeft. Hun rechten veranderen niet.
- **Reviewer:** hoeft een voorgeschreven commando in een skill of agentbestand niet meer met de hand tegen het rolhek te leggen.
- **Eigenaar:** niets nieuws te doen.

## Kopieer de vorm van

- `scripts/kit/zonder-prompt.mjs` — een deelcheck van `check-docs` in een eigen bestand, met `dekt` voor een
  permissiepatroon, codeblokken en codespans uit `scripts/kit/markdown.mjs` en de zinsgrens `ZINSGRENS`.
- `test/rails/check-docs-zonder-prompt.test.ts` — een tijdelijke git-repo per fixture, gefilterd op de sleutel.
- `test/hooks/rolhek-netwerkvorm.test.ts` — een ctx voor `decide` zonder schijf, met `netwerkvormen` uit `.claude/settings.json`.
- `scripts/kit/feiten.mjs` — een sectie in de sectielijst die `--alle` leest (zoals `specs` en `fase`), met een plek in
  `VOLGORDE` uit `scripts/kit/feiten-secties.mjs`.

## Hergebruik en UX

Geen UI. Drie delen.

### 1. De kaart: `docs/operations/recepten.md`

Eén tabel met de kop `| Taak | Lokaal | Cloud |`. Een cel bevat codespans en gewone tekst; `idem` in de kolom Cloud betekent
"gelijk aan Lokaal". Een codespan die met `git `, `gh `, `pnpm ` of `node ` begint, is een commando; andere codespans (een
MCP-toolnaam, een plaatshouder) zijn tekst. Plaatshouders staan tussen `<` en `>`. Zoals in GFM is `\|` in een cel een
letterlijke `|`, ook binnen een codespan; alleen een `|` zonder `\` ervoor scheidt cellen. Elk commando is één Bash-aanroep;
staan er meer in een cel, dan in die volgorde.

Rijen (elke lezende `gh api`-vorm is op 21 november 2026 in een cloudsessie gedraaid, met `--paginate` waar het een lijst is;
de schrijvende niet):

| Taak | Lokaal | Cloud |
|---|---|---|
| Feiten over de repo | `node scripts/kit/feiten.mjs <sectie>` | idem |
| Commit | `git commit -F <bestand>` | idem |
| Push | `git push origin HEAD` | idem |
| PR openen | `gh pr create --head <branch> --base main --title <titel> --body-file <bestand>` | MCP `mcp__github__create_pull_request` (head de werkbranch, base `main`) |
| Op CI wachten | `pnpm pr:verify <nr> --watch` | idem |
| Runs van een commit | `gh api "repos/{owner}/{repo}/actions/runs?head_sha=<volledige-sha>" --jq '.workflow_runs[] \| {id, name, conclusion}'` | idem |
| Rode jobs van een run | `gh api --paginate "repos/{owner}/{repo}/actions/runs/<run-id>/jobs" --jq '.jobs[] \| select(.conclusion == "failure") \| {id, name}'` | idem |
| Log van een job | `gh api "repos/{owner}/{repo}/actions/jobs/<job-id>/logs"` | idem |
| Status en head van een PR | `gh api "repos/{owner}/{repo}/pulls/<nr>" --jq '{state, closed_at, draft, ref: .head.ref, sha: .head.sha}'` | idem |
| Is de PR gemerged | `gh api --paginate "repos/{owner}/{repo}/issues/<nr>/events" --jq '.[] \| {event, commit_id}'` | idem |
| Reviewopmerkingen | `gh api --paginate "repos/{owner}/{repo}/pulls/<nr>/comments" --jq '.[] \| {id, path, line, user: .user.login, body}'` | idem |
| PR-reacties | `gh api --paginate "repos/{owner}/{repo}/issues/<nr>/comments" --jq '.[] \| {id, user: .user.login, body}'` | idem |
| Antwoord op een reviewopmerking | `gh api -X POST "repos/{owner}/{repo}/pulls/<nr>/comments/<id>/replies" -F body=@<bestand>` | idem |
| Beantwoorde botgesprekken sluiten | `pnpm pr:resolve <nr>` | idem |
| Mergen (geen beschermd pad) | `pnpm pr:merge <nr>` | idem |
| Open PR's | `gh api --paginate "repos/{owner}/{repo}/pulls?state=open" --jq '.[] \| {number, title, ref: .head.ref}'` | idem |
| Issues zoeken | `gh api "search/issues?q=repo:{owner}/{repo}+is:issue+<zoekwoord>" --jq '.items[] \| {number, title, state}'` | idem |
| Leerpunt indienen | `gh issue create --repo <template.repository> --label leerpunt --title <titel> --body-file <bestand>` | MCP `mcp__github__issue_write` (aanmaken, label `leerpunt`, naar `template.repository`) |
| Remote branch verwijderen | `gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/<branch>"` | idem |
| `main` bijhalen in de PR-branch | `git fetch origin main` en dan `git merge origin/main` | idem |

Onder de tabel staat:

- `gh` vult `{owner}` en `{repo}` zelf in uit de remote. Zet zo'n endpoint tussen aanhalingstekens: op 21 november 2026 gaf
  in een cloudsessie `gh api repos/{owner}/{repo}/issues/891/events --jq '…'` zonder aanhalingstekens drie keer `HTTP 401` en
  met aanhalingstekens het antwoord.
- Een lijst zonder `--paginate` geeft alleen de eerste pagina (30 items); een `merged`-gebeurtenis of een botopmerking kan
  later staan.
- `Bash(gh api *merge*)` in `permissions.deny` weigert elk `gh api`-commando met `merge` in de tekst, ook een leesfilter als
  `--jq .merged_at` of `select(.event == "merged")`. Lees de gebeurtenissen daarom zonder filter op die naam; probeer de deny
  niet te ontwijken.
- Een log van een job kan tientallen kilobytes zijn; lees het opgeslagen bestand met de Read-tool en zoek op `##[error]`.
- `gh pr …` en `gh issue …` werken in de cloud niet (GraphQL); `gh run view` werkt binnen de sandbox niet (#679). De kaart
  gebruikt daarom `gh api`, dat lokaal en in de cloud buiten de sandbox draait.
- Een subagent schrijft niet naar GitHub. De reviewer leest alleen `gh pr view|diff|checks|list|status`,
  `gh run view|list|watch` en `gh issue view|list|status` (`rails/hooks/lib/rolhek.mjs`, `SUBAGENT_GH` en de leeslijst van de
  reviewer); in de cloud werken die niet, dus daar levert de hoofdsessie de PR-gegevens aan.
- `main` bijhalen faalt in de sandbox als `main` iets onder `.claude/skills` of `.claude/agents` wijzigt (#789); volg dan
  "Branchwissels in een sandbox" in `docs/operations/agent-doorloop.md`.

### 2. `node scripts/kit/feiten.mjs recepten`

Nieuw bestand `scripts/kit/recepten.mjs` met twee exports: `receptRijen(tekst)` leest de tabel (een rij is
`{ taak, lokaal, cloud }`, met `idem` al vervangen door de waarde van Lokaal) en `receptenSectie(tekst, { cloud, alle })` geeft
het resultaat van een feitensectie. De sectie `recepten` staat in de sectielijst van `scripts/kit/feiten.mjs` (ze leest
`--alle`) en achteraan in `VOLGORDE`; ze leest
`docs/operations/recepten.md` uit de werkmap en `cloud` is `process.env.CLAUDE_CODE_REMOTE === 'true'`.

- Kop: `runtime <lokaal|cloud> (CLAUDE_CODE_REMOTE); bron docs/operations/recepten.md; --alle toont beide kolommen`.
- Inhoud zonder `--alle`: per rij `{ taak, commando }`, met de cel van de eigen runtime. Met `--alle`: `{ taak, lokaal, cloud }`.
- `--json` geeft dezelfde lijst. Ontbreekt de kaart, dan is de inhoud
  `["docs/operations/recepten.md ontbreekt"]`; een kaart zonder de kop `| Taak | Lokaal | Cloud |` geeft
  `["docs/operations/recepten.md: geen tabel met | Taak | Lokaal | Cloud |"]`.

### 3. De check: `docs:recept-rolhek`

Nieuw bestand `scripts/kit/recept-rolhek.mjs` met één export `receptRolhekViolations(files, read)`, aangeroepen vanuit
`docsViolations` in `scripts/kit/check-docs.mjs`.

1. **Bestanden:** getrackt `docs/operations/recepten.md` (de kaart), `.claude/skills/**/SKILL.md`, `.claude/agents/*.md`,
   `.claude/rules/*.md`, `AGENTS.md` en `CLAUDE.md` (de agentinstructies).
2. **Kandidaten:** elke codespan (witruimte, ook een regeleinde, wordt één spatie, zoals in CommonMark) en elke regel in een
   codeblok tussen hekken, getrimd, met `\|` vervangen door `|`, die begint
   met `git `, `gh `, `pnpm ` of `node `. Niet: een kandidaat met `*`, `…` of `...` (een patroon of afkorting), en een
   codeblokregel die op `\` eindigt (een afgebroken commando). In de kaart alleen de codespans in de tabelcellen. De sleutel en
   de melding gebruiken de kandidaat na deze vervanging.
3. **Uitzonderingen, alleen buiten de kaart:** een codespan in een zin met het hele woord `nooit`, `weigert`, `weigeren`,
   `verboden` of `dicht` (hoofdletterongevoelig). Een zin loopt tot `;`, een zinseinde (`.`, `!` of `?` gevolgd door
   witruimte), een witregel, een `|` zonder `\` ervoor, of een regeleinde gevolgd door `|` of een lijstmarker (`-`, `*` of
   `<cijfers>.`, gevolgd door een spatie), steeds buiten codespans. `niet` en `geen` tellen bewust niet: ze staan te vaak in een gewone instructie
   ("als de branch nog geen upstream heeft"). Ook geen melding voor een kale `pnpm <script>` als `pnpm <script> 1` niet
   geweigerd wordt (een verwijzing naar een kitscript). Een regel in een codeblok heeft geen uitzondering.
4. **Invullen:** elke plaatshouder `<…>` wordt `1`.
5. **Toets:** `decide` uit `rails/hooks/lib/rolhek.mjs` met payload `{ tool_name: 'Bash', tool_input: { command } }` (de
   hoofdsessie) en een ctx zonder schijf: `root` en `cwd` `/repo`, `config` uit het getrackte `.claude/gates.json`, `read`
   geeft `null`, `committed` en `isDir` geven `false`, `branch` `feat/x`, `netwerkvormen` uit `sandbox.excludedCommands`,
   `mergeTrusted`, `kitTrusted` (sinds spec `ci-log`) en `runnerTrusted` `true`; in een app ook `.claude/gates.app.json` als het getrackt is (tweede argument van
   `loadConfig`). Een `deny` is een melding; een `ask` niet. Alleen zonder deny van het rolhek: een regel `Bash(<patroon>)` uit
   `permissions.deny` die het ingevulde commando dekt (`dekt` uit `zonder-prompt.mjs`) is een melding. Zo heeft elke
   kandidaat hooguit één melding.
6. **Endpoint:** een `gh api`-commando waarvan het endpoint `{owner}` of `{repo}` bevat en niet tussen aanhalingstekens staat,
   is een melding, in de kaart en in de agentinstructies (dezelfde uitzonderingen als stap 3).

Meldingen letterlijk, sleutel `docs:recept-rolhek:<bestand>:<commando>` (het commando na de vervanging van `\|`, vóór het invullen van plaatshouders):

- `<bestand>:<regel>: \`<commando>\` weigert het rolhek: <eerste deny-reden>`
- `<bestand>:<regel>: \`<commando>\` staat in permissions.deny van .claude/settings.json`
- `<bestand>:<regel>: \`<commando>\`: zet een endpoint met {owner} of {repo} tussen aanhalingstekens, anders draait gh api in de sandbox en geeft het 401`

Zonder getrackt `.claude/gates.json` of `.claude/settings.json` geeft de check niets. Onleesbare JSON in een van beide geeft
één melding met sleutel `docs:recept-rolhek:config` en tekst `<bestand>: geen geldige JSON`. Gooit `loadConfig` op geldige
JSON (een ontbrekende of verkeerde sleutel), dan geeft deze check niets en crasht hij niet: de vorm van `.claude/gates.json`
bewaken andere deelchecks (`docs:paden`), en het rolhek faalt dan zelf dicht. Zo blijven de bestaande fixtures van
`check-docs` met een minimale `gates.json` ongewijzigd.

### 4. De skill `opleveren` en de verwijzingen

- CI-lus stap 3: bij rood de rode jobs en hun log volgens de kaart (`gh api --paginate "repos/{owner}/{repo}/actions/runs/<run-id>/jobs" …`
  en `gh api "repos/{owner}/{repo}/actions/jobs/<job-id>/logs"`), lokaal en in de cloud; `gh run view --log-failed` blijft
  genoemd als lokale vorm buiten de sandbox.
- Opruimen stap 1: in de cloud is de trigger een `merged`-gebeurtenis uit
  `gh api --paginate "repos/{owner}/{repo}/issues/<nr>/events" --jq '.[] | {event, commit_id}'`, met `ref` en `sha` uit de rij "Status en
  head van een PR"; lokaal blijft `gh pr view`.
- Opruimen stap 6 en Mergen stap 3: het endpoint tussen aanhalingstekens.
- De slotstap noemt `template.repository` in plaats van `onderhoud.repository` (#807), ook in de cloudzin; de zin over
  `app:init` en de vaste upstream vervalt.
- `AGENTS.md` (Werkafspraken, de regel over taakrelevante feiten), `docs/operations/agent-doorloop.md` ("Gewone commits,
  pushes en PR-aanmaak in Claude Code") en `docs/ENVIRONMENT.md` ("Cloud: commit, push, PR en bewijs") verwijzen naar
  `node scripts/kit/feiten.mjs recepten`; `docs/ENVIRONMENT.md` zet het endpoint tussen aanhalingstekens.

## Acceptatiecriteria

- **agent-recepten/AC-1** — Gegeven de getrackte bestanden van de template zelf, wanneer `receptRolhekViolations` draait,
  dan geen melding, en `receptRijen` op `docs/operations/recepten.md` geeft minstens de taken "Commit", "Push", "PR openen",
  "Log van een job", "Is de PR gemerged" en "Leerpunt indienen"; de rijen "Is de PR gemerged", "Reviewopmerkingen" en
  "Open PR's" bevatten `--paginate`. Toets: `test/rails/check-docs-recept-rolhek.test.ts`
- **agent-recepten/AC-2** — Gegeven `.claude/skills/x/SKILL.md` (voorbeeld) met de zin "Push met `git push -u origin HEAD`." en
  `.claude/agents/y.md` (voorbeeld) met een codeblok met de regel `git push -u origin HEAD`, wanneer `check-docs` draait, dan twee meldingen
  met sleutel `docs:recept-rolhek:<bestand>:git push -u origin HEAD` en "weigert het rolhek: Netwerkvorm"; met
  `git push origin HEAD` geen. Toets: `test/rails/check-docs-recept-rolhek.test.ts`
- **agent-recepten/AC-3** — Gegeven elk van deze teksten in een SKILL.md, wanneer `check-docs` draait, dan geen melding:
  "Nooit `gh pr merge 1`."; "`git push -u origin HEAD` weigert het rolhek."; "Regel `gh api *`."; "Zie `gh pr …`."; "Mergen
  via `pnpm pr:merge`."; en dezelfde verboden vorm in `docs/operations/andere.md`. Wel een melding: een codeblok met de regel
  `gh pr merge 1`; de zin "Push met `git push -u origin HEAD` als de branch nog geen upstream heeft."; een tabel met de rijen
  `| Push | \`git push -u origin HEAD\` |` en `| Force | nooit |` (de `|` is een zinsgrens). Toets: `test/rails/check-docs-recept-rolhek.test.ts`
- **agent-recepten/AC-4** — Gegeven een kaart met een rij waarvan de cel Cloud "nooit `git push -u origin HEAD`" bevat, wanneer
  `check-docs` draait, dan een melding (de kaart kent geen uitzondering); een cel met
  `gh api "repos/{owner}/{repo}/commits/<sha>/check-runs" --jq .total_count` en `Bash(gh api *check-runs*)` in
  `permissions.deny` geeft "staat in permissions.deny van .claude/settings.json". Toets: `test/rails/check-docs-recept-rolhek.test.ts`
- **agent-recepten/AC-5** — Gegeven een kaart met `gh api repos/{owner}/{repo}/pulls/<nr>/comments --jq '.[].id'`, wanneer
  `check-docs` draait, dan de melding "zet een endpoint met {owner} of {repo} tussen aanhalingstekens"; met het endpoint tussen
  dubbele of enkele aanhalingstekens geen; dezelfde vorm zonder aanhalingstekens in een SKILL.md geeft dezelfde melding.
  Toets: `test/rails/check-docs-recept-rolhek.test.ts`
- **agent-recepten/AC-6** — Gegeven `pnpm pr:merge <nr>` in een SKILL.md, wanneer `check-docs` draait, dan geen melding
  (plaatshouder `1`, vertrouwde ctx); zonder getrackt `.claude/gates.json` geen melding van deze check; met ongeldige JSON in
  `.claude/settings.json` precies één melding met sleutel `docs:recept-rolhek:config`; met een `.claude/gates.json` zonder
  `testpaden` geen melding van deze check en geen crash. Toets:
  `test/rails/check-docs-recept-rolhek.test.ts`
- **agent-recepten/AC-7** — Gegeven een kaart met `\|` binnen een codespan en `idem` in de kolom Cloud, wanneer
  `receptRijen` draait, dan blijft de codespan één cel met een letterlijke `|` en is `cloud` gelijk aan `lokaal`; `receptenSectie` met `cloud: true`
  geeft per rij `{ taak, commando }` met de cel Cloud, met `cloud: false` de cel Lokaal, met `alle: true` `{ taak, lokaal, cloud }`;
  zonder tabel de ene regel uit "Hergebruik en UX". Toets: `test/scripts/feiten-recepten.test.ts`
- **agent-recepten/AC-8** — De skill `opleveren` noemt in de CI-lus `actions/jobs/<job-id>/logs`, in Opruimen
  `issues/<nr>/events`, in de slotstap `template.repository` en niet meer `onderhoud.repository`, en elk `gh api`-endpoint met
  `{owner}` staat tussen aanhalingstekens. Toets: `test/rails/opleveren-skill.test.ts`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Verboden vorm in een zin die hem afwijst, over twee regels afgebroken | De zin telt als geheel: geen melding | — |
| `ask` van het rolhek (bv. `pnpm format`) | Geen melding | — |
| Rolgebonden weigering (een subagent mag niet pushen) | Niet getoetst: de check toetst als hoofdsessie | — |
| Dezelfde melding twee keer in één bestand | Eén melding per sleutel | — |
| Rolhek-deny én een deny-patroon (bv. `gh pr merge 1`) | Alleen de melding van het rolhek | — |

## Raakt ook

- `pnpm ratchet` (check-docs) en de beschrijving van de ratchet in `scripts/kit/gates.mjs` ("voorgeschreven commando's tegen
  het rolhek").
- `docs/template/specs/leerlus.md` AC-3: `onderhoud.repository` wordt `template.repository` (#807); de spec blijft gebouwd en
  de eigenaarmerge is het besluit (ADR 0080 punt 4). Ook `test/rails/opleveren-skill.test.ts` (de letterlijke slotstap en
  leerlus-bewijs/AC-8) wijzigt daarom (R-TEST-02).
- `docs/template/specs/leerlus.md`: ook de zinnen die `onderhoud.repository` als leerpuntdoel van de skill noemen, voor zover
  ze niet over de allow-regel (AC-8) gaan.
- Beschermde paden: `.claude/skills/opleveren/SKILL.md`, `AGENTS.md`, `scripts/**` (voorReview), `scripts/kit/gates.mjs`
  (besluit-PR), `docs/operations/recepten.md` en `docs/framework.md` (de regel "Afgedwongen door" bij R-TOOL). Het werk is
  kritiek (R-WERK-05): in de template spec, code en tests in één PR, de eigenaar keurt goed en merget.

## Buiten scope

- Commando's in `docs/framework.md`, `docs/ENVIRONMENT.md`, `docs/nieuwe-app.md` en de andere operationele documenten
  (OV-1).
- Nieuwe kitscripts, zoals een samenvatting van een CI-log of `pr:bijwerken` voor #789: vervolg-PR met eigen spec, omdat ze
  `sandbox.excludedCommands` raken.
- De leesrechten van de reviewer in de cloud (OV-4) en de melding van het rolhek die `gh api -X DELETE repos/{owner}/…` zonder
  aanhalingstekens voorstelt (OV-5).
- `leerlus/AC-8`: de allow-regel voor `gh issue create` blijft aan `onderhoud.repository` gekoppeld.

## Testplan

Unit-tests met tijdelijke git-repo's in `test/rails/check-docs-recept-rolhek.test.ts`, pure functies in
`test/scripts/feiten-recepten.test.ts`, de bestaande skilltest aangepast; `pnpm ratchet` en `pnpm gate:fast` groen op de
template. In de PR: `node scripts/kit/feiten.mjs recepten` met en zonder `CLAUDE_CODE_REMOTE=true`. Bewijs voor #893 in de
sectie `## Leerpunt`: `test/rails/check-docs-recept-rolhek.test.ts` (rood op de basis, want daar ontbreekt de deelcheck).

## Open vragen

- **OV-1** — Moet de check ook de andere documenten toetsen? Een proef op `docs/framework.md`, `docs/ENVIRONMENT.md`,
  `docs/nieuwe-app.md` en `docs/operations/**` gaf met dezelfde uitzonderingen 14 meldingen, bijna allemaal vals:
  commando's voor de terminal van de eigenaar (`gh repo edit "$R" …`), meetverslagen en afwijzingen in een zin die de
  regelgrens overschrijdt. Aanbeveling: niet; agentcommando's horen in de kaart en die documenten verwijzen ernaar.
- **OV-2** — Hoe leest een agent of een PR gemerged is? `Bash(gh api *merge*)` in `permissions.deny` weigert elk `gh api`-commando
  met `merge` in de tekst, dus ook `--jq .merged_at`. Aanbeveling: de gebeurtenissen van het issue lezen (`event: merged`); dat
  is een gewoon leesendpoint, de deny blijft ongewijzigd en `.claude/settings.json` hoeft niet te veranderen.
- **OV-3** — #807 wijzigt AC-3 van de gebouwde spec `leerlus`. Aanbeveling: in deze PR, met de eigenaarmerge als besluit
  (ADR 0080 punt 4), omdat de skill het rolhek moet volgen (`template.repository`, spec `template-repo`).
- **OV-4** — De reviewer kan in de cloud geen PR-gegevens lezen: zijn `gh pr`-vormen gaan via GraphQL en `gh api` staat niet op
  zijn leeslijst. Aanbeveling: buiten deze PR; nieuw leerpunt met de meting.
- **OV-5** — De weigering van het rolhek voor `git push origin --delete` noemt `gh api -X DELETE repos/{owner}/{repo}/…` zonder
  aanhalingstekens (`GH_DELETE_VORM` in `rails/hooks/lib/rolhek.mjs`). Aanbeveling: buiten deze PR (rails); meenemen in het
  leerpunt van OV-4.
