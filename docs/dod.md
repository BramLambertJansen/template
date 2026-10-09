# Definition of Done

De reviewer bepaalt eerst welke fase uit `docs/roadmap.md` bij het werk hoort. Loop daarna de algemene criteria en alleen de toepasselijke fasecriteria af; noteer bewijs of een concrete reden waarom een criterium niet van toepassing is in de PR.

## Altijd

- [ ] Voer alle toepasselijke checks uit die in `package.json` bestaan en noteer elke exacte opdracht met de uitslag in de PR. Als een vereiste check nog niet bestaat of niet kan draaien, benoem die als niet uitgevoerd; claim geen groen resultaat. Voer nooit een onbekend of alleen gedocumenteerd commando uit alsof het bestaat.
- [ ] Als `check-docs` bestaat, voer die ook uit bij documentatiewijzigingen. Als die nog niet bestaat, meld dat expliciet en controleer handmatig de gewijzigde interne links en verwijzingen op juistheid; deze controle vervangt de ontbrekende check niet.
- [ ] Elk acceptatiecriterium voor gewijzigd gedrag heeft een inhoudelijke test (geen lege of triviale assertie). Bij wijzigingen zonder gedragsverandering, zoals alleen documentatie, noteer je voor dit criterium “n.v.t.” met reden; toepasselijke documentatiechecks blijven verplicht.
- [ ] Geen bestaande migratie of bestaande test gewijzigd. Als zo'n wijziging noodzakelijk lijkt, stop en leg dit voor aan de eigenaar.
- [ ] Laat de status van een spec alleen naar `gebouwd` gaan als er voor dit werk een goedgekeurde spec bestaat en de implementatie is afgerond. Verander nooit zelf een status naar `goedgekeurd`.

## Fase 0 — Bewijs

- [ ] Voor elk bewijscriterium dat de roadmap aan het werk koppelt, noteer de uitvoerder, exacte testopzet en meetbare uitkomst. Bewijs waarvoor de eigenaar de lokale stack moet starten, is niet afgevinkt op basis van alleen code of documentatie.
- [ ] Leg de uitkomst vast in de ADR die de roadmap daarvoor aanwijst; maak geen nieuwe beslissing zonder eigenaarakkoord.

## Fase 1 — Fundament

- [ ] Voor elke gebouwde capability zijn de toepasselijke check, test en documentatie bijgewerkt; roadmap-items blijven open totdat de checkuitslag of het bewijs beschikbaar is.
- [ ] Nieuwe routes gebruiken `defineRoute` met permissie en hebben tests voor verboden rollen. Nieuwe foutcodes hebben een tekst in `src/web/copy/errors.ts`.
- [ ] Nieuwe tabellen hebben RLS aan en geforceerd, expliciete grants en een pgTAP-test per policy.
- [ ] Nieuwe `unsafeCast`-aanroepen hebben een reden.

## Fase 2 — Gouden pad en features

- [ ] Elk acceptatiecriterium uit de goedgekeurde spec is gedekt door een inhoudelijke test; meld ontbrekende criteria afzonderlijk.
- [ ] Bij schermwerk: als `ui:check` in `package.json` bestaat, voer `pnpm ui:check <route>` uit (375 en 1280 px + axe) en noteer de uitslag. Zo niet, vermeld dat de check nog niet beschikbaar is; claim geen UI-check als geslaagd.
- [ ] De feature volgt het gouden pad en de generator uit de roadmap zodra die beschikbaar zijn; als die nog ontbreken, meld dit als open fundamentwerk en verzin geen vervangend commando.

## Fase 3 — Release

- [ ] Volg de releasecriteria uit `docs/framework.md` §10 en de runbook van de gekozen host. Toon bewijs voor staging, schema-compatibiliteit, smoketest en vereiste CI-checks.
- [ ] Productierelease vereist de expliciete goedkeuring van de eigenaar via de beschermde omgeving; een agent voert die goedkeuring of release niet zelf uit.
