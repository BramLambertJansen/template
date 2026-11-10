---
status: gebouwd # #423
namespace: rolhek-lezen
---

# Rolhek: lezen voor de reviewer, schrijven blijft streng

## Doel

De reviewer kan met een kleine lijst alleen-lezen commando's onderzoeken wat de Read-, Grep- en Glob-tools niet kunnen, zonder dat het rolhek een schrijf- of uitvoerweg opent ([ADR 0064](../adr/0064-leesbudget-per-laag.md) punt 5 en 7). Drie reviews konden `gh issue view` en `gh run view` niet gebruiken; `git diff --output` is een bestaande schrijfweg (leerpunt #409). Zonder Grep- en Glob-tool kon de reviewer niet in de repo zoeken: 58 van 87 rolhek-weigeringen in zes proefsessies kwamen van hem, en hij vertrouwde op een zoekactie van de hoofdsessie die hij juist moet toetsen (leerpunt #664, eerder #609); daarom krijgt hij `git grep` met een vaste optielijst en `git ls-files` met een glob (AC-6 tot AC-10, [ADR 0087](../adr/0087-reviewer-zoekt-met-git-grep.md)).

## Rollen en wie wat ziet

n.v.t. — het rolhek (`rails/hooks/lib/rolhek.mjs`); geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Koppeling

n.v.t. — geen externe dienst.

## Kopieer de vorm van

- `rails/hooks/lib/rolhek.mjs` — `REVIEWER_COMMANDS`, `reviewerMay`, `ghCommandWords`
- `rails/hooks/lib/shell.mjs` — schrijfdoelen van opties (`fileTargets`); `Command.patterns` en `Command.expanded` voor aangehaalde globs en geëxpandeerde woorden (AC-7, AC-8)
- `test/hooks/rolhek-lezen.test.ts` — tabeltests met een basis die eerst slaagt

## Hergebruik en UX

n.v.t. — geen UI. De weigermelding noemt de regel en de toegestane opties.

## Acceptatiecriteria

- **rolhek-lezen/AC-1** — De reviewer mag zonder weigering, met alleen deze opties. Een optie met waarde neemt altijd het volgende woord als waarde (ook als dat met `-` begint, zoals pflag); elke andere optie is een vlag zonder waarde; een woord dat met `-` begint en niet in de lijst staat, ook vastgeplakt of in een cluster, wordt geweigerd. Een waarde bestaat uit `[A-Za-z0-9_./,:-]` (geen `$`, backtick, `;`, spatie of aanhalingsteken), zodat de shell van pnpm niets kan uitvoeren:
  - `git ls-files`: vlag-loos, paden na `--`;
  - `gh issue view <nr>`: vlag `--comments`, met waarde `--json`, `--jq`;
  - `gh issue list`: met waarde `--label --state --limit --json --jq`;
  - `gh run view <id>`: vlaggen `--log --log-failed`, met waarde `--json --jq --job`;
  - `gh run list`: met waarde `--branch --workflow --limit --json --jq`;
  - `pnpm leespad`: vlag `--json`, met waarde `--ref`; `pnpm meting`: vlaggen `--json --pr-tabel --trend --help` (`--trend` sinds ADR 0065), met waarde `--branch --sessie`.

  `gh ... --web`, `-R`/`--repo` en `gh api` blijven geweigerd. Zoeken en tellen doet de Grep-tool (ontbreekt die: `git ls-files` plus Read, en meld in het rapport wat niet na te zoeken was; #609); `git grep`, `git blame`, `wc` en pipes komen er niet bij (voor `git grep` en een glob bij `git ls-files` vervangen door AC-6 tot AC-10, ADR 0087). Tabeltests bevatten `--comments --web` en `--log --web`.
- **rolhek-lezen/AC-2** — Voor elke rol wordt geweigerd: `--output`, `--output=…` en elke afkorting ervan bij `git diff|log|show`, en `-O`, `-O<commando>`, `--open-files-in-pager` en elke afkorting of cluster ervan (`--open-files`, `-iO`, `-nOvim`) bij `git grep` (nieuwe weigering; ze stonden niet in de schrijfdoelen). Daarmee is leerpunt #409 gesloten.
- **rolhek-lezen/AC-3** — Een onbekende optie bij een commando uit AC-1 geeft voor de reviewer een weigering die de toegestane opties noemt. `git diff|log|show|status` en `gh pr view|diff|checks` blijven zoals nu, behalve AC-2 en AC-4 (AC-4 dicht ook het bestaande gat dat `NODE_OPTIONS=… node scripts/kit/feiten.mjs` doorlaat).
- **rolhek-lezen/AC-4** — Voor de reviewer wordt elke variabele vóór het commando geweigerd (`X=… cmd`, ook `LC_ALL=C git status`); negatieve tabeltests per commando met `METING_GH`, `GIT_EXTERNAL_DIFF` en `NODE_OPTIONS`, elk met een basis die zonder variabele slaagt (leerpunt #401).
- **rolhek-lezen/AC-5** — Alle bestaande aanvaltests en vals-positieve tests van het rolhek blijven ongewijzigd groen, behalve de wijzigingen die "Raakt ook" voor AC-6 tot AC-10 noemt. Voor hoofdsessie, developer en tester verandert alleen AC-2; `git ls-files`, `gh issue view|list` en `gh run view|list` zijn daar al toegestaan of vragen (ask) zoals nu, en een test legt dat vast.
- **rolhek-lezen/AC-6** (nog niet gebouwd) — De reviewer mag `git grep` zonder weigering, met alleen deze opties, elk als los woord (geen cluster als `-in`, geen vastgeplakte waarde als `-C3` of `-efoo`, geen `--optie=waarde`): vlaggen `-n -i -w -v -l -L -c --count -h -F -E -I`; met waarde `-e <patroon>` (mag vaker) en `-C <n>`, `-A <n>`, `-B <n>` met `<n>` uit `[0-9]{1,3}`. Zonder `-e` is het eerste losse woord het patroon; de losse woorden daarna zijn refs of paden volgens `insideRepo` (zoals bij `git show`) en beginnen niet met `:`, en na `--` alleen paden volgens AC-8. Elk ander woord dat met `-` begint, op elke plek behalve de waarde na `-e`, wordt geweigerd; dat zijn in elk geval `-O`/`--open-files-in-pager` (al AC-2), `--textconv` (start een driver uit de config), `--no-index` (leest buiten de repo), `--untracked` en `--no-exclude-standard` (lezen niet-gevolgde bestanden zoals `.env`), `--recurse-submodules`, `-f <bestand>` (leest patronen uit een bestand, ook buiten de repo of van stdin), `-P` (perl-regex) en `--threads`. Globale git-opties vóór `grep` (`git -c core.pager=… grep`, `git -C /tmp grep`, `git --no-pager grep`) blijven geweigerd, net als elke variabele vóór het commando (AC-4). Voor de andere rollen verandert `git grep` niet (behalve AC-2).
- **rolhek-lezen/AC-7** (nog niet gebouwd) — Een patroon van `git grep` (na `-e`, of het eerste losse woord) mag spaties, aanhalingstekens en regex-tekens bevatten (`'7 dagen'`, `"foo(bar)"`, `'^## '`, `'a|b'`, `'a.*b'`, `'[0-9]+'`, `'x$'` tussen enkele aanhalingstekens), en na `-e` ook met `-` beginnen (`-e -O` zoekt de tekst `-O`). De toets leest het woord zoals bash het aan git geeft (`Command.words`), niet de vorm met gemarkeerde aanhalingen (`Command.patterns`). Geweigerd wordt een patroon met een stuurteken (U+0000 tot U+001F of U+007F, dus ook newline en tab) en een woord dat bash nog expandeert (`Command.expanded`: `$` of backtick buiten enkele aanhalingstekens, `$'…'`). Waarom de tekenregel van `SAFE_VALUE` (de shell van pnpm) hier niet nodig is: bash geeft het woord direct aan git, zonder tweede shell, en `git grep` heeft met de lijst uit AC-6 geen uitvoerweg die `git diff|log|show|status` de reviewer niet al geven (pager en fsmonitor uit de repo-config); config wijzigen is voor elke rol dicht (R-ROL-08). Wat overblijft is een verschil tussen de lezer van het rolhek en bash; dat dekken de weigering van geëxpandeerde woorden en de bestaande vangnetten voor elke rol, die vóór deze regel blijven gaan.
- **rolhek-lezen/AC-8** (nog niet gebouwd) — De reviewer mag bij `git ls-files` en `git grep` een pad met een glob geven, na `--` en bij `git ls-files` ook als los woord zonder `--` (`git ls-files '*.md'`). Eén pathspec-functie toetst beide posities met dezelfde regel: `insideRepo` met daarbij de tekens `*`, `?`, `[` en `]` (`git ls-files -- '*.md'`, `git ls-files 'docs/**'`, `git grep -n -e x -- 'src/*.ts'`), geen `:` vooraan (pathspec-magie zoals `:(attr:x)` of `:!x`), geen `/` of `~` vooraan en geen segment `..`. Een globteken moet aangehaald zijn (in `Command.patterns` als aangehaald gemarkeerd), zodat git de glob binnen de repo toepast en niet bash; `git ls-files -- *.md` wordt geweigerd met een melding die de vorm `git ls-files -- '*.md'` noemt. Kan het rolhek niet zeker lezen dat de glob aangehaald is (R-ROL-11: `#`, `${`, `$'`, `$(`, `((`, backtick, `\` of een newline in het commando, zoals `git grep -n -e '## ' -- '*.md'`), dan wordt het commando geweigerd als geaccepteerd vals-positief, met de melding "laat de glob weg of zoek in een map (bijv. `-- docs`)", niet de aangehaalde vorm die er al staat. Is de glob in zo'n commando echt onaangehaald (te zien aan `Command.raws`), dan blijft de melding de vorm met `'*.md'` noemen. `git ls-files` blijft verder vlag-loos.
- **rolhek-lezen/AC-9** (nog niet gebouwd) — `git grep` door de reviewer wordt geweigerd als de werkmap van het segment niet de root van de repo of een map eronder is, of onbekend is (`cwdNu` is null), zodat `grep.fallbackToNoIndex` niet buiten de repo leest. Een tabeltest met een werkmap buiten de repo heeft als basis hetzelfde commando met een werkmap in de repo, dat slaagt.
- **rolhek-lezen/AC-10** (nog niet gebouwd) — De generieke weigering van de reviewer wijst naar een route die werkt, met letterlijk deze tekst:

  ```text
  reviewer: alleen lezen (`<commando>` mag niet; framework §8); zoeken en tellen: gebruik de Grep-tool; zonder die tool: zoeken met `git grep -n -F -e '<tekst>' -- '<glob>'`, bestanden vinden met `git ls-files '<glob>'`, tellen met `git grep -c -F -e '<tekst>'`; noem in je rapport wat je niet kon nazoeken
  ```

  `rolhek.mjs` houdt deze tekst als één sjabloonconstante met de plaatshouders `<commando>`, `<tekst>` en `<glob>`. De test eist twee dingen: de echte weigertekst van `git blame x`, `wc -l x` en `git log | head` is het sjabloon met alleen `<commando>` ingevuld; elke term met `<tekst>` of `<glob>` geeft, ingevuld met `7 dagen` en `*.md`, voor de reviewer `allow`. De term met `<commando>` (het geweigerde commando zelf) voert de test niet uit. Een wijziging van de tekst of van de optielijst die de route breekt, maakt de test rood. De weigering voor een onbekende `git grep`-optie (AC-3) noemt de opties uit AC-6 en de tekenregel uit AC-7.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `git show <ref>:<pad>` door de reviewer | toegestaan zoals nu | n.v.t. |
| `git blame`, `wc`, `grep`, `rg`, `x \| y` door de reviewer | geweigerd met de route uit AC-10 (tot de bouw: de tekst uit #609) | n.v.t. |
| `git grep -n -F -e '7 dagen' -- '*.md'` door de reviewer | toegestaan (AC-6 tot AC-8) | n.v.t. |
| `git grep -n foo origin/main -- docs` | toegestaan; leest uit objecten, dezelfde blootstelling als `git show <ref>:<pad>` | n.v.t. |
| `git grep -e -O`, `git grep -e --no-index` | toegestaan: de waarde na `-e` is altijd het patroon (pflag-regel uit AC-1) | n.v.t. |
| `git grep --no-index x`, `--untracked`, `--textconv`, `-f pat.txt`, `--recurse-submodules`, `-P` | geweigerd (AC-6) | n.v.t. |
| `git grep -in x`, `git grep -C3 x`, `git grep --context=3 x` | geweigerd: cluster, vastgeplakte waarde of `=`-vorm; de melding noemt `-i`, `-n` en `-C <n>` | n.v.t. |
| `git grep "$X"`, `git grep -e "$(cat f)"` | geweigerd: geëxpandeerd woord of substitutie (AC-7) | n.v.t. |
| Patroon met een newline of tab | geweigerd (stuurteken, AC-7); zoek met `-E` en `[[:space:]]` | n.v.t. |
| Patroon dat een bestaand vangnet raakt: `gh` als los woord (`git grep -e gh`), `api.github.com`, `git credential`, een merge-commando van gh als tekst | het vangnet gaat voor en weigert, voor elke rol zoals nu (R-ROL-08, R-ROL-11); omweg: zoek op een deel van de tekst (`-F -e 'github.com'`, `-F -e 'credential'`) | n.v.t. |
| Patroon of pad dat een zelfladend pad noemt (`git grep -n -F -e '.git/hooks'`, `git ls-files -- '.claude/**'`) | toegestaan: `git grep` en `git ls-files` lezen, de zelfladende toets kijkt bij git-leescommando's alleen naar schrijfopties | n.v.t. |
| `git ls-files -- *.md` (onaangehaald) | geweigerd; de melding noemt `git ls-files -- '*.md'` (AC-8) | n.v.t. |
| `git ls-files '*.md'`, `git ls-files 'docs/**'` (zonder `--`) | toegestaan, met dezelfde padregel als na `--` (AC-8) | n.v.t. |
| Aangehaalde glob die het rolhek niet zeker als aangehaald leest (`git grep -n -e '## ' -- '*.md'`) | geweigerd (vals-positief, R-ROL-11); de melding zegt "laat de glob weg of zoek in een map (bijv. `-- docs`)" (AC-8) | n.v.t. |
| Echt onaangehaalde glob in zo'n commando (`git grep -n -e '## ' -- *.md`) | geweigerd; de melding noemt `'*.md'` (AC-8) | n.v.t. |
| `git ls-files -- ':!docs'`, `':(attr:x)'`, `'../*'`; `git grep -n x ':/docs'` | geweigerd: `:` vooraan of `..` (AC-6, AC-8) | n.v.t. |
| Veel uitvoer (`git grep -e e`) | toegestaan; de Bash-tool kort de uitvoer in, gebruik `-l` of `-c` | n.v.t. |
| `gh run view <id> --log-failed` | toegestaan (leest alleen) | n.v.t. |
| `gh issue view 5 --web` | geweigerd (start een browser) | n.v.t. |
| `gh issue view 5 --comments --web` | geweigerd (`--comments` heeft geen waarde, `--web` staat niet in de lijst) | n.v.t. |
| `-nO…`, `-C3`, `-efoo` bij een git-optie | geweigerd tenzij exact in de lijst; `-O` in een cluster ook voor elke rol | n.v.t. |
| `gh run view <id> --log` | toegestaan; gh schrijft een cache buiten de repo (`~/.cache/gh`) | n.v.t. |
| Pad-wrapper of geëxpandeerd argument | geweigerd zoals nu | n.v.t. |

## Raakt ook

`test/hooks/rolhek*.test.ts` (nieuwe tabeltests), leerpunt #409, `docs/operations/review-checklists.md`, `.claude/agents/reviewer.md` (de leeslijst), framework §8 R-ROL-04 en R-ROL-08.

Voor AC-6 tot AC-10 (bouw-PR; `rails/hooks/**` is `besluit-pr`): `rails/hooks/lib/rolhek.mjs` (`REVIEWER_READS`, `reviewerRefusal`, `readArgsAllowed`; `reviewerBash` krijgt `patterns`, `expanded` en de werkmap van het segment). `test/hooks/rolhek-lezen.test.ts` wijzigt bestaande tests omdat deze spec het gedrag verandert; de merge van deze besluit-PR is het eigenaarakkoord voor het vervangen van deze testgevallen (R-TEST-02, vgl. ADR 0080 Gevolgen):

- de Randgevallen-test met `git grep foo`, `git blame …`, `wc -l …` en `git log | head` (`test.each` rond regel 164): `git grep foo` gaat naar de positieve tabel van AC-6, en de verwachte tekst uit #609 wordt de sjabloontoets uit AC-10;
- de test "de route die de weigering noemt is zelf toegestaan voor de reviewer (#609)" (rond regel 176) wordt de route-test uit AC-10;
- `GEEN_SCHRIJFOPTIE` (AC-2): de uitzondering `if (role !== REVIEWER)` (rond regel 258) vervalt voor `git grep -e FOO` en `git grep -e -O`; `git grep -eFOO` blijft voor de reviewer geweigerd en krijgt een eigen negatief geval;
- `GREP` (AC-2): de basis `git grep foo` (rond regel 267) slaagt ook voor de reviewer, dus de voorwaarde `role !== REVIEWER` vervalt.

Nieuwe tests van AC-6 tot AC-10, ook de glob-paden van AC-8, komen in `test/hooks/rolhek-lezen.test.ts` (zie Testplan). `.claude/agents/reviewer.md`: "zoeken en tellen met Grep" wordt "zoeken en tellen met de Grep-tool, of zonder die tool met `git grep` en `git ls-files '<glob>'`". `docs/framework.md` R-WERK-21: bij "in Claude Code lees en zoek met Read, Grep, Glob, niet Bash" komt de bijzin "reviewer zonder Grep-tool: `git grep` (rolhek-lezen, 0087)"; het rolhek staat de architect dat schrijven niet toe, dus de hoofdsessie zet die regel in de bouw-PR (een besluit-PR bevat alleen besluitdocumenten, `scripts/kit/lane.mjs`). `CLAUDE.md` ("Lees en zoek met de Read-, Grep- en Glob-tools, niet met Bash") blijft ongewijzigd (agentinstructie, beschermd); de regel blijft waar als standaard en R-WERK-21 noemt de uitzondering. `docs/operations/review-checklists.md` noemt geen zoekroute en framework §8 R-ROL-04 verwijst al naar de lijst in `rolhek.mjs`; beide blijven ongewijzigd. Niet geraakt: `check:migrations`, `check:secdef`, `test:db`/policies, `test/security/resources.ts` en permissietests (geen database, routes of permissies).

## Buiten scope

`grep`, `rg`, `awk`, `sed`, `wc`, `git blame`, `node -e` en pipes voor de reviewer (`git grep -c` en `-l` dekken tellen en een bestandslijst; een pipe vraagt een tweede programma per segment zonder gemeten nood); `git grep` voor de andere rollen verruimen of beperken (behalve AC-2); de shell-lezer van het rolhek zo uitbreiden dat een aangehaalde glob in een commando met `#`, `${`, `$'`, `$(` en dergelijke niet meer door een vangnet valt (mogelijke opvolging, R-ROL-11; nu een geaccepteerd vals-positief met eigen melding, AC-8); het volledig dichten van de bekende gaten uit het roadmap-item "Bekende gaten in het rolhek"; hoofdsessie en developer verruimen.

## Testplan

Tabeltests per commando, optie en variabele; de aanvallen uit AC-2 en AC-4 zijn negatieve gevallen met een basis die eerst slaagt.

Voor AC-6 tot AC-10, alles in `test/hooks/rolhek-lezen.test.ts`:

- AC-6 en AC-7, positief: elke vlag en elke waarde-optie uit AC-6 los, een ref, paden na `--`, en de patronen `'7 dagen'`, `"foo(bar)"`, `'^## '`, `'a|b'`, `'a.*b'`, `'[0-9]+'`, `'x$'`, `-e -O`.
- AC-6 en AC-7, negatief met basis `git grep -n -e x`, elk met één woord erbij: `-O`, `--textconv`, `--no-index`, `--untracked`, `--no-exclude-standard`, `--recurse-submodules`, `-f pat.txt`, `-P`, `--threads 2`, `-in`, `-C3`, `--context=3`, `-C x`, `-C 1000`, `-eFOO`, `':/docs'` als los woord, een patroon met newline en `"$X"`; plus `git -c core.pager=less grep -n -e x` en `git --no-pager grep -n -e x`.
- AC-8, positief: `git ls-files -- '*.md'`, `git ls-files -- 'docs/**'`, `git ls-files '*.md'`, `git ls-files 'docs/**'`, `git ls-files -- '.claude/**'`, `git grep -n -e x -- 'src/*.ts'`. Negatief met basis `git ls-files -- docs`: `*.md` onaangehaald (melding noemt `'*.md'`), `':!docs'`, `':(attr:x)'`, `'/*'`, `'../*'`, ook zonder `--`. Vals-positief: `git grep -n -e '## ' -- '*.md'` geweigerd, met de melding "laat de glob weg of zoek in een map (bijv. `-- docs`)" en zonder de aangehaalde vorm als advies; `git grep -n -e '## ' -- *.md` geweigerd met de melding die `'*.md'` noemt (onderscheid via `Command.raws`).
- Vangnetten: `git grep -e gh`, `git grep -F -e 'api.github.com'`, `git grep -F -e 'git credential'` en een merge-commando van gh als patroon blijven geweigerd, elk met een omweg-basis (`-F -e 'github.com'`) die slaagt.
- AC-9: een werkmap buiten de repo tegen dezelfde basis met de werkmap in de repo.
- AC-10: de weigertekst van `git blame x`, `wc -l x` en `git log | head` is gelijk aan het sjabloon met alleen `<commando>` ingevuld, en elke term met `<tekst>` of `<glob>` geeft ingevuld met `7 dagen` en `*.md` voor de reviewer `allow`. Elke negatieve test faalt als de optie in de lijst komt of de tekenregel wordt verruimd.

## Open vragen

- **OV-1 ✅ besloten** — De lijst van AC-1; uitbreiding via een leerpunt en een tabelrij (ADR 0064 punt 7).
