# Stappenformulier (Wizard)

`Wizard` verdeelt invoer over meerdere stappen: een voortgangslijst, validatie per stap, Vorige zonder dataverlies en één
verzendactie op de laatste stap ([spec stappenformulier](template/specs/stappenformulier.md)). Importeer uit
`src/web/ui/index.ts`; het component staat in [wizard.tsx](../src/core/web/ui/wizard.tsx). Werkend voorbeeld:
`/design-system?vak=patronen`, sectie "Stappenformulier" ([wizard-example.tsx](../src/web/features/design-system/wizard-example.tsx)).

## Contract

- Elke stap heeft een eigen formulier (`useZodForm` met eigen schema) dat de aanroeper bezit. Maak de stap met
  `wizardStep({ id, title, form, content, errorSummary?, fieldForCode? })`: de helper legt de generics per stap vast, zodat
  stappen met verschillende schema's in één lijst `steps` passen zonder `any` of casts.
- `Wizard` krijgt `label` (naam van de voortgangslijst), `steps`, `onSubmit: () => Promise<unknown>` en optioneel
  `submitLabel` (standaard "Versturen") en `headingLevel` (2 of 3, standaard 2; 4 kan niet omdat `FormErrorSummary` een h3
  rendert). `onSubmit` krijgt geen argumenten: lees de waarden uit je eigen formulieren. Een tweede submit tijdens
  "Bezig…" (bijvoorbeeld Enter in een veld) deelt de lopende belofte en roept `onSubmit` niet opnieuw aan (`useSubmitOnce`
  in [wizard.tsx](../src/core/web/ui/wizard.tsx)).
- Per stap rendert `Wizard` een bestaand `Form`: Volgende is de verzendknop van een niet-laatste stap (dus zod-validatie,
  `errorSummary` en Enter in een tekstveld werken zoals altijd); Vorige is de `secondaryAction` en valideert niet.
- Alle stappen blijven gemount; inactieve secties krijgen `hidden`. Waarden, ook nog niet gevalideerde invoer, blijven
  daardoor staan bij Vorige en Volgende. Elke stap valideert opnieuw bij Volgende.
- Na een stapwissel krijgt de stapkop ("Stap 2 van 3: Adres") de focus, via een timer zodat een nog geplande focus van de
  foutsamenvatting van die stap niet wint ([wizard.tsx](../src/core/web/ui/wizard.tsx), `useHeadingFocus`). De eerste
  render en het inkorten van `steps` verplaatsen geen focus.
- Lege lijst, lege of dubbele `id`: `assert` (programmeerfout). Wordt de lijst korter dan de actieve stap, dan wordt de
  laatste bestaande stap actief.
- De voortgangslijst is niet klikbaar. Terugzetten naar stap 1 gaat met een nieuwe React-`key` plus `form.reset()` per stap.

## Guard en afronding

`Wizard` rendert geen `UnsavedChangesGuard`. Zet hem er zelf naast, met `when` = "een van de stapformulieren is dirty
en nog niet verstuurd" en `busy` = `isSubmitting` van het formulier van de laatste stap; zie `WizardExample` in
[wizard-example.tsx](../src/web/features/design-system/wizard-example.tsx). Wat er na een geslaagde verzending gebeurt,
beslist de aanroeper; het voorbeeld toont een succesmelding met focus en een knop "Nieuwe aanmelding". Het voorbeeld
neemt een optionele `send` (standaard meteen geslaagd) als plaatshouder voor het serververzoek; een test geeft er een
uitgestelde belofte aan om de guard tijdens "Bezig…" te zien.

Fictieve voorbeeldinvoer: Anna de Vries, anna@example.test, Dorpsstraat 1, 1234 AB, Voorbeeldstad.

## Acceptatiecriteria en tests

| AC | Test |
|---|---|
| AC-1 t/m AC-13, AC-18, AC-19 (componentcontract en randgevallen) | `src/core/web/ui/wizard.test.tsx`; tweede submit tijdens "Bezig…" (AC-6): `src/core/web/ui/wizard-busy.test.tsx` |
| AC-14 (teksten, bronindex, alleen barrel-imports) | `src/web/features/design-system/wizard-example.test.tsx`, `pnpm check:catalogus` |
| AC-15 (guard bij wijziging, niet zonder of na succes, blokkeert tijdens "Bezig…") | `wizard-example.test.tsx`, `wizard-example-busy.test.tsx`, `e2e/stappenformulier.spec.ts` |
| AC-16 (succesfocus en reset) | `wizard-example.test.tsx`, `e2e/stappenformulier.spec.ts` |
| AC-17 (375/1280 px, licht/donker, axe, lange staptitels wrappen) | `e2e/stappenformulier.spec.ts`, `e2e/stappenformulier-lange-titel.spec.ts` |
