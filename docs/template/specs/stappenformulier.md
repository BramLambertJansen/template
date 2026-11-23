---
status: goedgekeurd
namespace: stappenformulier
sjabloon: mini
scope: functionele-ui
---

# Stappenformulier (Wizard)

## Doel

Een kitcomponent `Wizard` voor meerstaps-invoer: voortgang, validatie per stap via het bestaande `<Form>`/zod-patroon,
terug zonder dataverlies en één verzendactie op de laatste stap, zodat elke nieuwe app dit niet zelf bouwt.

## Rollen en wie wat ziet

Geen nieuwe rollen of rechten. Het component kent geen accounts. Het catalogusvoorbeeld staat op de bestaande
adminroute `/design-system` (tabblad "Patronen"), achter de bestaande guard, met fictieve lokale data.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

N.v.t. — geen route, API, permissie of foutcode. Fouten van de verzendactie lopen via het bestaande `Form`
(`useErrorText`, `fieldForCode`); het voorbeeld verstuurt niets naar de server.

## Kopieer de vorm van

- `src/core/web/ui/form.tsx` — `Form`, `FormField` en `useZodForm`: per stap één formulier met eigen schema;
  verzendknop met `uiTexts.busy`, formuliermelding en `fieldForCode` ongewijzigd hergebruiken.
- `src/core/web/ui/form-error-summary.tsx` — foutsamenvatting per stap via de bestaande `errorSummary`-prop van `Form`.
- `src/core/web/ui/tabs.tsx` — ids per instantie (`useId`), assert op lege/dubbele ids, geen focusroof bij eerste render.
- `src/web/features/login/login-page.tsx` — alleen ter inspiratie: stappen binnen één route, waarden in het geheugen;
  dit bestand wijzigt niet.
- `src/web/features/design-system/editable-details-example.tsx` — catalogusvoorbeeld met `UnsavedChangesGuard`,
  `NavLink` om de pagina te verlaten en lokale opslag.
- `src/web/features/design-system/editable-details-example.test.tsx` — voorbeeldtest binnen een memory-router.

## Acceptatiecriteria

Componentcontract (`src/core/web/ui/wizard.tsx`):

- **stappenformulier/AC-1** — Gegeven `Wizard` met stappen `{ id, title, form, content, errorSummary?, fieldForCode? }`,
  `label` en `onSubmit`, wanneer hij voor het eerst rendert, dan toont hij stap 1 met de kop
  "Stap 1 van 3: Gegevens" (formaat `Stap <n> van <totaal>: <titel>`), een benoemde geordende lijst (`<ol>` met
  `aria-label` = `label`) met alle staptitels, `aria-current="step"` uitsluitend op het actieve item, en houdt hij de
  focus waar die was (de kop krijgt bij de eerste render geen focus). Toets: `src/core/web/ui/wizard.test.tsx`
- **stappenformulier/AC-2** — Gegeven een stap die niet de laatste is, wanneer de gebruiker "Volgende" activeert (klik of
  Enter in een tekstveld) met ongeldige invoer, dan blijft dezelfde stap actief, verschijnen de veldfouten uit het
  zod-schema van die stap en krijgt de `FormErrorSummary` met de opgegeven titel de focus; zonder `errorSummary` krijgt
  het eerste ongeldige veld de focus (bestaand RHF-gedrag). Toets: `src/core/web/ui/wizard.test.tsx`
- **stappenformulier/AC-3** — Gegeven geldige invoer op een stap die niet de laatste is, wanneer de gebruiker "Volgende"
  activeert, dan wordt de volgende stap actief, verschuift `aria-current="step"` mee en krijgt de stapkop
  ("Stap 2 van 3: Adres") de focus; `onSubmit` is niet aangeroepen. Toets: `src/core/web/ui/wizard.test.tsx`
- **stappenformulier/AC-4** — Gegeven stap 2 of later, wanneer de gebruiker "Vorige" activeert, dan wordt de vorige stap
  actief zonder validatie van de huidige stap, krijgt die stapkop de focus en staan de eerder ingevulde waarden van de
  vorige stap én de nog niet gevalideerde invoer van de verlaten stap er bij terugkeer ongewijzigd in. "Vorige" doet
  geen stapvalidatie: `submitCount` blijft gelijk, er verschijnt geen foutsamenvatting en de focus gaat niet naar een
  fout (een blurfout op het veld dat de focus had, mag wel verschijnen). "Vorige" krijgt bij `pointerdown` met de
  primaire knop `preventDefault()`, net als de verzendknop. Toets: `src/core/web/ui/wizard.test.tsx`
- **stappenformulier/AC-5** — Gegeven stap 1, dan is er geen knop "Vorige"; gegeven een niet-laatste stap heet de
  verzendknop "Volgende"; gegeven de laatste stap heet hij `submitLabel` (standaard "Versturen"). Toets: `src/core/web/ui/wizard.test.tsx`
- **stappenformulier/AC-6** — Gegeven geldige invoer op de laatste stap, wanneer de gebruiker "Versturen" activeert, dan
  roept `Wizard` `onSubmit` precies één keer aan; zolang die belofte loopt toont de knop "Bezig…", zijn de verzendknop en
  "Vorige" uitgeschakeld en leidt een tweede klik niet tot een tweede aanroep. Toets: `src/core/web/ui/wizard.test.tsx`
- **stappenformulier/AC-7** — Gegeven een verworpen `onSubmit`, dan blijft de laatste stap actief met alle waarden van alle
  stappen intact, toont `Form` de bestaande formuliermelding (of de veldfout via `fieldForCode` van de laatste stap) en
  is de knop weer "Versturen" en bruikbaar. Toets: `src/core/web/ui/wizard.test.tsx`
- **stappenformulier/AC-8** — Gegeven ongeldige invoer op de laatste stap, wanneer de gebruiker "Versturen"
  activeert, dan wordt `onSubmit` niet aangeroepen en krijgt de foutsamenvatting van de laatste stap de focus. Toets: `src/core/web/ui/wizard.test.tsx`

Randgevallen:

- **stappenformulier/AC-9** — Gegeven een lege stappenlijst, een stap met lege `id` of twee stappen met dezelfde `id`,
  dan faalt `Wizard` met een `assert` (programmeerfout), niet met een stille fallback. Toets: `src/core/web/ui/wizard.test.tsx`
- **stappenformulier/AC-10** — Gegeven precies één stap, dan toont de kop "Stap 1 van 1: <titel>", is er geen "Vorige" en
  heet de knop `submitLabel`. Toets: `src/core/web/ui/wizard.test.tsx`
- **stappenformulier/AC-11** — Gegeven dat de aanroeper de lijst inkort tot onder de actieve stap, dan wordt de laatste
  bestaande stap actief, zonder `onSubmit`-aanroep en zonder focus te verplaatsen. Toets: `src/core/web/ui/wizard.test.tsx`
- **stappenformulier/AC-12** — Gegeven twee `Wizard`-instanties op één pagina, dan zijn alle ids in het document uniek,
  verwijst `aria-labelledby` van elke stapsectie naar de stapkop binnen dezelfde instantie, verwijst elke stapkop alleen
  naar zijn eigen lijst en verandert een stapwissel in de ene niets aan de andere. Toets: `src/core/web/ui/wizard.test.tsx`
- **stappenformulier/AC-13** — Gegeven een stap die terugkeert na "Vorige" en opnieuw "Volgende", dan valideert die stap
  opnieuw met de huidige waarden (een eerder geldige stap die nu ongeldig is, houdt de gebruiker tegen). Toets: `src/core/web/ui/wizard.test.tsx`
- **stappenformulier/AC-18** — Gegeven stap 2 met ongeldige invoer, wanneer de gebruiker "Vorige" activeert en op stap 1
  (geldig) "Volgende", dan houdt de stapkop van stap 2 de focus, ook nadat alle timers zijn afgelopen
  (`vi.runAllTimers()`); de foutsamenvatting van stap 2 is zichtbaar maar pakt de focus niet af. Toets: `src/core/web/ui/wizard.test.tsx`
- **stappenformulier/AC-19** — Alle stappen staan in de DOM als sectie met `aria-labelledby` naar hun eigen stapkop
  (`tabIndex={-1}`); alleen de actieve sectie heeft geen `hidden`-attribuut. Toets: `src/core/web/ui/wizard.test.tsx`

Catalogus (`/design-system?vak=patronen`):

- **stappenformulier/AC-14** — Het voorbeeld "Stappenformulier" toont drie stappen met de letterlijke teksten uit
  "Hergebruik en UX", is via de zoekfunctie en de bronindex bereikbaar (`check:catalogus` en
  `component-index.test.tsx` blijven groen zonder uitzonderingen) en importeert uitsluitend uit `src/web/ui/index.ts`. Toets: `src/web/features/design-system/wizard-example.test.tsx`
- **stappenformulier/AC-15** — Gegeven gewijzigde invoer in het voorbeeld, wanneer de gebruiker "Terug naar accounts"
  activeert, dan opent `UnsavedChangesGuard` met de teksten "Pagina verlaten?" / "Je hebt onopgeslagen wijzigingen. Bij
  verlaten gaan deze verloren." / "Wijzigingen verwerpen en verlaten"; zonder wijziging, of na een geslaagde verzending,
  opent de dialoog niet; tijdens "Bezig…" blokkeert de guard verlaten (bestaande `busy`). Toets: `src/web/features/design-system/wizard-example.test.tsx`
- **stappenformulier/AC-16** — Na een geslaagde verzending toont het voorbeeld de succesmelding met focus erop en
  zet "Nieuwe aanmelding" alle drie de stappen leeg terug op stap 1, zonder focusroof naar de stapkop. Toets: `src/web/features/design-system/wizard-example.test.tsx`
- **stappenformulier/AC-17** — Het voorbeeld werkt op 375 en 1280 px zonder pagina-overflow (lange staptitels wrappen),
  in licht en donker thema zonder axe-overtredingen, met alleen bestaande tokens en zonder nieuwe dependency. Toets: `e2e/stappenformulier.spec.ts`

## Hergebruik en UX

- Bestaande componenten: `Form`, `FormField`, `useZodForm`, `FormErrorSummary` (via `errorSummary`), `Button`, `Input`,
  `FormCheckboxField`, `DescriptionList`, `Notice`, `UnsavedChangesGuard`, `NavLink`, `Section`. Het nieuwe `Wizard`
  bouwt op `Form` en `Button`; geen eigen validatie, geen tweede formulierlaag, geen stappenbalk-dependency.
- Contract: elke stap levert een eigen formulier (`useZodForm` met eigen schema) dat de aanroeper bezit. `Wizard` houdt
  alle stappen gemount en verbergt de inactieve met `hidden` (AC-19), zodat waarden en focus betrouwbaar blijven; een
  aanpak met `clearErrors` bij het wisselen heeft een race met de asynchrone blurvalidatie. Typeveilig per stap zonder `any`, `as` of
  `@ts-ignore` (R-CODE-04); een helper die de generics per stap vastlegt mag. `Wizard` heeft interne staat (actieve stap);
  terugzetten gaat via een nieuwe React-`key`. De voortgangslijst is niet klikbaar: overslaan zonder validatie kan niet.
  `onSubmit: () => Promise<unknown>` krijgt geen argumenten; de aanroeper leest de waarden uit zijn formulieren.
  `headingLevel` (2 of 3, standaard 2) bepaalt het niveau van de stapkop; 4 kan niet, omdat `FormErrorSummary` altijd
  een h3 rendert. `Wizard` rendert geen `UnsavedChangesGuard`;
  de aanroeper zet `when` op "een van de stapformulieren is dirty" en `busy` op de verzendstatus van de laatste stap.
- Staten per scherm: laden — n.v.t. (lokaal component, de aanroeper gebruikt `AsyncView` voor zijn data); leeg — n.v.t.
  (lege stappenlijst is een `assert`); fout — veldfouten plus `FormErrorSummary` per stap, verzendfout als bestaande
  formuliermelding op de laatste stap; bezig — "Bezig…" op de verzendknop, "Vorige" uitgeschakeld; gelukt — beslist de
  aanroeper (voorbeeld: succesmelding); verouderd — n.v.t. (geen serverdata).
- Alle zichtbare tekst letterlijk:
  - Vaste kitteksten (nieuw in `src/core/web/copy/ui.ts`): `wizardNext` "Volgende", `wizardPrevious` "Vorige",
    `wizardSubmit` "Versturen" (standaard `submitLabel`) en `wizardStepHeading: (step: number, total: number, title: string) => string`
    voor de stapkop `Stap <n> van <totaal>: <titel>`; de woordenlijsttest roept functies aan met één voorbeeldwaarde.
    Bestaand en hergebruikt: "Bezig…".
  - Voorbeeld, sectietitel "Stappenformulier", beschrijving "Meerstaps-invoer met voortgang, validatie per stap en
    terugbladeren zonder dataverlies.", gebruikszin "Vul drie stappen in; Vorige bewaart je invoer. Dit voorbeeld
    bewaart niets buiten de browser.", lijstlabel `label` = "Voortgang aanmelding".
  - Stap 1 "Gegevens": velden "Naam" (fout "Vul een naam in.") en "E-mailadres" (fout "Vul een geldig e-mailadres in.").
  - Stap 2 "Adres": velden "Straat en huisnummer" (fout "Vul een straat en huisnummer in."), "Postcode" (hulptekst
    "Bijvoorbeeld 1234 AB.", fout "Vul een geldige postcode in, bijvoorbeeld 1234 AB.") en "Plaats" (fout "Vul een
    plaats in.").
  - Stap 3 "Controleren": een `DescriptionList` met "Naam", "E-mailadres", "Straat en huisnummer", "Postcode",
    "Plaats" en de ingevulde waarden, plus het selectievakje "Ik bevestig dat deze gegevens kloppen." (fout
    "Bevestig de gegevens om te versturen.").
  - Foutsamenvatting per stap: titel "Controleer de invoer", met de veldlabels van die stap.
  - Na verzenden: `Notice` (tone `success`) "Aanmelding verstuurd. Dit voorbeeld bewaart niets." en de knop
    "Nieuwe aanmelding". Link "Terug naar accounts" naar `/admin/accounts`; guardteksten zoals in AC-15.
  - Fictieve data als voorbeeldinvoer in de documentatie: Anna de Vries, anna@example.test, Dorpsstraat 1, 1234 AB,
    Voorbeeldstad.
- Focusvolgorde en toetsenbord: Tab volgt de documentvolgorde: voortgangslijst (niet focusbaar), stapkop (alleen
  programmatisch, `tabIndex={-1}`), foutsamenvatting (als zichtbaar), velden van de stap, dan "Vorige" en de
  verzendknop in de bestaande knoppenrij van `Form` ("Vorige" als `secondaryAction`, links van de verzendknop op brede
  schermen). Enter in een tekstveld verstuurt de stap (= "Volgende" of "Versturen"); Spatie/Enter activeert knoppen.
  Na een stapwissel krijgt de nieuwe stapkop de focus; schermlezers lezen zo "Stap 2 van 3: Adres". Na een fout gaat de
  focus naar de foutsamenvatting. Geen pijltjestoetsen of sneltoetsen. In het voorbeeld krijgt na verzenden de
  succesmelding de focus (`tabIndex={-1}` op een omhullend element in het voorbeeld; `Notice` wijzigt niet).

## Datawijzigingen (met grants)

N.v.t. — geen tabel, migratie, opslag of provider; alle voorbeelddata blijft in het geheugen van de pagina.

## Raakt ook

Bouw in één PR met deze spec (R-WERK-18):

- `src/core/web/ui/wizard.tsx` — nieuw component `Wizard` (+ types `WizardProps`, `WizardStep`).
- `src/core/web/ui/wizard.test.tsx` — nieuw; AC-1 t/m AC-13, AC-18 en AC-19 met `stappenformulier/AC-n` in de testnaam.
- `src/core/web/copy/ui.ts` — vier nieuwe sleutels voor "Volgende", "Vorige", "Versturen" en de stapkop;
  bestaande sleutels blijven ongewijzigd (`src/web/copy/woordenlijst.test.ts` dekt ze automatisch).
- `src/web/ui/index.ts` — export van `Wizard`, `WizardProps`, `WizardStep`.
- `src/web/features/design-system/wizard-example.tsx` — nieuw catalogusvoorbeeld.
- `src/web/features/design-system/wizard-example.test.tsx` — nieuw; AC-14 t/m AC-16 binnen een memory-router.
- `src/web/features/design-system/vak-panels.tsx` — voorbeeld toevoegen aan het tabblad "Patronen".
- `src/web/features/design-system/example-targets.ts` — vindplaats `{ names: ['Wizard'], id: 'example-wizard',
  vak: 'patronen' }` met de gebruikszin.
- `e2e/stappenformulier.spec.ts` — nieuw; AC-15 t/m AC-17 op 375/1280 px, licht/donker, axe, tegen de echte lokale stack.
- `src/core/web/ui/wizard-busy.test.tsx`, `src/web/features/design-system/wizard-example-busy.test.tsx` en `e2e/stappenformulier-lange-titel.spec.ts` — nieuw; dubbel verzenden en lange titel (AC-6, AC-15, AC-17).
- `docs/ui-stappenformulier.md` — nieuwe gebruiksdocumentatie (contract, guard-compositie, AC → test).
- `docs/design-system-catalogue.md` — één regel voor het voorbeeld; `docs/README.md` — link naar de gebruiksdoc.

Checks die de bouw raakt: `pnpm check:catalogus`, `component-index.test.tsx`, woordenlijsttest, lint (R-UI-04/R-UI-05,
functielengte R-CODE-02), typecheck, `check-docs` (AC-traceerbaarheid zodra `gebouwd`). Niet geraakt: `check:migrations`,
`check:secdef`, `test:db`/policies, `test/security/resources.ts`, permissietests (geen tabel, route of permissie).

## Buiten scope

Geen wijziging aan `src/web/features/login/login-page.tsx`, `Form`, `FormErrorSummary`, `UnsavedChangesGuard`,
`Notice` of andere bestaande componenten en tests. Geen route, API, query, permissie, migratie, provider, dependency,
token, configuratie of regelwerk (`docs/framework.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/**`, `scripts/**`, `rails/**`,
`.github/**`). Niet in deze tranche: klikbare/overslaanbare stappen, stappen in de URL of opslag (concept bewaren),
voorwaardelijke of dynamisch vertakkende stappen, serverveldfouten terugleiden naar een eerdere stap, verticale
stappenbalk, animatie. Geen roadmap-item wordt hiermee afgevinkt.

## Testplan

- Unit (`wizard.test.tsx`, jsdom): kop en `aria-current` per stap, geen focus bij mount, focus na Volgende/Vorige,
  foutsamenvatting en geen stapwissel bij ongeldige invoer, waardebehoud na Vorige (ook ongevalideerde invoer),
  hervalidatie, busy met uitgestelde belofte en dubbele klik, verworpen `onSubmit`, asserts, één stap, inkorten,
  twee instanties.
- Voorbeeld (`wizard-example.test.tsx`): teksten, guard bij dirty/bezig/na succes, succesfocus en reset.
- E2E (`e2e/stappenformulier.spec.ts`): volledige doorloop met toetsenbord, 375/1280 px zonder overflow, axe licht/donker.
- Bestaande tests ongewijzigd groen; geen test gewijzigd, geskipt of verwijderd.

## Open vragen

- **OV-1 ✅ besloten** — Pakket en reikwijdte: de eigenaar koos dit pakket in de sessie van 2026-11-13; teksten en
  voorbeelddata zoals hierboven.
- **OV-2 ✅ besloten** — Het voorbeeld komt in het tabblad "Patronen", naast het vergelijkbare
  bewerk-met-guard-voorbeeld; het is een samengesteld patroon, geen los invoerveld (eigenaar, 2026-11-13).
- **OV-3 ✅ besloten** — De voortgangslijst maakt voltooide stappen in deze tranche niet klikbaar; "Vorige" volstaat en
  voorkomt overslaan zonder validatie. Later als variant toe te voegen (eigenaar, 2026-11-13).
- **OV-4 ✅ besloten** — Alle stappen blijven gemount en de inactieve worden verborgen met `hidden` (AC-19), niet alleen
  de actieve stap renderen met `clearErrors` bij het wisselen (eigenaar, 2026-11-13).
