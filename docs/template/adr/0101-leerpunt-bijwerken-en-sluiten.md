# 0101 — Leerpunten bijwerken en sluiten door de hoofdsessie

Status: voorgesteld

Wijzigt [0078](0078-leerlus-met-bewijs.md) punt 4 en 5 en [0059](0059-leerlus-van-app-naar-template.md) voor zover dat alleen
`gh issue create` toestaat; vult R-WERK-13, R-ROL-07, R-ROL-12 en R-SEC-09 aan. Drempel: A3 (een uitzondering op "MCP alleen
lezend" en op het rolhek) en A4 (een geaccepteerd ADR wijzigt). Aanleiding: verzoek van de eigenaar, 2026-11-20, met de
keuzes "sluiten als duplicaat of als completed na merge", "comment, titel/body en labels", "gh en MCP", "doel vooraf lezen".

## Context

De hoofdsessie mag een leerpunt alleen aanmaken: `gh issue create` met precies één `--label leerpunt` (rolhek, R-ROL-07), of
in de cloud de MCP-issuetool, alleen aanmaken (R-ROL-12). ADR 0078 punt 5 staat al toe dat een agent een leerpunt sluit met
sluitbewijs of als achterhaald, maar geen kanaal laat dat toe: het rolhek vraagt bij `gh issue close`, `comment` en `edit`, en
in de cloud is MCP verder alleen lezend. Gevolg: een duplicaat blijft open, een onvolledig leerpunt (`leerpunt-onvolledig`)
wacht op de eigenaar om een veld aan te vullen, en een opgelost leerpunt sluit alleen als de PR toevallig een sluitwoord had.

## Besluit

1. **Bijwerken.** De hoofdsessie mag op een issue met label `leerpunt` in de template-repo (`template.repository` in
   `.claude/gates.json`): een comment plaatsen, titel en body wijzigen en labels zetten of weghalen. Ze haalt nooit het label
   `leerpunt` weg en raakt `leerpunt-onvolledig` en `leerpunt-zonder-bewijs` niet aan; die beheert de issue-check (0078
   punt 3). De body blijft in de vorm van `.github/ISSUE_TEMPLATE/leerpunt.yml`, zonder appcode, appdata of geheimen.
2. **Sluiten, limitatief.** De hoofdsessie sluit een leerpunt alleen:
   - als **duplicaat** (`state_reason` duplicate) met een comment `duplicaat van #<nr>` naar een ander leerpunt; of
   - als **completed** met een comment `opgelost door #<pr>`, waarbij die PR gemergd is, in zijn sectie `## Leerpunt` dit
     issue noemt en de job `leerpunt-bewijs` erop groen was (0078 punt 1).
   De issue-check (0078 punt 3) erkent beide comments als bewijs, net als `achterhaald: <reden>`, en controleert dat het
   duplicaat zelf een leerpunt is en dat de PR gemergd is met die sectie.
   Sluiten als achterhaald of "not planned" blijft triage van de eigenaar (0078 punt 2 en 5). Heropenen doet de eigenaar.
3. **Doelcheck vooraf.** Vóór elke schrijfactie leest de hoofdsessie het nummer (`gh issue view <nr> --repo <repo> --json
   labels,state,url` of de MCP-leestool) en stopt als het geen issue met label `leerpunt` is: issues en PR's delen nummers,
   en `gh issue edit` labelt ook een PR (R-ROL-08). Dit is een afspraak, geen grens: het rolhek is offline en kan het label
   niet zien.
4. **Kanalen.** Lokaal laat het rolhek `gh issue comment|edit|close` van de hoofdsessie zonder vraag door met `--repo`/`-R`
   gelijk aan `template.repository`, één los commando en tekst via `--body-file`/`-F`; bij `edit` zonder
   `--remove-label leerpunt` en zonder een van de twee checklabels; bij `close` alleen met `--reason completed` of
   `--duplicate-of`. Elke andere vorm blijft ask. In de cloud mag de hoofdsessie de MCP-issuetool voor dezelfde acties
   gebruiken; daar draait geen rolhek, dus daar is punt 1 tot 3 een afspraak. Subagents schrijven geen issues (ongewijzigd).
5. **Afstemmen in de leerpuntstap.** Vóór een nieuw leerpunt zoekt de hoofdsessie in `opleveren` stap 8 de open leerpunten
   die het werk van de sessie raakt: `gh issue list --repo <repo> --label leerpunt --state open --search <trefwoord>`, met
   trefwoorden uit de geraakte paden en regels, niet de hele lijst (R-DOC-09). Per geraakt leerpunt:
   - **opgelost**: de PR krijgt de sectie `## Leerpunt` met bewijs (0078 punt 1), of na de merge sluit de hoofdsessie het
     volgens punt 2; zonder bewijs geen sluiten, alleen een comment;
   - **deels opgelost**: een comment `deels: <wat gedaan is>; open: <wat nog moet>` met de PR, en zo nodig de body bijgewerkt
     zodat hij alleen het resterende beschrijft;
   - **zelfde les opnieuw**: een comment met de nieuwe reproductie op het bestaande leerpunt in plaats van een nieuw issue.
   De slotregel van stap 8 noemt per geraakt leerpunt welke van de drie het werd, of "geen open leerpunt geraakt".

## Alternatieven

- **Alleen comments.** Afgewezen door de eigenaar: duplicaten en onvolledige leerpunten blijven dan bij de eigenaar liggen.
- **Ook "not planned" en achterhaald.** Afgewezen: dat is triage, en die blijft bij de eigenaar (0078 punt 5).
- **Rolhek vraagt GitHub om het label.** Afgewezen: het rolhek is offline en deterministisch; een netwerkcall maakt elke
  aanroep traag en onvoorspelbaar (R-DOC-09).

## Gevolgen

- Rolhek: een nieuwe doorlaat met tabeltest (R-DOC-09) in `.claude/hooks/lib/rolhek.mjs` en `test/hooks/`.
- `.claude/settings.json`: allow-regels voor de drie vormen; `test/rails/leerpunt-settings.test.ts` bindt ze aan
  `template.repository`. Een fork past ze mee aan (`docs/nieuwe-app.md`).
- `scripts/kit/leerpunt-check.mjs` erkent `duplicaat van #<nr>` en `opgelost door #<pr>`; zonder die erkenning zet hij
  `leerpunt-zonder-bewijs` bij elk duplicaat en bij elke sluiting na een PR zonder sluitwoord.
- `opleveren` stap 8 krijgt de doelcheck, het sluiten na merge, de duplicaatregel en de afstemming uit punt 5.
- Minder dubbele leerpunten (nu `eerder: #nnn` achteraf); per oplevering één tot enkele gerichte zoekopdrachten extra.
- Restrisico: in de cloud kan een agent een PR labelen of het verkeerde issue sluiten; de issue-check zet
  `leerpunt-zonder-bewijs` bij sluiten zonder bewijs, en de eigenaar kan heropenen.
