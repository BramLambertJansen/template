---
status: goedgekeurd
namespace: ci-log
---

# De log van een rode CI-job in één aanroep: `pnpm pr:log <nummer>`

## Doel

De hoofdsessie ziet met één commando, lokaal en in de cloud, per rode CI-job van een PR alleen de regels rond elke fout,
zonder de volledige log in de context (ADR 0102, leerpunt #679).

## Rollen en wie wat ziet

- **Hoofdsessie:** draait `pnpm pr:log <nummer>` na een rode `pnpm pr:verify`, pas als het anker deze wijziging heeft (na de
  merge); de skill `opleveren` en de receptenkaart noemen het.
- **Subagents:** krijgen een weigering van het rolhek; de hoofdsessie levert de uitslag aan.
- **Tester:** schrijft vóór de bouw de tabeltest van het rolhek (risicowerk, R-WERK-04: een vertrouwensgrens, drempel A3).
- **Eigenaar:** besluit via ADR 0102 en de merge; keurt in de PR de prompt voor de enige proef goed (zie Testplan, OV-3).

## Kopieer de vorm van

- `scripts/kit/pr-verify.mjs` — de vertrouwde basis (origin/main), `readAuthority` voor de repository, het argumentformaat en
  de foutafhandeling in `main()`.
- `scripts/kit/pr-merge.mjs` — `ZONDER_BIN`: `gh` draait zonder de bin-map van node_modules in het PATH.
- `scripts/kit/github-evidence.mjs` — `parsePullRequest` voor de kop van de PR (ook de weigering van een fork).
- `scripts/kit/pr-resolve.mjs` — een kitscript onder de ankertoets, met de regel in `KIT_SCRIPTS` van
  `rails/hooks/lib/rolhek.mjs`.
- `test/hooks/rolhek-gesprekken-sluiten.test.ts` — de tabeltest van het rolhek voor een kitscript.

## Hergebruik en UX

Geen UI. Nieuw bestand `scripts/kit/pr-log.mjs`; scriptregel `"pr:log": "node scripts/kit/pr-log.mjs"` in `package.json`. Het
script importeert alleen `node:`-modules en bestanden uit `scripts/` en `rails/` (die de ankertoets dekt).

### Het script

1. **Argumenten** (`argumenten(args)`): precies één, een positief geheel getal (`^[1-9]\d*$`). Anders stderr
   `Gebruik: pnpm pr:log <nummer>` en exitcode 1.
2. **GitHub:** elke aanroep is `gh api <endpoint>` (`ghArgs(endpoint)` geeft precies `['api', endpoint]`: geen `-X`, `-f`,
   `-F`, `--method` of `--input`), met `env: ZONDER_BIN`. JSON-antwoorden en de log (tekst) lopen via een `Api`-object
   (`{ json, tekst }`), zodat de stroom zonder netwerk te testen is. `maakApi(exec)` bouwt dat object op een `exec`
   (standaard `gh` via `execFileSync`): elke fout en onleesbare JSON wordt `GitHub is niet leesbaar: <endpoint>`.
3. **Bron:** basis `origin/main`, repository uit `readAuthority`, de kop uit `parsePullRequest(api.json('repos/<repo>/pulls/<nr>'))`.
   Zonder leesbare basis: `Geen leesbare vertrouwde basis` en exitcode 1. Een PR uit een fork geeft de melding van
   `parsePullRequest`. Een kop die geen sha van 40 hextekens is, komt niet in een endpoint: dan
   `GitHub is niet leesbaar: <endpoint van de PR>`.
4. **Runs** (`rodeRuns(antwoord)`, puur): uit `repos/<repo>/actions/runs?head_sha=<sha>&per_page=100` de runs met `conclusion`
   `failure` of `timed_out`, plus elke run met `status` anders dan `completed` (die kan al een rode job hebben); en het aantal
   runs dat nog loopt.
5. **Rode jobs** (`rodeJobs(antwoord)`, puur): uit `repos/<repo>/actions/runs/<id>/jobs?per_page=100` de jobs met `conclusion`
   `failure` of `timed_out`.
6. **Log:** per rode job `repos/<repo>/actions/jobs/<id>/logs` als tekst (GitHub stuurt door naar blobopslag; in een cloudsessie
   op 21 november 2026 gemeten met `gh api`: werkt).
7. **Uittreksel** (`foutUittreksel(log)`, puur, per job): een BOM vooraan en de tijdstempel vooraan elke regel (`^\S+Z `) vallen
   weg. Per regel met `##[error]` een venster van de 15 regels ervóór tot en met die regel; vensters die overlappen of direct
   aansluiten, worden één blok; blokken gescheiden door een regel `…`. Hooguit 120 regels per job, de `…`-regels meegeteld;
   daarboven de eerste 120 en dan `… (<n> regels weggelaten)`. Zonder `##[error]` de laatste 30 regels.
8. **Uitvoer** (`verslag(uitslag)`, puur), letterlijk:
   - eerste regel `PR #<nummer> · <sha>`;
   - per rode job een lege regel, `## <runnaam> / <jobnaam> (<conclusion>)` en het uittreksel;
   - zonder rode job `Geen rode jobs op <sha>.`;
   - lopen er runs: als laatste regel `Nog bezig: <n> run(s)`.
   Exitcode 0, ook met rode jobs (de uitslag geeft `pnpm pr:verify`).
9. **Fouten:** een onleesbaar antwoord, of een antwoord met een verkeerde vorm, geeft
   `GitHub is niet leesbaar: <endpoint>` en exitcode 1. Het script schrijft niets
   naar GitHub of de schijf.

### Het rolhek

- `KIT_SCRIPTS` krijgt `log`. `kitScript` krijgt twee velden erbij:
  - `vertrouwd`: `'merge'` (`pr:merge`, `pr:resolve`: `ctx.mergeTrusted`) of `'kit'` (`pr:log`: `ctx.kitTrusted`);
    `decideKitScript` kiest daarop.
  - de basismelding volgt `vertrouwd`: voor `'kit'` zonder modus,
    `pnpm pr:log alleen vanuit de repo-root, met scripts, rails en hostbestanden (package.json, .npmrc, …) gelijk aan het anker (ADR 0102)`.
  De subagentmelding is `De CI-log via pnpm pr:log leest alleen de hoofdsessie (ADR 0102)`, de vormmelding
  ``Het logscript draait alleen als precies `pnpm pr:log <nummer>` (ADR 0102)``. De bestandsnaam telt alleen als hele naam:
  `pr-log(?![\w-])`, zodat `pr-login` niet raakt; voor `pr:merge` en `pr:resolve` verandert het patroon niet.
- `NETWERK_EIGEN_REGEL` krijgt `pnpm pr:log`: de netwerkvorm en `decideKitScript` weigeren niet dubbel.
- `runner-authority.mjs`: `trustedKitScript(root, basis)` geeft nee zonder basis, en anders: geen programma uit `MERGE_BIN` in
  `node_modules/.bin` en `MERGE_FILES` gelijk aan het anker. `trustedMerge` wordt `basis !== null && mergeMode(…) &&
  trustedKitScript(root, basis)`; het gedrag van `pr:merge` en `pr:resolve` verandert niet.
- `rolhekContext` vult `kitTrusted` lui, zoals `mergeTrusted`; het `Ctx`-typedef krijgt `kitTrusted`.
- Tests die de lijst kitscripts kennen: de aanvalscorpus (`test/hooks/rolhek-aanvalscorpus.ts`: `REGELS`, `FRAGMENT` met
  `'(ADR 0102)'`, een basisrij `node scripts/kit/pr-log.mjs 5`) en de AC-17-tabel in `test/hooks/rolhek-pr-merge.test.ts`
  (`SCRIPTS_17`, `KIT_REDENEN`) krijgen `log` erbij (R-TEST-02: de lijst kitscripts groeit door ADR 0102).

### Configuratie en documenten

- `.claude/settings.json`: `Bash(pnpm pr:log *)` in `permissions.ask` (direct na `pr:resolve`, zoals de andere kitscripts:
  het rolhek geeft het zonder prompt vrij als de ankertoets klopt; tot het anker de regel kent, is de prompt de grens),
  `pnpm pr:log *` in `sandbox.excludedCommands`;
  `test/rails/fixtures/claude-sandbox-werkstraat/boundaries.json` en `RUNNER` in `test/rails/claude-sandbox-werkstraat.test.ts`
  volgen.
- `.claude/gates.json`: `scripts/kit/pr-log.mjs` met besluit `besluit-pr` (zoals `pr-merge.mjs` en `pr-resolve.mjs`);
  `.github/CODEOWNERS` opnieuw gegenereerd (`node scripts/kit/codeowners.mjs --schrijf`).
- De receptenkaart krijgt de rij "Samenvatting van de rode jobs" met `pnpm pr:log <nr>`; de skill `opleveren` noemt het in
  CI-lus stap 3 vóór de `gh api`-vormen.
- ADR 0061 en 0069 krijgen een herzieningsregel; R-TOOL-02 in `docs/framework.md`, `docs/ENVIRONMENT.md` en de commentaren
  in `runner-authority.mjs` en `check-docs.mjs` noemen het script; een changelogfragment.

## Acceptatiecriteria

- **ci-log/AC-1** — Gegeven de argumenten `[]`, `['0']`, `['12', 'x']`, `['abc']` of `['-1']`, wanneer `argumenten` draait, dan
  gooit het `Gebruik: pnpm pr:log <nummer>`; `['12']` geeft `12`. Toets: `test/scripts/ci-loguittreksel.test.ts`
- **ci-log/AC-2** — Gegeven een jobs-antwoord met de uitslagen `success`, `failure`, `timed_out`, `cancelled` en `null`, wanneer
  `rodeJobs` draait, dan blijven alleen `failure` en `timed_out` over; gegeven runs met `failure`, `success`, `cancelled` en
  één met `status` `in_progress`, wanneer `rodeRuns` draait, dan de rode en de lopende run, en `bezig` 1. Toets:
  `test/scripts/ci-loguittreksel.test.ts`
- **ci-log/AC-3** — Gegeven een log met tijdstempels, een BOM en twee `##[error]`-regels die 5 regels uit elkaar staan, wanneer
  `foutUittreksel` draait, dan één blok zonder tijdstempels en BOM van 15 regels vóór de eerste fout tot en met de tweede; twee
  fouten die 40 regels uit elkaar staan, geven twee blokken met `…` ertussen. Toets: `test/scripts/ci-loguittreksel.test.ts`
 
- **ci-log/AC-4** — Gegeven een log met 30 fouten ver uit elkaar, wanneer `foutUittreksel` draait, dan precies 120 regels en
  daarna `… (<n> regels weggelaten)`, met `<n>` het aantal weggelaten regels van het uittreksel, `…`-regels meegeteld; zonder `##[error]` de laatste 30 regels. Toets:
  `test/scripts/ci-loguittreksel.test.ts`
- **ci-log/AC-5** — Gegeven twee rode jobs en een lopende run, en gegeven geen rode jobs, wanneer `verslag` draait, dan de
  letterlijke uitvoer uit "Het script" punt 8. Toets: `test/scripts/ci-loguittreksel.test.ts`
- **ci-log/AC-6** — Gegeven een nep-`Api` met een PR, een rode en een lopende run met elk een rode job, wanneer `leesPr` draait,
  dan het verslag met beide jobs en `Nog bezig: 1 run(s)`, en elk gevraagd endpoint begint met `repos/<repo>/`; `ghArgs(x)` is
  precies `['api', x]`; `maakApi` met een `exec` die gooit of geen JSON geeft, runs met een verkeerde vorm en een kop die
  geen sha is, geven `GitHub is niet leesbaar: <endpoint>` (de kop: zonder verder endpoint). Toets:
  `test/scripts/ci-loguittreksel.test.ts`
- **ci-log/AC-7** — Rolhek: `pnpm pr:log 12` als hoofdsessie vanuit de repo-root met `kitTrusted` waar geeft allow, ook met
  `mergeTrusted` onwaar; met `kitTrusted` onwaar of buiten de repo-root deny met de basismelding; elke subagent deny met de
  subagentmelding; `pnpm pr:log`, `pnpm pr:log 12 --x`, `pnpm pr:log 12 && ls`, `pnpm pr:log 12; ls`,
  `node scripts/kit/pr-log.mjs 12` en `pnpm run pr:log 12` deny met de vormmelding (hoofdsessie); `cat scripts/kit/pr-log.mjs`
  en `git add test/scripts/pr-login.ts` niet; `pnpm pr:merge 12` met `mergeTrusted` onwaar en `kitTrusted` waar blijft deny;
  met `netwerkvormen` `['pnpm pr:log *']` geeft `pnpm pr:log 12 --x` precies één deny, de vormmelding (`NETWERK_EIGEN_REGEL`).
  Toets: `test/hooks/rolhek-logscript.test.ts`
- **ci-log/AC-8** — `trustedKitScript` is nee zonder basis; `trustedMerge` is nee bij een andere modus, ook als
  `trustedKitScript` ja is. Toets: `test/hooks/rolhek-logscript.test.ts`
- **ci-log/AC-9** — `.claude/settings.json` heeft `Bash(pnpm pr:log *)` in `ask` en niet in `allow`, en `pnpm pr:log *` in
  `excludedCommands`;
  `package.json` heeft het script; `.claude/gates.json` geeft `scripts/kit/pr-log.mjs` besluit `besluit-pr`. Toets:
  `test/hooks/rolhek-logscript.test.ts`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| PR zonder runs op de kop | `Geen rode jobs op <sha>.` | — |
| Log niet (meer) beschikbaar (GitHub bewaart logs beperkt) | `GitHub is niet leesbaar: <endpoint>`, exitcode 1 | — |
| PR uit een fork | Melding van `parsePullRequest`, exitcode 1 | — |
| Meer dan 100 runs of jobs | Alleen de eerste 100 per lijst (één pagina); bewust geen paginering | — |

## Raakt ook

- Het rolhek (`rails/hooks/lib/rolhek.mjs`, `runner-authority.mjs`, `rolhek-context.mjs`), de aanvalscorpus, de AC-17-tabel
  en de nieuwe tabeltest (R-DOC-09).
- `test/rails/claude-sandbox-werkstraat.test.ts` en zijn fixture, `test/hooks/rolhek-aanvalscorpus.ts` en
  `test/hooks/rolhek-pr-merge.test.ts`: één kitscript erbij (R-TEST-02, reden: ADR 0102).
- Beschermde paden: `.claude/settings.json`, `.claude/gates.json`, `.github/CODEOWNERS`, `rails/**`, `scripts/**`,
  `.claude/skills/opleveren/SKILL.md`, `docs/framework.md`, ADR's 0061, 0069 en 0102. Kritiek werk (R-WERK-05) en risicowerk
  (R-WERK-04): tester vóór de bouw, spec, ADR, code en tests in één PR; de eigenaar keurt goed en merget.

## Buiten scope

- `pnpm pr:bijwerken` (#789): dat script pusht; eigen spec en besluit.
- De reviewer laten lezen in de cloud (#898).
- De bestandsnaamgrens voor `pr-merge` en `pr-resolve` (bekend vals positief, #736).

## Testplan

De namespace heet `ci-log` en niet `pr-log`: het rolhek herkent `pr-log` als bestandsnaam van het script (vals positief op
een testfilter of branchnaam, zoals #736). Unit-tests zonder netwerk in `test/scripts/ci-loguittreksel.test.ts`; de tabeltest van het rolhek in
`test/hooks/rolhek-logscript.test.ts`, door de tester vóór de bouw; `pnpm gate:fast` groen. In de PR kent het
rolhek uit het anker het script nog niet, en de werkmap-`settings.json` zet het al buiten de sandbox (ADR 0102 "Venster"); de
regel in `ask` geeft dan een prompt. De agent draait na goedkeuring van de eigenaar één keer `pnpm pr:log <nr>` op een PR met
een rode job en zet de uitvoer in de PR (OV-3).

## Open vragen

- **OV-1 ✅ besloten** — Ankertoets zoals `pr:merge` en `pr:resolve` (eigenaar, 2026-11-21).
- **OV-2 ✅ besloten** — De ankertoets eist de modus `niet-kritiek` niet: lezen hangt niet af van wie samenvoegt
  (eigenaar, 2026-11-21; ADR 0102 Alternatieven).
- **OV-3 ✅ besloten** — De agent draait in de PR één proef, na een prompt die de eigenaar goedkeurt; aanvaard risico: die ene
  keer draait de branchcode buiten de sandbox zonder ankertoets (eigenaar, 2026-11-21; ADR 0102 "Venster").
