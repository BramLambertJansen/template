---
soort: toegevoegd
---

- Kitcomponent `Wizard` (stappenformulier) met `wizardStep`: voortgang, validatie per stap via het bestaande `Form`, Vorige
  zonder dataverlies en één verzendactie op de laatste stap; een tweede submit tijdens "Bezig…" roept `onSubmit` niet
  opnieuw aan. Voorbeeld op `/design-system?vak=patronen`, gebruik in `docs/ui-stappenformulier.md` (spec
  `stappenformulier`). Een app hoeft niets te doen; importeer `Wizard` uit `src/web/ui/index.ts` wanneer je meerstaps-invoer
  nodig hebt.
