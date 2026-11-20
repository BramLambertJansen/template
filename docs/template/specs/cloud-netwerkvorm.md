---
status: goedgekeurd
namespace: cloud-netwerkvorm
---

# Cloudsessie: netwerkcommando's alleen in de vorm die buiten de sandbox draait

## Doel

Een agent die een netwerk- of signeergevoelig commando in een verkeerde vorm geeft, krijgt vóór het uitvoeren een weigering.
De weigering noemt de vorm die wel buiten de sandbox draait. Een uitwijkroute die lefthook overslaat, gaat niet stil door.

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
   `ctx` (bijvoorbeeld `ctx.netwerkvormen`). Er komt geen tweede lijst in code.
2. **Regel "netwerkvorm".** Per patroon is het **voorvoegsel** de woorden vóór een afsluitende ` *`. Zonder ` *` zijn het de
   eerste twee woorden (`git push` uit `git push origin HEAD`). Een Bash-commando **raakt** een patroon als een segment uit
   `parseCommands`, na toewijzingen, pad-wrappers en git-opties zoals `-C` of `-c`, begint met het programma en het
   subcommando van het voorvoegsel. Bij `git` telt het subcommando uit `gitSubcommand`. Een commando dat raakt, moet in zijn
   **geheel** op een patroon met dat voorvoegsel passen:
   - precies één segment, geen operator (`|`, `;`, `&&`, `||`, `&`), geen redirect (ook geen `2>&1`), geen substitutie,
     geen heredoc, geen groep, geen toewijzing of wrapper vóór het programma;
   - de woorden, na de shellontleding (aanhalingstekens weg), zijn gelijk aan de patroonwoorden. Een afsluitende ` *` staat voor
     nul of meer verdere woorden.

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
5. **Startmelding.** `sessionStart` (`rails/hooks/lib/werkstraat.mjs`) toont één regel als de omgeving van de hook
   `CLAUDE_CODE_REMOTE=true` heeft:
   `Cloud: commit \`git commit -F <bestand>\`, push \`git push origin HEAD\`, PR via \`mcp__github__create_pull_request\`, elk als los commando.`
   Zonder die variabele, of met een andere waarde, staat de regel er niet (OV-3). De functie krijgt de omgeving via `deps`,
   zodat de test haar kan zetten.
6. **Aanvalscorpus.** `netwerkvorm` krijgt een lid in `REGELS` met een fragment en een basisrij in
   `test/hooks/rolhek-aanvalscorpus.ts` (spec rolhek-aanvalscorpus).

## Kopieer de vorm van

- `rails/hooks/lib/rolhek.mjs` — `decideKitScript`: precies deze vorm, anders een weigering met de vorm in de reden
- `rails/hooks/lib/rolhek-context.mjs` — `configuratie`: vertrouwde basis, dicht falen in een hook
- `test/hooks/rolhek-pr-merge.test.ts` — payloads per rol tegen `decide`, de reden letterlijk getoetst

## Hergebruik en UX

Geen UI. Zichtbare tekst staat letterlijk in Ontwerp punt 2, 3 en 5.

## Acceptatiecriteria

- **cloud-netwerkvorm/AC-1** — Met de echte `excludedCommands` krijgen `git commit -F msg.txt`, `git commit` en
  `git push origin HEAD` geen weigering van de regel netwerkvorm, voor de hoofdsessie en voor de developer. Toets:
  `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-2** — `git commit -q -F msg.txt 2>&1 | tail -2; git log --oneline -1`, `cd /x && git commit -F m`
  en `git commit -F m > uit.txt` krijgen voor elke rol een `deny` die `git commit -F <bestand>` en `zonder token-proxy en signeerdienst`
  noemt. Toets: `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-3** — `git push -u origin claude/foo`, `git push origin claude/foo` en
  `git -C /x push origin HEAD` krijgen voor elke rol een `deny` die `git push origin HEAD` noemt. Toets:
  `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-4** — `gh api repos/o/r | jq .x` krijgt een `deny` die `gh api …` noemt; `gh api repos/o/r` krijgt
  geen weigering van deze regel. Toets: `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-5** — `git log --oneline`, `git status` en `pnpm test:unit` krijgen geen melding van deze regel.
  Toets: `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-6** — Een ctx met een extra patroon `foo bar *` geeft op `foo bar x | cat` een `deny` die
  `foo bar …` noemt. Zonder dat patroon komt er geen melding. De regel haalt zijn patronen dus uit de ctx. Toets:
  `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-7** — `rolhekContext` leest `sandbox.excludedCommands` uit de vertrouwde basis. In een hook (anker
  gezet) zonder leesbare `.claude/settings.json` in het anker gooit de functie, en het rolhek faalt dicht. Toets:
  `test/hooks/rolhek-netwerkvorm-context.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-8** — `mcp__github__push_files`, `mcp__github__create_or_update_file` en `mcp__github__delete_file`
  geven voor de hoofdsessie een `ask` en voor elke subagent een `deny`, met `git push origin HEAD` en `lefthook` in de reden,
  ook met de naam in `mcpLezen`. Toets: `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-9** — `mcp__github__create_pull_request` krijgt geen melding met `lefthook`; de bestaande uitkomst
  van `decideMcp` blijft. Toets: `test/hooks/rolhek-netwerkvorm.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-10** — `sessionStart` met `CLAUDE_CODE_REMOTE=true` in de omgeving uit `deps` toont de regel uit Ontwerp
  punt 5 letterlijk. Zonder de variabele, of met `false`, staat er geen regel die met `Cloud:` begint. Toets:
  `test/hooks/werkstraat-cloudregel.test.ts` (nieuw)
- **cloud-netwerkvorm/AC-11** — Het aanvalscorpus heeft de regel `netwerkvorm` met een basisrij. Elke vorm uit het corpus
  rond die basis geeft een `deny` met het fragment. Toets: `test/hooks/rolhek-aanvalscorpus.test.ts`

## Randgevallen

| Situatie | Gedrag |
|---|---|
| `git commit -m "x y"` | past op `git commit *`: geen weigering van deze regel (OV-2) |
| `GIT_TRACE=1 git push origin HEAD` | toewijzing vóór het programma: `deny` |
| `git push origin HEAD --force` | past niet op `git push origin HEAD`: `deny` van deze regel (de bestaande force-weigering blijft) |
| `pnpm test:db` zonder argumenten | past op `pnpm test:db *` (` *` = nul of meer woorden): geen weigering |
| `echo "git push" > notes.txt` | geen segment begint met `git push`: niet geraakt |
| `excludedCommands` ontbreekt in een geldig settingsbestand | lege lijst: de regel raakt niets (geen fout) |

## Raakt ook

- `rails/hooks/lib/rolhek.mjs`, `rails/hooks/lib/rolhek-context.mjs`, `rails/hooks/lib/werkstraat.mjs` en
  `rails/hooks/werkstraat.mjs`: beschermde paden; die gelden pas na de merge op `main` (de stub laadt main).
- `test/hooks/rolhek-aanvalscorpus.ts`: nieuw lid in `REGELS`.
- `docs/ENVIRONMENT.md` "Cloud: commit, push, PR en bewijs": een regel over de weigering, met `bestand:regel`. Plus een fragment in
  `docs/template-changelog.d/`.
- Niet geraakt: `.claude/settings.json` en `boundaries.json` (OV-1: geen nieuw patroon).

## Buiten scope

- De platforminstructie die `git push -u` voorschrijft; die is niet van de repo.
- `gh pr create` in de cloud (spec `cloud-pr-route`).

## Testplan

0. **Na de merge, in een nieuwe cloudsessie** (zoals stap 0 van `cloud-pr-route`): meet en leg vast in deze spec onder "Aanleiding".
   (a) `git commit -F <bestand> 2>&1 | tail -2` geeft de weigering met de vorm. (b) `git push -u origin HEAD` geeft de weigering.
   (c) `git commit -F <bestand>` en `git push origin HEAD`, elk los, slagen zonder fout. (d) De startmelding toont de
   Cloud-regel. Dat meet ook of het hookproces `CLAUDE_CODE_REMOTE` ziet.
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
