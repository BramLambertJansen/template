---
status: voorstel # voorstel | goedgekeurd | vervallen — architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd volgt uit de AC-dekking (ADR 0104)
namespace: stijlladder
---

# Stijlladder: een app maakt haar eigen stijl af, trede voor trede

Derde van drie specs voor "Designsystem → Appstyling" (besluiten van de eigenaar, 2026-11-15). De specs [app-thema](app-thema.md)
en [schillen](schillen.md) leveren de middelen; deze spec legt vast in welke volgorde een agent ze gebruikt, wie beslist, wat er
wordt vastgelegd en welke check dat bewaakt. Bouwt voort op de spec [ontwerp-overnemen](ontwerp-overnemen.md) (gebouwd).

Aanleiding: de strenge basis (de rail die losse styling in `features/` en `routes/` verbiedt) blijft, maar elke app moet er echt
uniek uit kunnen zien, zonder dat ze voor elke wens op de template wacht en zonder dat agents stijl laten uitdijen.

Raakt agentinstructies, een skill en een gate: beschermde paden, elk met eigenaarakkoord (R-REPO-03).

## Doel

Een agent die een scherm of een aangeleverd ontwerp vormgeeft, kiest aantoonbaar de laagste trede die volstaat, maakt het werk
in de app zelf af, en legt elke stap boven de vrije treden vast, zodat herbruikbare stijl in variabelen, componenten en
layouts terechtkomt en een uitzondering een bewuste keuze is.

## Rollen en wie wat ziet

| Wie | Doet |
|---|---|
| eigenaar | zegt wat hij mooi vindt of levert een ontwerp; keurt trede 5 en 6 goed; beslist bij een verschil tussen ontwerp en toegankelijkheid niets, want toegankelijkheid wint |
| agent die de stijl uitwerkt (de rol die de skill `ontwerp-overnemen` uitvoert, OV-1) | nodigt uit, kiest de trede, beslist zelf op trede 1 t/m 4, stelt trede 5 en 6 voor met reden |
| developer | bouwt op de gekozen trede; mag geen hogere trede nemen dan het register toestaat |
| reviewer | toetst of een lagere trede had volstaan en of het register klopt met de diff |

## De ladder

Eerst de laagste trede proberen; pas omhoog als die aantoonbaar niet volstaat.

| Trede | Middel | Plek | Wie beslist | Vastleggen |
|---|---|---|---|---|
| 1 | semantisch token | `src/web/styles/theme.css` | agent | mappingdocument |
| 2 | componenttoken (spec app-thema) | `src/web/styles/theme.css` | agent | mappingdocument |
| 3 | bestaande variant, prop of layoutcomponent van de kit kiezen | `features/` | agent | niets |
| 4 | nieuwe variant in een bestaand recept, afgeleid en niet geforkt (R-UI-02) | `src/web/ui/` | agent | stijlregister |
| 5 | eigen component of eigen schil/layout, gebouwd uit kitonderdelen en tokens | `src/web/ui/` | eigenaar | stijlregister, met akkoord |
| 6 | uitzondering: een onderdeel dat niet uit kitonderdelen te bouwen is | `src/web/ui/` | eigenaar | stijlregister, met akkoord en reden waarom 1 t/m 5 niet volstaan |

Op elke trede gelden de rails onverkort: geen kleur, typografie of arbitrary values in `features/` en `routes/`; de kitrail
uit de spec app-thema in `src/web/ui/`; contrast, 44 px, de focusring en axe. Trede 6 is een uitzondering op "uit kitonderdelen",
nooit op toegankelijkheid of op de rails. Core blijft in een app dicht (R-ARCH-07): geen enkele trede wijzigt `src/core`.

## Hergebruik en UX

- **Stijlregister**: `docs/ontwerp/register.md` in de app, één tabel met een rij per onderdeel op trede 4, 5 of 6:

  | Onderdeel | Trede | Reden dat een lagere trede niet volstond | Besluit | Generiek |
  |---|---|---|---|---|
  | `src/web/ui/<bestand>.tsx` | 4, 5 of 6 | één zin | trede 4: "agent"; trede 5 en 6: PR-nummer of datum van het akkoord van de eigenaar | "nee", of het nummer van het leerpunt |

  De template levert het sjabloon met een lege tabel; de bestaande app-componenten van de template (`Section`, `TokenSwatch`,
  `TypeSample`) staan er als trede 5 met besluit "template".
- **Check** `pnpm check:stijl` (in `gate:fast`): elk bestand in `src/web/ui/` dat een component exporteert, heeft precies één
  rij; elke rij wijst naar een bestaand bestand; trede 5 en 6 hebben een besluit dat geen "agent" is; een rij met "Generiek"
  anders dan "nee" noemt een nummer. Het aantal rijen op trede 6 staat in de ratchet-baseline: stijgen is een gate-wijziging
  (R-CI-02).
- **Een app maakt zichzelf af.** Past iets niet op trede 1 t/m 3, dan bouwt de app trede 4 of hoger in haar eigen
  `src/web/ui/` en wacht niet op de template. Een leerpunt naar de template (`node scripts/kit/leerpunt.mjs`) alleen als de
  behoefte generiek is: een tweede app zou hetzelfde nodig hebben. De kolom "Generiek" legt die afweging vast.
- **Aangeleverd ontwerp.** Ontwerpen komen binnen als export in `designs/` (geen koppeling met een ontwerptool). De agent
  werkt het ontwerp zo ver mogelijk af; alles wat op meer dan één plek terugkomt, wordt een token, een variant, een component
  of een layout en geen herhaalde opmaak. Het mappingdocument (`docs/ontwerp/<bron>.md`) krijgt twee secties erbij:
  "Ladder" (per onderdeel van het ontwerp de gekozen trede) en "Afwijkingen van het ontwerp".
- **Toegankelijkheid wint van het ontwerp.** Haalt een ontwerp het contrast, het aanraakdoel of de focusring niet, dan benadert
  de agent het zo dicht mogelijk binnen de eis en meldt het verschil in "Afwijkingen van het ontwerp" (wat het ontwerp vroeg,
  wat gebouwd is, welke eis). Er is geen akkoord dat de eis opzij zet.
- **Uitnodigen.** De agent vraagt de eigenaar actief om stijlinvoer, op twee momenten en niet vaker:
  1. bij de eerste featurespec van een app: het aanbod van een stijl-PR vóór de eerste feature. Aangeboden, niet verplicht;
  2. daarna alleen bij het eerste scherm van een nieuwe soort (lijst, detail, formulier, dashboard, stappen, leeg startscherm,
     of een soort die de app zelf toevoegt).

  Het antwoord staat in `docs/ontwerp/stijl.md` (sjabloon in de template): of de stijl-PR is aangenomen, afgeslagen of gedaan,
  de aangeleverde referenties, en per schermsoort of de vraag gesteld is. Wat daar staat, vraagt de agent niet opnieuw.
- **Alle zichtbare tekst letterlijk** (vragen aan de eigenaar, in de skill):

  | Moment | Tekst |
  |---|---|
  | Aanbod stijl-PR | "Wil je eerst de stijl van de app vastleggen, vóór het eerste scherm? Je kunt een website delen die je mooi vindt en zeggen wat je eraan mooi vindt, een screenshot sturen van de stijl die je zoekt, of een ontwerp aanleveren. Sla je dit over, dan begin ik met de standaardstijl en kun je later altijd bijsturen." |
  | Eerste scherm van een nieuwe soort | "Dit is het eerste scherm van de soort '{soort}'. Heb je een voorbeeld van hoe zo'n scherm eruit moet zien, of zal ik de stijl van de rest van de app volgen?" |
  | Voorstel trede 5 of 6 | "Voor '{onderdeel}' volstaat geen bestaand component. Voorstel: {voorstel}. Lagere treden die ik heb geprobeerd: {treden en waarom niet}. Akkoord?" |

- **Bestaande onderdelen**: de skill `ontwerp-overnemen`, `docs/ontwerp/_template.md`, `scripts/kit/ontwerp-meten.mjs`,
  `scripts/kit/leerpunt.mjs`, `node scripts/kit/feiten.mjs tokens componenten`. Nieuw: het register, `stijl.md` en de check.
- **Staten, focus en toetsenbord**: geen scherm; deze spec levert werkwijze, documenten en een check.

## Kopieer de vorm van

- `scripts/kit/check-koppelingsvorm.mjs` — check die een vaste vorm per onderdeel afdwingt en het bestand noemt.
- `scripts/kit/catalogus.mjs` — exports van `src/web/ui` vinden via de bron, niet met een regex (R-CODE-01).
- `scripts/kit/ratchet.mjs` — een telling die niet mag stijgen zonder gate-wijziging.
- `docs/ontwerp/_template.md` — het mappingdocument dat twee secties erbij krijgt.
- `test/rails/catalogus.test.ts` — tabeltests met falende fixtures voor een check op de kit.

## Acceptatiecriteria

- **stijlladder/AC-1** — Gegeven een bestand in `src/web/ui/` dat een component exporteert zonder rij in
  `docs/ontwerp/register.md`, of een rij zonder bestaand bestand, of twee rijen voor één bestand, dan faalt `pnpm check:stijl`
  en noemt hij het pad. Toets: `test/rails/check-stijl.test.ts` (nieuw)
- **stijlladder/AC-2** — Gegeven een rij op trede 5 of 6 met besluit "agent" of zonder besluit, of een rij op trede 6 zonder
  reden, dan faalt de check. Toets: `test/rails/check-stijl.test.ts` (nieuw)
- **stijlladder/AC-3** — Gegeven een rij met een trede buiten 4, 5 en 6, of "Generiek" dat geen "nee" en geen nummer is, dan
  faalt de check. Toets: `test/rails/check-stijl.test.ts` (nieuw)
- **stijlladder/AC-4** — Gegeven meer rijen op trede 6 dan de baseline, dan faalt `pnpm ratchet`; minder dan de baseline faalt
  tot `pnpm ratchet:update`. Toets: `test/rails/check-stijl.test.ts` (nieuw)
- **stijlladder/AC-5** — Gegeven de template zelf, dan slaagt `pnpm check:stijl`: elk component in `src/web/ui/` heeft een rij. Toets: `test/rails/check-stijl.test.ts` (nieuw)
- **stijlladder/AC-6** — Gegeven `docs/ontwerp/_template.md`, dan heeft het de secties "Ladder" en "Afwijkingen van het
  ontwerp" met hun kolomkoppen, en `docs/ontwerp/stijl.md` de secties "Stijl-PR", "Referenties" en "Schermsoorten". Toets: `test/docs/ontwerp-sjablonen.test.ts` (nieuw)
- **stijlladder/AC-7** — Gegeven de skill `ontwerp-overnemen`, dan noemt hij de zes treden in volgorde, wie per trede beslist,
  de twee uitnodigingsmomenten, `docs/ontwerp/stijl.md`, het register en de regel dat toegankelijkheid wint (structuurtest:
  koppen, paden en trede­nummers, geen hele zinnen, R-TEST-02). Toets: `test/docs/ontwerp-skill.test.ts` (nieuw)
- **stijlladder/AC-8** — Gegeven een mappingdocument van een aangeleverd ontwerp met een rij in "Afwijkingen van het ontwerp",
  dan heeft die rij de drie velden (gevraagd, gebouwd, eis); een rij zonder eis laat `check-docs` falen. Toets: `test/rails/check-docs-ontwerp.test.ts` (nieuw)
- **stijlladder/AC-9** — Gegeven `docs/ontwerp/stijl.md` waarin de stijl-PR als afgeslagen staat, dan faalt geen check en geen
  gate daarop: het aanbod is niet verplicht. Toets: `test/rails/check-stijl.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Een variant (trede 4) blijkt later in twee apps nodig | leerpunt naar de template; de app houdt haar variant tot de template-update hem levert, daarna vervalt de rij |
| Een eigen component wordt verwijderd | de rij verdwijnt in dezelfde PR, anders faalt de check |
| Het ontwerp gebruikt een lettertype zonder licentie voor zelf hosten | niet overnemen; in "Bewust buiten" met de reden (spec semantische-tokens) |
| De eigenaar levert midden in een project een nieuw ontwerp | modus "bestaande stijl plus referentie" van de skill; het register blijft, rijen wijzigen alleen als het onderdeel wijzigt |
| Een agent zonder de skill (andere runtime) | de check en de rails gelden in CI; de uitnodiging is alleen een instructie (R-WERK-23) |
| Onderdeel past op trede 3 maar de agent bouwt trede 4 | de check ziet dat niet; de reviewer toetst het (checklist) |

## Raakt ook

- `.claude/skills/ontwerp-overnemen/SKILL.md`, `.claude/skills/nieuw-component/SKILL.md`, `.claude/skills/nieuw-scherm/SKILL.md`,
  `.claude/agents/architect.md` (het aanbod bij de eerste featurespec), `.claude/agents/reviewer.md` en
  `docs/operations/review-checklists.md` ("had een lagere trede volstaan?"): beschermde paden.
- `scripts/kit/gates.mjs` (nieuwe check in `gate:fast`) en `.kit/baseline.json` (telling trede 6): gate-paden.
- `docs/framework.md` §7: R-UI-03 verwijst naar de ladder in plaats van "stop en stel variant voor"; een nieuwe regel legt
  vast wie per trede beslist. `docs/gouden-pad.md`, `docs/ui-ux-patterns.md`, `docs/nieuwe-app.md` (de openingsopdracht noemt
  het aanbod van de stijl-PR).
- De spec ontwerp-overnemen: het mappingdocument krijgt twee secties via een specwijziging.
- Leeslast van de agent: meet vóór en na met `pnpm leespad` (R-PRINC-07).

## Buiten scope

- De middelen zelf: componenttokens en thema's (spec app-thema), schillen en het frame (spec schillen).
- Een automatische toets of een lagere trede had volstaan; dat blijft review.
- Een koppeling met een ontwerptool; een componentbibliotheek in een ontwerptool.
- Een aparte agentrol voor UI (OV-1).

## Testplan

- Tabeltests voor `check:stijl` met falende fixtures per regel (R-PRINC-04), en de template zelf als slagend geval.
- Structuurtests op de skill en de sjablonen.
- Meting vóór en na (`pnpm meting --pr-tabel --branch <naam>`, `pnpm leespad`); de eerste app die de ladder gebruikt levert
  de praktijkuitslag als leerpunt.
- `pnpm gate:fast` en `pnpm ratchet` groen; uitslag in de PR.

## Open vragen

Een vraag zonder aanbeveling (de eigenaar kiest) blokkeert `goedgekeurd`; een vraag met aanbeveling mag blijven staan. `check-docs` telt elke regel in deze sectie met het waarschuwingsteken en "open" (ook met U+FE0F of hoofdletter, ook zonder opsommingsteken).

- **OV-1** — Een aparte agentrol voor UI naast architect, developer, reviewer, tester en docs. Aanbeveling: nee; de skill
  `ontwerp-overnemen` versterken en de architect het aanbod laten doen. Een zesde rol kost overdracht en leeslast, en de
  ladder werkt ook zonder.
- **OV-2 ✅ besloten** — De agent beslist op de lagere treden; alleen eigen componenten en layouts vragen de eigenaar (2026-11-15).
- **OV-3 ✅ besloten** — Toegankelijkheid wint van een aangeleverd ontwerp: benaderen en het verschil melden (2026-11-15).
- **OV-4 ✅ besloten** — De stijl-PR vóór de eerste feature wordt aangeboden en is niet verplicht; daarna nodigt de agent alleen
  uit bij het eerste scherm van een nieuwe soort (2026-11-15).
- **OV-5 ✅ besloten** — Een leerpunt naar de template alleen bij een generieke behoefte; een app maakt zichzelf af (2026-11-15).
- **OV-6 ✅ besloten** — Ontwerpen komen binnen als export; geen directe koppeling met een ontwerptool (2026-11-15).
- **OV-7** — Valt een nieuwe variant in een bestaand recept (trede 4) onder "agent beslist". Aanbeveling: ja; het besluit van
  2026-11-15 noemt alleen eigen componenten en layouts als eigenaarswerk, en het register maakt elke variant zichtbaar.
- **OV-8** — De vaste lijst schermsoorten voor de tweede uitnodiging. Aanbeveling: lijst, detail, formulier, dashboard, stappen
  en leeg startscherm, aan te vullen per app in `docs/ontwerp/stijl.md`.
