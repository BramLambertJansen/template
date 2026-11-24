---
status: goedgekeurd
namespace: rolhek-herstel
---

# Rolhek: zoekscope, merge in een waarde, testakkoord en de commentaargrens van bash

## Doel

Vier leerpunten over het rolhek in één PR: een zoekopdracht van de reviewer kan niet meer buiten de eigen repository zoeken
(leerpunt #947), het woord `merge` in een titel of branchnaam van een PR of issue wordt niet meer geweigerd (leerpunt #736),
een tester die een testakkoord in een gemergede spec ziet, krijgt een route in plaats van een doodlopende weigering
(leerpunt #688), en de shell-lezer telt `#` zoals bash, bewaakt door een differentiële test tegen echte bash (leerpunten #603
en #617).

Gemeten op `main` (`b51e05d`) met `decide` uit `rails/hooks/lib/rolhek.mjs`:

- `gh pr list --search "x OR is:private"` gaat voor de reviewer door; `gh api "search/issues?q=…+OR+…"` is sinds #945 dicht.
- `gh pr create --head chore/iets-uit-merge --title "fix: x" --body-file b.md` wordt voor elke rol geweigerd met "mergen of
  goedkeuren via gh of …/pulls/ is voor elke rol verboden (vangnet op de ruwe tekst, WS-04)". De weigeringen op de
  mergescriptnaam uit #736 zijn al opgelost door rolhek-lezen/AC-17.
- `cat;#<<EOF⏎rm -rf .claude/hooks⏎EOF`, `true&&#<<E⏎…`, `(#<<E⏎…`, `echo ${x/ #/}; rm -rf .claude/hooks`,
  ``echo `true #`; rm -rf .claude/hooks`` en `(( #)); rm -rf .claude/hooks` geven voor hoofdsessie en developer alleen
  context. Het losse `rm -rf .claude/hooks` geeft voor de hoofdsessie een vraag en voor een subagent een weigering: de
  lezer ziet `rm` niet, bash voert het wel uit.

Eigenaarbesluit 24 november 2026: de bundel omvat de differentiële test én een fix van de vier #617-vormen in `shell.mjs`;
voor #736 een uitzondering voor waarden, geen verruiming van het hele vangnet.

## Rollen en wie wat ziet

- Reviewer en onbekende subagent (krijgt de reviewerrol): de zoekregel uit AC-1 en AC-2 geldt voor `gh pr list --search`,
  `gh issue list --search` en `gh api "search/issues?q=…"`.
- Elke rol: de uitzondering voor waarden uit AC-3 en AC-4 en de commentaargrens uit AC-6 tot AC-8.
- Subagent (tester, developer, docs, architect, reviewer): de weigermelding uit AC-5; de hoofdsessie houdt haar vraag aan de
  eigenaar (`gate`).

## Kopieer de vorm van

- `test/hooks/shell-glob-klasse-bash.test.ts` — differentieel tegen echte bash met `bashOmgeving` en een versiecheck
- `test/hooks/rolhek-gh-allowlist.test.ts` — `inKooi` met `ctx.skip(vermogen('kooi').ontbreekt, …)` voor een corpusrij
- `test/hooks/rolhek-pr-merge.test.ts` — `verdict()` rond `decide` met een vaste context per rol

## Hergebruik en UX

- Bestaande componenten: geen UI. Hergebruik `parseCommands`, `tokenize` en `ONZEKERE_TEKST` uit `rails/hooks/lib/shell.mjs`,
  `API_OPERATOR`, `zoekwaarde`, `rawForbidden` en `existingTest` uit `rails/hooks/lib/rolhek.mjs`, `inKooi` uit
  `scripts/kit/kooi.mjs` en de corpusrijen uit `test/hooks/rolhek-aanvalscorpus.ts`.
- Alle zichtbare tekst letterlijk (weigermeldingen):
  - zoekregel (aanvulling op de bestaande melding van `--search` en `API_MELDING`): `zonder losse OR, AND of NOT en zonder
    repo:, org: of user: (spec rolhek-herstel/AC-1)`
  - testakkoord (achter de bestaande melding voor verwijderen, skippen of gevallen weghalen, alleen voor een subagent):
    `; noemt een gemergede spec het akkoord (Raakt ook), dan doet de hoofdsessie deze wijziging: zij krijgt de vraag aan de
    eigenaar (spec rolhek-herstel/AC-5)`

## Acceptatiecriteria

- **rolhek-herstel/AC-1** — Eén gedeelde toets `zoekScopeFout(woorden)` in `rails/hooks/lib/rolhek.mjs` weigert een
  zoekopdracht als een woord, hoofdletterongevoelig, precies `OR`, `AND` of `NOT` is, of als een woord `repo:`, `org:` of
  `user:` bevat. `zoekwaarde` (`gh pr list --search`, `gh issue list --search`) splitst op witruimte, `API_ZOEKEN` splitst
  `<rest>` op `+`; beide roepen dezelfde toets aan. `gh pr list --search "x OR is:private"`, `gh issue list --search "a and b"`
  en `gh issue list --search "NOT x"` worden voor de reviewer geweigerd; `gh issue list --search "leerpunt rolhek"`,
  `gh pr list --search "fix ordening"` en `gh issue list --search "operator"` gaan door. Toets:
  `test/hooks/rolhek-zoekwaarde.test.ts` (nieuw)
- **rolhek-herstel/AC-2** — Eén tabel met aanvallen (losse `OR`, `AND` en `NOT` in elke hoofdlettervorm, een tweede `repo:`,
  `org:` of `user:`, en voor `gh api` ook een tweede `q` via `&` en `=`) draait tegen elke zoekvorm van de reviewer:
  `gh pr list --search`, `gh issue list --search` en `gh api "search/issues?q=repo:{owner}/{repo}+…"`. Elke aanval wordt in
  elke vorm geweigerd; een vorm die bij de reviewer bijkomt zonder rij in de tabel maakt de test rood (de test leest de
  zoekvormen uit `REVIEWER_READS` en `API_ZOEKEN`). Toets: `test/hooks/rolhek-zoekwaarde.test.ts` (nieuw)
- **rolhek-herstel/AC-3** — Het vangnet op de ruwe tekst (`rawForbidden`, eerste tak met `RAW_MERGE`) laat het woord `merge`
  in een waarde buiten beschouwing als alle voorwaarden gelden: het commando heeft geen `ONZEKERE_TEKST` en geen
  `SHELL_TRICKS`, `parseCommands` geeft precies één segment, dat begint met `gh pr create`, `gh issue create`,
  `gh issue comment` of `gh issue edit`, en `merge` staat alleen in de waarde van `--title`/`-t`, `--head`/`-H`,
  `--base`/`-B`, `--label`/`-l` of `--body`/`-b` (los woord of `--optie=waarde`). Voor elke rol gaan dan door:
  `gh pr create --head chore/iets-uit-merge --title "fix: x" --body-file b.md`, `gh pr create --title "fix: merge script"
  --body-file b.md` en `gh issue comment 12 --body "merge-conflict opgelost"`. Toets: `test/hooks/rolhek-ruwe-tekst-waarden.test.ts` (nieuw)
- **rolhek-herstel/AC-4** — Buiten de vorm uit AC-3 blijft het vangnet gelijk, voor elke rol: `gh pr merge 12`,
  `gh pr create --title x && gh pr merge 12`, `gh pr create --title "$(echo merge)"`, `gh pr create --title x merge`
  (`merge` als los woord, geen waarde), `gh api -X PUT repos/{owner}/{repo}/pulls/1/merge`, `gh pr create --title "pr merge"`
  (`RAW_PR_MERGE`, derde tak) en `gh pr create --body mergePullRequest` (`MERGE_MUTATION`) worden geweigerd zoals op `main`.
  Elke basisrij van `gh-mergen-en-goedkeuren` en `subagentvangnet-ruwe-tekst` uit `test/hooks/rolhek-aanvalscorpus.ts` blijft
  geweigerd. Toets: `test/hooks/rolhek-ruwe-tekst-waarden.test.ts` (nieuw)
- **rolhek-herstel/AC-5** — Een subagent die in een bestaand testbestand een test verwijdert, skipt of gevallen weghaalt
  (`existingTest`, uitkomst `delete`, `skip` of `removed`), krijgt een weigering die eindigt met de testakkoordtekst uit
  "Hergebruik en UX". De hoofdsessie krijgt voor dezelfde wijziging de vraag zonder die aanvulling. Een fixture of setup
  (`LOCKED_HELPERS`) houdt de bestaande melding. `.claude/agents/tester.md` punt 5 noemt dezelfde route. Toets:
  `test/hooks/rolhek-testakkoord-melding.test.ts` (nieuw)
- **rolhek-herstel/AC-6** — `tokenize` in `rails/hooks/lib/shell.mjs` begint een commentaar met `#` aan het begin van een
  woord, ook direct na een operator (`;`, `&`, `&&`, `|`, `||`, `(`, `)`, `<`, `>` en elke redirectvorm). `#` binnen een woord,
  binnen `${…}`, binnen backticks of `$(…)` vóór hun sluitteken, binnen `((…))` en binnen `[[ … ]]` begint geen commentaar
  dat verder loopt dan die constructie. Voor elk van de zes vormen uit het Doel (en de variant `${x/;#/}; rm -rf .claude/hooks`)
  geeft `parseCommands` een segment met `rm` als eerste woord, en geeft `decide` voor de hoofdsessie een vraag en voor een
  subagent een weigering, net als voor het losse `rm -rf .claude/hooks`. Toets: `test/hooks/shell-commentaar.test.ts` (nieuw)
- **rolhek-herstel/AC-7** — Een differentiële test draait elke rij uit een vast corpus in echte bash, in de kooi (`inKooi`,
  R-TOOL-03), met alle uitschakelbare builtins uit (`enable -n`), een lege map als `PATH` en een `command_not_found_handle`
  die zijn argumenten met NUL gescheiden afdrukt. Per rij moet elke commandonaam die bash zo afdrukt ook het eerste woord van
  een segment van `parseCommands` zijn. Een rij waar de lezer een commando mist, is rood; de lezer mag meer zien dan bash. Het
  corpus bevat minstens de zes vormen en de variant uit AC-6 en elke basisrij uit `test/hooks/rolhek-aanvalscorpus.ts`.
  Zonder kooi slaat de test over met de melding van `vermogen('kooi')`; in CI is de kooi er (`.github/workflows/ci.yml`,
  `kooi.mjs --proef`). Toets: `test/hooks/shell-woorden-bash.test.ts` (nieuw)
- **rolhek-herstel/AC-8** — Een rij die bash anders telt dan de lezer en die de bouw niet oplost, staat op een aanvaard-lijst
  in het testbestand, met per rij een reden van minstens drie woorden. De zes vormen en de variant uit AC-6 staan er niet op;
  de test faalt als een van hen erop staat, en ook als een rij op de lijst groen wordt (de lijst krimpt mee). Toets:
  `test/hooks/shell-woorden-bash.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag |
|---|---|
| `--search "orde"`, `--search "Notitie"` | Door: alleen het hele woord `OR`, `AND` of `NOT` telt (AC-1) |
| `--search "-label:x"` | Door: een uitsluiting verruimt de scope niet |
| `gh pr create --title "fix: merge" --head x; rm y` | Twee segmenten: het vangnet blijft gelden (AC-4) |
| `gh pr create -t merge` en `--title=merge` | Door: losse en vastgeplakte waarde tellen allebei (AC-3) |
| `echo a#b` | Geen commentaar: `#` staat binnen een woord, zoals in bash (AC-6) |
| `echo $((1 #2))` | Geen commentaar dat verder loopt dan `))` (AC-6) |
| Bash zonder kooi (lokaal, cloudsessie) | De differentiële test slaat over; AC-6 draait zonder bash en dekt de zes vormen |

## Raakt ook

- `rails/hooks/lib/rolhek.mjs`, `rails/hooks/lib/shell.mjs` (besluit `besluit-pr`: kritiek werk, de eigenaar merget).
- `.claude/agents/tester.md` (AC-5) en `CLAUDE.md` ("Sandbox en rolhek": het woord `merge` naast `gh` wordt geweigerd,
  behalve als waarde van een titel, branch, label of body bij `gh pr create` en `gh issue create|comment|edit`).
- Bestaande tests blijven ongewijzigd groen: `test/hooks/rolhek-lezen.test.ts` (AC-16, AC-21), `test/hooks/rolhek-pr-merge.test.ts`,
  `test/hooks/rolhek-aanvalscorpus.test.ts`, `test/hooks/shell-tokenize.test.ts`, `test/hooks/rolhek-padcorpus-vooraf.test.ts`.
  Moet een bestaand geval wijzigen omdat het het oude commentaargedrag pint, dan noemt de PR het met reden (R-TEST-02).
- Risicowerk: de tester schrijft de tests vóór de bouw (R-WERK-04); aparte review na de bouw.

## Buiten scope

- Een volledige bash-parser of het vervangen van `shell.mjs`.
- Het testakkoord automatisch uit een gemergede spec lezen (wacht op de krimp van het rolhek, ADR 0089 punt 9); AC-5 geeft
  alleen de route.
- Andere zoekqualifiers dan `repo:`, `org:` en `user:` (bijvoorbeeld `is:private` zonder operator blijft binnen de eigen
  repository).

## Testplan

- Lokaal: `pnpm test:unit` (AC-1 tot AC-6; AC-7 en AC-8 slaan over zonder kooi), `pnpm lint`, `pnpm typecheck`, `pnpm ratchet`.
- CI: `gate:fast` draait AC-7 en AC-8 met de kooi; de PR noemt de job en de uitslag.
- Leerpunt-bewijs per issue in de PR (`## Leerpunt`): #947 en #736 met `test/hooks/rolhek-zoekwaarde.test.ts` en
  `test/hooks/rolhek-ruwe-tekst-waarden.test.ts`, #603 en #617 met `test/hooks/shell-commentaar.test.ts`, #688 met
  `test/hooks/rolhek-testakkoord-melding.test.ts`.

## Open vragen

- **OV-1 ✅ besloten** — Hoe ver gaat #603: differentiële test plus een fix van de #617-vormen (eigenaar, 24 november 2026).
- **OV-2 ✅ besloten** — #736: een uitzondering voor waarden bij `gh pr create` en `gh issue create|comment|edit`, het
  vangnet blijft verder gelijk (eigenaar, 24 november 2026).
- **OV-3** — Sluit #688 met deze PR, of blijft hij open tot het rolhek het akkoord zelf leest? Aanbeveling: `deels`. AC-5
  geeft de route, en het issue blijft open voor het lezen van het akkoord (Buiten scope).
