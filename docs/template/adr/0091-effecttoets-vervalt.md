# 0091 — De effecttoets vervalt; de toets vooraf en de review van code-eigenaren blijven

Status: geaccepteerd

Wijzigt [0066](0066-schrijfgrens-op-effect.md) (vervalt in zijn geheel), [0071](0071-rolhek-vooraf-vaste-lijst.md) punt 3, 4 en
6, [0083](0083-bewaking-met-minder-wrijving.md) punt 2, [0084](0084-sandbox-afscherming-geen-effect.md) (alleen de
plaatshouders voor `pr:verify` blijven) en [0089](0089-templateregime.md) punt 9 en 10. Drempel: A3 (een check vervalt).
Besluit van de eigenaar, 2026-11-12.

## Context

Het rolhek toetst een schrijfactie van een subagent twee keer: vooraf op de tekst van het commando, en achteraf op wat er op
schijf veranderde (de effecttoets, ADR 0066). De toets achteraf weet niet wie iets veranderde, alleen dat het veranderde terwijl
een subagent draaide. Een branchwissel of verplaatsing door de hoofdsessie, een commando van de eigenaar in een eigen terminal,
de editor en plaatshouders van de sandbox kwamen daardoor op naam van een subagent. Op 12 november 2026 gaf de toets in één
sessie ruim 340 meldingen, geen ervan was een overtreding; leerpunten #642 en #674 beschrijven hetzelfde. Elke melding blokkeerde
de Stop-hook, `pnpm pr:verify` en `pnpm pr:merge` tot iemand haar wegklikte.

Sinds ADR 0089 eist GitHub de review van een code-eigenaar op elk beschermd pad. `.github/CODEOWNERS` noemt de testbestanden
(`**/*.test.*`, `/test/`, `/e2e/`, `/db/tests/`), `src/core`, migraties, scripts, hooks, workflows, het regelboek, ADR's en specs.

## Besluit

1. **De effecttoets vervalt**, met de open lijst, de schaduwmodus voor de hoofdsessie, `pnpm rolhek:overnemen` en de controle
   op die lijst in de Stop-hook, `pnpm pr:verify` en `pnpm pr:merge`.
2. **Wat blijft:** de toets vooraf op Bash, Edit en Write, het schrijfrecht per rol uit de padtabel, de identiteitsregels, de
   toets op zelfladende paden, de overige Stop-checks, en in `pnpm pr:verify` de controle op een schone werkmap met de
   uitzondering voor plaatshouders van de sandbox.
3. **De toets vooraf wordt niet verder uitgekleed.** De derde stap van de spec `rolhek-vooraf-krimp` vervalt: zonder toets
   achteraf is de toets vooraf het enige wat een schrijfactie buiten de rol tegenhoudt vóór de PR. De spec gaat als document naar
   `vervallen`; wat ervan gebouwd is (de vaste lijst vooraf, het corpus, de zelfladende paden) blijft in code en tests.
4. **Volgorde.** Eerst gaan de logica en de aanroepen weg en blijft het ingangsbestand van de hook als lege huls staan, zodat
   een werkmap met de oude `.claude/settings.json` niet dichtvalt. Daarna haalt de eigenaar de aanroepen uit
   `.claude/settings.json` en verdwijnt de huls. Tot dan weigert het rolhek elk commando dat
   `pnpm rolhek:overnemen` start, voor elke rol: dat patroon staat in `.claude/settings.json` nog buiten de sandbox en het script
   bestaat niet meer.
5. ADR 0089 punt 9 en 10: de effecttoets wacht niet op de identiteit van de agent; de identiteitsregels van het rolhek en de
   bypass wachten daar wel op.

## Alternatieven

- **Alleen `pnpm pr:verify` naar de eigen werkmap laten kijken:** een pleister; de valse meldingen binnen de sessie blijven.
- **De toets alleen laten loggen, zonder te blokkeren:** haalt de wrijving weg, maar laat code staan waarvan niemand de
  meldingen leest tot het misgaat.
- **De toets leren wie schreef:** vraagt per proces bijhouden wat het schrijft; dat is meer machinerie dan het vangt.

## Gevolgen

- Aanvaard risico: een subagent die de toets vooraf omzeilt (een interpreter of eigen script, een programma dat de toets niet
  als schrijvend kent, een pad dat pas bij uitvoeren bekend is, een achtergrondproces) valt niet meer automatisch op. Op een
  beschermd pad houdt de review van de code-eigenaar de merge tegen. In app-code onder `src/` buiten `src/core` en in gewone
  docs ziet alleen de review van de diff het nog (R-WERK-11).
- De map `rolhek-effect` in de git-map van een bestaande checkout heeft geen functie meer; de eigenaar verwijdert haar.
- R-ROL-09, R-ROL-10, R-ROL-11 en R-REPO-01 volgen dit ADR; de spec `rolhek-effect` gaat naar `vervallen`.
- Acceptatiecriteria van gebouwde specs die de toets op effect als middel noemen, vervallen voor dat deel:
  `samenhang-checks-rollen` AC-4 (weigering "via de toets op effect"; de weigering vooraf blijft), `bewaking-zichtbaar` (de
  melding noemt de toets op effect niet meer) en `specarchief-en-bouwvorm` (de archieftoets achteraf).
- Drie procescriteria zonder test (`kooi` AC-9, `tests-naar-vermogen` AC-9 en AC-10) staan nu als bekende afwijking in
  `.kit/baseline.json`: `check-docs` vond ze toevallig via een naam in een verwijderd testbestand.
