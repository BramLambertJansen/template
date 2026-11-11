import { describe, expect, test } from 'vitest';
import { gateFast } from '../../scripts/kit/gate-fast.mjs';

// tests-naar-vermogen/AC-8: gate:fast toont onder een groene gate de uitvoerregels die met `⚠ ` beginnen, vóór de lijst.
type Uitslag = { script: string; code: number; output: string; seconds: number };

const WAARSCHUWING =
  '⚠ overgeslagen: 3 tests, want de kooi kan hier niet starten (✗ kooi: x); ze draaien in CI, waar overslaan rood is (ADR 0088)';

async function draai(uitvoer: Record<string, string>, rood: string[] = []) {
  const scripts = Object.keys(uitvoer);
  const run = (script: string): Promise<Uitslag> =>
    Promise.resolve({ script, code: rood.includes(script) ? 1 : 0, output: uitvoer[script] ?? '', seconds: 0 });
  let tekst = '';
  const code = await gateFast(scripts, run, (t: string) => {
    tekst += t;
  });
  return { code, tekst };
}

describe('gate-fast ⚠-regels (AC-8)', () => {
  test('AC-8: een ⚠-regel van een groene gate staat in de uitvoer, vóór de lijst', async () => {
    const { code, tekst } = await draai({
      'test:unit': `ok\n${WAARSCHUWING}\nklaar\n`,
      lint: 'schoon\n',
    });

    expect(code).toBe(0);
    expect(tekst.split('\n')).toContain(WAARSCHUWING);
    expect(tekst.indexOf(WAARSCHUWING)).toBeLessThan(tekst.indexOf('✓ test:unit ('));
    expect(tekst).toContain('✓ gate:fast groen');
  });

  test('AC-8: alleen regels die met ⚠ en een spatie beginnen; de rest van de uitvoer blijft weg', async () => {
    const { tekst } = await draai({
      'test:unit':
        ['ruis', '⚠zonder-spatie', '  ⚠ ingesprongen', 'tekst ⚠ midden', '⚠ echte waarschuwing'].join('\n') + '\n',
    });

    expect(tekst).toContain('⚠ echte waarschuwing');
    expect(tekst).not.toContain('⚠zonder-spatie');
    expect(tekst).not.toContain('ingesprongen');
    expect(tekst).not.toContain('midden');
    expect(tekst).not.toContain('ruis');
  });

  test('AC-8: een groene gate zonder ⚠-regels toont niets extra', async () => {
    const { tekst } = await draai({ lint: 'schoon\n', 'check:docs': 'ok\n' });

    expect(tekst).not.toContain('⚠');
    expect(tekst.split('\n').filter((r) => r !== '')).toHaveLength(3);
  });

  test('AC-8: elke ⚠-regel precies één keer, in registervolgorde van de gates', async () => {
    const { tekst } = await draai({ 'test:unit': '⚠ eerste\n', lint: '⚠ tweede\n⚠ derde\n' });

    expect(tekst.match(/⚠ /g)).toHaveLength(3);
    expect(tekst.indexOf('⚠ eerste')).toBeLessThan(tekst.indexOf('⚠ tweede'));
    expect(tekst.indexOf('⚠ tweede')).toBeLessThan(tekst.indexOf('⚠ derde'));
  });

  test('AC-8: bij een rode gate blijft de rode uitvoer staan en komt de ⚠-regel van een groene gate er niet dubbel in', async () => {
    const { code, tekst } = await draai({ 'test:unit': '⚠ van groen\n', lint: 'FOUT\n' }, ['lint']);

    expect(code).toBe(1);
    expect(tekst).toContain('── lint ──\nFOUT\n');
    expect(tekst.match(/⚠ van groen/g)).toHaveLength(1);
  });
});
