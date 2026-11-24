import { describe, expect, test } from 'vitest';
import { vakken } from '#web/features/design-system/vakken.ts';
import { schilKeuze, voorbeeldHref, voorbeeldNav, VOORBEELD_ITEMS } from './schil-voorbeeld.ts';

describe('schillen/AC-19: voorbeeldnavigatie van de schilwissel', () => {
  test('schillen/AC-19: elk vak-id in schil-voorbeeld.ts bestaat als vak in vakken.ts', () => {
    const ids: readonly string[] = vakken.map((vak) => vak.id);
    expect(VOORBEELD_ITEMS.map((item) => item.vak).filter((vak) => !ids.includes(vak))).toStrictEqual([]);
  });

  test('schillen/AC-19: negen items met elk een eigen href die de keuze vasthoudt; drie zijn de eerste drie', () => {
    const nine = voorbeeldNav({ schil: 'topbalk', items: 9 });
    expect(nine).toHaveLength(9);
    expect(new Set(nine.map((item) => item.href)).size).toBe(9);
    expect(nine[3]?.href).toBe('/design-system?schil=topbalk&items=9&vak=formulieren');
    expect(voorbeeldNav({ schil: 'sidebar', items: 3 }).map((item) => item.label)).toStrictEqual(
      nine.slice(0, 3).map((item) => item.label),
    );
    expect(voorbeeldHref({ schil: 'sidebar', items: 3 }, { vak: 'gegevens', q: 'Card' })).toBe(
      '/design-system?schil=sidebar&items=3&vak=gegevens&q=Card',
    );
  });

  test('schillen/AC-9: de keuze telt alleen op /design-system en met design-system:read', () => {
    expect(schilKeuze('/design-system', { schil: 'topbalk', items: 9 }, true)).toStrictEqual({
      schil: 'topbalk',
      items: 9,
    });
    expect(schilKeuze('/design-system', { schil: 'sidebar', items: '3' }, true)).toStrictEqual({
      schil: 'sidebar',
      items: 3,
    });
    expect(schilKeuze('/design-system', { schil: 'topbalk', items: 7 }, true)).toStrictEqual({
      schil: 'topbalk',
      items: 3,
    });
    expect(schilKeuze('/design-system', { schil: 'onzin' }, true)).toBeNull();
    expect(schilKeuze('/design-system', {}, true)).toBeNull();
    expect(schilKeuze('/admin', { schil: 'topbalk' }, true)).toBeNull();
    expect(schilKeuze('/design-system', { schil: 'topbalk' }, false)).toBeNull();
  });
});
