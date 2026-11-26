# Recepten voor git, gh en CI

De commando's die werken, per runtime: lokaal (Claude Code op een eigen machine) en in de cloud (claude.ai/code,
`CLAUDE_CODE_REMOTE=true`). `node scripts/kit/feiten.mjs recepten` toont de kolom van de eigen runtime; `--alle` toont beide.
Spec: [agent-recepten](../template/specs/agent-recepten.md). `pnpm ratchet` toetst elk commando hier tegen het rolhek en
`permissions.deny` (`docs:recept-rolhek`).

Elk commando is één Bash-aanroep: geen pipe, `&&` of redirect erachter. Plaatshouders staan tussen `<` en `>`. `idem` betekent:
gelijk aan Lokaal.

| Taak | Lokaal | Cloud |
|---|---|---|
| Feiten over de repo | `node scripts/kit/feiten.mjs <sectie>` | idem |
| Commit | `git commit -F <bestand>` | idem |
| Push | `git push origin HEAD` | idem |
| PR openen | `gh pr create --head <branch> --base main --title <titel> --body-file <bestand>` | MCP `mcp__github__create_pull_request` (head de werkbranch, base `main`) |
| Op CI wachten | `pnpm pr:verify <nr> --watch` | idem |
| Runs van een commit | `gh api "repos/{owner}/{repo}/actions/runs?head_sha=<volledige-sha>" --jq '.workflow_runs[] \| {id, name, conclusion}'` | idem |
| Rode jobs van een run | `gh api --paginate "repos/{owner}/{repo}/actions/runs/<run-id>/jobs" --jq '.jobs[] \| select(.conclusion == "failure") \| {id, name}'` | idem |
| Samenvatting van de rode jobs (alleen de hoofdsessie) | `pnpm pr:log <nr>` | idem |
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
| Staat de remote branch er nog | `git ls-remote --heads origin <branch>` | idem |
| Remote branch verwijderen | `gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/<branch>"` | n.v.t. (de GitHub-proxy weigert de DELETE met 403; `delete_branch_on_merge` ruimt hem bij de merge op, een achtergebleven branch meld je aan de eigenaar) |
| `main` bijhalen in de PR-branch | `git fetch origin main`, dan `git merge --no-commit origin/main` en dan `git commit -F <bestand>` | idem |
| `main` bijhalen als `main` een beschermd pad wijzigt | `git fetch origin main`, dan `node scripts/kit/bijhalen.mjs main`, de genoemde beschermde paden bijwerken met Edit, dan `git diff --quiet -- <paden>` en dan `git commit -F <bestand>`; tot dan geen `git add -u`, `-A`, `.` of `commit -a` | idem |
| Branch vooruitzetten als de stap een beschermd pad wijzigt | `git fetch origin <branch>`, dan `node scripts/kit/bijhalen.mjs volg origin/<branch>` en de genoemde beschermde paden bijwerken met Edit | idem |
| Bijgehaalde merge afbreken | `node scripts/kit/bijhalen.mjs terug` | idem |
| Nieuw werk na een merge op dezelfde branch | n.v.t. (lokaal begint nieuw werk op een nieuwe branch, zie `docs/operations/agent-doorloop.md`) | `git fetch origin main`, dan `git merge --ff-only origin/main`; weigert dat (squash-merge), dan de rij "`main` bijhalen"; raakt de stap een beschermd pad, dan `node scripts/kit/bijhalen.mjs volg origin/main` |
| CI-bewijs als de werkmap niet naar de PR-head kan | n.v.t. (lokaal kan de werkmap altijd mee) | `pnpm pr:verify <nr> --zonder-werkmap` |

## Waarom deze vormen

- `gh` vult `{owner}` en `{repo}` zelf in uit de remote. Zet zo'n endpoint tussen aanhalingstekens: op 21 november 2026 gaf
  in een cloudsessie `gh api repos/{owner}/{repo}/issues/891/events --jq '…'` zonder aanhalingstekens drie keer `HTTP 401` en
  met aanhalingstekens het antwoord.
- Een lijst zonder `--paginate` geeft alleen de eerste pagina (30 items); een `merged`-gebeurtenis of een botopmerking kan
  later staan.
- `Bash(gh api *merge*)` in `permissions.deny` weigert elk `gh api`-commando met `merge` in de tekst, ook een leesfilter als
  `--jq .merged_at` of `select(.event == "merged")`. Lees de gebeurtenissen daarom zonder filter op die naam; probeer de deny
  niet te ontwijken.
- Een log van een job kan tientallen kilobytes zijn; lees het opgeslagen bestand met de Read-tool en zoek op `##[error]`.
- `gh pr …` en `gh issue …` werken in de cloud niet (GraphQL); `gh run view` werkt binnen de sandbox niet (leerpunt #679). De
  kaart gebruikt daarom `gh api`, dat lokaal en in de cloud buiten de sandbox draait (`sandbox.excludedCommands`).
- Een subagent schrijft niet naar GitHub. Andere subagents lezen met `SUBAGENT_GH` en `gh api` (GET); de reviewer heeft een
  eigen leeslijst (`rails/hooks/lib/rolhek.mjs`), in de cloud met de `gh api`-leesrecepten van deze kaart: endpoint tussen
  aanhalingstekens, alleen `--paginate` en `--jq <filter>` (spec rolhek-lezen/AC-21). Niet `pulls/<nr>/reviews` en
  `check-runs`: die weigert `permissions.deny`.
- `main` bijhalen: een kale `git merge origin/main` maakt de commit binnen de sandbox, en in de cloud faalt dan het
  ondertekenen ("failed to write commit object"; gemeten op 22 november 2026). Met `--no-commit` blijft de merge in de index
  (met `MERGE_HEAD`) en maakt `git commit -F <bestand>` de commit buiten de sandbox; het bericht begint met `Merge ` of volgt
  conventional commits (bijvoorbeeld `Merge origin/main into <branch>`), anders weigert de commit-msg-hook. Geen `MERGE_HEAD`
  (een fast-forward of al bij): dan is er niets te committen. Staat er na een mislukte merge al een `MERGE_HEAD`, dan rondt
  `git commit -F <bestand>` hem net zo af.
- De sandbox kan `.claude/skills`, `.claude/agents`, `.claude/hooks`, `.claude/settings.json` en `.claude/settings.local.json`
  niet schrijven (`docs/ENVIRONMENT.md`, "Grens van de sandbox"; `.claude/agents` in de cloud, leerpunten #789 en #895). Wijzigt `main` daar iets,
  dan breekt de merge halverwege af. Kijk dat vóór de merge na met
  `git diff --name-only HEAD...origin/main -- .claude/skills .claude/agents .claude/hooks .claude/settings.json .claude/settings.local.json`; staat er iets, merge dan niet maar meld het de eigenaar, en volg bij een
  afgebroken merge "Branchwissels in een sandbox" in [agent-doorloop](agent-doorloop.md).
