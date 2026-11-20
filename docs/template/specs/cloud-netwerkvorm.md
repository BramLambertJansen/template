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
van F1 tot en met F4: overdracht van de eigenaar, gemeten rond 16:35 UTC. Bron van F5 tot en met F7: deze sessie.

| # | Feit |
|---|---|
| F1 | `git commit -q -F <bestand> 2>&1 \| tail -2; git log --oneline -1` draaide in de sandbox en gaf `fatal: failed to write commit object` (sessie "Leertickets beheer"). |
| F2 | Na een push zonder inloggegevens week een agent uit naar `mcp__github__push_files`. Die commit liep buiten lefthook om (sessie "Leerticket"). |
| F3 | De platforminstructie van een cloudsessie schrijft `git push -u origin <branch>` voor. Dat past niet op het patroon `git push origin HEAD`. |
| F4 | `.claude/settings.json` is sinds `1327bcf`/`4e87ba1` ongewijzigd: de lijst is niet overschreven. |
| F5 | `sandbox.excludedCommands` (`.claude/settings.json:137-148`) bevat `pnpm pr:merge *`, `pnpm pr:resolve *`, `pnpm test:db *`, `pnpm ui:check *`, `pnpm gate:slow *`, `pnpm db:generate *`, `pnpm check:snapshot *`, `git commit *`, `git push origin HEAD`, `gh api *` en `pnpm pr:verify *`. |
| F6 | `decideMcp` (`rails/hooks/lib/rolhek.mjs:341`) vraagt de hoofdsessie al om akkoord voor elke `mcp__`-tool buiten `mcpLezen`, en weigert hem voor een subagent. `mcpLezen` is `[]`. |
| F7 | Een Bash-commando in deze cloudsessie ziet `CLAUDE_CODE_REMOTE=true` en `CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE=cloud_default`. |

**Niet gemeten:** of een hookproces dezelfde `CLAUDE_CODE_REMOTE` ziet als een Bash-commando. Of Claude Code `pnpm test:db *`
ook toepast op het kale `pnpm test:db`. Of een redirect zoals `2>&1` achter een verder passend commando de uitzondering
breekt. Het ontwerp kiest bij die twee laatste punten de veilige kant (punt 2). Stap 0 van het testplan legt de meting na de
merge vast.

## Rollen en wie wat ziet

- **Hoofdsessie en elke subagent**: de regel "netwerkvorm" (punt 2) geldt voor elke rol. Het is een weigering, geen vraag:
  in de verkeerde vorm faalt het commando toch.
- **MCP-bestandsschrijftools** (punt 3): de hoofdsessie krijgt een vraag aan de eigenaar, een subagent een weigering. Dat
  geldt ook als zo'n tool in `mcpLezen` staat.
- Geen UI en geen eindgebruiker.

## Ontwerp

1. **Eén bron.** De regel leest de patronen uit `sandbox.excludedCommands` in `.claude/settings.json`, uit dezelfde
   vertrouwde basis als `.claude/gates.json` (`rails/hooks/lib/rolhek-context.mjs`, `configuratie`). Binnen een hook komt het
   bestand uit het anker. Is het daar onleesbaar of geen geldige JSON, dan faalt het rolhek dicht, zoals bij `gates.json`.
   Daarbuiten geldt de vertrouwde basis met terugval op de werkmap. `decide` blijft puur: de patronen komen als lijst in
   `ctx` (bijvoorbeeld `ctx.netwerkvormen`). Er komt geen tweede lijst in code. Bewust: het rolhek leest de lijst uit het
   anker (main), terwijl Claude Code de `settings.json` van de werkmap toepast. Een PR die de lijst wijzigt, werkt in het
   rolhek pas na de merge.
2. **Regel "netwerkvorm".** Per patroon is het **voorvoegsel** de woorden vóór een afsluitende ` *`. Zonder ` *` zijn het de
   eerste twee woorden (`git push` uit `git push origin HEAD`). Een Bash-commando **raakt** een patroon als een segment uit
   `parseCommands` (ook binnen een groep of compound) het programma en het subcommando van het voorvoegsel heeft. Daarbij:
   - tellen toewijzingen, pad-wrappers en het programmapad niet mee (`programName`: `/usr/bin/git` telt als `git`);
   - telt bij `git` het subcommando uit `gitSubcommand` (na `-C`, `-c` en andere git-opties);
   - telt bij `pnpm` het eerste woord dat geen optie is, na een eventuele `run` (`pnpm run test:db`, `pnpm -C x test:db` en
     `pnpm --filter x test:db` raken `pnpm test:db`).

   Een commando dat raakt, moet in zijn **geheel** op een patroon met dat voorvoegsel passen:
   - precies één segment, zonder operator (`|`, `;`, `&&`, `||`, `&`), groep, compound, `$(…)`, backticks, procesvervanging of
     heredoc;
   - in dat segment zijn `redirects`, `kopieen` (`2>&1`) en `inputs` (`<`) leeg, en er staan geen toewijzingen of wrappers vóór
     het programma;
   - de woorden, na de shellontleding (aanhalingstekens weg), zijn letterlijk gelijk aan de patroonwoorden, ook het
     programmawoord (`/usr/bin/git` past niet op `git`). Een afsluitende ` *` staat voor nul of meer verdere woorden, en in die
     woorden mag parameterexpansie staan (`git commit -F $TMPDIR/msg.txt`, OV-6), want het patroon dekt die tekst letterlijk.

   De regel draait in `decide` vóór de automatische runner-allow (`automaticRunner`) en vóór `decidePrMerge`. Een `deny` van
   deze regel wint dus van een automatische allow.

   Past het niet, dan volgt een `deny` voor elke rol, met als reden
   `Netwerkvorm: draai dit als los commando in de vorm <patronen met dit voorvoegsel>; buiten deze vorm draait het in de
   sandbox, zonder token-proxy en signeerdienst (docs/ENVIRONMENT.md, "Cloud: commit, push, PR en bewijs")`.
   Een ` *` toont de reden als ` …`. Is het voorvoegsel `git commit`, dan staat er `git commit -F <bestand>`, de vorm uit
   `docs/ENVIRONMENT.md`. Het rolhek kiest die tekst zelf, niet uit de lijst.
   `pnpm pr:merge` en `pnpm pr:resolve` houden hun eigen regel (`decideKitScript`): voor die voorvoegsels voegt deze regel
   niets toe.
3. **Geen omweg.** `mcp__github__push_files`, `mcp__github__create_or_update_file` en `mcp__github__delete_file` geven voor de
   hoofdsessie een `ask`, en voor een subagent een `deny`, ook als de naam in `mcpLezen` staat. De reden is
   `Push met \`git push origin HEAD\` als los commando; deze route slaat lefthook over`.
   `mcp__github__create_pull_request` valt niet onder deze regel (ADR 0078 punt 4); `decideMcp` blijft voor die tool gelden.
4. **Push met upstream.** `git push -u origin HEAD` komt niet in `excludedCommands` (OV-1). Punt 2 weigert die vorm met
   `git push origin HEAD` in de reden.
5. **Remote branch opruimen.** `git push origin --delete *` komt in `sandbox.excludedCommands` (`.claude/settings.json`) en
   in `test/rails/fixtures/claude-sandbox-werkstraat/boundaries.json` (OV-7). Zo blijft stap 6 van de skill opleveren
   (`git push origin --delete <headRefName>`) werken, ook in de cloud. Edit door de hoofdsessie, met akkoord van de eigenaar.
   De bestaande weigering van een push naar `main` blijft gelden.
6. **Startmelding.** `sessionStart` (`rails/hooks/lib/werkstraat.mjs`) toont één regel als de omgeving van de hook
   `CLAUDE_CODE_REMOTE=true` heeft:
   `Cloud: commit \`git commit -F <bestand>\`, push \`git push origin HEAD\`, PR via \`mcp__github__create_pull_request\`, elk als los commando.`
   Zonder die variabele, of met een andere waarde, staat de regel er niet (OV-3). De functie krijgt de omgeving via `deps`,
   zodat de test haar kan zetten.
7. **Aanvalscorpus.** `netwerkvorm` krijgt een lid in `REGELS` met een fragment en een basisrij in
   `test/hooks/rolhek-aanvalscorpus.ts` (spec rolhek-aanvalscorpus).

## Kopieer de vorm van

- `rails/hooks/lib/rolhek.mjs` — `decideKitScript`: precies deze vorm, anders een weigering met de vorm in de reden
- `rails/hooks/lib/rolhek-context.mjs` — `configuratie`: vertrouwde basis, dicht falen in een hook
- `test/hooks/rolhek-pr-merge.test.ts` — payloads per rol tegen `decide`, de reden letterlijk getoetst

## Hergebruik en UX

Geen UI. Zichtbare tekst staat letterlijk in Ontwerp punt 2, 3 en 6.

## Acceptatiecriteria

- **cloud-netwerkvorm/AC-1** — Met de echte `excludedCommands` krijgen `git commit -F msg.txt`, `git commit`,
  `git commit -m "x y"`, `git commit -F $TMPDIR/msg.txt`, `git push origin HEAD`, `git push origin --delete feat/x` en
  het kale `pnpm test:db` geen weigering van de regel netwerkvorm, voor de hoofdsessie en voor de developer. Toets:
  `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-2** — `git commit -q -F msg.txt 2>&1 | tail -2; git log --oneline -1`, `cd /x && git commit -F m`,
  `git commit -F m > uit.txt`, `git commit -F m 2>/dev/null`, `git commit -F - <m` en `git commit -F "$(cat m)"` krijgen
  voor elke rol een `deny` die `git commit -F <bestand>` en `zonder token-proxy en signeerdienst` noemt. Toets:
  `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-3** — `git push -u origin claude/foo`, `git push origin claude/foo`, `git push`,
  `git -C /x push origin HEAD`, `/usr/bin/git push origin HEAD`, `GIT_TRACE=1 git push origin HEAD` en
  `git push origin HEAD --force` krijgen voor elke rol een `deny` die `git push origin HEAD` noemt. Dat geldt ook buiten de
  cloud (OV-5). Toets: `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-4** — `gh api repos/o/r | jq .x` krijgt een `deny` die `gh api …` noemt; `gh api repos/o/r` krijgt
  geen weigering van deze regel. Toets: `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-5** — `git log --oneline`, `git status`, `pnpm test:unit` en `echo "git push" > notes.txt` krijgen
  geen melding van deze regel. Toets: `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-6** — Een ctx met een extra patroon `foo bar *` geeft op `foo bar x | cat` een `deny` die
  `foo bar …` noemt. Zonder dat patroon komt er geen melding. De regel haalt zijn patronen dus uit de ctx. Toets:
  `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-7** — `rolhekContext` leest `sandbox.excludedCommands` uit de vertrouwde basis. In een hook (anker
  gezet) zonder leesbare `.claude/settings.json` in het anker gooit de functie, en het rolhek faalt dicht. Een geldig
  settingsbestand zonder `excludedCommands` geeft een lege lijst, zonder fout. Toets:
  `test/hooks/rolhek-netwerkvorm-context.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-8** — `mcp__github__push_files`, `mcp__github__create_or_update_file` en `mcp__github__delete_file`
  geven voor de hoofdsessie een `ask` en voor elke subagent een `deny`, met `git push origin HEAD` en `lefthook` in de reden,
  ook met de naam in `mcpLezen`. Toets: `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-9** — `mcp__github__create_pull_request` krijgt geen melding met `lefthook`; de bestaande uitkomst
  van `decideMcp` blijft. Toets: `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-10** — `sessionStart` met `CLAUDE_CODE_REMOTE=true` in de omgeving uit `deps` toont de regel uit Ontwerp
  punt 6 letterlijk. Zonder de variabele, of met `false`, staat er geen regel die met `Cloud:` begint. Toets:
  `test/hooks/werkstraat-cloudregel.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-11** — Het aanvalscorpus heeft de regel `netwerkvorm` met een basisrij. Elke vorm uit het corpus
  rond die basis geeft een `deny` met het fragment. Toets: `test/hooks/rolhek-aanvalscorpus.test.ts`
- **cloud-netwerkvorm/AC-12** — `pnpm run test:db`, `pnpm -C x test:db | tail` en `pnpm test:db | tail` krijgen een `deny`
  die `pnpm test:db …` noemt, ook in de repo-root met een vertrouwde runner. De weigering wint van de automatische allow, en
  `decision.allow` is niet `true`. Toets: `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-13** — `sandbox.excludedCommands` in `.claude/settings.json` en de lijst in `boundaries.json` bevatten
  `git push origin --delete *`, naast de elf patronen uit F5. Toets: `test/rails/claude-sandbox-werkstraat.test.ts`

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
| `pnpm pr:merge 12 \| tail` | `decideKitScript` weigert al; deze regel mag een tweede melding geven |

## Raakt ook

- `rails/hooks/lib/rolhek.mjs`, `rails/hooks/lib/rolhek-context.mjs`, `rails/hooks/lib/werkstraat.mjs` en
  `rails/hooks/werkstraat.mjs`: beschermde paden; die gelden pas na de merge op `main` (de stub laadt main).
- **Kritiek werk:** `rails/hooks/**` staat op `besluit-pr` (`.claude/gates.json`). Daarom schrijft een aparte tester de
  AC-tests, bouwt de developer, volgt een aparte review, en keurt de eigenaar de PR goed en merget hem (R-WERK-05, R-WERK-07).
- `test/hooks/rolhek-aanvalscorpus.ts`: nieuw lid in `REGELS`.
- `.claude/settings.json` en `test/rails/fixtures/claude-sandbox-werkstraat/boundaries.json`: het patroon
  `git push origin --delete *` (OV-7). `settings.json` wijzigt de hoofdsessie met Edit, met akkoord van de eigenaar.
- **Gewijzigde testverwachtingen** (R-TEST-02, reden in de PR: deze spec, OV-5 en OV-7). Na de bouw krijgt de ctx van deze
  tests de echte patronen, zodat ze de hook volgen zoals hij werkt:
  - `test/hooks/rolhek.test.ts`: de pushvormen rond r.215, r.222, r.382, r.398 en r.399 (`git push`,
    `git push -u origin feat/main-menu`, `git push --follow-tags origin feat`, `git push origin HEAD:feat`) gaan van
    toegestaan naar `deny`;
  - `test/hooks/opruimen-git.test.ts`: `git push origin --delete …` blijft toegestaan, nu via het nieuwe patroon;
  - `test/rails/claude-sandbox-werkstraat.test.ts`: `cloud-pr-route/AC-1` ("plus precies" vier patronen) krijgt er
    `git push origin --delete *` bij (AC-13).
- Docs (R-WERK-15), met `bestand:regel`:
  - `docs/ENVIRONMENT.md` "Cloud: commit, push, PR en bewijs";
  - `docs/operations/agent-doorloop.md` (de cloudroute rond r.314-320);
  - een fragment in `docs/template-changelog.d/`.

## Buiten scope

- De platforminstructie die `git push -u` voorschrijft; die is niet van de repo.
- `gh pr create` in de cloud (spec `cloud-pr-route`).

## Testplan

0. **Na de merge, in een nieuwe cloudsessie** (zoals stap 0 van `cloud-pr-route`): meet en leg vast in deze spec onder "Aanleiding".
   (a) `git commit -F <bestand> 2>&1 | tail -2` geeft de weigering met de vorm. (b) `git push -u origin HEAD` geeft de weigering.
   (c) `git commit -F <bestand>` en `git push origin HEAD`, elk los, slagen zonder fout. (d) De startmelding toont de
   Cloud-regel. Dat meet ook of het hookproces `CLAUDE_CODE_REMOTE` ziet. (e) `git push origin --delete <testbranch>` slaagt.
1. Unit: de AC's hierboven, in `pnpm gate:fast`.

## Open vragen

- **OV-1 ✅ besloten** — `git push -u origin HEAD` uitzonderen of alleen weigeren? Eigenaar, 20 november 2026: alleen weigeren
  met de aanwijzing. De lijst blijft gelijk.
- **OV-2** — Het overdrachtsplan verwacht een weigering voor `git commit -m "x"`, maar die vorm past op `git commit *` en draait
  dus buiten de sandbox. Opties: (a) niet weigeren, de regel volgt alleen de lijst; (b) `-m` apart weigeren met
  `git commit -F <bestand>`. Aanbeveling: (a). De regel heeft dan één bron, en de startmelding en de docs noemen `-F` al
  als de vorm.
- **OV-3 ✅ besloten** — Startmelding alleen in de cloud of altijd? Eigenaar, 20 november 2026: alleen in de cloud, herkend aan
  `CLAUDE_CODE_REMOTE=true` (F7). De meting in het hookproces volgt in stap 0.
- **OV-4 ✅ besloten** — MCP-bestandsschrijftools altijd weigeren, of in de hoofdsessie na een vraag? Eigenaar, 20 november 2026:
  in de hoofdsessie na een vraag, voor een subagent weigeren.
- **OV-5 ✅ besloten** (spec-review B-2) — Geldt de regel overal of alleen in de cloud? Eigenaar, 20 november 2026: overal,
  want `excludedCommands` geldt ook lokaal. De tests met een andere pushvorm worden herzien (Raakt ook).
- **OV-6 ✅ besloten** (spec-review N-1) — Is `git commit -F $TMPDIR/msg.txt` toegestaan? Eigenaar, 20 november 2026: ja.
  Parameterexpansie in een `*`-woord mag; `$(…)`, backticks, redirects, pipes en heredocs niet.
- **OV-7 ✅ besloten** (spec-review B-1) — `git push origin --delete <branch>` uit de skill opleveren. Eigenaar, 20 november
  2026: het patroon `git push origin --delete *` in `excludedCommands` en `boundaries.json`. Dit herziet "de lijst blijft
  gelijk" uit OV-1 voor dit ene patroon.
