# Gedragsbaseline: een tekstfix bewijzen

Een PR die een leerpunt sluit met trede Skill, Padregel of `AGENTS.md` bewijst de tekstfix met een gedragsbaseline: drie runs
zonder de wijziging en drie met (ADR 0107, spec `docs/template/specs/gedragsbaseline.md`). De job `leerpunt-bewijs` toetst
alleen de vorm; de eigenaar toetst de runs en merget.

## Stappen

1. Leg het scenario vast vóór de eerste run, uit de generieke reproductie van het issue: `Prompt:` (de letterlijke opdracht),
   `Beginstand:` (de SHA van de merge-base en de stappen erop) en `Criterium:` (per run ja of nee, af te lezen aan het
   eindbericht of aan de gekozen commando's).
2. Draai drie runs op de oude tekst, elk als ad-hoc subagent met verse context die alleen leest, met de opdrachttekst
   hieronder.
3. Wijzig de tekst.
4. Draai drie runs op de nieuwe tekst. Alle zes runs met hetzelfde model.
5. Zet de regel en het blok in de sectie `## Leerpunt` van de PR. Er gaat geen transcript mee.

Alleen gedrag dat zichtbaar is in het eindbericht of in de commando's telt. Gedrag dat schrijven vraagt (tests eerst, de vorm
van een commit of PR) krijgt `bewijs geen baseline: <reden>`. Geven alle drie runs zonder de wijziging al ja (`zonder 3/3`),
dan reproduceert het scenario niet: de PR wijzigt de tekst niet en de eigenaar beslist over het leerpunt.

## Opdrachttekst voor één run

Agent- en skilldefinities worden bij de start van een sessie geladen; daarom krijgt elke run de tekst die hij toetst
letterlijk mee.

```text
Je bent één run van een gedragsbaseline (ADR 0107). Alleen lezen: schrijf, commit of push niets.
Beginstand: <sha> — <stappen>.
Voor deze run geldt de tekst hieronder letterlijk; die vervangt <pad> zoals je sessie hem laadde.
<<<
<tekst>
>>>
Opdracht: <Prompt uit het scenario>
Sluit af met een eindbericht van hooguit vijf regels: wat je doet en welke commando's je draait of zou draaien.
```

## Vorm in de PR

```text
## Leerpunt

- #<nr>: trede <Skill|Padregel|AGENTS.md>; bewijs baseline: zonder <a>/3, met 3/3 (<model>)

### Scenario #<nr>
- Prompt: <letterlijke opdracht>
- Beginstand: <sha merge-base>; <stappen>
- Criterium: <ja als …, anders nee>
- zonder 1: nee — <één zin>
- zonder 2: ja — <één zin>
- zonder 3: nee — <één zin>
- met 1: ja — <één zin>
- met 2: ja — <één zin>
- met 3: ja — <één zin>
```

`<a>` is het aantal ja zonder de wijziging (0, 1 of 2); met de wijziging moeten alle drie ja geven. Kan het niet:
`- #<nr>: trede <Skill|Padregel|AGENTS.md>; bewijs geen baseline: <reden>`.
