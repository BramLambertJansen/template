---
status: goedgekeurd
namespace: cloud-netwerkvorm
---

# Cloudsessie: netwerkcommando's alleen in de vorm die buiten de sandbox draait

## Doel

Een agent die een netwerk- of signeergevoelig commando in een verkeerde vorm geeft, krijgt vóór het uitvoeren een weigering.
De weigering noemt de vorm die wel buiten de sandbox draait. Een uitwijkroute die lefthook overslaat, gaat niet stil door.
De regel geldt lokaal en in de cloud, want `excludedCommands` en de sandbox gelden in beide (OV-5).

## Aanleiding en gemeten feiten

Aanleiding (framework §1): twee cloudsessies liepen op 20 november 2026 vast op de route uit spec `cloud-pr-route`. Bron
van F1 tot en met F4: overdracht van de eigenaar, gemeten rond 16:35 UTC. Bron van F5 tot en met F7: deze sessie. Bron van
F8 tot en met F12: deze sessie, een nieuwe cloudsessie na de merge van PR #890, 21 november 2026 (testplan stap 0). Bron van
F13 en F14: een cloudsessie op 26 november 2026 (roadmap-item "Cloud-netwerkvorm: vervolg op de review van de bouw").

| # | Feit |
|---|---|
| F1 | `git commit -q -F <bestand> 2>&1 \| tail -2; git log --oneline -1` draaide in de sandbox en gaf `fatal: failed to write commit object` (sessie "Leertickets beheer"). |
| F2 | Na een push zonder inloggegevens week een agent uit naar `mcp__github__push_files`. Die commit liep buiten lefthook om (sessie "Leerticket"). |
| F3 | De platforminstructie van een cloudsessie schrijft `git push -u origin <branch>` voor. Dat past niet op het patroon `git push origin HEAD`. |
| F4 | `.claude/settings.json` is sinds `1327bcf`/`4e87ba1` ongewijzigd: de lijst is niet overschreven. |
| F5 | `sandbox.excludedCommands` (`.claude/settings.json:137-148`) bevat `pnpm pr:merge *`, `pnpm pr:resolve *`, `pnpm test:db *`, `pnpm ui:check *`, `pnpm gate:slow *`, `pnpm db:generate *`, `pnpm check:snapshot *`, `git commit *`, `git push origin HEAD`, `gh api *` en `pnpm pr:verify *`. |
| F6 | `decideMcp` (`rails/hooks/lib/rolhek.mjs:341`) vraagt de hoofdsessie al om akkoord voor elke `mcp__`-tool buiten `mcpLezen`, en weigert hem voor een subagent. `mcpLezen` is `[]`. |
| F7 | Een Bash-commando in deze cloudsessie ziet `CLAUDE_CODE_REMOTE=true` en `CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE=cloud_default`. |
| F8 | (d) De startmelding van een nieuwe cloudsessie na de merge toont ``Cloud: commit `git commit -F <bestand>`, push `git push origin HEAD`, PR via `mcp__github__create_pull_request`, elk als los commando.`` Het hookproces ziet dus `CLAUDE_CODE_REMOTE=true`. |
| F9 | (a) `git commit -F <bestand> 2>&1 \| tail -2` wordt vóór het uitvoeren geweigerd: `rolhek: Netwerkvorm: draai dit als los commando in de vorm git commit -F <bestand>; buiten deze vorm draait het in de sandbox, zonder token-proxy en signeerdienst (docs/ENVIRONMENT.md, "Cloud: commit, push, PR en bewijs")`. `git log --oneline -1` toont daarna geen nieuwe commit. |
| F10 | (b) `git push -u origin HEAD` wordt geweigerd met dezelfde reden, met de vorm `git push origin HEAD`. |
| F11 | (c) `git commit -F <bestand>` en `git push origin HEAD`, elk los, slagen. De lefthook-hooks draaien: pre-commit (format, secrets), commit-msg (conventional-commit) en pre-push (`gate:fast` groen, `main-achterstand`). Het commitobject heeft een `gpgsig`-blok (SSH), en de signeerdienst gaf geen fout. |
| F12 | (e) `git push origin HEAD:refs/heads/meet-wegwerp-2026-11-21` wordt geweigerd met de reden van F10. De wegwerpbranch kwam er daarna niet (`git ls-remote origin 'refs/heads/meet*'` bleef leeg), dus de DELETE is niet uitgevoerd. |
| F13 | (e) In auto-modus weigert de classifier van Claude Code `gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/claude/dreamy-ritchie-54law3"` (de eigen werkbranch, net gepusht met `git push origin HEAD`) als destructieve actie; het rolhek liet het commando door. |
| F14 | (e) Na akkoord van de eigenaar geeft hetzelfde commando in de cloud `Write access to this GitHub API path is not permitted through this proxy. (HTTP 403)`. `git ls-remote origin refs/heads/claude/dreamy-ritchie-54law3` toont de branch daarna nog. In de cloud verwijdert deze route dus geen branch. |

**Niet gemeten:** of Claude Code `pnpm test:db *` ook toepast op het kale `pnpm test:db`. Of een redirect zoals `2>&1` achter
een verder passend commando de uitzondering breekt (F9 laat zien dat het rolhek zo'n vorm eerder weigert). Het ontwerp kiest
bij die twee punten de veilige kant (punt 2). Of `gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/<branch>"` lokaal een branch verwijdert; in de cloud doet hij dat
niet (F14), en in auto-modus weigert de classifier hem eerst (F13).

## Rollen en wie wat ziet

- **Hoofdsessie en elke subagent**: de regel "netwerkvorm" (punt 2) geldt voor elke rol. Het is een weigering, geen vraag:
  in de verkeerde vorm faalt het commando toch.
- **MCP-bestandsschrijftools** (punt 3): de hoofdsessie krijgt een vraag aan de eigenaar, een subagent een weigering. Dat
  geldt ook als zo'n tool in `mcpLezen` staat.
- Geen UI en geen eindgebruiker.

## Ontwerp

1. **Eén bron.** De regel leest de patronen uit `sandbox.excludedCommands` in `.claude/settings.json`, uit dezelfde
   vertrouwde basis als `.claude/gates.json` (`rails/hooks/lib/rolhek-context.mjs`, `configuratie`). Binnen een hook komt het
   bestand uit het anker. Ontbreekt het daar, dan is de lijst leeg en raakt de regel niets (OV-8): de regel helpt, de
   sandbox blijft de grens. Is het er wel maar geen geldige JSON, dan faalt het rolhek dicht, zoals bij `gates.json`.
   Daarbuiten geldt de vertrouwde basis met terugval op de werkmap. `decide` blijft puur: de patronen komen als lijst in
   `ctx` (bijvoorbeeld `ctx.netwerkvormen`). Er komt geen tweede lijst in code. Bewust: het rolhek leest de lijst uit het
   anker (main), terwijl Claude Code de `settings.json` van de werkmap toepast. Een PR die de lijst wijzigt, werkt in het
   rolhek pas na de merge.
2. **Regel "netwerkvorm".** Per patroon is het **voorvoegsel** de woorden vóór een afsluitende ` *`. Zonder ` *` zijn het de
   eerste twee woorden (`git push` uit `git push origin HEAD`). Een Bash-commando **raakt** een patroon als een segment uit
   `parseCommands` het programma en het subcommando van het voorvoegsel heeft. Dat segment kan ook binnen een groep of
   compound staan, of binnen `$(…)` of backticks (via `substitutions`). Dat laatste kijkt niet naar enkele aanhalingstekens.
   Een bekend vals positief is daarom `echo '$(git push)'` of een `--body` met `` `git push -u` `` erin. De reden wijst dan naar
   `-F`/`--body-file`, wat AGENTS.md al voorschrijft. Daarbij:
   - tellen toewijzingen, pad-wrappers en het programmapad niet mee (`programName`: `/usr/bin/git` telt als `git`);
   - telt bij `git` het subcommando uit `gitSubcommand` (na `-C`, `-c` en andere git-opties);
   - telt bij `pnpm` het eerste woord dat geen optie of optiewaarde is, na een eventuele `run`. Opties met een waarde zijn
     `-C`/`--dir`, `-F`/`--filter`, `--workspace` en de bestaande set `PNPM_OPTIONS_WITH_VALUE` in `rails/hooks/lib/rolhek.mjs`
     (onder meer `--reporter` en `--loglevel`), ook in de vorm `--dir=x`. Een onbekende optie telt zonder waarde.
     Zo raken `pnpm run test:db`, `pnpm -C x test:db` en `pnpm --filter x test:db` het voorvoegsel `pnpm test:db`.

   Een commando dat raakt, moet in zijn **geheel** op een patroon met dat voorvoegsel passen:
   - precies één segment, zonder operator (`|`, `;`, `&&`, `||`, `&`), groep, compound, `$(…)`, backticks, procesvervanging of
     heredoc;
   - in dat segment zijn `redirects`, `kopieen` (`2>&1`) en `inputs` (`<`) leeg, en er staan geen toewijzingen of wrappers vóór
     het programma;
   - de woorden, na de shellontleding (aanhalingstekens weg), zijn letterlijk gelijk aan de patroonwoorden, ook het
     programmawoord (`/usr/bin/git` past niet op `git`). Een afsluitende ` *` staat voor nul of meer verdere woorden, en in die
     woorden mag parameterexpansie staan (`git commit -F $TMPDIR/msg.txt`, OV-6), want het patroon dekt die tekst letterlijk;
   - elk teken van het commando hoort bij een token of is witruimte. Een commentaar (`# …`) of een afsluitende newline maakt
     het commando dus niet passend.

   De regel draait in `decide` vóór de automatische runner-allow (`automaticRunner`) en vóór `decidePrMerge`. Een `deny` van
   deze regel wint dus van een automatische allow.

   Past het niet, dan volgt een `deny` voor elke rol, met als reden
   `Netwerkvorm: draai dit als los commando in de vorm <patronen met dit voorvoegsel>; buiten deze vorm draait het in de
   sandbox, zonder token-proxy en signeerdienst (docs/ENVIRONMENT.md, "Cloud: commit, push, PR en bewijs")`.
   Een ` *` toont de reden als ` …`. Is het voorvoegsel `git commit`, dan staat er `git commit -F <bestand>`, de vorm uit
   `docs/ENVIRONMENT.md`. Het rolhek kiest die tekst zelf, niet uit de lijst. Heeft een `git push` een verwijderoptie
   (`--delete`, `-d` of een refspec met lege bron, `:x` of `+:x`), dan noemt de reden ook
   `gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/<branch>"` (punt 5).
   `pnpm pr:merge` en `pnpm pr:resolve` houden hun eigen regel (`decideKitScript`): voor die voorvoegsels voegt deze regel
   niets toe.
3. **Geen omweg.** `mcp__github__push_files`, `mcp__github__create_or_update_file` en `mcp__github__delete_file` geven voor de
   hoofdsessie een `ask`, en voor een subagent een `deny`, ook als de naam in `mcpLezen` staat. De reden is
   `Push met \`git push origin HEAD\` als los commando; deze route slaat lefthook over`.
   `mcp__github__create_pull_request` valt niet onder deze regel (ADR 0078 punt 4); `decideMcp` blijft voor die tool gelden.
4. **Push met upstream.** `git push -u origin HEAD` komt niet in `excludedCommands` (OV-1). Punt 2 weigert die vorm met
   `git push origin HEAD` in de reden.
5. **Remote branch opruimen.** Stap 6 van de skill opleveren (`.claude/skills/opleveren/SKILL.md`) wordt
   `gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/<headRefName>"`, in plaats van `git push origin --delete` (OV-7).
   `gh api *` staat al in `excludedCommands`. `excludedCommands`, `boundaries.json`, R-TOOL-02 en ADR 0061 blijven gelijk.
   De skill wijzigt de hoofdsessie met Edit, met akkoord van de eigenaar. De deny-regels voor `git push` naar `main` in
   `.claude/settings.json` dekken deze route niet. Daarom weigert het rolhek voor elke rol een `gh api` met een andere
   methode dan GET of met velden op het endpoint `…/git/refs/heads/main`. Vóór die toets normaliseert het rolhek het endpoint:
   `%2F`/`%2f` wordt `/`, meerdere `/` worden één, en een query (`?…`), een fragment (`#…`) en een afsluitende `/` vallen
   weg. Sinds AC-14 decodeert het rolhek elke procent-escape (niet alleen `%2F`), herhaald tot er niets meer verandert, en
   telt ook `…/branches/main/rename`. De toets is hoofdletterongevoelig (`refs/heads/MAIN` telt ook). De reden is
   `gh api: main verwijderen of verzetten is verboden, voor elke rol`. Andere branches blijven onder de bestaande gh-regels
   vallen. Een subagent schrijft via `gh api` sowieso niet. De echte grens voor `main` blijft de ruleset op GitHub; deze regel
   is extra bescherming. Andere schrijvende endpoints op `main` (zoals `contents` met `branch=main`) vallen buiten deze spec.
   `permissions.allow` heeft geen regel voor `gh api`, dus lokaal kan deze stap een vraag aan de eigenaar geven. De skilltekst
   zegt dat erbij.
6. **Startmelding.** `sessionStart` (`rails/hooks/lib/werkstraat.mjs`) toont één regel als de omgeving van de hook
   `CLAUDE_CODE_REMOTE=true` heeft:
   `Cloud: commit \`git commit -F <bestand>\`, push \`git push origin HEAD\`, PR via \`mcp__github__create_pull_request\`, elk als los commando.`
   Zonder die variabele, of met een andere waarde, staat de regel er niet (OV-3). De functie krijgt de omgeving via `deps`,
   zodat de test haar kan zetten.
7. **Aanvalscorpus.** `netwerkvorm` krijgt een lid in `REGELS` met een fragment en een basisrij in
   `test/hooks/rolhek-aanvalscorpus.ts` (spec rolhek-aanvalscorpus).

8. **Vervolg op de review van #890** (roadmap-item "Cloud-netwerkvorm: vervolg op de review van de bouw"; besluiten OV-9 t/m
   OV-12):
   - **N-1** (AC-14): de main-regel decodeert elke procent-escape en weigert ook `…/branches/main/rename`. GraphQL
     `deleteRef`/`updateRef` is **aanvaard**: die mutaties nemen een ref-ID, geen naam, dus het rolhek ziet niet welke ref
     het is; de ruleset op GitHub blijft de grens (OV-9). Ook aanvaard (review): dot-segmenten (`heads/x/../main`) en de
     gh-plaatshouder `{branch}` normaliseert het rolhek niet. Query en fragment vallen weg vóór het decoderen, want een
     `%3F` of `%23` is voor GitHub een teken in het pad.
   - **N-3** (AC-15): punt 3 geldt onder elke servernaam: `mcp__<server>__push_files`, `…__create_or_update_file` en
     `…__delete_file` (OV-10).
   - **N-5** (AC-16): weigert de regel voor elke rol een `git push` al met `push naar main is verboden; open een PR`, dan voegt
     de netwerkvorm geen tweede melding toe. `git push --force origin main` houdt de main-reden en de force-reden; alleen de
     netwerkvorm-melding valt weg. Staat er in hetzelfde commando nog een andere push, dan valt ook diens netwerkvorm-melding
     weg; het hele commando blijft geweigerd.
   - **B-3** (AC-17): een corpustoets leest de codeblokken in `docs/**` en `.claude/skills/**` met de kandidaatregels van
     spec agent-recepten (Ontwerp punt 2) en toetst ze tegen `decide` voor de hoofdsessie. Een blok voor de terminal van de
     eigenaar staat direct onder de regel `<!-- terminal: eigenaar -->` en telt niet (OV-11). Uitleg in
     `docs/operations/recepten.md` (bovenaan). De bestaande check `docs:recept-rolhek` blijft gelijk en kent de markering
     niet: in een `SKILL.md` helpt hij dus niet. Een app toetst met `.claude/gates.app.json` als dat bestand er is.

## Kopieer de vorm van

- `rails/hooks/lib/rolhek.mjs` — `decideKitScript`: precies deze vorm, anders een weigering met de vorm in de reden
- `rails/hooks/lib/rolhek-context.mjs` — `configuratie`: vertrouwde basis, dicht falen in een hook
- `test/hooks/rolhek-pr-merge.test.ts` — payloads per rol tegen `decide`, de reden letterlijk getoetst

## Hergebruik en UX

Geen UI. Zichtbare tekst staat letterlijk in Ontwerp punt 2, 3 en 6.

## Acceptatiecriteria

- **cloud-netwerkvorm/AC-1** — Met de echte `excludedCommands` krijgen `git commit -F msg.txt`, `git commit`,
  `git commit -m "x y"`, `git commit -F $TMPDIR/msg.txt`, `git push origin HEAD` en het kale `pnpm test:db` geen weigering van de regel netwerkvorm, voor de hoofdsessie en voor de developer. Toets:
  `test/hooks/rolhek-netwerkvorm.test.ts`
- **cloud-netwerkvorm/AC-2** — `git commit -q -F msg.txt 2>&1 | tail -2; git log --oneline -1`, `cd /x && git commit -F m`,
  `git commit -F m > uit.txt`, `git commit -F m 2>/dev/null`, `git commit -F - <m` en `git commit -F "$(cat m)"` krijgen
  voor elke rol een `deny` die `git commit -F <bestand>` en `zonder token-proxy en signeerdienst` noemt. Toets:
  `test/hooks/rolhek-netwerkvorm.test.ts`
- **cloud-netwerkvorm/AC-3** — `git push -u origin claude/foo`, `git push origin claude/foo`, `git push`,
  `git -C /x push origin HEAD`, `/usr/bin/git push origin HEAD`, `GIT_TRACE=1 git push origin HEAD` en
  `git push origin HEAD --force` krijgen voor elke rol een `deny` die `git push origin HEAD` noemt. Dat geldt ook buiten de
  cloud (OV-5). `git push origin --delete feat/x` en `git push origin :feat/x` krijgen een `deny` die ook
  `gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/<branch>"` noemt, met het endpoint tussen aanhalingstekens
  (zonder gaf `gh api` in de cloud `HTTP 401`, leerpunt #898, `docs/operations/recepten.md`). Toets: `test/hooks/rolhek-netwerkvorm.test.ts`
- **cloud-netwerkvorm/AC-4** — `gh api repos/o/r | jq .x` krijgt een `deny` die `gh api …` noemt; `gh api repos/o/r` krijgt
  geen weigering van deze regel. Toets: `test/hooks/rolhek-netwerkvorm.test.ts`
- **cloud-netwerkvorm/AC-5** — `git log --oneline`, `git status`, `pnpm test:unit` en `echo "git push" > notes.txt` krijgen
  geen melding van deze regel. Toets: `test/hooks/rolhek-netwerkvorm.test.ts`
- **cloud-netwerkvorm/AC-6** — Een ctx met een extra patroon `foo bar *` geeft op `foo bar x | cat` een `deny` die
  `foo bar …` noemt. Zonder dat patroon komt er geen melding. De regel haalt zijn patronen dus uit de ctx. Toets:
  `test/hooks/rolhek-netwerkvorm.test.ts`
- **cloud-netwerkvorm/AC-7** — `rolhekContext` leest `sandbox.excludedCommands` uit de vertrouwde basis. In een hook (anker
  gezet) zonder `.claude/settings.json` in het anker geeft de functie een lege lijst, zonder fout (OV-8). Met een
  settingsbestand met ongeldige JSON in het anker gooit de functie, en het rolhek faalt dicht. Een geldig settingsbestand
  zonder `excludedCommands` geeft een lege lijst, zonder fout. Toets:
  `test/hooks/rolhek-netwerkvorm-context.test.ts`
- **cloud-netwerkvorm/AC-8** — `mcp__github__push_files`, `mcp__github__create_or_update_file` en `mcp__github__delete_file`
  geven voor de hoofdsessie een `ask` en voor elke subagent een `deny`, met `git push origin HEAD` en `lefthook` in de reden,
  ook met de naam in `mcpLezen`. Toets: `test/hooks/rolhek-netwerkvorm.test.ts`
- **cloud-netwerkvorm/AC-9** — `mcp__github__create_pull_request` krijgt geen melding met `lefthook`; de bestaande uitkomst
  van `decideMcp` blijft. Toets: `test/hooks/rolhek-netwerkvorm.test.ts`
- **cloud-netwerkvorm/AC-10** — `sessionStart` met `CLAUDE_CODE_REMOTE=true` in de omgeving uit `deps` toont de regel uit Ontwerp
  punt 6 letterlijk. Zonder de variabele, of met `false`, staat er geen regel die met `Cloud:` begint. Toets:
  `test/hooks/werkstraat-cloudregel.test.ts`
- **cloud-netwerkvorm/AC-11** — Het aanvalscorpus heeft de regel `netwerkvorm` met een basisrij. Elke vorm uit het corpus
  rond die basis geeft een `deny` met het fragment. Toets: `test/hooks/rolhek-aanvalscorpus.test.ts`
- **cloud-netwerkvorm/AC-12** — `pnpm run test:db`, `pnpm -C x test:db | tail`, `pnpm --filter x test:db`,
  `pnpm --dir=x test:db` en `pnpm test:db | tail` krijgen een `deny`
  die `pnpm test:db …` noemt, ook in de repo-root met een vertrouwde runner. De weigering wint van de automatische allow, en
  `decision.allow` is niet `true`. Toets: `test/hooks/rolhek-netwerkvorm.test.ts`
- **cloud-netwerkvorm/AC-13** — `gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/feat/x` krijgt geen weigering van deze
  regel of de main-regel voor de hoofdsessie. `gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/main`,
  `gh api --method PATCH repos/o/r/git/refs/heads/main -f sha=abc`, `gh api -XDELETE /repos/o/r/git/refs/heads/main/`,
  `gh api -X DELETE repos/o/r/git/refs/heads%2Fmain` en `gh api -X DELETE repos/o/r/git/refs/heads//main?x=1`
  krijgen voor elke rol een `deny` met `main verwijderen of verzetten`. `gh api repos/o/r/git/refs/heads/main` (GET) krijgt
  die melding niet. Toets: `test/hooks/rolhek-netwerkvorm.test.ts`

- **cloud-netwerkvorm/AC-14** — `gh api -X DELETE repos/o/r/git/refs/heads/%6Dain`, `…/git/refs%2Fheads%2F%6D%61%69%6E`,
  `…/git/refs/heads%252Fmain`, `gh api -X PATCH repos/o/r/git/%72efs/heads/MAIN -f sha=abc`,
  `gh api -X POST repos/o/r/branches/main/rename -f new_name=oud` en `gh api repos/o/r/branches/%6Dain/rename -f new_name=oud`
  en `gh api -X DELETE repos/o/r%3F/git/refs/heads/main` krijgen voor elke rol een `deny` met `main verwijderen of verzetten`; `…/heads/%6Dain-oud`, een rename van `feat%2Fx` en een
  GET op `branches/main/rename` niet. Toets: `test/hooks/rolhek-netwerkvorm.test.ts`
- **cloud-netwerkvorm/AC-15** — `mcp__plugin_engineering_github__push_files`, `mcp__github-enterprise__create_or_update_file` en
  `mcp__gh__delete_file` geven, ook met de naam in `mcpLezen`, voor de hoofdsessie een `ask` en voor elke subagent een `deny`
  met de reden van punt 3; `…__create_pull_request`, `…__get_file_contents` en `mcp__x__push_files_old` krijgen geen
  lefthook-melding. Toets: `test/hooks/rolhek-netwerkvorm.test.ts`
- **cloud-netwerkvorm/AC-16** — `git push origin main`, `git push origin HEAD:main` en `git push -u origin main` geven voor elke
  rol de reden `push naar main is verboden; open een PR` en geen `Netwerkvorm:`; `git push origin claude/foo` houdt de
  netwerkvorm-melding. Toets: `test/hooks/rolhek-netwerkvorm.test.ts`
- **cloud-netwerkvorm/AC-17** — Geen commandoregel in een codeblok in `docs/**` of `.claude/skills/**` krijgt een weigering van
  het rolhek, behalve in een blok direct onder `<!-- terminal: eigenaar -->`. De toets vangt `git push -u origin HEAD`, een
  regel met een `#`-commentaar en `pnpm test:db | tail`, en slaat alleen het gemarkeerde blok over. Toets:
  `test/rails/docs-codeblok-rolhek.test.ts`

## Randgevallen

| Situatie | Gedrag |
|---|---|
| `git commit -m "x y"` | past op `git commit *`: geen weigering van deze regel (OV-2; AC-1) |
| `git commit -F $TMPDIR/msg.txt` | parameterexpansie in een `*`-woord: geen weigering (OV-6; AC-1) |
| `GIT_TRACE=1 git push origin HEAD` | toewijzing vóór het programma: `deny` (AC-3) |
| `git push origin HEAD --force` | past niet op `git push origin HEAD`: `deny` van deze regel; de bestaande force-weigering blijft (AC-3) |
| `pnpm test:db` zonder argumenten | past op `pnpm test:db *` (` *` = nul of meer woorden): geen weigering (AC-1) |
| `pnpm run test:db` | raakt `pnpm test:db` maar past niet: `deny`, wint van de runner-allow (AC-12) |
| `echo "git push" > notes.txt` | geen segment heeft programma `git` met subcommando `push`: niet geraakt (AC-5) |
| `excludedCommands` ontbreekt in een geldig settingsbestand | lege lijst: de regel raakt niets, geen fout (AC-7) |
| `git push origin --delete feat/x` | past niet op `git push origin HEAD`: `deny`, met de gh api-vorm in de reden (AC-3) |
| `gh api -X DELETE …/git/refs/heads/main` | `deny` voor elke rol (AC-13) |
| `pnpm pr:merge 12 \| tail` | `decideKitScript` weigert al; deze regel mag een tweede melding geven |
| `git push origin main` | alleen `push naar main is verboden; open een PR`, geen netwerkvorm-melding (AC-16) |
| GraphQL `deleteRef` op main | aanvaard: het rolhek ziet de ref niet (ID), de ruleset is de grens (OV-9) |

## Raakt ook

- `rails/hooks/lib/rolhek.mjs`, `rails/hooks/lib/rolhek-context.mjs`, `rails/hooks/lib/werkstraat.mjs` en
  `rails/hooks/werkstraat.mjs`: beschermde paden; die gelden pas na de merge op `main` (de stub laadt main).
- **Kritiek werk:** `rails/hooks/**` staat op `besluit-pr` (`.claude/gates.json`). Daarom schrijft een aparte tester de
  AC-tests, bouwt de developer, volgt een aparte review, en keurt de eigenaar de PR goed en merget hem (R-WERK-05, R-WERK-07).
- `test/hooks/rolhek-aanvalscorpus.ts`: nieuw lid in `REGELS`.
- `.claude/skills/opleveren/SKILL.md` stap 6 (rond r.72): `gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/<headRefName>"`
  (OV-7). De hoofdsessie wijzigt dit met Edit, met akkoord van de eigenaar; de Bash-sandbox kan `.claude/skills/` niet schrijven.
- Niet geraakt: `.claude/settings.json`, `boundaries.json`, R-TOOL-02 (`docs/framework.md`) en ADR 0061. De lijst van
  uitzonderingen blijft gelijk.
- **Gewijzigde testverwachtingen** (R-TEST-02, reden in de PR: deze spec, OV-5 en OV-7). Na de bouw krijgt de ctx van deze
  tests de echte patronen, zodat ze de hook volgen zoals hij werkt:
  - `test/hooks/rolhek.test.ts`: de pushvormen rond r.215, r.222, r.382, r.398 en r.399 (`git push`,
    `git push -u origin feat/main-menu`, `git push --follow-tags origin feat`, `git push origin HEAD:feat`) gaan van
    toegestaan naar `deny`;
  - `test/hooks/opruimen-git.test.ts`: `git push origin --delete …` gaat van toegestaan naar `deny`; de opruimstap gebruikt
    `gh api` (AC-3, AC-13).
  - `test/hooks/rolhek-script.test.ts` (r.34-36) en `test/hooks/rolhek-uitvoer.test.ts` (r.184-185): de exacte stderr bij
    `git push origin main` krijgt naast de bestaande reden de netwerkvorm-melding (twee weigeringen, zoals bij `--force`).
    Herzien door AC-16 (vervolg, N-5; R-TEST-02): daar staat nu alleen `push naar main is verboden; open een PR`.
  - `test/hooks/rolhek-netwerkvorm-context.test.ts`: de AC-7-test "geen settings.json in het anker gooit" wordt "geeft een
    lege lijst" (OV-8).
- Docs (R-WERK-15), met `bestand:regel`:
  - `docs/ENVIRONMENT.md` "Cloud: commit, push, PR en bewijs";
  - `docs/operations/agent-doorloop.md` (de cloudroute rond r.314-320);
  - vervolg (punt 8): `test/rails/docs-codeblok-rolhek.test.ts` (nieuw), `docs/nieuwe-app.md` (markering boven twee
    eigenaarblokken, commentaar uit de `gh api user`-regel), `docs/operations/recepten.md` (de markering) en
    `docs/ENVIRONMENT.md` (N-1, N-3, F14);
  - een fragment in `docs/template-changelog.d/`.

## Buiten scope

- De platforminstructie die `git push -u` voorschrijft; die is niet van de repo.
- `gh pr create` in de cloud (spec `cloud-pr-route`).

## Testplan

0. **Na de merge, in een nieuwe cloudsessie** (zoals stap 0 van `cloud-pr-route`): meet en leg vast in deze spec onder "Aanleiding".
   (a) `git commit -F <bestand> 2>&1 | tail -2` geeft de weigering met de vorm. (b) `git push -u origin HEAD` geeft de weigering.
   (c) `git commit -F <bestand>` en `git push origin HEAD`, elk los, slagen zonder fout. (d) De startmelding toont de
   Cloud-regel. Dat meet ook of het hookproces `CLAUDE_CODE_REMOTE` ziet. (e) `gh api -X DELETE
   repos/{owner}/{repo}/git/refs/heads/<testbranch>` verwijdert een wegwerpbranch. Gemeten op 20 november 2026 in deze sessie:
   een GET met `{owner}/{repo}` op `git/refs/heads/<branch>` slaagt door het rolhek. DELETE is niet gemeten. Vastgelegd op
   21 november 2026 in F8 tot en met F12. Voor (e) maakt de eigenaar de wegwerpbranch, want het rolhek weigert de push met
   een refspec (F12). Gemeten op 26 november 2026 op de eigen werkbranch (F13, F14): in de cloud geeft de route HTTP 403
   van de proxy en blijft de branch staan; in auto-modus weigert de classifier hem eerst. Lokaal is hij niet gemeten.
1. Unit: de AC's hierboven, in `pnpm gate:fast`.

## Open vragen

- **OV-1 ✅ besloten** — `git push -u origin HEAD` uitzonderen of alleen weigeren? Eigenaar, 20 november 2026: alleen weigeren
  met de aanwijzing. De lijst blijft gelijk.
- **OV-2 ✅ besloten** — Het overdrachtsplan verwacht een weigering voor `git commit -m "x"`, maar die vorm past op
  `git commit *` en draait dus buiten de sandbox. Eigenaar, 20 november 2026: niet weigeren. De regel volgt alleen de lijst;
  de startmelding en de docs noemen `-F` als de vorm.
- **OV-3 ✅ besloten** — Startmelding alleen in de cloud of altijd? Eigenaar, 20 november 2026: alleen in de cloud, herkend aan
  `CLAUDE_CODE_REMOTE=true` (F7). Het hookproces ziet die variabele ook (F8).
- **OV-4 ✅ besloten** — MCP-bestandsschrijftools altijd weigeren, of in de hoofdsessie na een vraag? Eigenaar, 20 november 2026:
  in de hoofdsessie na een vraag, voor een subagent weigeren.
- **OV-5 ✅ besloten** (spec-review B-2) — Geldt de regel overal of alleen in de cloud? Eigenaar, 20 november 2026: overal,
  want `excludedCommands` geldt ook lokaal. De tests met een andere pushvorm worden herzien (Raakt ook).
- **OV-6 ✅ besloten** (spec-review N-1) — Is `git commit -F $TMPDIR/msg.txt` toegestaan? Eigenaar, 20 november 2026: ja.
  Parameterexpansie in een `*`-woord mag; `$(…)`, backticks, redirects, pipes en heredocs niet.
- **OV-7 ✅ besloten** (spec-review B-1, herzien na B-3 en B-4) — `git push origin --delete <branch>` uit de skill opleveren.
  Eigenaar, 20 november 2026: eerst een nieuw patroon in `excludedCommands`. Daarna, toen bleek dat dit ook R-TOOL-02,
  ADR 0061 en `test/rails/excluded-commands.test.ts` raakt: de opruimstap gebruikt
  `gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/<branch>`. `gh api *` staat al in de lijst, die gelijk blijft.
- **OV-8 ✅ besloten** (bouw) — Wat als `.claude/settings.json` in het anker ontbreekt? Eigenaar, 20 november 2026: een lege
  lijst; de regel raakt dan niets. Dicht falen voor alles zou te zwaar zijn voor een hulpregel; de sandbox blijft de grens.
  Ongeldige JSON faalt nog wel dicht.
- **OV-9 ✅ besloten** (vervolg, N-1) — Hoe ver gaat de main-regel? Eigenaar, 26 november 2026: elke procent-escape decoderen en
  `…/branches/main/rename` weigeren; GraphQL `deleteRef`/`updateRef` aanvaard (ref-ID, de ruleset is de grens).
- **OV-10 ✅ besloten** (vervolg, N-3) — Welke servernamen vallen onder punt 3? Eigenaar, 26 november 2026: elke server; een vals
  positief kost alleen een vraag die `decideMcp` buiten `mcpLezen` toch al stelt.
- **OV-11 ✅ besloten** (vervolg, B-3) — Hoe wordt een blok voor de eigenaar uitgezonderd? Eigenaar, 26 november 2026: geen
  voorkeur; de hoofdsessie koos de markering `<!-- terminal: eigenaar -->` boven het blok, want die werkt ook in een app
  zonder de templatetest te wijzigen.
- **OV-12 ✅ besloten** (vervolg, meting (e)) — De classifier weigerde de DELETE (F13). Eigenaar, 26 november 2026: sta het toe en
  meet opnieuw. Uitslag: HTTP 403 van de proxy (F14).
