# 0105 — Begrensde fixlus: kleine bevindingen erbuiten, hooguit twee fixrondes, dan beslist de eigenaar

Status: geaccepteerd

Een ADR omdat het een controle lichter maakt (A3): een kleine reviewbevinding hoeft niet meer verwerkt te zijn vóór
oplevering (R-WERK-11). Het maakt de stopregel concreet voor reviewbevindingen (R-WERK-20, CLAUDE.md "Stoppen en vragen")
en verandert de werkwijze in `docs/operations/review-checklists.md`. Wijzigt [0059](0059-leerlus-van-app-naar-template.md)
punt 1: wat een "mislukte correctiepoging" is (punt 6). ADR 0046 punt 25 (fixes na de review ziet de reviewer opnieuw) en de
CI-lus blijven. Drempel: A3 en A4. Golf 4b van het overnameplan
(`docs/reviews/2026-11-18-overnameplan-agentic.md` §6). Voorstel van de hoofdsessie; de merge door de eigenaar is het besluit.

## Context

PR #596 liep acht reviewrondes. De stopregel "na twee mislukte correctiepogingen" maakt geen onderscheid tussen een
reviewronde en een mislukte fix. Elke ronde toetst de hele delta opnieuw, en elke bevinding, ook een kleine, start een nieuwe
fix en dus een nieuwe ronde. De reviewer noemt een bevinding in de codereview nu "blokkerend of niet"; alleen de spec-review
en de UX-modus kennen blokkerend, belangrijk en klein. Het meetdoel van het plan is hooguit drie reviewrondes per PR (§8). `pnpm meting --pr-tabel`
telt de rondes al.

## Besluit

1. **Blokkerend of klein.** Blokkerend is een bevinding die een AC, de spec, een R-regel of `docs/dod.md` breekt, een
   ontbrekende of schijnbare test per AC, een doc die door de diff onwaar wordt (R-WERK-15), en elke bevinding in de klasse
   security, auth, autorisatie, RLS of gegevensisolatie, rolhek of hooks. Die laatste is nooit klein. Al het andere is klein,
   ook "belangrijk". Bij twijfel is een bevinding blokkerend.
2. **Kleine bevindingen gaan nooit in de lus.** Ze starten geen fix en geen ronde. De hoofdsessie zet ze als één lijst onder
   `## Kleine bevindingen` in de PR-beschrijving, met `bestand:regel`. Een generieke les gaat via de leerlus (ADR 0059).
3. **Ronde 1** is één volledige review van de diff (zoals nu).
4. **Ronde 2 toetst alleen de fixdiff.** Ze krijgt de blokkerende bevindingen uit ronde 1 en `git diff <reviewer-sha>..HEAD`.
   Per bevinding is het oordeel `opgelost` of `niet opgelost`. Een nieuwe bevinding mag alleen als de fixdiff zelf een
   blokkerende fout veroorzaakt. De uitzonderingen voor een volledige deelreview blijven: een nieuw bestand, een beschermd pad
   of rail, of een vorige sha die geen voorouder van HEAD is. Ook daar telt alleen blokkerend.
5. **Ronde 3 gaat naar een verse developer.** Dat is een nieuwe developer-subagent die alleen krijgt: de open bevindingen
   (`bestand:regel`, pad van invoer naar fout), de spec en de AC's, en de branch. Hij krijgt niet het eerdere gesprek of de
   eerdere fixpogingen. Daarna volgt een fixdiff-review zoals in punt 4.
6. **Daarna één gebundeld besluit van de eigenaar.** Is na ronde 3 iets niet opgelost, dan stopt de hoofdsessie. Ze legt in
   één vraag (R-WERK-21) per open bevinding voor: de bevinding, beide pogingen in één regel, de opties (eigenaar wijst de fix,
   spec of AC aanpassen, aanvaarden met roadmap-item of leerpunt, PR sluiten) en een aanbeveling. De lijst kleine bevindingen
   gaat mee. Dit is de "tweede mislukte correctiepoging" van R-WERK-20 en ADR 0059 punt 1: de fix na ronde 1 en de fix van de
   verse developer zijn de twee pogingen; een reviewronde is geen poging.
7. **CI-lus en spec-review.** De CI-lus van `opleveren` blijft zonder vast aantal rondes, met haar eigen stopgronden
   (R-WERK-12). Een CI-fix na de review krijgt een fixdiff-review. Een blokkerende bevinding daarin gaat de lus in op de
   stand waar die staat. Voor de spec-review geldt dezelfde lus; daar fixt de architect of de hoofdsessie.

## Alternatieven

- **Alles in de lus, zoals nu:** onbegrensd (#596). Kleine bevindingen kosten even veel rondes als blokkers.
- **Een harde grens van drie rondes zonder verse developer:** dezelfde context herhaalt dezelfde fout.
- **Kleine bevindingen in de volgende push meenemen:** elke push brengt een fixdiff-review mee, dus ze komen via de achterdeur
  terug in de lus.
- **Een verificateur per blokker, of de zekerheid die het model zelf opgeeft:** verworpen in plan §7. Een extra overdracht
  (ADR 0090), slecht gekalibreerd.

## Gevolgen

- Bouw-PR (hoofdsessie, met akkoord van de eigenaar op `.claude/**`). CLAUDE.md "Stoppen en vragen": de pogingsregel noemt
  de fixlus. Framework §8: R-WERK-11 (blokkerend opgelost, klein in de PR-lijst) en R-WERK-20 (poging = fixronde, verwijzing
  naar 0105). `.claude/agents/reviewer.md`: per bevinding `blokkerend` of `klein` volgens punt 1, plus een modus fixdiff met
  `opgelost`/`niet opgelost`. `.claude/agents/developer.md`: de verse ronde-3-opdracht. `.claude/skills/opleveren/SKILL.md`
  stap 4: fixdiff en lus. `docs/operations/review-checklists.md` "Werkwijze".
- R-DOC-02: twee roadmap-items. (a) De SubagentStop-hook (`rails/hooks/lib/werkstraat.mjs`, `reviewerStop`) eist per bevinding
  `blokkerend` of `klein`, en in de fixdiff-modus per bevinding `opgelost` of `niet opgelost`. (b) `pnpm meting` zegt
  "let op" boven drie reviewrondes per branch. Een harde stop bij ronde 4 is niet afdwingbaar, want de rondetelling is lokaal.
- Aanvaard risico: een kleine bevinding blijft open tot de eigenaar haar oppakt. Daar staat tegenover dat security nooit klein
  is en dat bij twijfel blokkerend geldt.
- Klaar als: de bouw-PR de genoemde teksten wijzigt en de twee roadmap-items bestaan; meten volgens plan §8 over de volgende
  tien PR's.
