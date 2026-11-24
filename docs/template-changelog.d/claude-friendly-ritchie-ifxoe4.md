---
soort: toegevoegd
---

- Componenttokens voor de eerste set (spec `app-thema`, deel A): Button, de invoervelden, Card, Dialog, Table,
  StatusBadge, Tabs, Notice en Toast halen vorm en kleur uit `--<component>-<eigenschap>` in
  `src/core/web/styles/components.css` (hooguit zes per component), met klassen als `rounded-button`, `shadow-card` en
  `border-control`. De standaarden geven dezelfde uitstraling als voorheen (`e2e/app-thema.spec.ts` tegen een nulmeting).
  Nieuw semantisch invoertoken `--density-focus-ring` (standaard `2px`); `--focus-ring-width` wordt
  `max(var(--density-focus-ring), 2px)`. De sectie "Componenttokens" op `/design-system` toont elk token met standaard en
  berekende waarde.

### Bij een update

- Wil je een component anders laten ogen, overschrijf dan zijn componenttoken in `src/web/styles/theme.css` op de
  selector `:root, [data-app-theme]` (niet alleen `:root`). Een override alleen op `:root` werkt voor het hele document,
  maar binnen een `ThemeScope` (deel C van de spec) rekent hij dan niet mee met het thema van die deelboom.
- Gebruik je in eigen code `cn()` met een eigen klasse die met `border-`, `rounded-`, `shadow-`, `bg-` of `text-` begint,
  controleer dan of hij niet botst met de nieuwe componentklassen (`src/core/web/ui/cn.ts`).
