# UI-basiselementen gebruiken

De uitbreiding volgt [de goedgekeurde spec](specs/ui-kit-basics.md). Importeer componenten via
`src/web/ui/index.ts`; de voorbeelden staan op de bestaande, beveiligde `/design-system`-route.

## Invoervelden

- `Textarea` gebruikt dezelfde inputtokens als Input. Geef domeinlimieten vanuit het schema/de app door.
- `Checkbox` heeft een klikbaar `label` en native booleansemantiek. Arrayselectie en indeterminate vallen buiten deze kit.
- `RadioGroup` krijgt `label`, `value`, `options` en `onValueChange`. Native radios verzorgen selectie en toetsenbediening.
  `description` en `error` worden aan elke optie gekoppeld. De ref wijst naar de eerste niet-uitgeschakelde optie.
- Gebruik binnen `Form` de bestaande `useZodForm`. `FormField` bindt stringvelden, inclusief Textarea;
  `FormCheckboxField` bindt uitsluitend booleanvelden en `FormRadioGroupField` uitsluitend stringvelden.
  Geef passende defaultwaarden door. Een ontbrekende of ongeschikte default veroorzaakt een assertion, geen stille lege waarde.
- Reset en schema-/serverfouten blijven via RHF lopen. `Form.fieldForCode` koppelt de serverfout en focust het veld of groepsanker.

Bronnen: `src/core/web/ui/form.tsx:94`, `src/core/web/ui/form-checkbox-field.tsx:15`,
`src/core/web/ui/form-radio-group-field.tsx:15`, `src/web/features/design-system/ui-basics-examples.tsx`.
Additieve acceptatietests: `src/core/web/ui/form-controls.test.tsx`. Bestaande tests blijven ongewijzigd.
