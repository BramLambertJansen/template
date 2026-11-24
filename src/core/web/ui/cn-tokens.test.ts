import { expect, test } from 'vitest';
import { cn } from './cn.ts';

// Spec app-thema, deel A: cn() kent de klassen van de componenttokens (styles/index.css), zodat een latere klasse van
// dezelfde eigenschap wint en een randdikte niet als randkleur wordt weggegooid.
test.each([
  ['border-control border-input', 'border-control border-input'],
  ['rounded-button rounded-tabs', 'rounded-tabs'],
  ['px-button-x px-0', 'px-0'],
])('app-thema: cn(%s) geeft %s', (input, expected) => {
  expect(cn(input)).toBe(expected);
});
