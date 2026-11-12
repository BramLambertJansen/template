# 0089 — Templateregime: in de template geen besluit-PR en geen onwijzigbaar papier

Status: geaccepteerd

Wijzigt [0045](0045-railwerk.md) punt 10 en 21, [0046](0046-werkstraat-en-beslisroute.md) punt 2, 5, 6, 10, 12 en 15,
[0053](0053-adr-archief.md) punt 1 en 2, [0062](0062-spec-en-bouw-in-een-pr.md) punt 2 en 5,
[0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md) punt 5, [0074](0074-herziene-adr-punten-gemarkeerd.md) punt 2 en 4,
[0079](0079-een-padtabel.md) punt 4 en [0080](0080-specarchief-en-bouwvorm.md) punt 1, 3 en 4 — in de template-repo, en in
een app alleen via punt 5 en 6 hieronder. Drempel: A3 (checks worden lichter, in de template en in punt 5 en 6 ook in apps) en
A4. Uitwerking: [spec](../specs/templateregime.md). Besluit van de eigenaar, 2026-11-11.

## Context

De template-repo past de regels voor apps op zichzelf toe, en dat zet papier vast. 46 % van de commits is `docs`; 35 van de 49
geldige ADR's gaan over het proces zelf; 0046 is door negen latere ADR's gewijzigd. Een kleine wijziging aan de bewaking kost
een besluit-PR, een bouw-PR en een status-PR (#668, #685, #687). Leerpunt #673: een PR moet zijn eigen nummer noemen voordat hij
bestaat. In de template is de eigenaar die merget ook de enige die de afspraken maakt, en git bewaart de historie.

## Besluit

1. **Templateregime** geldt alleen als `onderhoud.repository` in `.claude/gates.json` van de vertrouwde basis gelijk is aan de
   repository (de vergelijking `isTemplateRepo` van `check-core`); anders streng. Daar mogen ADR, spec, regelboek en code in één
   PR; de eigenaarmerge blijft het besluit op beschermde paden.
2. **Oud papier mag weg.** In de template mag een ADR met eigenaarstatus herschreven, samengevoegd, hernoemd of verwijderd
   worden, zonder herzieningsregel; het archief mag wijzigen en verdwijnen, en een archiefnaam mag terugkomen; een gebouwde spec
   mag van inhoud wijzigen, een AC-id mag verdwijnen en een spec met eigenaarstatus mag weg of hernoemd worden. Git is de historie.
3. **Eén lane `template`.** In de template is elk besluit naast elk ander pad, ook een kritiek pad, de lane `template`: spec,
   spec-review, eigenaarmerge, in één PR. De beperking tot één nieuwe-tabelmigratie vervalt; `check:migrations` blijft gecommitte
   migraties beschermen.
4. **Wat blijft, ook in de template:** spec vóór code; geen testgeval weghalen of skippen, geen bestaande test verwijderen of
   hernoemen; geen gecommitte migratie wijzigen; de weigering van agentinstructies buiten de vaste plekken en van onbekende paden
   buiten gates; de regels voor een functionele-UI-spec; een geldige statusregel en nooit terug naar `voorgesteld`; alleen
   architect en hoofdsessie schrijven een eigenaarstatus; unieke ADR-nummers zonder hergebruik; een bestaand doel voor
   `vervangen door NNNN`; het bouwbewijs van `gebouwd # #<PR>`; werkende links; AC→test; de krimpcheck; de padtabel en de
   eigenaarmerge. De nummerreeks (template 0001–0099, app vanaf 0100) is een afspraak zonder check.
5. **Template-updates in apps.** De strenge toets geldt niet voor een document dat van de template is en door de app niet is
   aangepast: (a) de versie op de basis van de app is byte-gelijk aan dat pad op de merge-base van die basis met `template/main`,
   of het pad ontbreekt op beide, én (b) de versie na de PR is byte-gelijk aan `template/main`, of het pad ontbreekt zowel na de
   PR als op `template/main`. Bij een rename tellen bron en doel apart. Zonder of met meer dan één merge-base: streng. Zo'n
   document telt niet als besluit of bouwbewijs. `template/main` wordt altijd vers opgehaald in een eigen ref; lukt dat niet:
   streng.
6. **Herzieningsregels in apps.** In een app toetst `check-docs` de herzieningsregel alleen voor een wijzigend ADR vanaf 0100.

## Alternatieven

- **Alleen docs vrijgeven, kritieke code op twee PR's houden:** de bewaking is juist het werk dat de meeste rondes kost.
- **Niets aan de route, alleen teksten inkorten:** het papier groeit weer, want A4 verbiedt opruimen.
- **Het regime ook in apps:** in een app schrijft een agent onder het account van de eigenaar; daar blijft streng de standaard.

## Gevolgen

- Een template-PR met een besluit is één PR; wie het waarom van een oud punt zoekt, gebruikt `git log`.
- Elke check die het regime kent, valt dicht naar streng; de bestaande app-tests blijven ongewijzigd groen.
- Restrisico's, aanvaard: in de template ziet alleen de eigenaar bij de merge dat een punt verdween (de diff toont het); punt 6
  is boekhouding en geen grens, want de nummerreeks heeft geen check en `check-docs` draait de code van de PR; de grens is de
  guard (punt 5); als `template/main` intussen verder is, valt de toets vals rood, dus dicht.
- Korte specs, de architect op verzoek, de tester bij risicowerk en het samenvoegen van ADR's volgen in eigen PR's.
- Deze PR volgt zelf nog de oude route (de guard draait uit main): alleen `docs/adr/` en `docs/specs/`, met herzieningsregels.
