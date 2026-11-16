import { describe, expect, test } from 'vitest';
import { padNiveau } from '../../rails/hooks/lib/padtabel.mjs';
import { laadSamengevoegd, padenVan } from './app-padtabel-kit';
import { nieuw } from './padtabel-kit';

// Spec app-padtabel (AC-1, Afwezig of vervalst): een app-rij mag niet stil verdwijnen. Een glob `__proto__` uit JSON.parse is een
// eigen sleutel; een naïeve `samen[glob] = rij` zet in plaats daarvan het prototype en laat de rij uit de tabel vallen.
const RUW = nieuw();
const RIJ = { schrijven: 'voorReview', besluit: 'besluit-pr' };
/** Via JSON.parse, zodat `__proto__` een eigen eigenschap is en geen prototype-instelling. */
const app = (): unknown => JSON.parse(`{"paden":{"__proto__":${JSON.stringify(RIJ)}}}`);

describe('app-padtabel/AC-1 een glob __proto__ in het app-bestand', () => {
  test('app-padtabel/AC-1: de glob blijft een eigen sleutel in samengevoegd(...).paden', async () => {
    const samen = (await laadSamengevoegd())(RUW, app());
    const paden = padenVan(samen);

    expect(Object.hasOwn(paden, '__proto__')).toBe(true);
    expect(Object.keys(paden)).toContain('__proto__');
    expect(Object.getOwnPropertyDescriptor(paden, '__proto__')?.value).toEqual(RIJ);
  });

  test('app-padtabel/AC-1: het prototype van paden is niet door het app-bestand gezet', async () => {
    const samen = (await laadSamengevoegd())(RUW, app());

    expect(Object.getPrototypeOf(padenVan(samen))).toBe(Object.prototype);
  });

  test('app-padtabel/AC-1: padNiveau("__proto__") geeft de rij van de app', async () => {
    const samen = (await laadSamengevoegd())(RUW, app());

    expect(padNiveau('__proto__', samen)).toEqual({
      schrijven: 'voorReview',
      besluit: 'besluit-pr',
      bronnen: { schrijven: ['__proto__'], besluit: ['__proto__'] },
    });
  });

  test('app-padtabel/AC-1: de templaterijen blijven er, en de rij is alleen een toevoeging', async () => {
    const samen = (await laadSamengevoegd())(RUW, app());

    expect(Object.keys(padenVan(samen))).toEqual([...Object.keys(padenVan(RUW)), '__proto__']);
  });
});
