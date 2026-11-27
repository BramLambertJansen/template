---
name: nachtrun
description: Een opdracht afmaken zonder de eigenaar, bijvoorbeeld 's nachts. Eerst een vragenronde, daarna doorwerken met voorlopige en geparkeerde besluiten, tot slot een ochtendrapport. Alleen de hoofdsessie, alleen op verzoek van de eigenaar.
allowed-tools: Bash(node scripts/kit/feiten.mjs *)
---

# Nachtrun

ADR 0115, spec `nachtrun`. Alle andere regels gelden onverkort; dit verandert alleen wanneer je vraagt.

Feiten nu:

!`node scripts/kit/feiten.mjs besluiten`

## 1. Vragenronde (de eigenaar is er nog)

1. Lees de opdracht en de taakrelevante feiten. Maak een takenlijst met per taak: doel, spec (of: nog te schrijven),
   de check die bewijst dat hij klaar is, en waar hij van afhangt.
2. Zoek per taak de keuzes die je straks níet zelf mag maken (punt 2 hieronder) en stel ze allemaal in één gebundelde
   vraagprompt. Omkeerbare details vraag je niet; die kies je straks zelf.
3. Meld daarna in één bericht: de takenlijst, wat je voorlopig zult kiezen, en wat geparkeerd wordt als het antwoord
   uitblijft. Start pas na "go" of het antwoord van de eigenaar.

## 2. Mandaat na de start

Stel geen vragen meer. Kies zelf (`⏳ voorlopig`) als alles geldt:

- terug te draaien in een vervolg-PR;
- binnen de spec, of een keuze die de bouwer ook zonder spec mag maken;
- geen ontwerpkeuze over een beschermd pad (besluit `eigenaar` of `besluit-pr`: `node scripts/kit/feiten.mjs pad <pad>`),
  geen nieuwe dependency, geen auth of security, geen dataverlies, geen handeling buiten de repo.

Anders `⏸ geparkeerd`, en altijd bij: een fix die een regel, check, hook of test afzwakt; een spec die zichzelf tegenspreekt;
een regel die de opdracht in de weg staat; twee mislukte pogingen (R-WERK-20, ADR 0105); een stopgrond van `opleveren`
behalve de CI-lus; een vraag van Claude Code of het rolhek die niemand beantwoordt. Een geparkeerde taak stopt; ga door met
de volgende taak die er niet van afhangt.

Leg elke keuze vast in `## Open vragen` van de spec, in deze vorm (één regel per punt):

```markdown
- **OV-3 ⏳ voorlopig** — <vraag>; gekozen: <keuze>, omdat <reden> (agent, <datum>)
- **OV-4 ⏸ geparkeerd** — <vraag>; nodig: <wat de eigenaar moet beslissen> (agent, <datum>)
```

Zonder spec komen ze in de PR-beschrijving, onder `## Voorlopige keuzes` en `## Geparkeerd`. Noem elke voorlopige keuze ook
in de PR, zodat de eigenaar haar bij de merge ziet; de markering blijft staan tot hij beslist.

## 3. Doorwerken

- Per taak de gewone route (framework §8): spec waar nodig, bouwer, reviewer, dan de skill `opleveren`.
- Merges zoals ADR 0069: zonder beschermd pad merge je zelf via `pnpm pr:merge`. Met beschermd pad wacht de PR op de
  eigenaar; bouw je erop voort, dan start de volgende branch vanaf die branch en krijgt de PR die branch als `base`.
- Commit- en PR-tekst en lees- of rekenscripts in `.tmp/<bestand>` van je werkmap.
- In de cloud open je de PR met `mcp__github__create_pull_request`, met de eigen werkbranch als `head`: het rolhek geeft dan allow.

## 4. Ochtendrapport

Het eindbericht van de sessie, kort:

1. Per taak: PR-nummer, CI-uitslag, gemerged of wacht op de eigenaar (en waarom), of geparkeerd.
2. De uitvoer van `node scripts/kit/feiten.mjs besluiten`: eerst wat geparkeerd is, dan de voorlopige keuzes.
3. Vervolgtaken en wat niet gemeten kon worden.

Herzien: de eigenaar antwoordt per OV-id. Een volgende sessie verwerkt het antwoord in een vervolg-PR en zet de markering op
`✅ besloten`.
