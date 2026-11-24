import { describe, expect, test } from 'vitest';
import { gateFast } from '../../scripts/kit/gate-fast.mjs';

// leerpunt #957: een rode test:unit sluit de uitvoer af met een blok `Falende tests:`, zodat een staart van de uitvoer volstaat.
type Uitslag = { script: string; code: number; output: string; seconds: number };

async function draai(uitvoer: Record<string, string>, rood: string[] = ['test:unit']) {
  const run = (script: string): Promise<Uitslag> =>
    Promise.resolve({ script, code: rood.includes(script) ? 1 : 0, output: uitvoer[script] ?? '', seconds: 0 });
  let tekst = '';
  const code = await gateFast(Object.keys(uitvoer), run, (t: string) => {
    tekst += t;
  });
  return { code, tekst, regels: tekst.replace(/\n$/, '').split('\n') };
}

const fail = (naam: string) => ` FAIL  |unit| ${naam}`;

describe('gate-fast falende tests (leerpunt #957)', () => {
  test('leerpunt #957: een rode test:unit eindigt met het blok Falende tests: per falende test, ontdubbeld, in volgorde', async () => {
    const { code, regels } = await draai({
      'test:unit': [
        fail('test/a.test.ts > groep > naam'),
        'AssertionError: expected 1 to be 2',
        fail('test/b.test.ts > andere'),
        fail('test/a.test.ts > groep > naam'),
        '  FAIL  test/c.test.ts > zonder projectmarkering',
        'Test Files  3 failed',
      ].join('\n'),
    });

    expect(code).toBe(1);
    expect(regels.slice(-4)).toStrictEqual([
      'Falende tests:',
      'test/a.test.ts > groep > naam',
      'test/b.test.ts > andere',
      'test/c.test.ts > zonder projectmarkering',
    ]);
  });

  test('leerpunt #957: het blok staat na de ✓/✗-lijst en de slotregel; de bestaande uitvoer erboven blijft', async () => {
    const { tekst } = await draai({ 'test:unit': `${fail('test/a.test.ts > x')}\n`, lint: 'schoon\n' });

    expect(tekst.indexOf('Falende tests:')).toBeGreaterThan(tekst.indexOf('✗ gate:fast rood: test:unit'));
    expect(tekst.indexOf('Falende tests:')).toBeGreaterThan(tekst.indexOf('✓ lint ('));
    expect(tekst).toContain('── test:unit ──\n');
    expect(tekst.endsWith('Falende tests:\ntest/a.test.ts > x\n')).toBe(true);
  });

  test('leerpunt #957: hooguit 20 regels, daarna "… en <n> meer" als laatste regel', async () => {
    const uitvoer = Array.from({ length: 25 }, (_, i) => fail(`test/t.test.ts > geval ${String(i)}`)).join('\n');
    const { regels } = await draai({ 'test:unit': uitvoer });

    const blok = regels.slice(regels.indexOf('Falende tests:') + 1);
    expect(blok).toHaveLength(21);
    expect(blok[0]).toBe('test/t.test.ts > geval 0');
    expect(blok[19]).toBe('test/t.test.ts > geval 19');
    expect(blok[20]).toBe('… en 5 meer');
  });

  test('leerpunt #957: precies 20 falende tests geeft geen "en meer"-regel', async () => {
    const uitvoer = Array.from({ length: 20 }, (_, i) => fail(`test/t.test.ts > geval ${String(i)}`)).join('\n');
    const { tekst } = await draai({ 'test:unit': uitvoer });

    expect(tekst).toContain('Falende tests:');
    expect(tekst).not.toContain('meer');
  });

  test('leerpunt #957: gekleurde (ANSI) FAIL-regels geven schone namen in het blok', async () => {
    const gekleurd = '\u001b[31m FAIL \u001b[39m \u001b[2m|unit|\u001b[22m test/a.test.ts > groep > naam';
    const { regels } = await draai({ 'test:unit': `${gekleurd}\n` });

    expect(regels.slice(-2)).toStrictEqual(['Falende tests:', 'test/a.test.ts > groep > naam']);
  });

  test('leerpunt #957: een rode test:unit zonder FAIL-regels krijgt geen blok', async () => {
    const { code, tekst } = await draai({ 'test:unit': 'Error: vitest crashte\n' });

    expect([code, tekst.includes('Falende tests:')]).toStrictEqual([1, false]);
  });

  test('leerpunt #957: een groene test:unit met FAIL in de uitvoer krijgt geen blok', async () => {
    const { code, tekst } = await draai({ 'test:unit': `${fail('test/a.test.ts > x')}\n` }, []);

    expect([code, tekst.includes('Falende tests:')]).toStrictEqual([0, false]);
  });

  test('leerpunt #957: een andere rode gate met FAIL-regels krijgt geen blok', async () => {
    const { tekst } = await draai({ 'test:unit': 'ok\n', lint: `${fail('test/a.test.ts > x')}\n` }, ['lint']);

    expect(tekst).not.toContain('Falende tests:');
  });
});
