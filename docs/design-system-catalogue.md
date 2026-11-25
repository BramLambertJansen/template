# De UI-catalogus gebruiken

De adminpagina `/design-system` is de gereedschapskist van de app: dezelfde UI-kit als de app, met live voorbeelden in
het echte thema ([spec designsystem-toolbox](template/specs/designsystem-toolbox.md)). Bovenaan staat de **Componentenindex**:
zoeken op naam of variant, met de zoekparameter `q`. De lijst met alle componenten (ook interne onderdelen, met tabblad,
varianten en een knop Toon) staat dicht en gaat open zodra je zoekt. Bronpad en importnaam staan niet op de pagina; die
vraag je op met `node scripts/kit/feiten.mjs componenten` ([ADR 0048](template/adr/0048-ui-catalogus.md)).

Onder de index staan de voorbeelden, verdeeld over tabbladen. De zoekparameter `vak` opent het bijbehorende tabblad. Op `/design-system?vak=schillen` vergelijk je bijvoorbeeld
navigatie in een zijbalk en in de bovenbalk. Wil je zo'n indeling aan je app toevoegen, volg dan [Een tweede schil](gouden-pad.md#een-tweede-schil).
De tabbladnamen en hun URL-waarden staan in [vakken.ts](../src/web/features/design-system/vakken.ts). Een onbekende waarde opent Basis.
Elk voorbeeld heeft een titel, één gebruikszin en een omlijst voorbeeldvlak ([Section](../src/web/ui/section.tsx) met `description` en `framed`).

Het tabblad Basis toont de tokens: de sectie "Tokens" (kleur, typografie, dichtheid, lagen, beweging) en de sectie
"Componenttokens" met per token component, standaard en de berekende waarde in het huidige thema
([componenttokens](ui-kit-basics.md#componenttokens), `src/web/features/design-system/component-tokens.ts`).

Boven de tabbladen staat de kiezer "Thema" ("Standaard" plus elk thema uit `src/web/styles/themes.ts`): de voorbeelden
staan dan in een `ThemeScope` met dat thema; meldingen en `<html>` volgen het thema van het document en de keuze wordt niet
bewaard ([app-thema's](ui-kit-basics.md#app-themas), `src/web/features/design-system/theme-picker.tsx`). Zonder thema's in
het register is er geen kiezer. De kolom "Waarde" van "Componenttokens" toont de waarde op `<html>`, niet die in de scope.

Bij de voorbeelden horen de volgende gebruiksrecepten.

| Je bouwt | Recept |
|---|---|
| Een tabel, tabbladen, galerij of filters | [Gegevensweergave en navigatie](ui-data-display.md) |
| Een doorzoekbaar keuzeveld, accordion of lijst | [Combobox en collecties](ui-collections.md) |
| Een datumveld, wachtwoordveld, kruimelpad of kopieerknop | [Invoer en hulpfuncties](ui-input-utilities.md) |
| Een bewerkbaar detail, een formulier met onbewaarde wijzigingen of een bulkactie | [Formulier- en lijstpatronen](ui-ux-patterns.md) |
| Een formulier in stappen, zoals op het tabblad Patronen | [Stappenformulier](ui-stappenformulier.md) |
| Een avatar, afbeelding of kengetal | [Avatar, Image en StatTile](ui-weergave-basis.md) |

Bij iedere indexrij staat **Toon [component]**. Die knop opent het tabblad van het voorbeeld, scrollt ernaartoe en
verplaatst de toetsenbordfocus naar de benoemde sectie. De zoekopdracht blijft behouden. Onderdelen zoals CardHeader en
TableCell worden in hun compositie getoond. De vindplaatstekst legt uit wanneer je een menu moet openen of een knop moet
bedienen. Layoutcomponenten werken in de echte navigatie en topbalk; providers worden via hun zichtbare resultaten
gedemonstreerd.

## Voorbeeldtoestanden

- **AsyncView:** kies resultaat, laden, fout of leeg. Laden blijft staan; Opnieuw proberen herstelt de lokale fout.
  Iedere nieuwe keuze voor fout begint weer met een fout. Leeg toont de standaardtekst; het andere EmptyState-voorbeeld
  demonstreert de eigen lege inhoud met beschrijving en actie.
- **Formulier: toestanden:** verstuur leeg voor fouten op Input, Select, FormCheckboxField en FormRadioGroupField.
  Vul Naam, Rol, Meldingen en Voorkeur in om een uitkomst te proberen. Serverfout toont de formuliermelding;
  Serverfout bij Naam koppelt de bestaande ALREADY_EXISTS-code aan Naam en zet daar focus.
  Bij Blijft bezig tot Afronden blijft de verzendknop uitgeschakeld totdat je Afronden kiest.
  Velden uitschakelen demonstreert disabled invoervelden en beide formulieradapters.
- **Input en Select: disabled en invalid:** blijvend inspecteerbare basisvoorbeelden met labels en gekoppelde fouttekst.
- **RouteError en NotFound:** generieke fout, verboden toegang en niet gevonden als previews, zonder extra main/h1 of
  echte sessiefout. Bestaande dialoog-, toast-, busy- en validatievoorbeelden blijven beschikbaar.
- **ErrorReference:** eigen sectie met een fictieve serverfout als RouteError-preview en los: "Referentie: <id>" met
  **Referentie kopiëren**; zie [Foutreferentie](ui-error-reference.md).

De query- en submituitkomsten zijn lokale voorbeelddata. Ze doen geen API-aanroep en wijzigen geen accounts.
[queries.ts](../src/web/features/design-system/queries.ts) bevat de lokale queries; Form en de adapters voeren de werkelijke validatie en foutafhandeling uit.

## Uitbreiden en controleren

Bij een nieuw UI-onderdeel blijven bronindex, barrel-export en bereikbaar voorbeeld verplicht (ADR 0048).
Voeg daarnaast in [example-targets.ts](../src/web/features/design-system/example-targets.ts) de vindplaats, het tabblad
(`vak`) en een korte bedieningsinstructie toe, en zet de sectie in het juiste tabblad in
[vak-panels.tsx](../src/web/features/design-system/vak-panels.tsx), met `description` en `framed`. Het doel is het `id`
van een Section; die wordt alleen met een expliciet id programmatisch focusbaar. Nieuwe Section-aanroepen zonder id
veranderen niet. In e2e-tests open je een tabblad met een lokale `openVak`-helper (klik het tabblad in de lijst "Onderdelen per soort") of direct
via `?vak=`.

`pnpm check:catalogus` controleert bronbereikbaarheid en eindige stringvarianten. De e2e-test
[design-system-coverage.spec.ts](../e2e/design-system-coverage.spec.ts) bedient voor iedere indexrij de voorbeeldknop en controleert het bestaande focusdoel, ook in een ander tabblad.
Dezelfde test controleert lokale toestanden, formulierfouten, mobiele overflow, CSP en axe in licht/donker.
[catalogue-states.test.tsx](../src/web/features/design-system/catalogue-states.test.tsx) test de query- en formulierinteracties zonder netwerk.

Een groene broncheck bewijst niet dat een lokale server dezelfde versie draait. Controleer eerst de werkdirectory en
commit van de server. Werk nooit een andere developerbranch met lokale wijzigingen stilzwijgend bij: gebruik een actuele
checkout en volg de bestaande dev-werkstraat. De audit van 14 oktober vond een oude server in `/home/bmj/template`;
het bijwerken van GitHub main verandert die server niet vanzelf.
