---
status: gebouwd
namespace: gebouwd-zonder-nummer
---

# `gebouwd` zonder PR-nummer in de bouw-PR; `docs:status` vervalt

## Doel

Een spec gaat naar `gebouwd` met de regel `status: gebouwd` in een gewone commit van de bouw-PR, zonder PR-nummer, zonder
status-PR en zonder `pnpm docs:status`, zodat de checks op een gebouwde spec al in de bouw-PR draaien (ADR 0095).

## Rollen en wie wat ziet

- **Hoofdsessie en architect:** zetten `status: gebouwd` in de bouw-PR, ook vóór het openen van de PR (R-WERK-08). Vergeet de
  bouw-PR het, dan zet een latere PR de regel met de hand.
- **Developer:** schrijft geen `status: gebouwd`; het rolhek weigert het (besluit van de eigenaar, 2026-11-18).
- **Reviewer:** toetst of de PR die `gebouwd` zet de spec ook echt af maakt, en legt elke nieuwe AC in de vorm
  `Vervallen door ADR <nummer>` naast dat ADR: vervalt de AC echt door dat besluit? Geen check doet dat.
- **Eigenaar:** de merge van de bouw-PR is het besluit, zoals nu.
- **CI:** `check:roadmap` en `check:docs` (in `gate:fast`) toetsen de gebouwde spec in de PR die haar `gebouwd` maakt.

## Kopieer de vorm van

- `scripts/kit/check-docs.mjs` — de AC-dekking slaat nu al AC's met `(nog niet gebouwd)` over; een vervallen AC volgt dat
  patroon; `ADR_STATUS` en de ADR-lijst per map leveren het bestaan en de status van het genoemde ADR.
- `test/rails/check-docs-dood-pad.test.ts` — fixtures per merkteken voor de dood-padcheck.
- `test/rails/check-roadmap-bewijsvorm.test.ts` — fixtures per vorm van de statusregel.
- `test/rails/specarchief-document-state.test.ts` — `beslisOvergang` per overgang van een gebouwde spec.
- `docs/template/specs/templateregime.md` — de vorm van een vervallen AC (`Vervallen door ADR … Was: …`).

## Hergebruik en UX

Geen UI. Hergebruik: `documentInfo`, `builtReference`, `acIds` en `beslisOvergang` uit `rails/hooks/lib/document-state.mjs`,
`SPEC_STATUS` en `ADR_STATUS` uit `scripts/kit/check-docs.mjs`, `canRecordStatus` uit `rails/hooks/lib/task-authority.mjs`.
`canRecordStatus` blijft en betekent na de bouw hetzelfde als nu: een statusregel terugzetten naar wat `main` heeft, met
dezelfde inhoud, voor elke status behalve `voorstel` en `gebouwd`.

Teksten, letterlijk:

- De weigering in `rails/hooks/lib/rolhek.mjs` bij een statuswijziging zonder besluit uit de vertrouwde basis (nu
  `…; gebouwd via pnpm docs:status`) wordt:
  `<pad>: deze statusovergang heeft geen geldig besluit uit de vertrouwde basis; status: gebouwd zetten hoofdsessie en architect in de bouw-PR (ADR 0095)`.
- De weigering bij een eigenaarstatus (nu `…(ADR 0046 punt 6); gebouwd via pnpm docs:status`) wordt:
  `<pad>: een eigenaarstatus of de inhoud van een goedgekeurde spec schrijven alleen architect en hoofdsessie (ADR 0046 punt 6); status: gebouwd zetten hoofdsessie en architect in de bouw-PR (ADR 0095)`.
- De weigering `de developer schrijft geen spec; dat doet de architect (R-WERK-07, ADR 0068 punt 4)` blijft ongewijzigd.
- De melding `spec:bewijs` van `check-roadmap` (`naar gebouwd zonder bouwbewijs; …`) vervalt. De melding
  `naar gebouwd en noemt <id>, maar docs/roadmap.md wijzigt niet in deze PR` blijft ongewijzigd.
- De melding van de dood-padcheck en de AC-melding van `check-docs` blijven ongewijzigd.
- De kop van `docs/specs/_template.md` en `docs/specs/_mini.md` noemt na `gebouwd:` alleen nog:
  `status: gebouwd in de bouw-PR (ADR 0095)`.

## Acceptatiecriteria

- **gebouwd-zonder-nummer/AC-1** — Gegeven een spec die in de diff van `goedgekeurd` naar `status: gebouwd` gaat en geen
  roadmap-id noemt, wanneer `check:roadmap` draait, dan is de uitslag groen, zonder nummer, met `# #12` en met elk ander
  commentaar achter de status. Geen invoer levert nog een melding met de sleutel `spec:bewijs`.
- **gebouwd-zonder-nummer/AC-2** — Gegeven dezelfde overgang naar `status: gebouwd` in een spec die een roadmap-id noemt,
  wanneer `check:roadmap` draait en `docs/roadmap.md` niet wijzigt, dan is de uitslag rood met de bestaande melding; wijzigt
  `docs/roadmap.md` wel, dan groen.
- **gebouwd-zonder-nummer/AC-3** — Gegeven een spec met `status: gebouwd` (zonder nummer), wanneer `documentInfo` haar leest,
  dan is de status `gebouwd`; `feiten.mjs specs` telt haar onder "gebouwd" en toont haar niet in de standaardlijst.
- **gebouwd-zonder-nummer/AC-4** — Gegeven een spec met `status: gebouwd` (zonder nummer) en een AC zonder testbestand, wanneer
  `check:docs` draait, dan is de uitslag rood met de bestaande AC-melding; met een test die het AC-id noemt, groen.
- **gebouwd-zonder-nummer/AC-5** — Gegeven een gebouwde spec met een AC zonder testbestand waarvan de tekst direct na het
  streepje begint met `Vervallen door ADR <nummer>`, wanneer `check:docs` draait, dan meldt de AC-dekking die AC niet als een
  ADR met dat nummer bestaat in de ADR-map naast de specmap (`docs/template/adr/` voor `docs/template/specs/`, `docs/adr/` voor
  `docs/specs/`) en de status `geaccepteerd` heeft. Wel gemeld: een onbekend nummer; een ADR met status `voorgesteld`,
  `vervallen` of `vervangen door NNNN`; "Vervallen door ADR" elders in de tekst dan direct na het streepje.
- **gebouwd-zonder-nummer/AC-6** — Gegeven een gebouwde spec met een niet-bestaand repopad tussen backticks, direct gevolgd
  door witruimte met hooguit één regeleinde en dan `(vervallen)`, `(nieuw)` of `(voorbeeld)`, wanneer `check:docs` draait, dan
  geeft de dood-padcheck geen melding. Met een ander woord ertussen, of een lege regel ertussen, wel.
- **gebouwd-zonder-nummer/AC-7** — Gegeven een spec die op `main` `goedgekeurd` is, wanneer een rol via Edit de statusregel
  `status: gebouwd` schrijft, dan: hoofdsessie en architect: toegestaan; developer met leesbare vertrouwde basis: geweigerd met
  de eerste tekst uit Hergebruik en UX; developer zonder leesbare vertrouwde basis: geweigerd met
  `de developer schrijft geen spec; …`.
- **gebouwd-zonder-nummer/AC-8** — Gegeven een spec die op `main` `gebouwd # #<n>` is met een AC `(nog niet gebouwd)`,
  wanneer de hoofdsessie het merkteken weghaalt, een test toevoegt en de statusregel ongewijzigd laat, dan laat het rolhek het
  toe en zijn `check:docs` en `check:roadmap` groen.
- **gebouwd-zonder-nummer/AC-9** — Gegeven een spec die `gebouwd` blijft, wanneer `beslisOvergang` de overgang beoordeelt,
  dan: alleen het commentaar achter de status anders (`# #130` naar niets, `# #130` naar `# #131`, de SHA weg) bij gelijke
  inhoud: `vrij`; nieuwe inhoud zonder weggehaald merkteken: `besluit`, ook als de statusregel geen nummer heeft; een
  merkteken `(nog niet gebouwd)` weggehaald: `gebouwd`; een nieuwe `; gevalideerd: <sha>`: `gebouwd`, en het rolhek weigert
  dat ook de hoofdsessie (zoals nu).
- **gebouwd-zonder-nummer/AC-10** — Gegeven de repo na de bouw, wanneer een test `package.json`, `.claude/gates.json` en de
  exports van `rails/hooks/lib/document-state.mjs` leest, dan bestaat het script `docs:status` niet, is er geen rij voor
  `scripts/kit/document-status.mjs` (vervallen), bestaan dat bestand en `scripts/kit/roadmap-item.mjs` (vervallen) niet, en
  exporteert `document-state.mjs` geen `changeStatus` meer.
- **gebouwd-zonder-nummer/AC-11** — Gegeven de repo na de bouw, wanneer een test zoekt naar `docs:status` in
  `docs/framework.md`, `AGENTS.md`, `docs/dod.md`, `docs/operations/agent-doorloop.md`, `.claude/agents/`, `.claude/skills/`,
  `docs/specs/_template.md`, `docs/specs/_mini.md` en `scripts/kit/templates/spec.md.tmpl`, dan vindt hij niets.
- **gebouwd-zonder-nummer/AC-12** — Gegeven de repo na de bouw, wanneer `check:docs` draait, dan is het groen, terwijl
  `docs/template/specs/gebouwd-na-merge.md` (vervallen) niet bestaat en `specarchief-en-bouwvorm/AC-9`,
  `specarchief-en-bouwvorm/AC-10` en `template-repo/AC-5` de vorm uit AC-5 hebben, zonder test.
- **gebouwd-zonder-nummer/AC-13** — Gegeven een spec die
  in de PR naar `status: gebouwd # #<n>` gaat met het roadmapvinkje in dezelfde PR, wanneer `check:roadmap` draait, dan geeft
  het geen `spec:bewijs`-melding; via Edit mogen hoofdsessie en architect die regel schrijven (vanaf `goedgekeurd` en vanaf
  `voorstel`), de developer niet. Bewijs nu: `test/rails/spec-en-bouw.test.ts:27`, `test/hooks/rolhek-beslisroute.test.ts:148`
  en `:163`.
- **gebouwd-zonder-nummer/AC-14** — De sectie
  `## Modus spec-review` in `.claude/agents/reviewer.md` geldt bij elke spec in de PR (niet alleen bij migratie, route of
  permissie) en vraagt een oordeel over "kritiek"; de eerste niet-lege regel van `.github/pull_request_template.md` is
  `## Spec`. Bewijs nu: `test/rails/spec-en-bouw.test.ts:49`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Vervolgbouw: gebouwde spec met een nieuwe AC `(nog niet gebouwd)` | de bouw-PR haalt het merkteken weg en voegt de test toe; de statusregel blijft zoals hij is (AC-8) | n.v.t. |
| Spec heeft al `gebouwd # #<n>` | blijft staan, het nummer is commentaar; niemand zet het om (AC-1, AC-3, AC-9) | n.v.t. |
| De oude vorm `gebouwd # #<n>; gevalideerd: <sha>` | `check-docs` weigert hem zoals nu; het rolhek weigert een nieuwe SHA (AC-9) | n.v.t. |
| Bouw-PR vergeet de status | een latere PR zet `status: gebouwd` met de hand; AC-dekking, dood-padcheck en roadmap-id-regel toetsen die PR (AC-1, AC-4) | n.v.t. |
| Status naar `gebouwd` in een PR zonder code | toegestaan; de AC-dekking moet groen zijn en de reviewer toetst of de bouw op `main` staat (aanvaard risico, ADR 0095) | n.v.t. |
| Merkteken `(nog niet gebouwd)` weg in een PR zonder code | geen check ziet het als er al een test met dat AC-id is; de reviewer toetst het (aanvaard risico, ADR 0095) | n.v.t. |
| Spec noemt een roadmap-id die zij niet bouwt | `check:roadmap` rood bij `gebouwd` (AC-2); haal het id uit de tekst | n.v.t. |
| Vervallen-AC noemt een ADR dat nog `voorgesteld` is | AC-dekking meldt de AC (AC-5); eerst het ADR accepteren | n.v.t. |
| ADR 0095 wordt later vervangen | de AC-dekking meldt de vervallen-AC's die naar 0095 wijzen opnieuw (AC-5); de PR die het ADR vervangt, laat ze naar het nieuwe ADR wijzen | n.v.t. |
| Merkteken `(nog niet gebouwd)` toegevoegd aan een bestaande AC | telt niet als inhoudswijziging; daarna slaat de AC-dekking die AC over en kan haar test zonder melding verdwijnen. Aanvaard risico; bestond al, AC-9 maakt het niet groter | n.v.t. |
| PR die `gebouwd` zet, wordt gesloten | de claim komt niet op `main` (ADR 0054, Gevolgen) | n.v.t. |

## Raakt ook

**Checks**

- `scripts/kit/check-roadmap.mjs`: `heeftBouwbewijs` en de melding `spec:bewijs` vervallen; de roadmap-id-regel blijft (AC-1,
  AC-2). Het commentaar bovenaan (r.2-3) en bij de bewijsvorm (r.149-151) noemt `status: gebouwd` en ADR 0095. De omschrijving
  van `check:roadmap` in `scripts/kit/gates.mjs` noemt `status: gebouwd # #<PR>` niet meer.
- `scripts/kit/check-docs.mjs`: het merkteken van de dood-padcheck mag na witruimte met hooguit één regeleinde staan (AC-6); de
  AC-dekking slaat een vervallen AC over volgens AC-5; het commentaar bovenaan (regel 6 en 14) volgt.

**Rolhek en document-state**

- `rails/hooks/lib/rolhek.mjs`: de twee meldingen (Hergebruik en UX); het commentaar bij `inPrGebouwd` noemt ADR 0095.
- `rails/hooks/lib/document-state.mjs`:
  - `changeStatus` en zijn commentaar (r.95) vervallen.
  - `gebouwdBlijft` volgt AC-9: het commentaar achter de status telt niet meer, behalve een nieuwe SHA.
  - Het commentaar bij `beslisOvergang` (r.161, "`gebouwd`: alleen met bouwbewijs") wordt "`gebouwd`: architect en
    hoofdsessie, in de bouw-PR (ADR 0095)".
  - Het commentaar bij `gebouwdBlijft` (r.187-188, r.194) en bij `builtReference` (r.210-211) noemt geen `docs:status` en geen
    `# #<deze PR>` meer.

**Schrappen**

- `scripts/kit/document-status.mjs` (vervallen) en het script `docs:status` in `package.json`.
- `scripts/kit/roadmap-item.mjs` (vervallen); alleen `status-git.mjs` importeerde het.
- In `rails/hooks/lib/built-evidence.mjs`: `builtRefusal`, `openRefusal`, `canRecordBuilt`, `approvedBefore`,
  `mergedRefusal`, `gebouwdOpMain` en `vertrouwdeTemplate`. Wat `scripts/kit/pr-verify.mjs` gebruikt (`checkedCommit`,
  `expectedCheckAppId`, `requiredProofChecks`, `GITHUB_ACTIONS_APP_ID`), blijft. De JSDoc-typen `PullRequest` en `CheckRun`
  blijven ook: `scripts/kit/github-evidence.mjs` en `scripts/kit/pr-verify.mjs` gebruiken ze. `MergedEvidence` en
  `BuiltEvidence` vervallen.
- In `scripts/kit/status-git.mjs`: alles behalve `unchangedHead` (dat gebruikt `pr-verify.mjs`).
- `scripts/kit/github-evidence.mjs` blijft: `pr-verify.mjs` en `pr-merge.mjs` gebruiken het.

**Tests**

Eigenaarakkoord voor verwijderen en wijzigen geldt voor precies deze lijst (keuze van de eigenaar, 2026-11-18; R-TEST-02).
De PR noemt per bestand en per geval de reden. Zoekopdracht waarmee de lijst is gemaakt:
`git grep -n -l -F -e 'docs:status' -e 'document-status' -e 'built-evidence' -e 'status-git' -e 'roadmap-item' -- test`.
Elk ander bestand uit die zoekopdracht noemt het woord alleen als historie of toetst wat blijft, en wijzigt niet.

- Heel bestand weg, want het toetst alleen vervallen code:
  - `test/rails/gebouwd-na-merge.test.ts` (vervallen): de route na de merge.
  - `test/rails/gebouwd-na-merge-git.test.ts` (vervallen): de route na de merge.
  - `test/rails/bouwvorm-na-merge.test.ts` (vervallen): `docs:status` na de merge.
  - `test/hooks/bouwvorm-docs-status.test.ts` (vervallen): `docs:status` voor een open PR.
  - `test/hooks/bouwvorm-vervolgbouw.test.ts` (vervallen): `docs:status` bij vervolgbouw.
  - `test/hooks/mandate-follow-up-status.test.ts` (vervallen): `statusOnlyDiff` en `docs:status --roadmap`.
  - `test/rails/functional-ui-akkoord.test.ts` (vervallen): het UI-akkoord van `docs:status` en `openRefusal`.
  - `test/scripts/status-git-name-status.test.ts` (vervallen): `parseNameStatus`, alleen gebruikt door `statusOnlyDiff`.
- Geval weg; de rest van het bestand blijft:
  - `test/hooks/built-evidence.test.ts`: de gevallen van `canRecordBuilt`. Die van `checkedCommit` en de parsers van
    `github-evidence.mjs` blijven.
  - `test/hooks/authority-git.test.ts`: de test "de statushelper weigert goedgekeurd …", de helper `approve` en de constante
    `SCRIPT`.
  - `test/hooks/authority.test.ts`: de describe "changeStatus: formatter, geen eigenaartoestemming".
  - `test/hooks/taakmandaat-weg.test.ts`: de describe "compacte-kennisbasis-rails/AC-15: docs:status schrijft alleen nog
    gebouwd".
  - `test/hooks/template-repo-rolhek.test.ts`: de describe van `template-repo/AC-5` (`approvedBefore` via `openRefusal`).
  - `test/rails/bouwvorm-review.test.ts`: de describe van `specarchief-en-bouwvorm/AC-10` (`docs:status` na de merge).
  - `test/rails/specarchief-document-state.test.ts`: de gevallen van `changeStatus` onder `specarchief-en-bouwvorm/AC-13`.
    De toets "geen spec … heeft gevalideerd:" blijft.
  - `test/hooks/follow-up-kit.ts`: `draaiDocsStatus`, `ghStub`, `statusOnly`, `STATUS_GIT` en elke hulpfunctie die daarna
    geen test meer gebruikt.
- Verwachting wijzigt:
  - `test/rails/check-roadmap.test.ts`: het geval met de melding `spec:bewijs` (r.226) krijgt geen melding.
  - `test/rails/check-roadmap-bewijsvorm.test.ts`: in de tabel is elke gebouwd-regel bewijs; geen geval verwacht nog
    `spec:bewijs`. De fixture `spec-gebouwd-zonder-bewijs` is groen.
  - `test/rails/specarchief-document-state.test.ts`, `specarchief-en-bouwvorm/AC-12`:
    - "een ander PR-nummer bij gelijke inhoud" wordt `vrij`;
    - "SHA weg en inhoud gewijzigd" wordt `besluit` (AC-9).
  - `test/hooks/rolhek-beslisroute.test.ts`: titels r.135 en r.163 en het kopcommentaar noemen ADR 0095 in plaats van
    "alleen via pnpm docs:status". De uitkomst (deny) blijft.
  - `test/rails/bouwvorm-review.test.ts`: de titel van `specarchief-en-bouwvorm/AC-7` noemt geen `# #<deze PR>`. De
    uitkomst (`gebouwd`) blijft.
  - `test/scripts/schrap-documentbewaking-templateregime.test.ts`:
    - r.49-50: alleen `check-core` als bestaand voorbeeld;
    - r.54: titel zonder `docs:status`;
    - r.140-146: `docs:status` en `scripts/kit/document-status.mjs` (vervallen) bestaan niet;
    - r.376-377: `test/rails/gebouwd-na-merge.test.ts` (vervallen) gaat uit de lijst "blijft".
- Nieuw: `test/rails/gebouwd-zonder-nummer.test.ts` (nieuw); zie Testplan.

**Specs (inhoud, in dezelfde PR)**

- `docs/template/specs/gebouwd-na-merge.md` (vervallen): verwijderd (R-CI-06).
- `docs/template/specs/specarchief-en-bouwvorm.md`:
  - `specarchief-en-bouwvorm/AC-7` wordt gewijzigd: "Rood" verliest "`gebouwd # #<deze PR>` met een markering", en "Groen"
    wordt "een bouw-PR haalt de markering weg, voegt de test toe en laat de statusregel staan (ADR 0095)".
  - `specarchief-en-bouwvorm/AC-9` en `specarchief-en-bouwvorm/AC-10` vervallen door ADR 0095 (AC-5-vorm, met "Was:").
  - `specarchief-en-bouwvorm/AC-11` wordt gewijzigd: "check-docs weigert `gebouwd # #N; gevalideerd: <sha>` in een
    statusregel met de melding uit Hergebruik en UX; `gebouwd # #N` zonder SHA geeft geen melding". Het deel over de guard
    vervalt.
  - `specarchief-en-bouwvorm/AC-12` wordt gewijzigd naar de regels van AC-9 hierboven ("Rood: `gebouwd # #M` zonder bewijs voor
    M" vervalt).
  - `specarchief-en-bouwvorm/AC-13` wordt gewijzigd: "geen spec in `docs/specs/` of `docs/template/specs/` heeft `gevalideerd:`
    in de statusregel"; het deel over `changeStatus` vervalt.
  - De randgevallen en Werking volgen.
- `docs/template/specs/template-repo.md`: `template-repo/AC-5` vervalt door ADR 0095 (AC-5-vorm). Doel en de regel over
  `approvedBefore` in de opsomming en de randgevallen noemen `docs:status` en `approvedBefore` niet meer.
- `docs/template/specs/samenhang-checks-rollen.md`: in `samenhang-checks-rollen/AC-4` vervalt "een statusregel met geldig bewijs
  uit de vertrouwde basis (`pnpm docs:status`, zoals nu)". De developer houdt "Status uit main" en een nieuw testbestand.
- `docs/template/specs/templateregime.md` (goedgekeurd):
  - `templateregime/AC-7` krijgt achter "de scripts uit "Raakt ook" zijn weg" de toevoeging "en wat ADR 0095 schrapt".
  - Raakt ook r.139-140: "`pnpm docs:status`" en "Blijven: `scripts/kit/document-status.mjs` (vervallen)" worden "vervallen
    door ADR 0095".
- `docs/template/specs/compacte-kennisbasis-rails.md` (goedgekeurd):
  - `compacte-kennisbasis-rails/AC-14` (r.88) noemt `docs:status` niet meer in de opsomming.
  - `compacte-kennisbasis-rails/AC-15` (r.101): "`gebouwd` via `docs:status`" wordt "`gebouwd` alleen door hoofdsessie en
    architect (ADR 0095)".
  - De tabel van `compacte-kennisbasis-rails/AC-15` (r.90-98) blijft.

**Padtabel**

- De rijen voor `scripts/kit/document-status.mjs` (vervallen) en `scripts/kit/roadmap-item.mjs` (vervallen) in
  `.claude/gates.json` vervallen.
- `.github/CODEOWNERS` wordt opnieuw gegenereerd.

**Regelboek en instructies**

- `docs/framework.md`:
  - R-WERK-08: één vorm `status: gebouwd`, gezet door hoofdsessie of architect in de bouw-PR of een latere PR; geen
    `docs:status`.
  - R-WERK-16: zonder `pnpm docs:status --roadmap`.
  - R-WERK-07: controleren; de bouw-PR haalt alleen de markering weg.
- `AGENTS.md`: de regel over status en `gebouwd`.
- `docs/dod.md`: het vinkje- en het specpunt.
- `docs/operations/agent-doorloop.md`: de alinea's over `docs:status`, de UI-mini-spec en "PR en statussen afronden".
- `.claude/agents/architect.md` punt 5 en `.claude/agents/docs.md` punt 2.
- `.claude/skills/opleveren/SKILL.md` stap 7: `status: gebouwd` in een gewone commit, het vinkje met testpad of checknaam;
  geen route na de merge.
- De kop van `docs/specs/_template.md` en `docs/specs/_mini.md`. `scripts/kit/templates/spec.md.tmpl` noemt nu al geen
  `docs:status` en geen `# #<PR>`; daar wijzigt niets.
- `docs/template-changelog.md`: een regel voor deze wijziging, met wat een app moet doen (niets; bestaande regels blijven).

**ADR's**

De hoofdsessie herschrijft deze punten op hun plek, met een `Herzien:`-regel:

- 0054 punt 1 en 5;
- 0080 punt 4, 5, 6 en 8;
- 0062 punt 4;
- 0046 punt 6 en 10;
- 0063 punt 5 (de zin over de developer);
- 0068 punt 4 en het eerste Gevolgen-punt.

**Niet geraakt en beschermd**

- Geen migratie, route, permissie of resource, dus niet `check:migrations`, `check:secdef`, `test:db` of
  `test/security/resources.ts`.
- Beschermde paden: `rails/hooks/`, `.claude/` en `scripts/kit/` vragen het akkoord van de eigenaar. `.claude/skills/` kan de
  sandbox niet schrijven (Edit in de hoofdsessie met akkoord).

## Buiten scope

- De PR-nummers in `Herzien:`-regels van ADR's: een apart voorstel daarna.
- Roadmapvinkjes: de regels van `check-roadmap` voor vinkjes veranderen niet. Een vinkje mag al naar een testpad of checknaam
  verwijzen.
- `gebouwd` afleiden uit git, en de checks op een gebouwde spec al vanaf `goedgekeurd` (ADR 0095, Alternatieven).

## Testplan

- Unit, nieuw: `test/rails/gebouwd-zonder-nummer.test.ts` (nieuw), met fixtures per AC:
  - `check-roadmap` (AC-1, AC-2);
  - `documentInfo` en feiten (AC-3);
  - `check-docs` (AC-4, AC-5 met elk negatief geval, AC-6, AC-12);
  - `beslisOvergang` (AC-9);
  - de bestandstoetsen (AC-10, AC-11).
- Rolhek: een rolhektest per rol en per stand van de vertrouwde basis voor AC-7, en de vervolgbouw van AC-8, naast de
  bestaande in `test/hooks/rolhek-beslisroute.test.ts`.
- Gates: `pnpm check:docs`, `pnpm check:roadmap`, `pnpm ratchet` en `pnpm gate:fast` zijn groen. Deze spec staat in de bouw-PR
  op `status: gebouwd`, dus haar eigen AC-dekking en dood-padcheck draaien in die PR.

## Open vragen

- **OV-1 ✅ besloten** — Vorm: `status: gebouwd` zonder nummer; bestaande regels `gebouwd # #<n>` blijven staan, het nummer
  is commentaar (eigenaar, 2026-11-18).
- **OV-2 ✅ besloten** — `pnpm docs:status` vervalt helemaal, met de route na de merge, de status-PR en spec
  `gebouwd-na-merge` (eigenaar, 2026-11-18).
- **OV-3 ✅ besloten** — Eén PR met ADR, checks en schrappen (eigenaar, 2026-11-18).
- **OV-4 ✅ besloten** — Een AC die vervalt, krijgt de vorm `Vervallen door ADR <nummer> … Was: …`. De AC-dekking slaat haar
  alleen over als dat ADR bestaat en `geaccepteerd` is (AC-5), en de reviewer legt elke nieuwe vervallen-AC naast dat ADR
  (eigenaar, 2026-11-18).
- **OV-5 ✅ besloten** — Alleen hoofdsessie en architect schrijven `status: gebouwd`; de developer niet (eigenaar,
  2026-11-18).
- **OV-6 ✅ besloten** — De eigenaar gaf op 2026-11-18 via de vraagprompt akkoord voor de testlijst in "Raakt ook"
  (R-TEST-02). Dat akkoord omvat ook het vervallen van de scripttoets "spec was goedgekeurd vóór de bouw"; dat blijft een
  afspraak die de reviewer toetst.
