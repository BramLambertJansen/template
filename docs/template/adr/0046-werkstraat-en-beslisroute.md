# 0046 — Werkstraat en beslisroute

Status: geaccepteerd

Herzien: 2026-10-30 (#385): taakmandaat en gate-label vervallen ([0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md));
geschrapt in punt 5, 7, 8, 9, 11 en 15.
Herzien: 2026-11-03 (#469): gewijzigd door [0054](0054-gebouwd-in-de-bouw-pr.md) punt 5, 6 en 10;
[0056](0056-functionele-ui-in-een-pr.md) punt 8–9 en 12–15; [0057](0057-risicogestuurde-werkstraat.md) de vaste
rolvolgorde; [0062](0062-spec-en-bouw-in-een-pr.md) punt 5, 10, 12, 14 en 15; [0069](0069-agent-merge-niet-kritiek.md)
punt 30, 31, 33, 34 en 35; [0074](0074-herziene-adr-punten-gemarkeerd.md) punt 2
Herzien: 2026-11-04 (#535): gewijzigd door [0079](0079-een-padtabel.md) punt 27 en 28, de lijst `voorReview` wordt de
kolom `schrijven` van de padtabel in `.claude/gates.json` (wat erin hoort, blijft gelijk), en CODEOWNERS volgt de afgeleide
gates plus `jsonGates`
Herzien: 2026-11-05 (#541): gewijzigd door [0080](0080-specarchief-en-bouwvorm.md) punt 5 en 10, een gebouwde spec krijgt in een besluit-PR nieuwe
AC's met `(nog niet gebouwd)`, en `gebouwd` noemt alleen de PR (`# #<PR>`), zonder gevalideerde SHA
Herzien: 2026-11-12 (#692): door ADR 0089 punt 1–3, in de template deels: punt 2, vervalt: A4 en de herzieningsroute; blijft: nooit terug naar `voorgesteld`, de strikte statusregel; punt 5, vervalt: de besluit-PR zonder code; blijft: de toegestane overgangen; punt 6, vervalt: de lokale A4-weigering, alleen voor architect en hoofdsessie in de onderhoudsmodus en alleen voor de gevallen uit spec templateregime AC-10; blijft: alleen architect en hoofdsessie schrijven een eigenaarstatus; punt 10, vervalt: daarna mogen alleen statusregels veranderen; blijft: het bouwbewijs; punt 12 en 15 (er komt een derde lane `template` bij)
Herzien: 2026-11-12 (#696): door ADR 0089 punt 2, 5, 8 en 9, de vorige regel vervalt: geen licht regime en geen lane `template`; zodra de GitHub App bewezen is, verdwijnt `check-document-status` en worden punt 2, 5, 10, 12 en 15 afspraken die de eigenaar met zijn goedkeuring op de PR beslist; punt 6, het rolhek houdt het schrijfrecht per rol en verliest zijn A4-logica in een latere stap (ADR 0089 punt 9); punt 31, wie merget volgt `CODEOWNERS` en de ruleset
Herzien: 2026-11-12 (#703): punt 1, architect in de template op verzoek; punt 18, model per spec vervalt; geen besluit-PR in de template (ADR 0090 punt 1, 4 en 5)
Herzien: 2026-11-14 (#713): ingekort tot wat nog geldt; een ingehaald punt is één regel met de plek waar het nu staat, de puntnummers zijn ongewijzigd, de oude tekst staat in git
Herzien: 2026-11-17 (#778): Gevolgen, het rolhek valt dicht bij een storing (R-ROL-09) en blijft een vangnet, geen grens (R-ROL-10); er stond "fail-open"
Herzien: 2026-11-18 (#805): gewijzigd door [0095](0095-gebouwd-zonder-pr-nummer.md) punt 1, 3 en 7, punt 6: de developer
schrijft geen `gebouwd` meer; punt 10: `status: gebouwd` zonder PR-nummer in de bouw-PR, `pnpm docs:status` vervalt
Herzien: 2026-11-19: punt 6, gewijzigd door [0099](0099-rolhek-leeslijst-ruimer.md): alleen architect en hoofdsessie wijzigen ook de inhoud van een vervallen spec (de status blijft `vervallen`); een vervallen ADR blijft onwijzigbaar (punt 2)
Herzien: 2026-11-19: punt 2: een vervallen of vervangen ADR wijzigt in een app niet; in de template verdwijnt het en `check-docs` weigert het (R-CI-05, R-CI-06, spec vervallen-documenten-weg)

Vervangt 0025, 0027, 0030 en 0038; neemt de delen van 0029 over die via 0038 punt 8 nog golden. Drempel: A4.

## Context

De werkstraat (framework §8) liep van architect tot reviewer; daarna lagen push, PR, CI en statusadministratie bij de eigenaar,
die alleen wil mergen. Elk besluit kostte twee of drie PR's (voorstel, statusstap, record), terwijl het enige echte anker de merge
door de eigenaar is. Dit ADR bundelt de werkstraat tot de merge, de CI-lus en de beslisroute. Sinds 0089 bewaakt GitHub wie
beslist (review van code-eigenaren, ruleset) en zijn de eigen documentbewaking, de lanes en de besluit-PR in de template weg.

## Besluit

**Principes** (was 0029 P1–P7; eigenaarbesluit 2026-10-15)

- **P1 Bewijs vóór uitbreiding:** geen nieuwe template-capability, rail of meta-ADR zonder app-behoefte, doorgeglipte fout of gemeten wrijving.
- **P2 Rails blijven:** nooit een check, test, hook, RLS-regel of type afzwakken voor autonomie.
- **P3 Prompts alleen voor wat werkt vóór review:** code die op de machine van de eigenaar of in CI draait, en de eigen instructies en rechten van de agent.
- **P4 Eén ronde per besluit.** **P5 Wat een check kan, is een check:** elk acceptatiecriterium een test.
- **P6 Meten vóór en na** een wijziging aan de werkstraat. **P7 Eén bron per feit,** die de huidige werking beschrijft.

**Beslisroute**

1. **Merge is acceptatie** (kern eigenaarbesluit 2026-10-21). Architect of hoofdsessie schrijft een ADR of spec direct met de
   bedoelde status (`geaccepteerd`, `goedgekeurd`, `vervallen`, `vervangen door NNNN`). De merge door de eigenaar is het besluit;
   afwijzen is de PR sluiten. `voorgesteld`/`voorstel` alleen voor een bewust geparkeerd voorstel. Een status geeft zichzelf geen
   goedkeuring; inhoud, scope, intrekking en vervanging zijn eigenaarbesluiten. Wie de spec schrijft: 0090 punt 1.
2. **A4 na 0089 en 0090.** Een geaccepteerd ADR herschrijven of verwijderen mag in de template in elke PR, in een app alleen in
   een besluit-PR, met een herzieningsregel (R-CI-05). Geen ADR gaat terug naar `voorgesteld`; een vervallen of vervangen
   ADR wijzigt in een app niet, in de template verdwijnt het (R-CI-06, `check-docs`); de statusregel houdt zijn strikte
   vorm. Het rolhek laat alleen architect en hoofdsessie een geaccepteerd ADR herschrijven of verwijderen. Behalve de
   weigering van een vervallen of vervangen ADR in de template (`check-docs`, R-CI-06) toetst geen check dit (0089 punt 5
   en 8): de goedkeuring van de eigenaar is het besluit.
3. **Korte ADR's** (kern eigenaarbesluit). Richtlijn één pagina: context, besluit, alternatieven, gevolgen; geen regelnummers en
   geen werkinstructie (die horen in `docs/`).
4. **Drempel** (kern eigenaarbesluit). Een ADR is nodig bij A2 (moeilijk terug te draaien: migratie op bestaande rijen,
   rollen/RLS-model, auth of identiteit, provider of nieuwe dependency), A3 (rechten verruimen, of een check, hook of gate
   afzwakken), A4 (geaccepteerd ADR wijzigen of vervangen) en, van A1, alleen een wijziging van het contract tussen zones. Het ADR
   noemt welke. Een strengere check is geen ADR; anders een regel in `docs/`. De toets: "als de twee mensen die dit besloten
   morgen weg zijn, weet de rest dan waarom?"
5. **Statusovergangen.** Toegestaan: een nieuw document met een eigenaarstatus; `voorstel`/`voorgesteld` naar een
   eigenaarstatus; een ADR van `geaccepteerd` naar `vervangen door NNNN` of `vervallen`; een spec van `goedgekeurd` of `gebouwd`
   naar `vervallen`; een spec terug naar `voorstel` (R-WERK-08). Het rolhek toetst dit per rol; `check-document-status` bestaat
   niet meer (0089 punt 5), dus in CI is het een afspraak die de eigenaar met zijn goedkeuring beslist.
6. **Rolhek.** Alleen architect en hoofdsessie schrijven een eigenaarstatus of wijzigen de inhoud van een goedgekeurde spec;
   andere rollen niet, ook geen `gebouwd` (0095 punt 7).
7. **Anker.** Commitvolgorde, inhoud na de status en committer doen er niet toe; het anker is de review van de code-eigenaar op
   GitHub, met een eigen identiteit voor de agent (0089 punt 2 en 3).

**Taakmandaat**

8. **Register alleen voor `requiredChecks`.** `.claude/decisions.json` op main houdt de verplichte checks voor `pr:verify`.
   Rechten gelden pas na de merge; een werkversie, prompt, label of commit-auteur vervangt dat niet.
9. *(vervallen, zie 0063)*
10. **Gebouwd met bouwbewijs.** Een spec gaat naar `gebouwd` met `status: gebouwd`, zonder PR-nummer, in de PR met de
    implementatie, of met de hand in een latere PR (0095 punt 1 en 3). Gebouwd is aangeboden en gecontroleerd, geen merge of release. ADR's kennen geen `gebouwd`.
11. *(vervallen, zie 0063)* Een label vervangt geen eigenaarreview.

**Mini-spec**

12. *(vervallen, zie 0089 punt 5 en 0090 punt 4)* Er zijn geen lanes meer.
13. **Mini-spec** (eigenaarbesluit 2026-10-15). Eigen sjabloon `docs/specs/_mini.md` met marker `sjabloon: mini`, voor een route,
    een permissie of een nieuwe tabel. Migraties alleen als nieuwe tabel via `pnpm new:resource`; alles onder A2 (bestaande
    rijen, rollen/RLS-model, `security definer`) en elke wijziging in `src/core` gaat via het volledige sjabloon.
14. *(vervallen, zie 0089 punt 5)* De route voor werk met een mini-spec staat in 0056 en 0062.
15. *(vervallen, zie 0089 punt 5)*

**Werkstraat tot de merge**

16. **Stap Opleveren.** Tussen reviewer en eigenaar, alleen door de hoofdsessie: branch pushen, PR openen, CI-lus, conflicten
    oplossen, eindmelding. Push naar `main` en force-push blijven verboden.
17. **Conflicten via `git merge origin/main`**, nooit rebase.
18. *(vervallen, zie 0090 punt 5)*
19. **Runner.** Runner, hostcontrole en vaste runnerchecks: zie [0044](0044-tests-buiten-de-sandbox.md).
20. **Gecommitte migratie** is voor het rolhek: staat in de merge-base met `origin/main`, zoals `check:migrations`.
21. **Mergen en force-push dicht** voor elke rol in het rolhek, ook `--auto`, `gh api …/merge` en GraphQL-merge, behalve
    `pnpm pr:merge` (0069 punt 3 en 4).
22. **Rolhekgaten en MCP.** Testhulpbestanden en configs als gate, hooks met de root uit de payload; MCP-tools onder het rolhek
    met een allowlist `mcpLezen` voor leestools.
23. **Rood bewijzen bij migraties.** De tester bewijst rood met één `pnpm test:db`-run; de uitslag staat in de PR.
24. **Onvoltooid blijft onvoltooid.** Een weigering meldt de developer met de werkelijke rolhekuitvoer aan de hoofdsessie; die
    verwerkt de blokkade of legt een concrete scope-uitbreiding voor. De groen-eis van de stop-hook krijgt geen tekstuele
    uitzondering; een rode of ontbrekende check is geen voltooide taak.
25. **CI-lus tot groen.** De hoofdsessie wacht met `pnpm pr:verify <nr> --watch` (SHA, branch, herkomst GitHub Actions), herstelt
    rood en herhaalt, zonder vast aantal rondes. Stoppen en vragen als de fix een regel, check, hook of test afzwakt; dezelfde
    fout drie keer achter elkaar; de oorzaak buiten de code ligt; of een gate- of beschermd pad moet wijzigen. Fixes na de review
    ziet de reviewer opnieuw. De lus leeft alleen in de sessie: geen timer, token of credential.
26. **Opruimen na de merge**, door de hoofdsessie, alleen na bevestigde merge: main fast-forward, alleen de eigen branch en
    worktree weg; stoppen bij een vuile werkmap of ongepusht werk. Nooit rebase, `reset --hard`, `--force` of `--delete main`.

**Promptbeleid en mergen**

27. **Paden met effect vóór review** (twijfelgevallen eigenaarbesluit 2026-10-15). Een deelverzameling van de beschermde paden
    werkt vóór de review: (a) gereedschap dat lokaal of in CI draait (scripts, CI, hooks, dependencies, omgeving, configs; niet
    app- en testcode, die in de runner draaien), (b) instructies, rechten of hooks van de agent, (c) de vertrouwde basis van
    checks. De roadmap, ADR's, specs, `docs/nieuwe-app.md`, `src/api`, `src/core`, `deploy/**` en testpaden horen er niet in. De
    lijst is elk pad met `schrijven` op `voorReview` of `altijdVragen` in de padtabel in `.claude/gates.json` (0079).
28. **Prompts.** Buiten de onderhoudsmodus vraagt het rolhek de hoofdsessie op een pad uit punt 27; op de andere beschermde
    paden geeft het een melding. Commando-`ask`'s, migraties, gegenereerde bestanden en bestaande tests blijven ongewijzigd.
    Welke Edit-regels `ask` zijn en wat subagentrollen op beschermde paden krijgen: [0045](0045-railwerk.md). `CODEOWNERS` volgt
    de padtabel (0089 punt 3).
29. *(vervallen, zie 0089 punt 5)* De diff-guard bestaat niet meer.
30. *(vervallen, zie 0069 punt 3 tot en met 5 en 0089)*
31. **Wie merget.** De eigenaar, behalve een PR zonder pad van een code-eigenaar: die merget de hoofdsessie via `pnpm pr:merge`
    (0089 punt 2 en 3, R-REPO-01).
32. **`src/api/app.ts` en `src/shared/permissions.ts` geen beschermd pad** (eigenaarbesluit 2026-10-15; A3). Compensatie:
    `defineRoute`, een test per verboden rol en `can()` blijven, en de reviewer toetst elke nieuwe of gewijzigde permissie en route
    (0089 punt 8). Zwakte: minder menselijke review op wie wat mag.
33. *(vervallen, zie 0089 punt 5)*
34. **Harde grens is GitHub** (eigenaarbesluit 2026-10-14). De ruleset eist groene checks; de agent zet geen review of label
    rechtstreeks.
35. *(vervallen, zie 0089 punt 5)*

**Meten**

36. Per besluit: PR's tot de eindstatus op main en doorlooptijd; doel mediaan één PR (basislijn: 2 PR's, 2u03m). Per sessie en
    branch: prompts, weigeringen, beurten, CI-rondes en correcties van de eigenaar (elk eigenaarbericht na de opdracht, als
    bovengrens; eigenaarbesluit 2026-10-15), via fail-open hooks zonder netwerk en zonder promptinhoud of geheimen.
37. Nulmeting en dezelfde meting na elke werkstraatwijziging. Herzien na de eerste 5 besluiten als de mediaan > 1 PR is of de
    doorlooptijd niet onder de basislijn ligt; direct bij één onbedoelde status op main; en als prompts niet dalen of weigeringen,
    blokkerende bevindingen of correcties stijgen.

**Vertrouwensgrens.** Main berust op de review van de code-eigenaar en de ruleset op GitHub (0089). Een rolnaam is geen
onafhankelijk reviewbewijs. De Claude-hooks zijn runtime-specifiek; CI en GitHub blijven de grens voor andere runtimes.

## Alternatieven

- **Statusstap in de webeditor of sessieakkoord (0029, 0035):** extra ronde of machinerie zonder sterker anker.
- **Auto-merge na groen of akkoord via label of comment:** geen moment waarop de eigenaar de head ziet; label en comment kan de
  agent zelf zetten.
- **Rebase met force-push; vast maximum aan CI-rondes; `gh pr checks --watch`:** verworpen.
- **Status, label of agentreview als akkoord; iedere developer blijvende toegang:** verworpen.
- **Beschermde paden uit `CODEOWNERS` halen voor minder prompts:** verworpen (P2), behalve punt 32.

## Gevolgen

- Werkinstructie (commando's, opruimstappen) staat in `docs/operations/agent-doorloop.md` en de skill `opleveren`.
- Restrisico's: het reviewerakkoord is een sessie-artefact; het rolhek valt dicht bij een storing maar is een vangnet, geen grens (R-ROL-09, R-ROL-10); het token van de eigenaar staat nog in de
  agentomgeving (0089 punt 2 en 9).
