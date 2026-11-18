---
status: goedgekeurd
namespace: botgesprekken-sluiten
---

# De hoofdsessie sluit beantwoorde en verouderde botgesprekken

## Doel

Een PR zonder beschermd pad met een verwerkte en beantwoorde botbevinding komt zonder klik van de eigenaar op `main`:
`pnpm pr:resolve <nummer>` sluit precies de reviewgesprekken die een bot opende, die na de laatste botopmerking door een
mens met schrijfrecht beantwoord zijn en die GitHub als verouderd meldt (ADR 0096).

## Rollen en wie wat ziet

- **Hoofdsessie:** antwoordt in het gesprek met `gh api -X POST repos/<repo>/pulls/<nr>/comments/<id>/replies -F
  body=@<bestand>`, draait na de push met de fix `pnpm pr:resolve <nr>` en daarna `pnpm pr:merge <nr>`.
- **Eigenaar:** sluit elk ander gesprek zelf: van een mens, zonder antwoord, een afgewezen bevinding zonder codewijziging, en
  elk gesprek op een PR die een beschermd pad raakt.
- **Subagents:** draaien het script niet en antwoorden, wijzigen, verbergen of wissen niets in een gesprek; het rolhek
  weigert de directe `gh`-vorm en elk omhulsel, maar niet een interpreter of een eigen script (R-ROL-10).
- **GitHub:** de ruleset eist opgeloste gesprekken (R-REPO-02, ongewijzigd).

## Kopieer de vorm van

- `scripts/kit/pr-merge.mjs` — pure functies die redenen teruggeven, de API als parameter, elke aanroep afgevangen,
  schrijfacties pas aan het eind, redenen op stderr en slotregels op stdout. Hergebruik `leesModus`, `padRedenen`,
  `bestandOp`, `gh` en `ZONDER_BIN` (exporteren mag; `beschermdPad` gebruikt `padRedenen` zelf). `nummerUit(args, script =
  'pr:merge')` krijgt een tweede parameter voor de gebruiksregel (`Gebruik: pnpm <script> <nummer>`); zonder die parameter
  blijft de melding gelijk.
- `test/scripts/pr-merge-samenvoegen.test.ts` — unit-tests met een nep-API; per reden geen schrijfactie.
- `test/hooks/rolhek-pr-merge.test.ts` — tabeltest van de rolhekregel, per rol en per vorm.
- `test/hooks/rolhek-gh-allowlist.test.ts` — schrijfwijzen van `gh api` (`--raw-field`, `-F x=@-`, `command gh`,
  `/usr/bin/gh`, `--repo=o/r`).
- `test/support/negative-table.ts` — `expectNegativeTable` voor de negatieve tabellen.
- `docs/template/specs/agent-samenvoegen.md` — opbouw van deze spec.

## Hergebruik en UX

Geen UI. Nieuw: `scripts/kit/pr-resolve.mjs` met scriptregel `"pr:resolve": "node scripts/kit/pr-resolve.mjs"`, en twee
exports: `gesprekRedenen(gesprek)` en `sluitGesprekken({ rest, graphql }, { repo, nummer, head })`, dat `{ uit, fout, code }`
teruggeeft: `fout` zijn de regels voor stderr (een stop), `uit` die voor stdout (per gesprek en de slotregel); bij een stop
is `uit` leeg. `rest` is de `Api` van het mergescript (`gh(endpoint)`: `gh api <endpoint>`, geparste JSON; een 404 houdt
`HTTP 404` in de melding).

**Contract van `graphql(query, variabelen)`:** geeft de volledige geparste body terug. Lezen: variabelen `{ owner, name,
number, after }` (`owner` en `name` uit `repo`, `number` als getal (de uitkomst van `nummerUit`), `after` `null` op pagina 1, daarna de
`endCursor`), de PR op
`data.repository.pullRequest`. Sluiten: variabelen `{ threadId }`, het antwoord op `data.resolveReviewThread.thread`. Een
body met `errors` (ook naast `data`) en een `graphql` die gooit, tellen allebei als niet te lezen (AC-4) of `sluiten
mislukt` (AC-5). De echte wrapper roept `gh api graphql` aan via `execFileSync` met `env: ZONDER_BIN`: `-f query=<tekst>`
met de vaste query of mutatie als letterlijke tekst in het script (nooit uit invoer opgebouwd), `-f` voor de tekstvariabelen
(`owner`, `name`, `after`, `threadId`), `-F number=<nr>` voor het getal; op pagina 1 ontbreekt `after` (de variabele
`$after: String` is dan `null`). Een exitcode anders dan 0 of geen JSON op stdout: de wrapper gooit.

Lezen via REST, zoals het mergescript: `repos/<repo>/branches/main` (de kop van main), `.claude/gates.json` op die SHA
(`bestandOp`, `leesModus`) en de padtoets `padRedenen` op dezelfde SHA. Zo komen modus en padtabel van één commit. Lezen
via GraphQL, één query per pagina, van `repository(owner:, name:).pullRequest(number:)`: `state`, `isCrossRepository`,
`baseRefName`, `headRefOid` en `reviewThreads(first: 100, after:)` met `totalCount`, `pageInfo { hasNextPage endCursor }` en
`nodes`, per gesprek `id`, `isResolved`, `isOutdated`, `viewerCanResolve`, `path` en `comments(first: 100)` met
`totalCount`, `pageInfo { hasNextPage }` en `nodes`, per opmerking `url`, `state`, `createdAt`, `authorAssociation` en
`author { __typename }`. Schrijven: `resolveReviewThread(input: { threadId })` met `thread { id isResolved }`.

Uitvoer letterlijk (`<nr>`, `<pad>`, `<url>` ingevuld; `<url>` is die van de eerste opmerking; een onleesbaar `<pad>`,
`<url>` of `headRefOid` wordt `?`). Op stderr, zoals de redenen van het mergescript:

- Fout gebruik: `Gebruik: pnpm pr:resolve <nummer>`, exit 1. Geen anker te lezen: `Geen leesbare vertrouwde basis`, exit 1,
  zonder GitHub-aanroep (zoals `main()` van het mergescript).
- Stop, exit 1, geen mutatie: `Geen gesprek gesloten (ADR 0096):` en per reden `- <reden>`, in drie trappen:
  1. Elk alleen, de eerste die faalt: `geen geldige lokale HEAD`; `de kop van main is niet leesbaar`; `de modus op main is
     niet "niet-kritiek": de eigenaar sluit de gesprekken`.
  2. Elk alleen: `de PR of de gesprekken zijn niet te lezen`; `meer dan 1000 gesprekken: de eigenaar sluit ze`.
  3. Samen, in deze volgorde: `de PR is niet open`; `de basis is niet main`; `de head staat niet in deze repository (fork)`;
     `de head van de PR (<7 tekens>) is niet de lokale HEAD (<7 tekens>)`; en de reden van `padRedenen` letterlijk: `raakt
     een beschermd pad (<paden>): de eigenaar voegt samen` of `de bestanden van de PR of de padtabel op main zijn niet te
     lezen: de eigenaar voegt samen`.

Op stdout, na de toetsen:

- Per gesprek met `isResolved` niet `true`, in leesvolgorde: `- gesloten: <pad> (<url>)` of `- open: <pad> (<url>): <reden>`, met reden `niet te
  lezen`, `niet geopend door een bot; de eigenaar sluit het`, `geen antwoord na de laatste opmerking van een bot`, `niet
  verouderd: de regel is niet gewijzigd`, `GitHub staat sluiten niet toe` of `sluiten mislukt`. Een al gesloten gesprek
  krijgt geen regel.
- Slotregel: `PR #<nr>: <g> gesloten, <o> open, <a> waren al gesloten.` Exit 0 als `<o>` 0 is, anders exit 1.

## Acceptatiecriteria

- **botgesprekken-sluiten/AC-1** — `gesprekRedenen(gesprek)` geeft hoogstens één reden: de eerste die faalt in de volgorde
  `niet te lezen` (AC-2), `niet geopend door een bot; de eigenaar sluit het`, `geen antwoord na de laatste opmerking van een
  bot`, `niet verouderd: de regel is niet gewijzigd`, `GitHub staat sluiten niet toe`. Leeg alleen als: de eerste opmerking
  in `comments.nodes` `author.__typename` `Bot` heeft; later in `nodes` dan de laatste opmerking met `__typename` `Bot` een
  opmerking staat met `__typename` `User` en `authorAssociation` `OWNER`, `MEMBER` of `COLLABORATOR` (OV-1); `isOutdated`
  `true` is; en `viewerCanResolve` `true` is. Een opmerking van een andere bot telt als botopmerking, niet als antwoord. Een
  opmerking met `author` `null`, met een ander `__typename` dan `Bot` of `User`, of van een `User` met een andere
  `authorAssociation` telt als geen van beide; is zo'n opmerking de eerste, dan is het gesprek niet door een bot geopend.
  De aanroeper toetst `isResolved` `true` vóór `gesprekRedenen` (AC-5).
- **botgesprekken-sluiten/AC-2** — `niet te lezen` geldt voor een gesprek met: `id` geen niet-lege tekst; `isResolved`,
  `isOutdated` of `viewerCanResolve` geen boolean, of `isResolved` niet `false`; `path` geen tekst; `comments.nodes` geen
  lijst of leeg; `comments.totalCount` ongelijk aan het aantal `nodes`; `comments.pageInfo.hasNextPage` niet `false`; een
  opmerking met `url` of `authorAssociation` geen tekst, `createdAt` geen geldige ISO-tijd, `author` niet `null` en zonder
  tekst in `__typename`, of `state` anders dan `SUBMITTED`; of een `createdAt` die daalt in de volgorde van `nodes`. Zo'n
  gesprek wordt niet gesloten; de andere gesprekken worden gewoon getoetst.
- **botgesprekken-sluiten/AC-3** — Vóór enige mutatie toetst `sluitGesprekken` de drie trappen uit "Hergebruik en UX": trap 1
  stopt bij de eerste reden (lokale HEAD 40 hex-tekens; `rest` op `repos/<repo>/branches/main` gooit niet en geeft in
  `commit.sha` 40 hex-tekens, anders `de kop van main is niet leesbaar`; modus `merge` in `gates.json` op die SHA
  `niet-kritiek`, onleesbaar telt als `eigenaar` via `leesModus`); trap 2 volgt AC-4; trap 3 geeft alle redenen samen
  (`state` `OPEN`, `baseRefName` `main`, `isCrossRepository` `false`, `headRefOid` gelijk aan de lokale HEAD, en geen reden
  uit `padRedenen` op de kop van main, OV-2). Elke reden geeft `Geen gesprek gesloten (ADR 0096):` met de redenen, exit 1,
  geen regel per gesprek, geen slotregel en nul aanroepen van de mutatie.
- **botgesprekken-sluiten/AC-4** — Paginering: zolang `hasNextPage` `true` is, leest het script de volgende pagina met de
  variabelen `{ owner, name, number, after }` en `after` gelijk aan `endCursor` (pagina 1: `after` `null`). Na tien
  pagina's nog `hasNextPage` `true`: `meer dan 1000 gesprekken: de eigenaar sluit ze`. `de PR of de gesprekken zijn niet te
  lezen` bij: een gooiende `graphql`; een body met `errors` of zonder object op `data.repository.pullRequest`;
  `reviewThreads.nodes` geen lijst; `hasNextPage` geen boolean, of `true` zonder niet-lege `endCursor`; een latere pagina met
  een andere `state`, `baseRefName`, `isCrossRepository`, `headRefOid` of `totalCount` dan de eerste (de PR-velden komen van
  de eerste pagina); of een totaal aantal gelezen gesprekken ongelijk aan `reviewThreads.totalCount`. In al die gevallen nul
  mutaties.
- **botgesprekken-sluiten/AC-5** — Schrijven: pas na alle pagina's en alle toetsen roept het script per gesprek met een lege
  `gesprekRedenen` één keer `resolveReviewThread` aan met de variabelen `{ threadId }` gelijk aan het `id` van dat gesprek,
  en geen ander. Een gesprek met `isResolved` `true` krijgt geen aanroep en geen regel, en telt bij `<a>`. Gooit de mutatie,
  heeft de body `errors`, of staat op `data.resolveReviewThread.thread` geen `isResolved` `true` met `id` gelijk aan het
  gevraagde `id`, dan wordt dat gesprek `- open: <pad> (<url>): sluiten mislukt`, gaan de andere door en is de exitcode 1.
- **botgesprekken-sluiten/AC-6** — Uitvoer, kanaal en exitcode zoals in "Hergebruik en UX", letterlijk: gebruik, basis en
  stop op stderr; regels per gesprek en slotregel op stdout. Exit 0 alleen als na de run geen open gesprek overblijft (ook
  bij een PR zonder gesprekken: `PR #<nr>: 0 gesloten, 0 open, 0 waren al gesloten.`). `nummerUit(args, 'pr:resolve')`
  weigert `0`, `012`, `12a`, geen argument en meer dan één argument met `Gebruik: pnpm pr:resolve <nummer>`;
  `test/scripts/pr-merge.test.ts` slaagt ongewijzigd.
- **botgesprekken-sluiten/AC-7** — Rolhek: `pnpm pr:resolve <nr>` (spaties genormaliseerd zoals bij het mergescript) van de
  hoofdsessie, vanuit de repo-root, met `mergeTrusted` waar en zonder eerdere deny of ask, geeft allow. Niet vertrouwd of
  buiten de root: deny met `pnpm pr:resolve alleen vanuit de repo-root, met modus "niet-kritiek" in het anker en scripts,
  rails en hostbestanden (package.json, .npmrc, …) gelijk aan het anker (ADR 0096)`. Elke subagent (developer, tester,
  architect, reviewer, docs, onbekend): deny met `Gesprekken sluiten via pnpm pr:resolve doet alleen de hoofdsessie (ADR
  0096)`.
- **botgesprekken-sluiten/AC-8** — Rolhek, andere vormen: deny met ``Het sluitscript draait alleen als precies `pnpm
  pr:resolve <nummer>` (ADR 0096)`` voor dezelfde tabel als bij het mergescript met `pr-resolve` en `pr:resolve` in plaats
  van de merge-namen (onder meer `node scripts/kit/pr-resolve.mjs 12`, `pnpm pr:resolve 12 && echo klaar`, `pnpm run
  pr:resolve 12`, `sh -c "pnpm pr:resolve 12"`, `pnpm pr:resolve $(echo 12)`, `node scripts/kit/pr-res*.mjs 12`, `pnpm
  pr:*ve 12`). Lezen blijft vrij: `cat`, `grep` en `git log` op `scripts/kit/pr-resolve.mjs` geven geen deny.
- **botgesprekken-sluiten/AC-9** — Kale mutaties dicht, voor de hoofdsessie en elke subagent, met de bestaande reden `gh api:
  labels, reviews en statussen zet alleen de eigenaar`: `gh api graphql -f query='mutation { resolveReviewThread(input:
  {threadId: "x"}) { thread { id } } }'` en dezelfde met `unresolveReviewThread`, `deletePullRequestReviewComment`,
  `updatePullRequestReviewComment`, `minimizeComment` en `unminimizeComment`. Het GraphQL-patroon van
  `apiWritesSelfReview` krijgt `minimizeComment` (hoofdletterongevoelig, dus `unminimizeComment` gaat mee; besloten
  2026-11-18). De bestaande tests in `test/hooks/rolhek-pr-merge.test.ts` slagen ongewijzigd.
- **botgesprekken-sluiten/AC-10** — Wisroute dicht: `ghForbidden` weigert voor elke rol, ook de hoofdsessie, met `gh api: een
  reviewopmerking wijzigen of wissen doet alleen de eigenaar, voor elke rol (ADR 0096)` elke schrijvende aanroep
  (`apiMutates`: een methode anders dan `GET`, of een veld of `--input`) waarvan het endpoint uit `apiCall` (zonder host,
  voorloop-slashes en `api/v3/`) past op `/(?:^|\/)pulls\/+comments\/+[^/?#]+\/*(?:[?#]|$)/i`. Tabel (o/r staat voor een
  repo; "deny" betekent: deze reden staat in de deny):

  | Vorm | Hoofdsessie | Subagent |
  |---|---|---|
  | `gh api -X DELETE repos/o/r/pulls/comments/1` | deny | deny |
  | `gh api -XDELETE repos/o/r/pulls/comments/1` | deny | deny |
  | `gh api -iX DELETE repos/o/r/pulls/comments/1` | deny | deny |
  | `gh api -X=DELETE repos/o/r/pulls/comments/1` | deny | deny |
  | `gh api --method=delete repos/o/r/pulls/comments/1` | deny | deny |
  | `gh api -X PUT repos/o/r/pulls/comments/1` | deny | deny |
  | `gh api --method PATCH repos/o/r/pulls/comments/1 -f body=x` | deny | deny |
  | `gh api repos/o/r/pulls/comments/1 -f body=x` (POST via een veld) | deny | deny |
  | `gh api repos/o/r/pulls/comments/1 --field body=x` | deny | deny |
  | `gh api repos/o/r/pulls/comments/1 --raw-field body=x` | deny | deny |
  | `gh api repos/o/r/pulls/comments/1 -F body=@-` | deny | deny |
  | `gh api repos/o/r/pulls/comments/1 --input f.json` | deny | deny |
  | `gh api -X DELETE /repos/O/R/Pulls/Comments/1/` | deny | deny |
  | `gh api -X DELETE 'repos/o/r/pulls/comments/1?x=1'` | deny | deny |
  | `gh api -X DELETE 'repos/o/r/pulls/comments/1#x'` | deny | deny |
  | `gh api -X DELETE https://api.github.com/repos/o/r/pulls/comments/1` | deny | deny |
  | `gh api -X DELETE 'repos/{owner}/{repo}/pulls/comments/1'` | deny | deny |
  | `gh api -X DELETE repositories/1/pulls/comments/1` | deny | deny |
  | `gh -R o/r api -X DELETE repos/o/r/pulls/comments/1` | deny | deny |
  | `gh --repo=o/r api -X DELETE repos/o/r/pulls/comments/1` | deny | deny |
  | `/usr/bin/gh api -X DELETE repos/o/r/pulls/comments/1` | deny | deny |
  | `command gh api -X DELETE repos/o/r/pulls/comments/1` | deny | deny |
  | `gh api repos/o/r/pulls/comments/1` | geen deny | geen deny |
  | `gh api -X GET repos/o/r/pulls/comments/1` | geen deny | deny (bestaand: alleen lezende opties) |
  | `gh api -X POST repos/o/r/pulls/12/comments/1/replies -F body=@antwoord.md` | geen deny | deny (bestaand: schrijven via `gh api`) |

  De weigeringen staan in een tabel via `expectNegativeTable` met als basis de toegestane leesvorm.
- **botgesprekken-sluiten/AC-11** — Configuratie: `.claude/settings.json` en de fixture
  `test/rails/fixtures/claude-sandbox-werkstraat/boundaries.json` hebben elk `Bash(pnpm pr:resolve *)` in `permissions.ask`
  direct na `Bash(pnpm pr:merge *)`, en `pnpm pr:resolve *` in `sandbox.excludedCommands` direct na `pnpm pr:merge *` (de
  tests vergelijken met `toEqual`, dus op volgorde); geen regel in `permissions.allow` noemt `pr:resolve`;
  `test/rails/claude-sandbox-werkstraat.test.ts` en `test/rails/excluded-commands.test.ts` slagen. `.claude/gates.json` heeft
  `"scripts/kit/pr-resolve.mjs": { "besluit": "besluit-pr" }` en `.github/CODEOWNERS` is gelijk aan de uitvoer van
  `scripts/kit/codeowners.mjs` (`check-docs`).
- **botgesprekken-sluiten/AC-12** — Bewijs, geen test; de uitvoer staat in de thread. (a) In de bouw-PR, na de push:
  `pnpm pr:resolve <nr>` van de hoofdsessie op de bouw-PR stopt met exit 1, `Geen gesprek gesloten (ADR 0096):` en als enige
  reden `raakt een beschermd pad (…)` (de PR raakt `scripts/` en `rails/`), zonder mutatie. Het rolhek draait dan uit het
  anker op `main` en kent de nieuwe regel nog niet: heeft de sessie de gewijzigde `.claude/settings.json` geladen, dan geeft
  de `ask`-regel een prompt; anders draait het commando in de sandbox. In beide gevallen is de stopreden van het script het
  bewijs, naast de unit- en rolhektests. Geeft het een andere stopreden (bijvoorbeeld `de kop van main is niet leesbaar`
  omdat de sandbox GitHub niet bereikt), dan is de padtoets niet bewezen: meld dat en toon hem na de merge op een PR met
  een beschermd pad. (b) Na de merge, in een sessie waarvan het anker de merge bevat: `pnpm run pr:resolve <nr>` geeft de
  deny van AC-8. (c) Op de eerste PR zonder beschermd pad met een verwerkt en beantwoord botgesprek: `pnpm pr:resolve <nr>`
  draait zonder prompt en sluit het gesprek, en `pnpm pr:merge <nr>` voegt samen zonder klik van de eigenaar.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Gesprek geopend door een mens (ook het gedeelde account) | open: `niet geopend door een bot; de eigenaar sluit het` (AC-1) | n.v.t. |
| Bot zonder antwoord | open: `geen antwoord na de laatste opmerking van een bot` (AC-1) | n.v.t. |
| Bot met antwoord, niet verouderd (bevinding afgewezen zonder codewijziging) | open: `niet verouderd: de regel is niet gewijzigd` (AC-1) | n.v.t. |
| Bot reageert opnieuw na het antwoord, vóór de run | open: `geen antwoord na de laatste opmerking van een bot` (AC-1) | n.v.t. |
| Bot reageert tussen lezen en sluiten | het gesprek wordt toch gesloten; aanvaard risico (ADR 0096), de opmerking blijft leesbaar | n.v.t. |
| Antwoord van een andere bot of van een `User` zonder schrijfrecht | telt niet als antwoord (AC-1, OV-1) | n.v.t. |
| Bezwaar van de eigenaar zelf in een botgesprek | telt als antwoord: eigenaar en agent delen één account; aanvaard risico (ADR 0096) | n.v.t. |
| Conceptopmerking (`state` niet `SUBMITTED`) of dalende `createdAt` | open: `niet te lezen` (AC-2) | n.v.t. |
| Al gesloten gesprek | geen aanroep en geen regel, telt bij `<a>` (AC-5) | n.v.t. |
| Meer dan 100 gesprekken | volgende pagina's, hoogstens tien (AC-4) | n.v.t. |
| Meer dan 100 opmerkingen in één gesprek | open: `niet te lezen` (AC-2) | n.v.t. |
| PR zonder gesprekken | exit 0 met de slotregel (AC-6) | n.v.t. |
| Gesloten of samengevoegde PR | stop: `de PR is niet open` (AC-3) | n.v.t. |
| PR raakt een beschermd pad, of bestanden of padtabel niet te lezen | stop met de reden van `padRedenen`, nul mutaties; de eigenaar sluit en voegt samen (AC-3, OV-2) | n.v.t. |
| Push na het lezen | geen invloed: elk gesprek is getoetst op wat gelezen is; een nieuw botgesprek vraagt een nieuwe run | n.v.t. |
| Agent wist, wijzigt of verbergt een opmerking met een directe `gh`-vorm | rolhek weigert, voor elke rol (AC-9, AC-10) | n.v.t. |
| Een agent doet dat via een interpreter of een eigen script (elke rol), of de hoofdsessie via een omhulsel (`bash -c`, `env -i`) | het rolhek ziet het niet; aanvaard risico (ADR 0096, R-ROL-10) | n.v.t. |
| Sessie met een anker van vóór de merge | geen rolhekregel voor het script, alleen zijn eigen toets (ADR 0096, Gevolgen) | n.v.t. |

## Raakt ook

- `docs/template/adr/0096-botgesprekken-sluiten.md` (nieuw); `Herzien:`-regels in ADR 0093, 0063 en 0069.
- `scripts/kit/pr-merge.mjs`: exports en de tweede parameter van `nummerUit`; het gedrag van het mergescript wijzigt niet.
- `rails/hooks/lib/rolhek.mjs`: een tweede exacte vorm naast die van het mergescript, met dezelfde vangnetten op de
  shelltekst (`startMergescript`, `PR_MERGE_EXACT`, `PR_MERGE_BESTAND`, `globRaaktMerge` krijgen een tegenhanger of worden
  algemeen); in `ghForbidden` een eigen regel voor de wisroute (AC-10); het GraphQL-patroon van `apiWritesSelfReview` krijgt
  `minimizeComment` (AC-9); `SELF_REVIEW_API` wijzigt niet.
- `rails/hooks/lib/runner-authority.mjs`: `trustedMerge` en `MERGE_FILES` gelden ongewijzigd (het script valt onder
  `scripts`, zijn imports onder `scripts` en `rails`); alleen hun commentaren noemen ook `pnpm pr:resolve` (ADR 0096).
- Tests: `test/scripts/gesprekken-sluiten.test.ts` en `test/hooks/rolhek-gesprekken-sluiten.test.ts` (nieuw; namen zonder
  de scriptnaam, omdat het rolhek shelltekst met die naam weigert).
- Beschermde paden, akkoord van de eigenaar (2026-11-18): `.claude/gates.json` (de rij uit AC-11, en in het `$comment` bij
  `merge`: de modus bepaalt ook `pnpm pr:resolve`, ADR 0096) en `.github/CODEOWNERS` (opnieuw gegenereerd met `node
  scripts/kit/codeowners.mjs --schrijf`); `.claude/settings.json` (AC-11, alleen met Edit in de hoofdsessie); bestaande test
  die wijzigt (R-TEST-02, akkoord via deze spec): de fixture `test/rails/fixtures/claude-sandbox-werkstraat/boundaries.json`,
  omdat `test/rails/claude-sandbox-werkstraat.test.ts` `permissions.ask` en `excludedCommands` exact vergelijkt.
- `package.json` (scriptregel; `test/rails/excluded-commands.test.ts` vraagt die in dezelfde PR).
- `scripts/kit/check-docs.mjs`: het commentaar bij `mergeModusViolations` noemt ook `pnpm pr:resolve` als lezer van de modus.
- `docs/operations/sandbox-bewijs.md`: de regelnummers van `.claude/settings.json` verschuiven.
- `docs/operations/agent-doorloop.md`, bij het samenvoegen: de antwoordroute uit "Rollen" en eerst `pnpm pr:resolve`, dan
  `pnpm pr:merge`.
- `docs/ENVIRONMENT.md`, "Grens van de sandbox": de alinea over het achterlopende anker geldt ook voor `pnpm pr:resolve`,
  met de reden "(ADR 0096)".
- `docs/nieuwe-app.md`, de alinea "Wie samenvoegt": de hoofdsessie sluit vóór het samenvoegen een beantwoord en verouderd
  botgesprek met `pnpm pr:resolve`; elk ander gesprek sluit de eigenaar.
- `docs/framework.md`: R-ROL-08 (uitzondering `pnpm pr:resolve <nr>` naast `pnpm pr:merge`; het rolhek weigert voor elke rol
  een reviewopmerking wijzigen, wissen of verbergen via `gh api`), R-WERK-12 (eerst `pnpm pr:resolve`, dan `pnpm pr:merge`)
  en §13 (bekende gaten: verouderd bewijst geen oplossing; een interpreter of eigen script bij elke rol, een omhulsel bij de
  hoofdsessie). R-ROL-10 wijzigt niet: het noemt interpreters en eigen scripts al voor elke rol (`docs/roadmap.md`, "Bekende
  gaten in het rolhek") en omhulsels bij de hoofdsessie ("Omhulsels met opties"). R-REPO-01,
  R-ROL-12 en R-REPO-02 wijzigen niet.
- `.claude/skills/opleveren/SKILL.md`, sectie Mergen, stap 3 (hoofdsessie met Edit, akkoord eigenaar); `docs/template-changelog.md`.
- Leerpunt (R-DOC-09, nieuwe rolhekuitzondering; akkoord van de eigenaar): de hoofdsessie opent vóór de PR een issue met
  label `leerpunt` over #803, en de PR sluit het met een sectie `## Leerpunt`.
- Voor de hoofdsessie: het rolhek weigert shelltekst met de naam van het nieuwe script buiten de exacte aanroep; stage per
  map (`git add scripts/kit`) en houd de scriptnaam uit PR-titel en commitkop.
- Niet: `AGENTS.md` (de regel over wie samenvoegt blijft waar); geen migratie, route, permissie of resource, dus
  `check:migrations`, `check:secdef`, `test:db` en `test/security/resources.ts` raakt dit niet.

## Buiten scope

- Het sluiten inbouwen in `pnpm pr:merge`, of een open gesprek als reden in het mergescript (ADR 0096, Alternatieven).
- Een gesprek van een mens sluiten, een bevinding afwijzen zonder codewijziging, of een gesprek sluiten op een PR met een
  beschermd pad.
- Een gewone opmerking op de PR (`issues/comments`) wijzigen of wissen via REST: die opent geen reviewgesprek.
- Een nieuw vangnet tegen omhulsels, interpreters of eigen scripts bij de hoofdsessie (besloten 2026-11-18; R-ROL-10).

## Testplan

Tests eerst, door de tester (risicowerk, R-WERK-04). De hoofdsessie mat de leesquery op #803 (2026-11-18); de
nep-API-fixtures volgen die vorm (bot `NONE`, antwoord `OWNER`, `state` `SUBMITTED`). Niet gemeten: het antwoord van
`resolveReviewThread` en `state` `PENDING`; de fixtures volgen het GraphQL-schema, en wijkt het echte antwoord af, dan geeft
AC-5 `sluiten mislukt` en exit 1 en laat AC-12 dat zien. AC-1 en AC-2 als unit-tests op `gesprekRedenen` met
`expectNegativeTable`, met als basis een sluitbaar gesprek en een rij per voorwaarde. AC-3 tot en met AC-6 in
`test/scripts/gesprekken-sluiten.test.ts` met:

- een nep-`rest` die levert wat het script en `padRedenen` lezen: `repos/<repo>/branches/main` (`{ commit: { sha } }`),
  `repos/<repo>/contents/.claude/gates.json?ref=<sha>` (`{ content: <base64> }`), voor
  `repos/<repo>/contents/.claude/gates.app.json?ref=<sha>` een fout met `HTTP 404` in de melding (alleen dan telt het als
  afwezig, zie `appBestand`), en `repos/<repo>/pulls/<nr>/files?per_page=100&page=<n>` als lijst met `filename`;
- een nep-`graphql` die query en mutatie scheidt, de variabelen vastlegt, een body `{ data }` of `{ errors }` geeft en de
  mutaties telt: per stopreden nul mutaties, bij succes precies de verwachte `threadId`'s.

AC-7 tot en met AC-11 in `test/hooks/rolhek-gesprekken-sluiten.test.ts` in de vorm van `test/hooks/rolhek-pr-merge.test.ts`.
AC-12 is bewijs.

## Open vragen

- **OV-1 ✅ besloten** — Een antwoord telt alleen van een `User` met `authorAssociation` `OWNER`, `MEMBER` of `COLLABORATOR`
  (eigenaar, 2026-11-18).
- **OV-2 ✅ besloten** — Nee: op een PR die een beschermd pad raakt, of waarvan bestanden of padtabel niet te lezen zijn,
  sluit het script niets; dezelfde padtoets als het mergescript (eigenaar, 2026-11-18).
- **OV-3 ✅ besloten** — Vorm: een eigen script `pnpm pr:resolve`, niet in het mergescript (eigenaar, 2026-11-18).
- **OV-4 ✅ besloten** — Voorwaarde: bot, antwoord na de laatste botopmerking, en verouderd, alle drie (eigenaar, 2026-11-18).
- **OV-5 ✅ besloten** — De wisroute gaat dicht in dezelfde PR (AC-10) (eigenaar, 2026-11-18).
- **OV-6 ✅ besloten** — `minimizeComment` (en daarmee `unminimizeComment`) valt voor elke rol onder de weigering van
  review-mutaties (AC-9): een botbevinding verdwijnt niet ongezien uit beeld (eigenaar, 2026-11-18).
- **OV-7 ✅ besloten** — Omhulsels: eerlijk benoemen als aanvaard risico (R-ROL-10), geen nieuw vangnet (eigenaar,
  2026-11-18).
