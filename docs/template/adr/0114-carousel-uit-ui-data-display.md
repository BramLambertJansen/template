# 0114 — Carousel vervalt uit ui-data-display

Status: geaccepteerd

Een ADR omdat het een AC van een goedgekeurde spec laat vervallen (R-WERK-07: een AC-id verdwijnt nooit, een vervallen AC
noemt het ADR); het wijzigt geen geaccepteerd ADR. Besluit van de eigenaar: 2026-10-15 (Carousel uit de tranche),
2026-11-26 (AC-7 laten vervallen in plaats van de Carousel opnieuw te bouwen).

## Context

De spec [ui-data-display](../specs/ui-data-display.md) beschreef vijf componenten. Op 2026-10-15 haalde de eigenaar de
Carousel uit de tranche: een touchregressie (tik op een dia-actie na een swipe) bleef in `gate:slow` falen. Component,
voorbeeld en tests zijn toen verwijderd (`docs/ui-data-display.md`, "Carousel"); de spec zette het onder "Buiten scope".
AC-7 bleef echter als levend criterium staan. Daardoor kon de AC-dekking (ADR 0104) de spec nooit `gebouwd` noemen en
bleef de roadmapregel "UI-kit: tabel, tabs, galerij en filterbalk" open, hoewel DataTable, Tabs, Gallery en ListToolbar
gebouwd en getest zijn.

## Besluit

1. **ui-data-display/AC-7 vervalt** door dit ADR, met de tekst achter `Was:`. De Carousel-paragraaf van de spec blijft als
   verslag staan; ze geeft geen bouwrecht meer.
2. **Een Carousel komt alleen terug met een nieuwe spec**, met een eigen aanleiding (R-PRINC-08), bijvoorbeeld wanneer
   de proef-app er een nodig heeft. Die spec lost de touchregressie op vóór de bouw.

## Alternatieven

- **De Carousel alsnog bouwen:** dezelfde touchregressie is eerder niet groen gekomen in `gate:slow`, en geen app vraagt
  erom.
- **AC-7 laten staan:** de spec blijft voor altijd `deels` en de roadmapregel kan niet worden afgevinkt, zonder dat er
  nog iets te bouwen valt.

## Gevolgen

- De AC-dekking van ui-data-display rekent zonder AC-7; met tests die AC-1 t/m AC-6 en AC-8 t/m AC-10 noemen, is de spec
  gebouwd.
- De roadmapregel van #156 kan worden afgevinkt met bewijs.
