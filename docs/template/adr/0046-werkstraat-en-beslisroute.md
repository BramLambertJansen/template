# 0046 — Werkstraat en beslisroute

Status: geaccepteerd

Herzien: 2026-11-14: ingekort tot wat nog geldt. Een punt dat door een later ADR is ingehaald, is één regel met de plek waar
het nu staat; de puntnummers zijn ongewijzigd. De eerdere herzieningsregels (#385, #469, #535, #541, #692, #696, #703) en de
oude tekst staan in git.

Vervangt 0025, 0027, 0030 en 0038; neemt de delen van 0029 over die via 0038 punt 8 nog golden. Drempel: A4.
Gewijzigd door [0054](0054-gebouwd-in-de-bouw-pr.md), [0056](0056-functionele-ui-in-een-pr.md),
[0057](0057-risicogestuurde-werkstraat.md), [0062](0062-spec-en-bouw-in-een-pr.md),
[0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md), [0069](0069-agent-merge-niet-kritiek.md),
[0079](0079-een-padtabel.md), [0080](0080-specarchief-en-bouwvorm.md), [0089](0089-templateregime.md) en
[0090](0090-lichtere-werkstraat.md).

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
2. *(vervallen, zie 0089 punt 5 en 8 en 0090 punt 4)* Een geaccepteerd ADR herschrijven mag in de template in elke PR. Blijft:
   `geaccepteerd` gaat niet terug naar `voorgesteld`, de statusregel houdt zijn strikte vorm, en het rolhek laat alleen
   architect en hoofdsessie een geaccepteerd ADR herschrijven of verwijderen.
3. **Korte ADR's** (kern eigenaarbesluit). Richtlijn één pagina: context, besluit, alternatieven, gevolgen; geen regelnummers en
   geen werkinstructie (die horen in `docs/`).
4. **Drempel** (kern eigenaarbesluit). Een ADR is nodig bij A2 (moeilijk terug te draaien: migratie op bestaande rijen,
   rollen/RLS-model, auth of identiteit, provider of nieuwe dependency), A3 (rechten verruimen, of een check, hook of gate
   afzwakken), A4 (geaccepteerd ADR wijzigen of vervangen) en, van A1, alleen een wijziging van het contract tussen zones. Het ADR
   noemt welke. Een strengere check is geen ADR; anders een regel in `docs/`. De toets: "als de twee mensen die dit besloten
   morgen weg zijn, weet de rest dan waarom?"
5. *(vervallen, zie 0089 punt 5 en 8)* `check-document-status` bestaat niet meer; de toegestane statusovergangen zijn een
   afspraak die de eigenaar met zijn goedkeuring op de PR beslist.
6. **Rolhek.** Alleen architect en hoofdsessie schrijven een eigenaarstatus of wijzigen de inhoud van een goedgekeurde spec;
   andere rollen niet. De developer houdt alleen `gebouwd` via `docs:status`.
7. *(vervallen, zie 0089 punt 2 en 3)* Het anker is de review van de code-eigenaar op GitHub, met een eigen identiteit voor de agent.

**Taakmandaat**

8. **Register alleen voor `requiredChecks`.** `.claude/decisions.json` op main houdt de verplichte checks voor `pr:verify`.
   Rechten gelden pas na de merge; een werkversie, prompt, label of commit-auteur vervangt dat niet.
9. *(vervallen, zie 0063)*
10. **Gebouwd met bouwbewijs.** Een spec gaat naar `gebouwd` in de PR met de implementatie (0054); de statusregel noemt alleen de
    PR (0080 punt 5). Gebouwd is aangeboden en gecontroleerd, geen merge of release. ADR's kennen geen `gebouwd`.
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
    lijst is de kolom `schrijven` van de padtabel in `.claude/gates.json` (0079).
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
    (R-WERK-09). Zwakte: minder menselijke review op wie wat mag.
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
- Restrisico's: het reviewerakkoord is een sessie-artefact; het rolhek is fail-open; het token van de eigenaar staat nog in de
  agentomgeving (0089 punt 2 en 9).
