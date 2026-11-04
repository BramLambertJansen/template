# 0078 — Eén padtabel voor schrijfniveau en besluit

Status: geaccepteerd

Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 27 (de lijst `voorReview` wordt een kolom van de padtabel),
[0062](0062-spec-en-bouw-in-een-pr.md) punt 2 (de kritieke paden komen uit de padtabel) en
[0069](0069-agent-merge-niet-kritiek.md) punt 1 (`agentMerge.toegestaan` en `agentMerge.kritiek` worden de kolom `besluit`).
Drempel: A4 (afspraken uit geaccepteerde ADR's; de bouw raakt rolhek, lane en agent-merge). Uitwerking:
[spec](../specs/padtabel.md). Aanleiding: vraag van de eigenaar op 4 november 2026 ("Staan er zaken in het framework die te
complex zijn opgezet?"), bevinding A en B.

## Context

Hoe zwaar een pad beschermd is, staat op zes plekken: in `.claude/gates.json` de lijsten `gates`, `voorReview`,
`altijdVragen`, `agentMerge.toegestaan` en `agentMerge.kritiek`, en in code de vaste lijst `KRITIEK` in `scripts/kit/lane.mjs`
(auth, gegevensisolatie, `db/init`, hookcode en dertien scripts). Een agent die wil weten wat voor één pad geldt, moet zes
lijsten afwegen; `check-docs` bewaakt met aparte spiegelregels dat ze niet uit elkaar lopen (`voorReview` ⊆ gates,
`altijdVragen` ⊆ `voorReview`, geen bewaakt pad agent-mergebaar).

Daarbij bestaan drie definities van "kritiek": R-WERK-05 (besluit-PR), `KRITIEK` plus `altijdVragen` in `lane.mjs` (besluit-PR)
en `agentMerge.kritiek` (alleen: de eigenaar merget). Dezelfde naam voor twee gevolgen leidt tot verkeerde afwegingen.

Bevinding B: `.claude/decisions.json` bevat naast `requiredChecks` 26 besluitrecords die sinds ADR 0063 punt 5 niets meer
geven (R-WERK-24). Ze worden nog gelezen en gevalideerd, en een lezer moet weten dat ze niets betekenen.

## Besluit

1. **Eén tabel.** `.claude/gates.json` krijgt `paden`: een object met een glob als sleutel (dus nooit dubbel) en per glob
   `schrijven` (`gate`, `voorReview` of `altijdVragen`; ontbrekend = vrij) en `besluit` (`agent`, `eigenaar` of
   `besluit-pr`; ontbrekend = eigenaar). Per kolom wint de strengste waarde over alle passende globs; de volgorde doet er
   niet toe. Een pad zonder passende glob is vrij en eigenaar.
2. **Alles wordt afgeleid.** Eén functie in `rails/hooks/lib/` levert het niveau van een pad en de lijsten die rolhek,
   diff-guard, lane en agent-merge nu lezen: gates (schrijven ≥ `gate`, behalve de bestanden in `jsonGates`), `voorReview`,
   `altijdVragen`, de kritieke paden (`besluit-pr`) en het padgedeelte van agent-merge (strengste besluit `agent` en
   schrijven vrij). De vaste lijst `KRITIEK` verdwijnt uit `lane.mjs`. De structurele vangnetten blijven in code: vanzelf
   geladen bestanden, contracten, testpaden, omvang, permissieregels, migratie-inhoud en de bekende mappen van de lane.
3. **Samenhang in plaats van spiegeling.** `check-docs` eist: `altijdVragen` ⇒ `besluit-pr`; schrijven ≥ `gate` ⇒ besluit niet
   `agent`; een onbekende waarde, onbekende sleutel of rij zonder kolom is rood. De spiegelingen naar CODEOWNERS (= alle
   globs met `schrijven`) en naar de Edit-`ask` in `.claude/settings.json` (= `altijdVragen`) blijven. Bij het lezen krijgt
   een onleesbare rij het strengste niveau in beide kolommen.
4. **Eén definitie van kritiek.** Kritiek (R-WERK-05) is: besluit `besluit-pr` in de padtabel, plus de inhoudsregels uit 0062
   punt 2 die geen pad zijn (migraties). Wat alleen de eigenaar merget, heet voortaan `besluit: eigenaar`, niet meer
   "kritiek". Elk ADR is `besluit-pr`.
5. **Niets wordt losser.** De bouw-PR verandert voor geen pad de uitkomst, behalve strenger. Een test zet de lijsten van main
   30cc352 plus de oude `KRITIEK` naast de nieuwe tabel, per getrackt pad en per glob.
6. **Overgang.** De lezer accepteert de oude vorm (zonder `paden`) en de nieuwe; beide tegelijk is ongeldig en faalt dicht.
   Hooks, diff-guard en `pr:merge` lezen `gates.json` uit main of het anker terwijl de bouw-PR open staat, en oude commits
   houden de oude vorm.
7. **Het niveau lezen, niet afwegen.** `node scripts/kit/feiten.mjs pad <pad>` toont voor één pad beide kolommen en de globs
   waar ze vandaan komen.
8. **Register zonder dode records (B).** `.claude/decisions.json` houdt alleen `version` en `requiredChecks`. De lezer
   accepteert een ontbrekende `decisions` en leest een oud register met records nog (oude commits, bouwbewijs).
9. **Terugval.** Blijkt na de bouw-PR één pad losser beoordeeld dan ervoor, dan gaat de bouw-PR terug. De eigenaar beslist.

## Alternatieven

- **Alleen de spiegelregels aanscherpen.** Houdt zes plekken en drie betekenissen van kritiek. Lost de afweging niet op.
- **Een geordende lijst regels (eerste treffer wint).** Korter voor uitzonderingen, maar de volgorde wordt betekenis:
  een verschoven regel maakt een pad stil losser. Strengste-wint heeft die faalwijze niet.
- **`KRITIEK` in code houden.** Dan blijft er een tweede bron voor besluit-pr die niet in `gates.json` staat en die een app
  niet kan zien of aanvullen.
- **Records in `decisions.json` laten staan.** Kost niets aan gedrag, maar elke lezer moet blijven weten dat ze niets doen.

## Gevolgen

- Eén plek per pad. Een nieuw beschermd pad is één rij; de samenhangregels houden een rij die zichzelf tegenspreekt tegen.
- De meeste spiegelregels in `check-docs` vervallen; de gelijkwaardigheidstest komt erbij.
- Een branch met oude code die na de merge `gates.json` uit main leest, faalt dicht (rolhek weigert, agent-merge zegt nee)
  tot hij op main is gebaseerd.
- Tests die de ruwe vorm van `gates.json` lezen of samenstellen, lezen de afgeleide lijsten; hun verwachte uitkomsten blijven
  gelijk (spec, R-TEST-02).
- `docs/adr/**` wordt ook voor de lanetoets en agent-merge expliciet `besluit-pr`; daar waren ADR's al dicht, dus geen
  zichtbare verandering.
