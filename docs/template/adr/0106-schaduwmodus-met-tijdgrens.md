# 0106 — Een nieuwe controle draait eerst in schaduw, met een vooraf genoemde drempel en een verplicht besluit

Status: geaccepteerd

Wijzigt [0091](0091-effecttoets-vervalt.md) (het bezwaar tegen alleen loggen onder Alternatieven) en
[0071](0071-rolhek-vooraf-vaste-lijst.md) punt 6; de effecttoets zelf komt niet terug. Drempel: A4 (wijzigt twee
geaccepteerde ADR's) en A3 (een nieuwe controle blokkeert tijdens haar schaduwperiode nog niet). Randvoorwaarde: R-PRINC-09
en R-PRINC-10, geen bestaande controle wordt zachter. Golf 4c van het overnameplan (review 2026-11-18, §6). De merge door de
eigenaar is het besluit.

## Context

Meer dan 22.000 regels werkstraat zijn gebouwd en later weer verwijderd. De effecttoets gaf op 12 november 2026 ruim 340
meldingen in één sessie, geen ervan een overtreding, en blokkeerde de Stop-hook, `pnpm pr:verify` en `pnpm pr:merge` (0091).
ADR 0071 punt 6 had een schaduwmodus met meetreeks; die verviel met de effecttoets. ADR 0091 wees "alleen loggen" af omdat
niemand het log leest tot het misgaat. Dat bezwaar geldt voor een log zonder einde, niet voor een log met een vaste einddatum
en een besluit dat niet kan uitblijven.

De bouwstenen bestaan: de meetopslag per sessie (`rails/hooks/lib/meting.mjs`, buiten git in `<git common dir>/agent-meting`,
alleen tellingen en sleutels, overzicht `pnpm meting`) en de ratchet met de kanalen `meldingen` ("let op", nooit een andere
exitcode) en `strikt` (altijd rood, nooit in de baseline) (0065). In CI is elke overgeslagen test rood (0088 punt 3).

## Besluit

1. **Wat in schaduw mag.** Een nieuwe hook in `rails/hooks/`, een nieuwe check in `scripts/kit/` of een gate, of een eigen
   lintregel mag eerst alleen loggen. Dat geldt ook voor het nieuwe deel van een aangescherpte controle; het bestaande deel
   blijft hard. De spec kiest schaduw, het is geen plicht. Een controle die al hard is, gaat nooit terug naar schaduw (R-PRINC-09).
2. **Altijd meteen hard:** auth en sessies (R-AUTH), permissies en `can()` (R-CODE-03, R-TEST-03), RLS, grants, rollen en
   `security definer` (R-DB-01, R-DB-05, R-DB-09, R-CODE-08), geheimen en env (R-SEC-05, R-SEC-06, R-LAAG-08), foutlek, CSRF,
   headers en rate limit (R-SEC-01 t/m R-SEC-04, R-SEC-08), dependencies en supply chain (R-SEC-06), het rolhek voor `.git`,
   zelfladende paden, GitHub-schrijfacties, identiteit en tests skippen of verwijderen (0071 punt 1 en 2, R-ROL-03), skippen in
   CI (0088 punt 3), ruleset en vereiste checks (R-CI-01, R-CI-07, R-REPO-02), negatieve securitytests (R-TEST-04), en een
   rail-fix na een fout die doorglipte (R-PRINC-04). Bij twijfel: hard.
3. **Register met een drempel vooraf.** Elke controle in schaduw staat in `.kit/schaduw.json` (beschermd) met naam, spec, de
   R-id's die ze dient, startdatum, einddatum (hoogstens 14 dagen na de start) en de drempel: welke uitslag "hard" betekent
   (standaard: hoogstens één valse treffer op tien, en ten minste één terechte), welke "aanpassen" en welke "verwijderen".
   Zonder drempel en einddatum geen schaduw.
4. **Waar treffers landen.** Een hook schrijft een meetregel `Schaduw` met controle en sleutel in de meetopslag, nooit inhoud.
   Een check in CI meldt via het kanaal `meldingen` met het voorvoegsel `schaduw:`; de exitcode verandert niet. Een controle in
   schaduw draait volledig, nooit als skip.
5. **De tijdgrens dwingt het besluit af.** In het kanaal `strikt` komt `schaduw-termijn`. Die is rood zodra de commitdatum
   van HEAD na de einddatum ligt en de controle nog in het register staat; drie dagen eerder geeft hij "let op". De commitdatum
   telt, niet de klok, zodat dezelfde commit dezelfde uitslag geeft. Verlengen kan niet.
6. **Het besluit.** Vóór de einddatum legt de hoofdsessie een PR voor met de tellingen (`pnpm meting --schaduw` en de
   meldingen uit CI), de drempel en één uitkomst: **hard** (de controle blokkeert en verdwijnt uit het register),
   **aangepast** (één keer een nieuwe periode van hoogstens 14 dagen) of **verwijderd** (code en registerregel weg). De merge
   door de eigenaar is het besluit.
7. **R-PRINC-10 blijft heel.** Een controle in schaduw blokkeert niets en telt dus niet als controle. Haar verwijderen haalt
   niets weg wat blokkeerde. Het regelboek noemt haar pas als ze hard wordt (R-DOC-10); tot dan staat ze in het register en
   in haar spec.

## Alternatieven

- **Elke nieuwe controle meteen hard (nu):** de bouw- en sloopkosten en wrijving zoals bij de effecttoets blijven.
- **Een log zonder einde (de oude schaduwmodus van 0071 punt 6):** het bezwaar uit 0091 geldt, niemand leest het.
- **Een grens in aantal PR's of treffers:** zegt bij weinig verkeer niets en eindigt dan nooit; het aantal treffers telt mee
  in de drempel, niet in de grens.
- **Een roadmap-item met datum:** de roadmap houdt geen status in een datum bij (`docs/roadmap.md`) en er wordt niets rood.
- **De klokdatum in de check:** een oude commit wordt achteraf rood, en dezelfde run geeft dan niet altijd dezelfde uitslag.

## Gevolgen

- Bouw-PR (volledige route, tests eerst): het register met schemacheck; `schaduw-termijn` in `strikt`; het voorvoegsel
  `schaduw:` in `meldingen`; de meetregel `Schaduw` in `rails/hooks/lib/meting.mjs` met `pnpm meting --schaduw`; de norm in het
  regelboek (§4 of een nieuwe R-id onder R-PRINC); `docs/` bijgewerkt.
- Falende fixtures (R-PRINC-04): een registerregel zonder drempel of einddatum; een einddatum later dan 14 dagen na de start;
  een R-id uit de lijst van punt 2; een tweede aanpassing; HEAD na de einddatum geeft rood, drie dagen ervoor "let op" met
  exit 0; een schaduwcheck die skipt.
- Na de einddatum is elke PR rood tot het besluit gemerged is, ook een PR die er niets mee te maken heeft. Dat is de bedoeling.
- De meetopslag is lokaal. Treffers van hooks op een andere machine of in de cloud ontbreken; dat risico is aanvaard.
- Klaar als: de fixtures falen op de code van vóór de bouw-PR en zijn groen erna, en `pnpm ratchet` toont `schaduw-termijn`
  in `strikt`.
