---
status: goedgekeurd
namespace: rolhek-herstel
---

# Rolhek: zoekscope, testakkoord en de commentaargrens van bash

## Doel

Drie leerpunten over het rolhek in één PR: een zoekopdracht van de reviewer kan niet meer buiten de eigen repository zoeken
(leerpunt #947), een tester die een testakkoord in een gemergede spec ziet, krijgt een route in plaats van een doodlopende
weigering (leerpunt #688), en de shell-lezer telt `#` zoals bash, bewaakt door een differentiële test tegen echte bash
(leerpunten #603 en #617).

Gemeten op `main` (`b51e05d`) met `decide` uit `rails/hooks/lib/rolhek.mjs`:

- `gh pr list --search "x OR is:private"` gaat voor de reviewer door; `gh api "search/issues?q=…+OR+…"` is sinds #945 dicht.
- `cat;#<<EOF⏎rm -rf .claude/hooks⏎EOF`, `true&&#<<E⏎…`, `(#<<E⏎…`, `echo ${x/ #/}; rm -rf .claude/hooks`,
  ``echo `true #`; rm -rf .claude/hooks`` en `(( #)); rm -rf .claude/hooks` geven voor hoofdsessie en developer alleen
  context. Het losse `rm -rf .claude/hooks` geeft voor de hoofdsessie een vraag en voor een subagent een weigering: de
  lezer ziet `rm` niet, bash voert het wel uit.

Eigenaarbesluiten 24 november 2026: de bundel omvat de differentiële test én een fix van de #617-vormen in `shell.mjs`.
Leerpunt #736 gaat niet mee: de weigeringen op de mergescriptnaam zijn opgelost door rolhek-lezen/AC-17, en `merge` in
een PR-titel of -body is volgens R-ROL-11 een bewuste valse melding (R-ROL-10 laat het vangnet niet verder uitkleden).

## Rollen en wie wat ziet

- Reviewer en onbekende subagent (krijgt de reviewerrol): de zoekregel uit AC-1 en AC-2 geldt voor `gh pr list --search`,
  `gh issue list --search` en `gh api "search/issues?q=…"`.
- Subagent (tester, developer, docs, architect, reviewer): de weigermelding uit AC-3; de hoofdsessie houdt haar vraag aan de
  eigenaar (`gate`).
- Elke rol: de commentaargrens uit AC-4 tot AC-6.

## Kopieer de vorm van

- `test/hooks/shell-glob-klasse-bash.test.ts` — differentieel tegen echte bash met `bashOmgeving` en een versiecheck
- `test/hooks/rolhek-gh-allowlist.test.ts` — `inKooi` met `ctx.skip(vermogen('kooi').ontbreekt, …)` voor een corpusrij
- `test/hooks/rolhek-pr-merge.test.ts` — `verdict()` rond `decide` met een vaste context per rol

## Hergebruik en UX

- Bestaande componenten: geen UI. Hergebruik `parseCommands`, `tokenize` en `ONZEKERE_TEKST` uit `rails/hooks/lib/shell.mjs`,
  `API_OPERATOR`, `zoekwaarde`, `apiEndpointToegestaan` en `existingTest` uit `rails/hooks/lib/rolhek.mjs`, `inKooi` uit
  `scripts/kit/kooi.mjs` en de corpusrijen uit `test/hooks/rolhek-aanvalscorpus.ts`.
- Alle zichtbare tekst letterlijk (weigermeldingen):
  - zoekregel (aanvulling op de bestaande melding van `--search` en `API_MELDING`): `zonder losse OR, AND of NOT en zonder
    repo:, org: of user: (spec rolhek-herstel/AC-1)`
  - testakkoord (achter de bestaande melding voor verwijderen, skippen of gevallen weghalen, alleen voor een subagent):
    `; noemt een gemergede spec het akkoord (Raakt ook), dan doet de hoofdsessie deze wijziging: zij krijgt de vraag aan de
    eigenaar (spec rolhek-herstel/AC-3)`

## Acceptatiecriteria

- **rolhek-herstel/AC-1** — Eén gedeelde toets `zoekScopeFout(woorden)` in `rails/hooks/lib/rolhek.mjs` weigert een
  zoekopdracht als een woord, hoofdletterongevoelig, precies `OR`, `AND` of `NOT` is, of als een woord `repo:`, `org:` of
  `user:` bevat. `zoekwaarde` (`gh pr list --search`, `gh issue list --search`) splitst de waarde op witruimte, `(` en `)`;
  `apiEndpointToegestaan` splitst `<rest>` van `search/issues` op `+`, `(` en `)`; beide roepen dezelfde toets aan. Voor de
  reviewer worden geweigerd: `gh pr list --search "x OR is:private"`, `gh pr list --search "x OR(is:private)"`,
  `gh issue list --search "a and b"` en `gh issue list --search "NOT x"`. Door gaan: `gh issue list --search "leerpunt
  rolhek"`, `gh pr list --search "fix ordening"`, `gh issue list --search "operator"` en `gh issue list --search "Notitie"`.
  Toets: `test/hooks/rolhek-zoekwaarde.test.ts` (nieuw)
- **rolhek-herstel/AC-2** — `rails/hooks/lib/rolhek.mjs` exporteert `ZOEKVORMEN`: de zoekvormen van de reviewer, afgeleid
  uit `REVIEWER_READS` (elke lezer met `--search`) plus de `gh api`-vorm `search/issues?q=repo:{owner}/{repo}+<rest>`. Eén
  tabel met aanvallen draait tegen elke vorm uit `ZOEKVORMEN`: losse `OR`, `AND` en `NOT` in elke hoofdlettervorm, ook
  direct naast een haakje, en een tweede `repo:`, `org:` of `user:`; voor `gh api` ook een tweede `q` via `&` en `=`. Elke
  aanval wordt in elke vorm geweigerd, en de test is rood als `ZOEKVORMEN` een vorm bevat zonder rij in de tabel. Toets:
  `test/hooks/rolhek-zoekwaarde.test.ts` (nieuw)
- **rolhek-herstel/AC-3** — Een subagent die een bestaand testbestand verwijdert (`change.kind` `delete`) of erin een test
  skipt of gevallen weghaalt (`testChangeRisk` `skip` of `removed`), krijgt in `existingTest` een weigering die eindigt met
  de testakkoordtekst uit "Hergebruik en UX". De hoofdsessie krijgt voor dezelfde wijziging de vraag zonder die aanvulling.
  Een fixture of setup (`LOCKED_HELPERS`) houdt de bestaande melding. Punt 5 van `.claude/agents/tester.md` noemt dezelfde
  route. Toets: `test/hooks/rolhek-testakkoord-melding.test.ts` (nieuw)
- **rolhek-herstel/AC-4** — `tokenize` in `rails/hooks/lib/shell.mjs` begint een commentaar met `#` aan het begin van een
  woord, ook direct na een operator (`;`, `&`, `&&`, `|`, `||`, `|&`, `;;`, `;&`, `;;&`, `(`, `)` en elke redirectvorm). `#`
  binnen een woord, binnen `${…}`, binnen backticks, binnen `((…))`, `$((…))` en `$[…]` begint geen commentaar. Voor `#`
  aan het begin van een woord binnen `$(…)` of `[[ … ]]` leest `parseCommands` beide lezingen (commentaar tot het
  regeleinde, en geen commentaar) en geeft de vereniging van de segmenten. Voor elk van de zes vormen uit het Doel en voor de
  varianten `${x/;#/}; rm -rf .claude/hooks`, `echo $(true #) <<E⏎rm -rf .claude/hooks⏎E⏎)` en
  `[[ -n x #]] <<E⏎rm -rf .claude/hooks⏎E⏎` geeft `parseCommands` een segment met `rm` als eerste woord. Ook geeft `decide` voor de hoofdsessie een vraag en voor een
  subagent een weigering, net als voor het losse `rm -rf .claude/hooks`. Toets: `test/hooks/shell-commentaar.test.ts` (nieuw)
- **rolhek-herstel/AC-5** — Een differentiële test draait elke rij van een vast corpus in echte bash, via de kooi
  (`inKooi`, R-TOOL-03). Binnen de kooi start `env -i PATH=<lege map> BASH_ENV=<prelude> bash --restricted --noprofile
  --norc -O extglob|+O extglob <rijbestand>`; het rijbestand en de prelude staan als data in de werkmap, en `PATH` staat
  alleen in de omgeving van die binnenste aanroep (in restricted mode is `PATH` daarna alleen-lezen). Restricted mode laat
  een commandonaam met `/` niets uitvoeren en weigert een redirect naar een bestand. De prelude zet `enable -n` voor elke
  builtin behalve `builtin`, `enable`, `trap`, `set`, `shopt`, `return` en `printf`. Een `command_not_found_handle` met een
  recursiebeveiliging drukt zijn argumenten met NUL gescheiden af; dat is de bron voor elke commandonaam zonder `/`. Een
  DEBUG-trap (`set -T`) vult aan met alleen de namen met `/`: het eerste woord van `$BASH_COMMAND` na het afpellen van
  toewijzingen vooraan. Elke rij draait vier keer: met handlerstatus 0 en 1, en met `-O extglob` en `+O extglob`. De
  waargenomen commandonamen zijn de vereniging van die vier runs. Per rij moet elke waargenomen naam ook het eerste woord
  van een segment van `parseCommands` zijn. Een rij waar de lezer een naam mist, is rood; de lezer mag meer zien dan bash.
  Elke rij heeft een niet-leeg veld `bashZiet` (bijv. `['rm']`; bij een aanvalsrij de gevaarlijke naam). De test is rood bij
  een lege `bashZiet`, en ook als bash een naam uit `bashZiet` niet waarneemt: dan zou een rij door een syntaxfout, een
  geweigerde redirect of vroege afbraak vals groen zijn. Het corpus bevat minstens de zes vormen en de
  varianten uit AC-4 en elke basisrij uit `test/hooks/rolhek-aanvalscorpus.ts`. Bash ouder dan versie 5 of geen kooi: de
  test slaat over met de melding van `vermogen('kooi')` of de bashversie. In CI is de kooi er (`.github/workflows/ci.yml`,
  `kooi.mjs --proef`). Toets: `test/hooks/shell-woorden-bash.test.ts` (nieuw)
- **rolhek-herstel/AC-6** — Een rij die bash anders telt dan de lezer en die de bouw niet oplost, staat op een aanvaard-lijst
  in het testbestand, met per rij een reden van minstens drie woorden. De zes vormen en de varianten uit AC-4 staan er niet
  op; de test is rood als een van hen erop staat, en ook als een rij op de lijst groen wordt (de lijst krimpt mee). Toets:
  `test/hooks/shell-woorden-bash.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag |
|---|---|
| `--search "orde"`, `--search "Notitie"` | Door: alleen het hele woord `OR`, `AND` of `NOT` telt (AC-1) |
| `--search "fix and test"` | Geweigerd: een kleine `and` telt ook (geaccepteerde valse melding, R-ROL-11) |
| `--search "-label:x"` | Door: een uitsluiting verruimt de scope niet |
| `echo a#b` | Geen commentaar: `#` staat binnen een woord, zoals in bash (AC-4) |
| `echo $((1 #2))` | Geen commentaar (AC-4) |
| Bash zonder kooi (lokaal, cloudsessie) | De differentiële test slaat over; AC-4 draait zonder bash en dekt de vormen |
| Rij met `{ …; } > f` | Restricted mode weigert de redirect en de groep draait niet: `bashZiet` maakt de rij rood; zo'n rij gebruikt `<` of staat op de aanvaard-lijst (AC-6) |
| Rij die de waarneming uitzet (`trap - DEBUG`, `set -n`, `unset -f command_not_found_handle`) | `bashZiet` maakt de rij rood; het vaste corpus bevat zulke rijen niet |

## Raakt ook

- `rails/hooks/lib/rolhek.mjs` en `rails/hooks/lib/shell.mjs` (besluit `besluit-pr`: kritiek werk, de eigenaar merget).
- `.claude/agents/tester.md` (AC-3).
- `docs/framework.md` R-ROL-11: de nieuwe valse melding van AC-1 (een kleine `and`, `or` of `not` als los woord in
  `--search`, zoals `"fix and test"`), naast de bestaande `gh pr list --search "merge"`.
- Bestaande tests blijven ongewijzigd groen: `test/hooks/rolhek-lezen.test.ts` (AC-16, AC-21), `test/hooks/rolhek-aanvalscorpus.test.ts`,
  `test/hooks/shell-tokenize.test.ts`, `test/hooks/rolhek-padcorpus-vooraf.test.ts`. Pint een bestaand geval het oude
  commentaargedrag, dan noemt de PR de wijziging met reden (R-TEST-02).
- Risicowerk: de tester schrijft de tests vóór de bouw (R-WERK-04); aparte review na de bouw.

## Buiten scope

- Leerpunt #736: `merge` in een PR-titel, -body of branchnaam blijft een bewuste valse melding (R-ROL-11).
- Een volledige bash-parser of het vervangen van `shell.mjs`.
- Het testakkoord automatisch uit een gemergede spec lezen (wacht op de krimp van het rolhek, ADR 0089 punt 9); AC-3 geeft
  alleen de route.
- Andere zoekqualifiers dan `repo:`, `org:` en `user:` (bijvoorbeeld `is:private` zonder operator blijft binnen de eigen
  repository).

## Testplan

- Lokaal: `pnpm test:unit` (AC-1 tot AC-4; AC-5 en AC-6 slaan over zonder kooi), `pnpm lint`, `pnpm typecheck`, `pnpm ratchet`.
- CI: `gate:fast` draait AC-5 en AC-6 met de kooi; de PR noemt de job en de uitslag.
- Leerpunt-bewijs per issue in de PR (`## Leerpunt`): #947 met `test/hooks/rolhek-zoekwaarde.test.ts`, #603 en #617 met
  `test/hooks/shell-commentaar.test.ts`, #688 met `test/hooks/rolhek-testakkoord-melding.test.ts`.

## Open vragen

- **OV-1 ✅ besloten** — Hoe ver gaat #603: differentiële test plus een fix van de #617-vormen (eigenaar, 24 november 2026).
- **OV-2 ✅ besloten** — #736 gaat niet mee; comment `deels` op het issue (eigenaar, 24 november 2026).
- **OV-3** — Sluit #688 met deze PR, of blijft hij open tot het rolhek het akkoord zelf leest? Aanbeveling: `deels`. AC-3
  geeft de route, en het issue blijft open voor het lezen van het akkoord (Buiten scope).
