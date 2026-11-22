# 0107 — Gedragsbaseline voor tekstwijzigingen

Status: geaccepteerd

Wijzigt [0059](0059-leerlus-van-app-naar-template.md) punt 4 en [0078](0078-leerlus-met-bewijs.md) punt 2. Drempel: A4 (twee
geaccepteerde ADR's wijzigen). Aanleiding: [overnameplan](../../reviews/2026-11-18-overnameplan-agentic.md) §6, rij 4d.
Voorstel van de architect op verzoek van de hoofdsessie (2026-11-22); de merge door de eigenaar is het besluit.

## Context

De ladder van 0059 punt 4 eist voor Type en Check een fixture die op de oude code faalt, en de job `leerpunt-bewijs` toetst
dat (0078 punt 1). Voor de treden Skill, Padregel en `AGENTS.md` is het bewijs `geen test: <reden>` (0078 punt 2). Een
tekstfix voor agentgedrag is daardoor een aanname: niemand laat zien dat het gedrag zonder de fix misgaat en met de fix niet.
De generieke reproductie staat al in elk leerpunt-issue. Een volledig evalharnas, met betaalde runs in CI, veel runs en
meerdere modellen, is groot (L) en wacht op de meetgrond van ST-09.

## Besluit

1. **Bereik.** Een PR die een leerpunt sluit met trede Skill, Padregel of `AGENTS.md` heeft als bewijs een gedragsbaseline.
   Die trede is de definitie van een gedragsleerpunt. De PR wijzigt tekst onder `.claude/agents/`, `.claude/skills/`,
   `.claude/rules/`, `AGENTS.md` of `CLAUDE.md`. Een tekstwijziging zonder leerpunt valt er niet onder.
2. **Scenario.** Het scenario wordt vastgelegd vóór de eerste run, uit de generieke reproductie van het issue. Het heeft drie
   regels:
   - `Prompt:` de letterlijke opdracht;
   - `Beginstand:` de SHA van de merge-base en de stappen erop;
   - `Criterium:` per run een ja of nee, af te lezen aan het eindbericht of aan de gevraagde commando's.
3. **Runs.** Drie runs zonder de wijziging en drie met. De hoofdsessie draait elke run als ad-hoc subagent: verse context,
   alleen lezen (R-ROL-02), hetzelfde model voor alle zes runs. Eerst draaien de runs op de ongewijzigde tekst, daarna wordt
   de tekst gewijzigd, en daarna volgen de runs met. Zo begint ook dit bewijs met een fixture die op het oude faalt.
   Een run geeft de tekst die hij toetst (oud of nieuw) letterlijk in zijn opdracht mee, omdat agent- en skilldefinities bij
   de start van een sessie geladen worden. Alleen gedrag dat in het eindbericht of in de gekozen commando's zichtbaar is, past;
   gedrag dat schrijven vraagt (tests eerst, commit- of PR-vorm) krijgt `geen baseline: <reden>` (punt 6).
4. **Geslaagd.** Ten minste één nee bij de runs zonder, en drie keer ja bij de runs met. Geven alle runs zonder al ja, dan
   reproduceert het scenario niet. Dan wijzigt de PR de tekst niet, en de eigenaar beslist over het leerpunt.
5. **Vastleggen.** De vastlegging staat in de PR-beschrijving, sectie `## Leerpunt`, met deze regel:
   `- #<nr>: trede <Skill|Padregel|AGENTS.md>; bewijs baseline: zonder <a>/3, met 3/3 (<model>)`. Daaronder komt een blok
   `### Scenario #<nr>` met de drie regels uit punt 2 en per run één regel: uitslag en wat er gebeurde, in één zin.
   Transcripten gaan niet in de repo en niet in de meetopslag; `pnpm meting` telt de runs al als subagent-aanroepen.
6. **Kosten.** Alleen runs in de sessie zelf: geen API-sleutel, geen headless runs in CI, geen nieuw secret, geen nieuwe
   workflow of dependency. Hooguit zes runs per leerpunt. Past het scenario daar niet in, of hangt het af van de eigenaar of
   van schrijven, dan wordt het bewijs `bewijs geen baseline: <reden>`.
7. **Toets.** De job `leerpunt-bewijs` toetst alleen de vorm:
   - `baseline:` alleen bij de treden uit punt 1;
   - de tellingen uit punt 4;
   - een pad uit punt 1 in de diff;
   - het blok `### Scenario #<nr>` met de drie regels niet leeg.
   Of de runs echt gedraaid zijn, toetst de eigenaar. Hij merget, net als bij `geen test:` en `meting:`.
8. **Later.** Een evalharnas met betaalde runs vraagt een eigen ADR na ST-09, met de cijfers van ST-09.

## Alternatieven

- **Elke gedragsrelevante tekstwijziging, ook zonder leerpunt:** de grens is niet toetsbaar, en elke kleine tekstfix kost
  zes runs.
- **Alleen `.claude/agents/` en `.claude/skills/`, zoals het overnameplan noemt:** een padregel of `AGENTS.md` stuurt hetzelfde
  gedrag en zou een aanname blijven.
- **Vijf plus vijf runs:** sterker bewijs, maar bijna twee keer zo duur. Dat is pas zinvol als ST-09 laat zien hoe sterk de
  runs uiteenlopen.
- **Transcripten als bestand in de PR of in de meetopslag:** de repo groeit mee (R-DOC-09) en appdata kan meelekken; de
  regel per run volstaat voor de toets van de eigenaar.
- **Nu meteen een harnas in CI:** betaalde runs en een secret vóór de meetgrond; het overnameplan stelt dat uit.

## Gevolgen

- Een gedragsleerpunt kost zes subagent-runs in de sessie en een blok in de PR. Een PR zonder leerpunt merkt niets.
- Aanvaard risico: de hoofdsessie schrijft fix, scenario en oordeel zelf; dat is geen onafhankelijk bewijs (R-ROL-05). De
  eigenaar toetst het bij de merge, zoals bij `geen test:` en `meting:`.
- `geen test:` blijft voor een integratie- of e2e-test (0078 punt 2). Voor de drie teksttreden wordt het `baseline:` of
  `geen baseline: <reden>`.
- Bouw-PR (na de merge): spec `gedragsbaseline` met AC's; `scripts/kit/leerpunt.mjs` leest en toetst `baseline:`,
  `geen baseline:` en het scenarioblok, en `sluitOordeel` telt een baseline als bewijs, met tests; de sectie Leerpunt in
  `.github/pull_request_template.md`; de sluitzin in `opleveren` stap 8 (Edit door de hoofdsessie met akkoord van de
  eigenaar); een recept in `docs/operations/` met de opdrachttekst voor een run; R-WERK-13 in het regelboek.
- Klaar als: de job `leerpunt-bewijs` keurt een correcte baseline-regel goed en weigert met een foutmelding: `baseline:` bij
  trede Check, `met 2/3`, `zonder 3/3`, een ontbrekend scenarioblok, en een diff zonder pad uit punt 1.
