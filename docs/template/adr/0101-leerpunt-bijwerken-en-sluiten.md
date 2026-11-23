# 0101 — Leerpunten bijwerken en sluiten door de hoofdsessie

Status: geaccepteerd

Herzien: 2026-11-23: bij de bouw (eigenaar, 23 november 2026). Punt 2: sluiten alleen als duplicaat; "completed met
`opgelost door #<pr>`" vervalt, want spec leerlus-bewijs AC-1 maakt de job al rood als `## Leerpunt` een issue noemt dat de
PR niet sluit, dus een opgelost leerpunt sluit GitHub zelf via `Closes #<nr>`. Punt 3 (bewijs zonder sluitwoord) vervalt
daarmee. Punt 1 en 5: lokaal geen labels; R-ROL-08 weigert `gh issue edit` met een label-optie voor elke rol en blijft
ongewijzigd; labels alleen via de MCP-issuetool in de cloud, na de doelcheck. Punt 6: de zoektocht en de uitkomst
`opgelost` horen vóór het openen van de PR (CI-lus stap 1 van `opleveren`), want stap 8 draait na de merge

Wijzigt [0078](0078-leerlus-met-bewijs.md) punt 4 en 5 en [0059](0059-leerlus-van-app-naar-template.md) voor zover dat alleen
`gh issue create` toestaat; vult R-WERK-13, R-ROL-07, R-ROL-12 en R-SEC-09 aan. Drempel: A3 (een uitzondering op "MCP alleen
lezend" en op het rolhek) en A4 (een geaccepteerd ADR wijzigt). Aanleiding: verzoek van de eigenaar, 2026-11-20, met de
keuzes "sluiten als duplicaat of als completed na merge", "comment, titel/body en labels", "gh en MCP", "doel vooraf lezen";
bij de bouw bijgesteld (zie Herzien). Uitwerking: spec [leerlus-bewijs](../specs/leerlus-bewijs.md) AC-11 tot en met AC-15.

## Context

De hoofdsessie mag een leerpunt alleen aanmaken: `gh issue create` met precies één `--label leerpunt` (rolhek, R-ROL-07), of
in de cloud de MCP-issuetool, alleen aanmaken (R-ROL-12). ADR 0078 punt 5 staat al toe dat een agent een leerpunt sluit met
sluitbewijs of als achterhaald, maar geen schrijfweg is daarvoor afgesproken: `gh issue close`, `comment` en `edit` vragen
toestemming, en in de cloud is MCP verder alleen lezend. Gevolg: een duplicaat blijft open, een onvolledig leerpunt
(`leerpunt-onvolledig`) wacht op de eigenaar om een veld aan te vullen, en een deels opgelost leerpunt zegt niet wat er nog
openstaat.

## Besluit

1. **Bijwerken.** De hoofdsessie mag op een issue met label `leerpunt` in de template-repo (`template.repository` in
   `.claude/gates.json`) een comment plaatsen en titel en body wijzigen. Labels zet ze alleen via de MCP-issuetool in de
   cloud (punt 5); ze haalt nooit het label `leerpunt` weg en raakt `leerpunt-onvolledig` en `leerpunt-zonder-bewijs` niet
   aan, want die beheert de issue-check (0078 punt 3). De body blijft in de vorm van `.github/ISSUE_TEMPLATE/leerpunt.yml`,
   zonder appcode, appdata of geheimen.
2. **Sluiten, limitatief.** De hoofdsessie sluit een leerpunt alleen als **duplicaat** van een ander leerpunt, met de reden
   duplicate en een comment `duplicaat van #<nr>`. De issue-check (0078 punt 3) erkent die sluiting als bewijs, net als
   `achterhaald: <reden>`, als de comment van een auteur met schrijfrecht komt en `#<nr>` zelf een leerpunt is. Een opgelost
   leerpunt sluit via de PR (`Closes #<nr>` plus `## Leerpunt`, 0078 punt 1). Sluiten als achterhaald of "not planned" blijft
   triage van de eigenaar (0078 punt 2 en 5). Heropenen doet de eigenaar.
3. Vervallen bij de bouw (zie Herzien).
4. **Doelcheck vooraf.** Vóór elke schrijfactie leest de hoofdsessie het nummer (`gh issue view <nr> --repo <repo> --json
   labels,state,url` of de MCP-leestool) en stopt als het geen issue met label `leerpunt` is: issues en PR's delen nummers.
   Dit is een afspraak, geen grens: het rolhek is offline en kan het label niet zien.
5. **Kanalen.** Het rolhek laat drie vormen van de hoofdsessie zonder vraag door, als los commando met `--repo`/`-R` precies
   één keer gelijk aan `template.repository`, zonder `GH_REPO`/`GH_HOST` en zonder commandosubstitutie: `gh issue comment
   <nr>` met tekst alleen via `--body-file`/`-F`; `gh issue edit <nr>` met alleen `--title`/`-t` en `--body-file`/`-F`;
   `gh issue close <nr>` met alleen `--duplicate-of <nr>`. Elke andere vorm van comment, edit of close is ask; een
   label-optie bij `edit` blijft voor elke rol geweigerd (R-ROL-08). `.claude/settings.json` krijgt voor de drie vormen een
   allow-regel in de vorm `gh issue <actie> --repo <repo> <nr> …`; een andere geldige vorm krijgt de gewone permissieprompt,
   want het rolhek geeft zelf geen allow. In de cloud mag de hoofdsessie de MCP-issuetool voor dezelfde acties gebruiken,
   plus labels zetten volgens punt 1; de doelcheck uit punt 4 is daar de enige inhoudelijke rem, en het rolhek vraagt per
   MCP-schrijfactie. Subagents schrijven geen issues (ongewijzigd).
6. **Afstemmen.** Vóór het openen van de PR (`opleveren` CI-lus stap 1) en opnieuw vóór een nieuw leerpunt (stap 8, na de
   merge) zoekt de hoofdsessie de open leerpunten die het werk van de sessie raakt: `gh issue list --repo <repo> --label leerpunt --state open --search <trefwoord>`, met
   trefwoorden uit de geraakte paden en regels, niet de hele lijst (R-DOC-09). Per geraakt leerpunt:
   - **opgelost**: vóór het openen krijgt de PR `Closes #<nr>` en de sectie `## Leerpunt` met bewijs (0078 punt 1); zonder
     bewijs alleen een comment;
   - **deels opgelost**: een comment `deels: <wat gedaan is>; open: <wat nog moet>` met de PR, en zo nodig de body bijgewerkt
     zodat hij alleen het resterende beschrijft;
   - **zelfde les opnieuw**: een comment met de nieuwe reproductie op het bestaande leerpunt in plaats van een nieuw issue.
   De slotregel van stap 8 noemt per geraakt leerpunt welke van de drie het werd, of "geen open leerpunt geraakt".

## Alternatieven

- **Alleen comments.** Afgewezen door de eigenaar: duplicaten en onvolledige leerpunten blijven dan bij de eigenaar liggen.
- **Ook "not planned" en achterhaald.** Afgewezen: dat is triage, en die blijft bij de eigenaar (0078 punt 5).
- **Rolhek vraagt GitHub om het label.** Afgewezen: het rolhek is offline en deterministisch; een netwerkcall maakt elke
  aanroep traag en onvoorspelbaar (R-DOC-09).
- **Completed na merge met `opgelost door #<pr>`.** Afgewezen bij de bouw: dubbel met `Closes #<nr>`, en de job zou dan ook
  niet-sluitende verwijzingen moeten toetsen, wat AC-1 van leerlus-bewijs omdraait.
- **Labels ook lokaal.** Afgewezen bij de bouw: dat verzwakt de weigering van R-ROL-08, en het rolhek kan een PR niet van een
  issue onderscheiden.

## Gevolgen

- Rolhek: de drie vormen uit punt 5 in `rails/hooks/lib/rolhek.mjs`, met tabeltest in `test/hooks/`.
- `.claude/settings.json`: allow-regels voor de drie vormen; `test/rails/leerpunt-settings.test.ts` bindt ze aan
  `template.repository`. Een fork past ze mee aan (`docs/nieuwe-app.md`).
- `scripts/kit/leerpunt-check.mjs` erkent een sluiting als duplicaat met `duplicaat van #<nr>`; zonder die erkenning zet hij
  `leerpunt-zonder-bewijs` bij elk duplicaat.
- `opleveren` stap 8 krijgt de doelcheck, de duplicaatregel en de afstemming uit punt 6.
- Minder dubbele leerpunten (nu `eerder: #nnn` achteraf); per oplevering één tot enkele gerichte zoekopdrachten extra.
- Restrisico: `--body-file <pad>` kan elk leesbaar bestand in een openbaar issue zetten, net als bij `gh issue create`; de
  Bash-sandbox weigert `.env*`, elders is het een afspraak (eigenaar, 23 november 2026).
- Open: komt een duplicaat-comment uit de cloud-MCP onder een andere identiteit dan OWNER, MEMBER of COLLABORATOR, dan telt
  die sluiting niet; na de merge volgt één proef (eigenaar, 23 november 2026).
- Restrisico: in de cloud kan een agent via MCP een PR labelen of het verkeerde issue bewerken; de issue-check zet
  `leerpunt-zonder-bewijs` bij sluiten zonder bewijs, en de eigenaar kan heropenen.
