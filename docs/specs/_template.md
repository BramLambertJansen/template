---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd: `status: gebouwd` in de bouw-PR (ADR 0095)
namespace: <resource>
---

# <Feature>

Verplicht: Doel, Rollen en wie wat ziet, Acceptatiecriteria, Hergebruik en UX, Open vragen. Ook verplicht zodra het werk het
raakt: Datawijzigingen (met grants) bij een migratie, Routes en foutcodes bij een route of permissie, Koppeling bij een externe
dienst, Raakt ook bij risicowerk (R-WERK-04). Laat een andere kop weg als hij niet van toepassing is (geen "n.v.t."-regels);
de spec-review toetst of er niets ontbreekt. Ontbreekt een antwoord, dan vraagt
de agent het.

## Doel

<één zin>

## Rollen en wie wat ziet

## Datawijzigingen (met grants)

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

Bij routes: beschrijf per padparameter de vorm, het contractschema, de foutcode en validatie vóór een externe aanroep.
Leg de foutvolgorde en eventuele voor-stappen vast, met gecombineerde foutgevallen als acceptatiecriteria;
zie "Padparameters en foutvolgorde" in `docs/gouden-pad.md`. Zonder routes: "n.v.t. — reden".

## Koppeling

Zonder externe dienst: "n.v.t. — reden". Anders volgens de skill `nieuwe-koppeling` en het app-ADR dat de partner noemt.
Indeling: machtiging, richting, ritme, gevoeligheid, kosten en quota, bron van waarheid; elke waarde gebouwd volgens
`node scripts/kit/feiten.mjs koppelingen`. Per aanroep:

| Methode | Padsjabloon | Time-out | Herhaalbaar | Schema | Foutcode |
|---|---|---|---|---|---|

## Kopieer de vorm van

Per regel een bestaand pad uit `docs/gouden-pad.md` (accountbeheer) en wat je overneemt; `check-docs` controleert het pad.

- `src/api/routes/accounts.ts` — <wat je overneemt>

## Hergebruik en UX

- Bestaande componenten:
- Staten per scherm: laden, leeg, fout, bezig, gelukt, verouderd
- Alle zichtbare tekst letterlijk:
- Focusvolgorde en toetsenbord:

## Acceptatiecriteria

Elk criterium eindigt met `Toets:` en het testbestand dat `<namespace>/AC-n` noemt, met `(nieuw)` erachter zolang het niet
bestaat; de bouw-PR haalt `(nieuw)` weg, dan toetst `check-docs` het pad en de naam. Is het bewijs alleen een CI-uitslag of
een stap in de PR, dan is het geen criterium maar een regel in het Testplan.

- **<namespace>/AC-1** — Gegeven … wanneer … dan … Toets: `test/<pad>.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|

## Raakt ook

## Buiten scope

## Testplan

## Open vragen

Een vraag zonder aanbeveling (de eigenaar kiest) blokkeert `goedgekeurd`; een vraag met aanbeveling mag blijven staan. `check-docs` telt elke regel in deze sectie met het waarschuwingsteken en "open" (ook met U+FE0F of hoofdletter, ook zonder opsommingsteken).

- **OV-1 ⚠ open** — <vraag>; <opties> (geen aanbeveling: de eigenaar kiest)
- **OV-2** — <vraag>; <opties>. Aanbeveling: <keuze en reden>
- **OV-3 ✅ besloten** — <besluit en reden>
