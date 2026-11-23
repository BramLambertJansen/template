---
soort: gewijzigd
---

- `gebouwd` volgt uit de AC-dekking op `main`: een AC is gebouwd als een testbestand zijn volledige id noemt, een
  `goedgekeurde` spec is gebouwd als elk levend eigen AC dat is, anders `deels <n>/<m>` (`node scripts/kit/feiten.mjs specs`;
  spec `gebouwd-zonder-nummer`, ADR 0104, `rails/hooks/lib/ac-dekking.mjs`). Niemand schrijft nog `status: gebouwd` of het
  merkteken `(nog niet gebouwd)`: het rolhek weigert een nieuwe gebouwd-regel elke rol, en `pnpm ratchet` weigert een nieuwe
  gebouwd-regel, een nieuw merkteken en een gebouwd AC dat zijn test verliest. Een bestaande `status: gebouwd` (ook
  `gebouwd # #<n>`) en een bestaand merkteken blijven geldig: ze lezen als `goedgekeurd` en maken na de update niets rood;
  omzetten naar `goedgekeurd` mag. De "let op"-melding van `scripts/kit/vergeten-gebouwd.mjs` (vervallen) is weg.
