import { extendTailwindMerge } from 'tailwind-merge';

// De klassen van de componenttokens (spec app-thema, styles/index.css) in hun groep, zodat een latere klasse een eerdere
// van dezelfde eigenschap vervangt: `rounded-tabs` na `rounded-button`, `px-0` na `px-button-x`. Zonder deze lijst
// ziet tailwind-merge `border-button` als randkleur en zou hij `border-input` ernaast weggooien.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ['button', 'control', 'card', 'dialog', 'badge', 'tabs', 'notice', 'toast'] }],
      shadow: [{ shadow: ['button', 'card', 'dialog', 'toast'] }],
      'font-weight': [{ font: ['button', 'badge'] }],
      px: [{ px: ['button-x', 'control-x'] }],
      py: [{ py: ['card-y', 'table-cell-y'] }],
      'max-w': [{ 'max-w': ['dialog'] }],
      'border-w': [{ border: ['button', 'control', 'card-width', 'notice'] }],
      'border-w-b': [{ border: ['table-row', 'tabs-indicator'] }],
      'bg-color': [{ bg: ['control', 'table-header'] }],
      'text-color': [{ text: ['control', 'table-header'] }],
      'text-transform': ['case-button'],
    },
  },
});

// Klassen samenvoegen; bij een conflict wint de laatste (een className van de app boven de basis van het recept).
export function cn(...classes: readonly (string | false | null | undefined)[]): string {
  return twMerge(classes.filter((value) => typeof value === 'string' && value !== '').join(' '));
}
