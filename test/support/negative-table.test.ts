import { describe, expect, test } from 'vitest';
import { expectNegativeTable } from './negative-table.ts';

// Leerpunt #401: alle rijen van een negatieve tabel gaven `false`, maar de gedeelde basis was zelf al onwaar. Het weghalen
// van een bewaakte voorwaarde (`!authority.safe(...)`) liet daardoor alles groen. expectNegativeTable bewijst eerst dat de
// basis waar is, en eist per rij dat precies die wijziging de uitkomst onwaar maakt.
interface Toegang {
  readonly rol: string;
  readonly veilig: boolean;
  readonly status: string;
}

const BASIS: Toegang = { rol: 'eigenaar', veilig: true, status: 'goedgekeurd' };
const RIJEN = [
  { name: 'andere rol', change: (b: Toegang) => ({ ...b, rol: 'gast' }) },
  { name: 'onveilig pad', change: (b: Toegang) => ({ ...b, veilig: false }) },
  { name: 'voorstel', change: (b: Toegang) => ({ ...b, status: 'voorstel' }) },
];

const goed = (t: Toegang) => t.rol === 'eigenaar' && t.veilig && t.status === 'goedgekeurd';

describe('expectNegativeTable', () => {
  test('slaagt als de basis waar is en elke rij hem onwaar maakt', () => {
    expect(() => {
      expectNegativeTable({ base: BASIS, check: goed, cases: RIJEN });
    }).not.toThrow();
  });

  test('faalt als de basis al onwaar is, ook als elke rij onwaar geeft (de fout uit #401)', () => {
    expect(() => {
      expectNegativeTable({ base: { ...BASIS, status: 'vervallen' }, check: goed, cases: RIJEN });
    }).toThrow(/basis/);
  });

  test('faalt als een bewaakte voorwaarde uit de code is, en noemt de rij', () => {
    const zonderVeilig = (t: Toegang) => t.rol === 'eigenaar' && t.status === 'goedgekeurd';
    expect(() => {
      expectNegativeTable({ base: BASIS, check: zonderVeilig, cases: RIJEN });
    }).toThrow(/"onveilig pad"/);
  });

  test('noemt alle falende rijen tegelijk', () => {
    const altijd = () => true;
    expect(() => {
      expectNegativeTable({ base: BASIS, check: altijd, cases: RIJEN });
    }).toThrow(/"andere rol".*"onveilig pad".*"voorstel"/s);
  });

  test('faalt op een rij die niets verandert', () => {
    expect(() => {
      expectNegativeTable({ base: BASIS, check: goed, cases: [...RIJEN, { name: 'leeg', change: (b) => b }] });
    }).toThrow(/"leeg"/);
  });

  test('faalt als een rij de basis zelf wijzigt', () => {
    const muterend = {
      name: 'muteert',
      change: (b: { veilig: boolean }) => {
        b.veilig = false;
        return { ...b };
      },
    };
    expect(() => {
      expectNegativeTable({ base: { veilig: true }, check: (t) => t.veilig, cases: [muterend] });
    }).toThrow(/"muteert"/);
  });

  test('faalt zonder rijen', () => {
    expect(() => {
      expectNegativeTable({ base: BASIS, check: goed, cases: [] });
    }).toThrow(/rij/);
  });
});
