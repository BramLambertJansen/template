import type { RefObject } from 'react';

// Focus zetten na het sluiten van een dialoog (spec accountbeheer-uitbreiding, focusvolgorde). Een native <dialog> geeft bij
// close() de focus terug aan het element dat vóór showModal de focus had. Na een keuze in het menu "Acties" is dat het
// menu-item, dat dan al uit de DOM is: de focus valt op body. Zolang de dialoog modaal open is, is de rest van de pagina inert en
// negeert de browser focus(). Daarom pas in het volgende frame: na een discrete update (klik, Esc) heeft de Dialog dan zijn
// effect (close()) gedraaid. Komt het sluiten uit een promise (geen discrete update), roep dit dan pas aan vanuit een effect na de
// commit die de dialoog weghaalt. Het doel wordt pas in het frame gelezen, zodat een rij die intussen wegging niets doet.
export function focusAfterDialog(target: RefObject<HTMLElement | null>): void {
  requestAnimationFrame(() => {
    target.current?.focus();
  });
}
