---
status: goedgekeurd # #538
namespace: leerlus-bewijs
---

# Leerlus met bewijs (stap 2)

## Doel

Een leerpunt gaat pas dicht met bewijs dat de les blijft hangen, en elk leerpunt-issue klopt met het sjabloon, wie of wat het
ook aanmaakte. Besluit: [ADR 0078](../adr/0078-leerlus-met-bewijs.md); stap 1 is [leerlus](leerlus.md).

**Toets aan framework §1.** Aanleiding: herbeoordeling van 4 november 2026. Nulmeting op main `30cc352`: 34 gesloten
leerpunten, 0 met getoetst sluitbewijs; 4 van 40 issues zonder sjabloon; 16 van 40 aangemaakt buiten het rolhek (MCP en Codex);
fixes die zelf een nieuw leerpunt opleverden: #424 → #432, #411 → #444, #317 → #334.

Dit is kritiek werk (elk ADR, `.github/`, skills; R-WERK-05): deze besluit-PR bevat ADR en spec; de bouw volgt in een eigen PR
zodra deze op main staat.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| hoofdsessie | schrijft de sectie `## Leerpunt` in een PR die een leerpunt sluit; dient leerpunten in via `gh` of, in de cloud, via de MCP-tool voor issues | via MCP iets anders schrijven dan een leerpunt-issue in de template-repo |
| reviewer | toetst bij `geen test: <reden>` of de reden klopt, en meldt dat als bevinding | iets indienen of sluiten (ongewijzigd) |
| CI-job `leerpunt-bewijs` (eigen workflow `leerpunt-bewijs.yml`, `pull_request`) | draait het bewijsbestand tegen basis en head, zonder token voor de PR-code | iets schrijven; code uit de PR draaien met token of geheimen |
| workflow `leerpunt-check` | zet of haalt de labels `leerpunt-onvolledig` en `leerpunt-zonder-bewijs` weg, met één comment | sluiten, heropenen, de body bewerken |
| eigenaar | maakt de twee labels aan, merget een wijziging van het workflowbestand (`.github/**` is een beschermd pad; er is geen GitHub App meer, ADR 0093), merget PR's met `geen test` | — |

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen HTTP-route.

## Kopieer de vorm van

n.v.t. voor `docs/gouden-pad.md` (geen resource); railwerk volgt bestaande vormen:

- `.github/workflows/ci.yml` — vorm van een workflow onder `pull_request` met `permissions: read-all`. De bewijsjob krijgt een eigen
  workflow leerpunt-bewijs (types opened, synchronize, reopened, edited; eigen concurrency-groep), zodat een bewerkte
  beschrijving niet de hele CI afbreekt of verplichte checks op `skipped` zet. Het script komt via een aparte checkout van main.
  Een PR die dat workflowbestand wijzigt, draait onder `pull_request` zijn eigen versie; dat vangen alleen de diff-guard (die
  het oordeel `agent-merge` dan op nee zet) en de eigenaarreview
- `test/rails/leerpunt-sjabloon.test.ts` — sjabloon regelgebaseerd lezen zonder YAML-dependency; de nieuwe body-parser hergebruikt die lezer
- `scripts/kit/kooi.mjs` — draait het script buiten CI (een agent of pre-push), dan lopen beide bewijsruns via `inKooi`
  (R-TOOL-03: een werkmap is geen grens). In CI is de wegwerp-runner de grens, zoals voor elke test uit een PR; de
  basiskopie staat in een eigen tijdelijke map

## Hergebruik en UX

- Bestaande onderdelen: issue form `leerpunt.yml` als enige bron van koppen en keuzes; `gh` in CI met `GITHUB_TOKEN`; vitest.
  Geen nieuwe dependency.
- Sectie in de PR-beschrijving, letterlijk, één blok per gesloten leerpunt:

  ```text
  ## Leerpunt

  - #<nr>: trede <Type|Check|Gouden pad of generator>; bewijs <testpad>
  - #<nr>: trede <Type|Check|Gouden pad of generator>; bewijs geen test: <reden met een integratie- of e2e-test>
  - #<nr>: trede <Skill|Padregel|AGENTS.md>; bewijs baseline: zonder <a>/3, met 3/3 (<model>)
  - #<nr>: trede <Skill|Padregel|AGENTS.md>; bewijs geen baseline: <reden>
  ```

  De twee laatste vormen en het blok `### Scenario #<nr>` staan in spec [gedragsbaseline](gedragsbaseline.md) (ADR 0107).

- Comment van de workflow bij `leerpunt-onvolledig`, letterlijk de eerste regel: `Dit leerpunt volgt het sjabloon niet:`,
  daarna per fout één regel (`ontbreekt: <kop>`, `leeg: <kop>`, `onbekende waarde bij <kop>: <waarde>`, `volgorde: <kop>`),
  en per keuzeveld met een onbekende waarde één regel `Kies bij <kop> precies één van: <opties>; zet toelichting onder Bron
  of Onderbouwing, niet achter de waarde.` (leerpunt #759).
- Comment bij `leerpunt-zonder-bewijs`, letterlijk: `Gesloten zonder sluitbewijs (ADR 0078): geen gemergde PR met een sectie Leerpunt voor dit issue en geen comment "achterhaald: <reden>".`
- De workflow schrijft per issue hooguit één comment per soort; bij een volgende fout werkt hij die comment bij.
- Focusvolgorde en toetsenbord: n.v.t. — geen eigen UI.

## Acceptatiecriteria

- **leerlus-bewijs/AC-1** — Welke issues een PR sluit, komt uit GitHub zelf (GraphQL `closingIssuesReferences`), dus elk
  sluitwoord dat GitHub kent (close, closes, closed, fix, fixes, fixed, resolve, resolves, resolved, met of zonder dubbele
  punt) en een handmatige koppeling tellen. Een PR die zo een issue met label `leerpunt` sluit, zonder regel `- #n:` in de sectie `## Leerpunt`, maakt de job `leerpunt-bewijs` rood met de melding welk nummer
  ontbreekt. Een PR zonder zo'n verwijzing en zonder regel in `## Leerpunt` laat de job slagen zonder iets te draaien; een
  regel voor een issue dat de PR niet sluit, maakt de job rood met de uitweg `Closes #<nr>` (leerpunt #717). Toets:
  `test/scripts/leerpunt-koppeling.test.ts`
- **leerlus-bewijs/AC-2** — Bij `bewijs <testpad>`: het pad moet in de diff van de PR staan als toegevoegd of gewijzigd
  `*.test.ts(x)`-bestand buiten `*.int.test.ts` en `e2e/`, of bij trede Type als `*.test-d.ts`. Anders rood.
- **leerlus-bewijs/AC-3** — Het bewijsbestand draait in een tijdelijke kopie van de basis (merge-base) met alleen dat bestand
  uit de head en moet daar op minstens één assertie falen (vitest-uitslag `failed` met een assertiefout, geen laad- of
  importfout); het draait op de head en moet slagen. Bij trede Type: `vitest --typecheck` op het `*.test-d.ts`-bestand faalt
  op de basis en slaagt op de head. Slaagt het op de basis, faalt het daar alleen op laden, of faalt het op de head, dan rood
  met beide uitslagen. De PR-code draait zonder token: een voorbereidende stap met alleen-lezend token haalt de gesloten
  issues met hun labels op en zet die, met de beschrijving uit de event-payload, in een bestand; daarna geen `GH_TOKEN`,
  `GITHUB_TOKEN` of geheim in de env van workflow, job of bewijsstap, en geen `with: token` bij checkout
  (`persist-credentials: false`). Het token staat alleen in de env van die voorbereidende stap. De basisrun installeert uit de lockfile van de basis, de headrun uit die van de head, beide met
  `--ignore-scripts`. Een test leest het workflowbestand en faalt op een token in de env van workflow, job of een bewijsstap, of in `with: token`. Fixtures: een test die ook op de basis slaagt, en een test die op de basis
  alleen op een import faalt, maken de job allebei rood.
- **leerlus-bewijs/AC-4** — Gewijzigd door ADR 0107 (spec gedragsbaseline AC-5): `geen test: <reden>` is alleen geldig bij een
  integratie- of e2e-test uit de diff, met een niet-lege reden; bij trede Skill, Padregel of AGENTS.md is het bewijs
  `baseline:` of `geen baseline: <reden>` en is `geen test:` rood. Was: "`geen test: <reden>` is alleen geldig bij trede
  Skill, Padregel of AGENTS.md, of bij een integratie- of e2e-test, met een niet-lege reden". Verder ongewijzigd: met een niet-lege reden; dan slaagt de job en geeft het agent-merge-oordeel (`diff-guard.mjs`,
  gelezen door `pr-merge.mjs`) `nee` met reden `leerpunt zonder test`. Bij een andere trede of lege reden: rood. De job draait
  ook op `pull_request` type `edited`. Omdat de diff-guard niet op `edited` draait, leest `pr-merge.mjs` de beschrijving zelf op
  het moment van mergen met dezelfde parser van `## Leerpunt` als `leerpunt-bewijs.mjs`, en weigert bij `geen test:`, ook als
  het oordeel eerder `ja` was. Het omgekeerde (later `bewijs <pad>`) houdt het oordeel op `nee` tot de volgende push: veilig. Test: beschrijving na het oordeel
  gewijzigd van `bewijs <pad>` naar `geen test: …` geeft een weigering.
  Vervallen voor de diff-guard en het mergescript door ADR 0089 punt 5 (ADR 0078 Herzien #696): de eigenaar merget volgens
  afspraak; de job blijft zoals hierboven. Toets: `test/scripts/leerpunt-bewijs.test.ts`
- **leerlus-bewijs/AC-5** — De workflow `leerpunt-check` op `issues` (opened, edited, labeled, reopened) toetst een issue met label
  `leerpunt` tegen `leerpunt.yml`: elke kop aanwezig en in volgorde, verplichte velden niet leeg (`_No response_` telt als leeg),
  `Soort` en `Voorstel voor de plek` exact een optie. Bij fouten: label `leerpunt-onvolledig` en de comment uit "Hergebruik en UX";
  zonder fouten: label weg. Tabeltest per fout met echte bodies, ook #424, #487, #500 en #504 als vorm.
- **leerlus-bewijs/AC-6** — Bij `closed` op een leerpunt: zonder gemergde PR die het issue sluit (GraphQL
  `closedByPullRequestsReferences`) en een sectie `## Leerpunt` met dat nummer heeft, en zonder comment die begint met
  `achterhaald:` van een auteur met `author_association` OWNER, MEMBER of COLLABORATOR, zet de workflow
  `leerpunt-zonder-bewijs` met de comment. Bij `reopened`, of bij een geldige `achterhaald:`-comment na het sluiten
  (`issue_comment`), haalt hij het label weg. Een `achterhaald:` van een andere auteur telt niet.
- **leerlus-bewijs/AC-7** — De workflow heeft `permissions: issues: write` en verder niets; de job `leerpunt-bewijs` heeft
  `contents: read`, `pull-requests: read` en `issues: read`. Een test leest beide bestanden en faalt bij elk ander recht, bij
  elke aanroep die sluit, heropent of de body bewerkt, en bij elke `${{ github.event.* }}` in een `run:`-regel (issuebody en
  PR-beschrijving alleen via `env` of een bestand).
- **leerlus-bewijs/AC-8** — De skill `opleveren` stap 8 noemt de MCP-schrijfweg voor de cloud (aanmaken met label
  `leerpunt` en dezelfde body, alleen template-repo; sinds ADR 0101 ook bijwerken, sluiten als duplicaat en labels volgens
  AC-14; was "alleen aanmaken") en de sectie `## Leerpunt`; `.github/pull_request_template.md` heeft de
  sectie `## Leerpunt` met de regelvorm. `docs/framework.md` R-SEC-09, R-ROL-12 en R-WERK-13, `AGENTS.md` (regel over externe
  diensten) en `CLAUDE.md` ("MCP alleen read-only") noemen de uitzondering met ADR 0078. Het rolhek blijft op de MCP-issuetool
  vragen (ask); `mcpLezen` in `.claude/gates.json` verandert niet. Toets: `test/rails/opleveren-skill.test.ts`
- **leerlus-bewijs/AC-9** — De voorsortering staat als prompt in `docs/operations/leerpunten-voorsorteren.md`, zonder
  verwijzing naar een uitbreidingsstop, en noemt de labels `leerpunt-onvolledig` en `leerpunt-zonder-bewijs` als eigen bak.
- **leerlus-bewijs/AC-10** — Spec `leerlus.md` krijgt `status: gebouwd # #312`; het ST-09-protocol telt "opgepakt" als
  gesloten met sluitbewijs of achterhaald (ADR 0078 punt 6).
- **leerlus-bewijs/AC-11** — Gewijzigd door ADR 0109 (AC-16): `gh issue close <nr>` mag ook met precies één `--reason
  completed` in plaats van `--duplicate-of`; elke andere waarde van `--reason`/`-r` blijft ask. Verder ongewijzigd:
  Bijwerken en sluiten in het rolhek (ADR 0101 punt 5). Geldige vormen van de hoofdsessie, waarop
  het rolhek geen ask en geen deny geeft: `gh issue comment <nr>` met alleen `--body-file`/`-F <pad>`; `gh issue edit <nr>`
  met alleen `--title`/`-t` en `--body-file`/`-F` (minstens één); `gh issue close <nr>` met alleen `--duplicate-of <getal>`.
  In alle drie staat `--repo`/`-R` precies één keer, gelijk aan `template.repository` (hoofdletterongevoelig), en precies
  één positioneel getal als nummer. De toets loopt over alle ruwe woorden na `gh`, ook vóór `issue`; ook `--opt=waarde` en
  geclusterde korte vormen (`-Ff.md`, `-tTitel`) tellen. Ask bij: een andere of ontbrekende repo, `GH_REPO`/`GH_HOST` in het
  commando, commandosubstitutie, `--body`/`-b`, `--editor`/`-e`, `--web`/`-w`, `--reason`/`-r`, `--comment`/`-c`,
  `--edit-last`, `--delete-last`, `--create-if-none`, `--body-file -` (stdin), een URL als nummer of als waarde van
  `--duplicate-of` (gh volgt dan de repo uit de URL), `--`, een ontbrekend of tweede nummer, of elke andere optie; ontbreekt
  `template.repository`, dan ask. `reopen`, `delete`, `transfer`, `lock`, `unlock`, `pin`, `unpin` en `develop` zijn voor de
  hoofdsessie ask. Een label-optie bij `edit` blijft voor elke rol deny (R-ROL-08, ongewijzigd). Een subagent blijft deny op
  elke schrijvende `gh issue` (R-ROL-07, ongewijzigd). Het rolhek geeft zelf geen allow: zonder prompt gaat alleen de vorm
  uit AC-12. Wijzigt leerlus/AC-7 voor de hoofdsessie (zie Raakt ook). Tabeltest per vorm. Toets:
  `test/hooks/rolhek-leerpunt-bijwerken.test.ts` (nieuw)
- **leerlus-bewijs/AC-12** — `.claude/settings.json` heeft onder `permissions.allow` precies deze drie regels naast de
  bestaande voor `gh issue create`: `Bash(gh issue comment --repo <template.repository> *)`,
  `Bash(gh issue edit --repo <template.repository> *)` en `Bash(gh issue close --repo <template.repository> *)`, met de repo
  uit `.claude/gates.json`. De te gebruiken vorm is dus `gh issue <actie> --repo <repo> <nr> …`; met `-R`, een andere repo of
  zonder repo dekt geen allow-regel het commando. Een test leest beide bestanden en faalt bij een andere repo, een ontbrekende
  regel, of een regel die `-R`, een andere repo of een commando zonder repo dekt. Toets:
  `test/rails/leerpunt-bijwerken-settings.test.ts` (nieuw)
- **leerlus-bewijs/AC-13** — Sluiten als duplicaat telt als bewijs (ADR 0101 punt 2). De sluitreden komt uit de payload
  (`issue.state_reason`, ook bij `issue_comment`). Bij reden `duplicate` en een comment die begint met `duplicaat van #<nr>`,
  van een auteur met `author_association` OWNER, MEMBER of COLLABORATOR, waarbij `#<nr>` een ander issue (geen PR) met label
  `leerpunt` is, geldt de sluiting als bewijs, net als een geldige `achterhaald:`: de workflow zet geen
  `leerpunt-zonder-bewijs` en haalt het weg als het er al stond (ook op `issue_comment` na het sluiten). Het doel komt uit
  REST `repos/<repo>/issues/<nr>` (labels en het veld `pull_request`); een fout 404, of 410 voor een verwijderd issue, telt als "bestaat niet". Telt niet: een
  andere sluitreden, een comment van een andere auteur, een verwijzing naar zichzelf, een doel zonder label `leerpunt`, een
  doel dat een PR is of niet bestaat; dan blijft het label zoals in AC-6, zonder dat de job crasht. Tabeltest. Toets:
  `test/scripts/leerpunt-duplicaat.test.ts` (nieuw), `test/scripts/leerpunt-doel-ontbreekt.test.ts` (nieuw)
- **leerlus-bewijs/AC-14** — De skill `opleveren` stap 8 noemt vóór het indienen de zoektocht naar geraakte open leerpunten
  (`gh issue list … --label leerpunt --state open --search`) en per geraakt leerpunt de drie uitkomsten `opgelost` (via
  `Closes #<nr>` en `## Leerpunt`, al in de PR), `deels` en `zelfde les opnieuw`, met de slotregel "geen open leerpunt geraakt"; de
  doelcheck vóór elke schrijfactie (`gh issue view <nr> … --json labels`); de drie gh-vormen in de vorm uit AC-12; bij een
  duplicaat eerst `gh issue comment` met `duplicaat van #<nr>` en daarna `gh issue close --duplicate-of`; en in de cloud de
  MCP-issuetool voor dezelfde acties plus labels, nooit `leerpunt`, `leerpunt-onvolledig` of `leerpunt-zonder-bewijs`. Omdat
  stap 8 na de merge draait, noemt ook CI-lus stap 1 de zoektocht vóór het openen van de PR, met `Closes #<nr>` en
  `## Leerpunt` voor een opgelost leerpunt, alleen in de template: in een app nooit een sluitwoord (`#<nr>` wijst daar
  naar een app-issue), de uitkomst is `deels` of een comment (ADR 0101 punt 6, Herzien). Toets: `test/rails/leerpunt-bijwerken-docs.test.ts`
  (nieuw)
- **leerlus-bewijs/AC-15** — Gewijzigd door ADR 0109 (AC-21): in `AGENTS.md` staat "sluiten" in plaats van "sluiten als
  duplicaat"; de verwijzing naar 0101 blijft. Verder ongewijzigd: `docs/framework.md` R-WERK-13, R-ROL-07, R-ROL-12 en R-SEC-09 en `AGENTS.md` (regel over externe
  diensten) noemen bijwerken en sluiten als duplicaat met ADR 0101; `docs/nieuwe-app.md` noemt de drie nieuwe allow-regels
  bij de fork. Een test zoekt in elk bestand de verwijzing naar 0101. Toets: `test/rails/leerpunt-bijwerken-docs.test.ts`
  (nieuw)
- **leerlus-bewijs/AC-16** — Sluiten als opgelost in het rolhek (ADR 0109 punt 3). `gh issue close <nr>` met precies één
  `--reason completed` (ook `--reason=completed`, `-r completed`, `-rcompleted`, `-r=completed`) en verder alleen
  `--repo`/`-R` is voor de hoofdsessie een geldige vorm (geen ask, geen deny), met dezelfde eisen als AC-11: `--repo`/`-R`
  precies één keer gelijk aan `template.repository` (hoofdletterongevoelig), precies één positioneel getal, toets over alle
  ruwe woorden na `gh`, geen `GH_REPO`/`GH_HOST`, geen commandosubstitutie, geen `--`. Ask bij: `--reason` met een andere
  waarde (`"not planned"`, `not_planned`, `Completed`, leeg), `--reason` twee keer, `--reason` samen met `--duplicate-of`,
  `--comment`/`-c` (ook naast `--reason completed`), een URL of tweede nummer, een andere of ontbrekende repo, en elke andere
  optie. `reopen` blijft ask; een subagent blijft deny (R-ROL-07). De bestaande rijen van AC-11 blijven gelden, behalve de
  rij `close: -r` (`-r completed`), die van ask naar geldig gaat; de rijen `close: zonder --duplicate-of` en `close:
  --reason` (`"not planned"`) blijven ask. Voor de bouwer: `-r` moet in `GH_KORT` als `--reason`. Toets:
  `test/hooks/rolhek-leerpunt-bijwerken.test.ts`
- **leerlus-bewijs/AC-17** — Cloud (ADR 0109 punt 3). Het rolhek blijft op `mcp__github__issue_write` en
  `mcp__github__add_issue_comment` vragen (ask) voor de hoofdsessie en weigeren voor een subagent; `mcpLezen` in
  `.claude/gates.json` verandert niet. De skill `opleveren` stap 8 noemt dat de hoofdsessie met de MCP-issuetool op een
  leerpunt de staat `closed` alleen zet met `state_reason` `completed` (na de comment uit AC-18) of `duplicate`, en nooit
  `not_planned` of heropenen (`state` `open`), en dat in de cloud elke MCP-schrijfactie (comment, sluiten) een
  toestemmingsprompt voor de eigenaar is: zonder iemand die meekijkt staat deze route stil (zoals OV-4). Toets: `test/hooks/rolhek-leerpunt-bijwerken.test.ts` (ask en deny),
  `test/rails/leerpunt-bijwerken-docs.test.ts` (skilltekst)
- **leerlus-bewijs/AC-18** — Volgorde en tekst (ADR 0109 punt 1 en 2). De skill `opleveren` stap 8 noemt de uitkomst
  "opgelost op main" met, in deze volgorde: de doelcheck `gh issue view <nr> --repo <repo> --json labels,state,url` (label
  `leerpunt`, anders stop), dan `gh issue comment --repo <repo> <nr> --body-file <pad>` met een tekst die begint met
  `opgelost: ` en daarna een door komma's gescheiden lijst van één of meer verwijzingen in de vormen uit AC-20 (`#<nr>` van
  een gemergde PR naar `main`, een commit-SHA op `main`, `ADR <nnnn>` van een geaccepteerd ADR op `main`), dan `gh issue
  close --repo <repo> <nr> --reason completed`. Elke verwijzing in de lijst moet geldig zijn; is er één ongeldig of staat
  er één nog niet op `main`, dan geen sluiting maar `deels`. Ze noemt ook dat not planned, achterhaald en heropenen bij de eigenaar blijven.
  `docs/framework.md` R-ROL-12, R-SEC-09 en R-WERK-13 noemen sluiten als opgelost met verwijzing en ADR 0109. Een test zoekt
  in de skill de drie commando's in die volgorde en `opgelost: `, en in elke regel de verwijzing naar 0109. Toets:
  `test/rails/leerpunt-bijwerken-docs.test.ts`
- **leerlus-bewijs/AC-19** — Settings (ADR 0109 punt 3). De bestaande allow-regel `Bash(gh issue close --repo
  <template.repository> *)` uit AC-12 dekt de vorm `gh issue close --repo <repo> <nr> --reason completed`; `.claude/settings.json`
  verandert niet en houdt precies vier `gh issue`-regels. De test krijgt een rij die dat voor deze vorm vastlegt, naast de
  rij voor `--duplicate-of`. Toets: `test/rails/leerpunt-bijwerken-settings.test.ts`
- **leerlus-bewijs/AC-20** — Issue-check (ADR 0109 Gevolgen, OV-5). Een eigen tak in `scripts/kit/leerpunt-check.mjs`, die
  alleen draait bij `issue.state_reason` `completed` en na `sluitOordeel`; AC-6 en AC-13 blijven ongewijzigd. De tak leest
  de huidige comments en zoekt een comment die past op `opgelost:` hoofdletterongevoelig met witruimte vooraan toegestaan
  (zoals `DUPLICAAT`), van een auteur met `author_association` OWNER, MEMBER of COLLABORATOR. Na `opgelost:` volgt een door
  komma's gescheiden lijst van één of meer verwijzingen, elk precies één van: `#<cijfers>` (PR), 7 tot 40 kleine
  hexadecimale tekens (commit), `ADR <4 cijfers>` (ADR); elke andere vorm is ongeldig. De sluiting geldt als bewijs, net als
  een geldige `achterhaald:` (AC-6), alleen als **alle** verwijzingen geldig zijn: een `#<nr>` via REST
  `repos/<repo>/pulls/<nr>` gemergd (`merged` waar) met als basis de standaardbranch van de repo; commit en ADR toetst de
  check alleen op vorm. Dan zet de workflow geen `leerpunt-zonder-bewijs` en haalt het weg als het er al stond (ook op
  `issue_comment` na het sluiten). Telt niet: een andere sluitreden, een andere auteur (ook een bot met NONE), een lege
  lijst, één ongeldige verwijzing in de lijst, een `#<nr>` dat niet gemergd is, een andere basis heeft, een issue is of niet
  bestaat (404/410); dan blijft het label zoals in AC-6, zonder dat de job crasht. Tabeltest. Toets: `test/scripts/leerpunt-opgelost.test.ts` (nieuw)
- **leerlus-bewijs/AC-21** — `AGENTS.md` (ADR 0109, OV-6). In de regel over externe diensten luidt de uitzondering voor
  leerpunten letterlijk "een leerpunt-issue (aanmaken, bijwerken, sluiten)"; "sluiten als duplicaat" komt in `AGENTS.md` niet
  meer voor, en de verwijzing naar ADR 0101 blijft. Een test leest `AGENTS.md` en faalt op de oude tekst of als de nieuwe
  ontbreekt. Toets: `test/rails/leerpunt-bijwerken-docs.test.ts`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| PR sluit twee leerpunten | Twee regels in `## Leerpunt`; elk bewijs apart getoetst | n.v.t. |
| Regel in `## Leerpunt` voor een issue dat de PR niet sluit (geen sluitwoord of koppeling) | De job is rood met het nummer en de uitweg `Closes #<nr>`; zonder die fout draaide geen proef en bleef het issue open (leerpunt #717, `bewijsPlan` in `scripts/kit/leerpunt.mjs`) | n.v.t. |
| Eén test bewijst twee leerpunten | Hetzelfde pad op twee regels mag | n.v.t. |
| Bewijstest heeft een nieuwe helper nodig die op de basis niet bestaat | Laadfout op de basis telt niet: de job is rood met de melding "faalt op laden, niet op een assertie"; de helper hoort in de test zelf of de bouwer kiest een test die de bestaande code aanroept; de melding zegt dat ook (leerpunt #892) | n.v.t. |
| Typetest: `tsc` start niet, geeft geen `error TS`-diagnose of alleen een configuratiefout (TS5058, TS5083, TS18003) | Laadfout, geen rood bewijs (leerpunt #814, `typeUitslag` in `scripts/kit/leerpunt.mjs`) | n.v.t. |
| Basis kan het testbestand niet laden door een gewijzigde configuratie | Rood met de uitvoer; de eigenaar kan dan `geen test: <reden>` met eigenaarmerge laten gelden | n.v.t. |
| Leerpunt gesloten via een commit op main zonder PR | Geen sluitbewijs: label `leerpunt-zonder-bewijs` | n.v.t. |
| Issue zonder label `leerpunt` | Workflow en job doen niets | n.v.t. |
| Issue in een app-repo (via template-merge) | Workflow draait alleen als `github.repository` gelijk is aan `onderhoud.repository` | n.v.t. |
| Body door GitHub-formulier ingevuld | Zelfde koppen; `_No response_` bij `eerder` is goed | n.v.t. |
| Leerpunt gesloten vóór de bouw | Niet opnieuw beoordeeld (ADR 0078, Gevolgen) | n.v.t. |
| Fork-PR of ontbrekend token | Job rood met "geen toegang tot issuelabels"; de eigenaar beoordeelt | n.v.t. |
| `gh issue edit <nr>` met een nummer dat een PR is | Rolhek ziet het verschil niet; de doelcheck (ADR 0101 punt 4) is de rem; labels blijven deny | n.v.t. |
| Duplicaat verwijst naar een gesloten leerpunt | Telt; het doel moet een leerpunt zijn, open of dicht | n.v.t. |
| Duplicaat-comment vóór het sluiten geplaatst | Telt; de check leest alle comments bij `closed` | n.v.t. |
| Duplicaat-comment verwijst naar een PR of een niet-bestaand nummer | Telt niet; label zoals AC-6, de job blijft groen | n.v.t. |
| Duplicaat gesloten via MCP in de cloud | Telt alleen als de comment-auteur OWNER, MEMBER of COLLABORATOR is; na de merge één proef (ADR 0101) | n.v.t. |
| Leerpunt opgelost door een ADR of PR op main zonder `Closes #<nr>` (#830: ADR 0100 en #834) | Comment `opgelost: ADR 0100, #834`, daarna `--reason completed` (ADR 0109); telt alleen als beide verwijzingen geldig zijn (AC-20) | n.v.t. |
| `opgelost:`-comment zonder verwijzing, met één ongeldige verwijzing in de lijst, of een verwijzing die nog niet op main staat | Niet sluiten; comment `deels` (ADR 0101 punt 6); gebeurt het toch, dan telt het niet als bewijs (AC-20); het rolhek ziet de inhoud niet | n.v.t. |
| Gesloten als completed zonder `opgelost:`-comment | Label `leerpunt-zonder-bewijs` (AC-6) | n.v.t. |
| `opgelost:`-comment achteraf bewerkt of verwijderd | De check leest de huidige comments bij de volgende run (`closed`, `issue_comment`); is er geen geldige meer, dan blijft of komt het label zoals AC-6 | n.v.t. |
| `opgelost: #<nr>` waarbij `#<nr>` een issue is, geen PR | REST `pulls/<nr>` geeft 404: telt niet | n.v.t. |
| `opgelost:`-comment van een bot (`author_association` NONE) | Telt niet | n.v.t. |
| `gh issue close <nr> --reason completed` op een nummer dat een PR is | Rolhek ziet het verschil niet; de doelcheck is de rem (ADR 0101 punt 4) | n.v.t. |
| Gesloten met `opgelost:` maar de reden is `not planned` | Telt niet als bewijs; label zoals AC-6 | n.v.t. |

## Raakt ook

- Nieuw: `scripts/kit/leerpunt-bewijs.mjs`, `scripts/kit/leerpunt-check.mjs` (gedeelde sjabloonlezer), job in
  eigen workflow `leerpunt-bewijs.yml`, workflow `.github/workflows/leerpunt.yml`, `docs/operations/leerpunten-voorsorteren.md`.
- Gewijzigd: `.claude/skills/opleveren/SKILL.md`, `.github/pull_request_template.md`, `docs/framework.md` (R-SEC-09, R-ROL-12,
  R-WERK-13), `AGENTS.md`, `CLAUDE.md`, `docs/operations/st-09-praktijkproef.md`, `scripts/kit/diff-guard.mjs` en
  `scripts/kit/pr-merge.mjs` (AC-4), `docs/template/specs/leerlus.md`, `docs/nieuwe-app.md` (rulesetlijst) en
  `test/scripts/github-ruleset.test.ts`: `leerpunt-bewijs` erbij, en de job van `leerpunt.yml` (op `issues`, geen PR-check) als
  uitzondering op "elke workflowjob staat in requiredChecks"; dat wijzigt een bestaande test, met reden in de bouw-PR.
- AC-11 tot en met AC-15 (ADR 0101): `rails/hooks/lib/rolhek.mjs`, `.claude/settings.json`, `scripts/kit/leerpunt-check.mjs`,
  `.claude/skills/opleveren/SKILL.md`, `docs/framework.md`, `AGENTS.md`, `docs/nieuwe-app.md`. AC-11 wijzigt het gedrag
  dat `docs/template/specs/leerlus.md` AC-7 en `test/hooks/rolhek-leerpunt.test.ts` (de rij "voor de hoofdsessie verandert
  niets" bij comment, edit, close en de andere schrijfacties) vastleggen: die bestaande test wijzigt mee, met reden in de PR
  (R-TEST-02), en leerlus/AC-7 verwijst naar AC-11. Om dezelfde reden wijzigen `test/hooks/rolhek-label.test.ts` (een edit
  zonder label toetst nu met `--repo`) en `test/rails/opleveren-skill.test.ts` (leerlus-bewijs/AC-8: de MCP-tool doet meer dan
  alleen aanmaken).
- AC-16 tot en met AC-21 (ADR 0109): `rails/hooks/lib/rolhek.mjs`, `scripts/kit/leerpunt-check.mjs`,
  `.claude/skills/opleveren/SKILL.md`, `docs/framework.md`, `AGENTS.md`; `.claude/settings.json` niet (AC-19). AC-21
  wijzigt de AGENTS.md-toets van AC-15 in `test/rails/leerpunt-bijwerken-docs.test.ts` (de verwachting `/duplicaat/i` op de
  AGENTS-regel): die wijzigt mee, met reden in de PR (R-TEST-02). AC-16 wijzigt de rij `close: -r` (`-r completed`) in
  `test/hooks/rolhek-leerpunt-bijwerken.test.ts` van ask naar geldig, met reden in de PR (R-TEST-02). AC-6 en AC-13 blijven
  ongewijzigd.
- Verplichte check: `leerpunt-bewijs` in de ruleset (`scripts/github-ruleset.sh`) en `requiredChecks` in `.claude/decisions.json`.
- Na de merge: de routine "Leerpunten voorsorteren" verwijst naar het bestand uit AC-9.

## Buiten scope

Herhalingen en clusters in de voorsortering (voorstel V3) en meting uit GitHub voor kosten (V4): later, apart. Bestaande
gesloten leerpunten opnieuw beoordelen. De workflow laten sluiten of heropenen. Een privé kanaal voor railgaten (ADR 0078 punt 7).

## Testplan

Fase 1. De tester schrijft vóór de bouw, rood op asserties:

- `test/scripts/leerpunt-bewijs.test.ts` — AC-1 t/m AC-4 met PR-beschrijvingen en diffs als tabel; AC-3 met een fixture-repo
  in een tijdelijke map: één test die op de basis faalt (geldig), één die op beide slaagt (rood).
- `test/scripts/leerpunt-check.test.ts` — AC-5 en AC-6 met echte issuebodies als tabel.
- `test/rails/leerpunt-workflow.test.ts` — AC-7.
- `test/rails/opleveren-skill.test.ts` en `test/rails/leerpunt-sjabloon.test.ts` uitbreiden (toevoegen) — AC-8 t/m AC-10.

ADR 0101, risicowerk (rolhek): de tester schrijft vóór de bouw, rood op asserties, in nieuwe bestanden:

- `test/hooks/rolhek-leerpunt-bijwerken.test.ts` (nieuw) — AC-11, tabel per vorm, rol en reden.
- `test/rails/leerpunt-bijwerken-settings.test.ts` (nieuw) — AC-12, met negatieve rijen.
- `test/scripts/leerpunt-duplicaat.test.ts` (nieuw) — AC-13, tabel met issues, comments, sluitredenen en doelen.
- `test/rails/leerpunt-bijwerken-docs.test.ts` (nieuw) — AC-14 en AC-15.

ADR 0109, risicowerk (rolhek): de tester schrijft vóór de bouw, rood op asserties:

- `test/hooks/rolhek-leerpunt-bijwerken.test.ts` uitbreiden — AC-16 en AC-17, tabel per vorm, rol en reden.
- `test/rails/leerpunt-bijwerken-settings.test.ts` uitbreiden — AC-19.
- `test/rails/leerpunt-bijwerken-docs.test.ts` uitbreiden — AC-17 (skilltekst), AC-18 en AC-21.
- `test/scripts/leerpunt-opgelost.test.ts` (nieuw) — AC-20, tabel met sluitredenen, auteurs, verwijzingen en PR-doelen.

Handmatig na de merge: één proefleerpunt met een lege kop indienen en zien dat het label en de comment komen; daarna sluiten
als achterhaald.

## Open vragen

- **OV-1 ✅ besloten** — V1, V2 en V5 samen; openbare leerpunten zijn prima (eigenaar, 4 november 2026).
- **OV-2** — Waar draait het bewijs? Opties: een job in `guard.yml` (`pull_request_target`), een job in `ci.yml`
  (`pull_request`), een eigen workflow. Aanbeveling: een eigen workflow onder `pull_request` met `edited` en een eigen
  concurrency-groep, het script van main en geen token voor de PR-code. Onder `pull_request_target` zou code uit de PR met de
  rechten van de basis draaien; in `ci.yml` zou `edited` de hele CI herstarten (spec-reviews, 4 november 2026).
- **OV-3** — Wie mag `achterhaald:` schrijven? Aanbeveling: alleen auteurs met schrijfrecht (OWNER, MEMBER, COLLABORATOR),
  dus de eigenaar en de hoofdsessie via zijn token, met verwijzing naar het bestand of de PR die het leerpunt overbodig maakte;
  de voorsortering toont deze sluitingen.
- **OV-4** — Mag het rolhek de MCP-issuetool doorlaten? Aanbeveling: nee, ask blijven tot een eigen besluit met tabeltest.
- **OV-5 ✅ besloten** — De issue-check erkent een sluiting met `opgelost: <verwijzing>` als bewijs, zoals AC-20: een gemergde
  PR via REST getoetst, SHA en ADR op vorm (eigenaar, 24 november 2026).
- **OV-6 ✅ besloten** — `AGENTS.md` (regel over externe diensten): "sluiten als duplicaat" wordt "sluiten" (AC-21; eigenaar,
  24 november 2026).
