import { execFile } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';
import { banen, gateFast, snelleGates } from '../../scripts/kit/gate-fast.mjs';

type Uitslag = { script: string; code: number; output: string; seconds: number };

const scripts = snelleGates();
const wacht = (ms: number) => new Promise<void>((klaar) => setTimeout(klaar, ms));

function stub(opties: { rood?: string[]; vertraging?: Record<string, number> } = {}) {
  const gestart: string[] = [];
  const klaar: string[] = [];
  const lopend = new Set<string>();
  const gelijktijdig: string[][] = [];
  const run = async (script: string): Promise<Uitslag> => {
    gestart.push(script);
    lopend.add(script);
    gelijktijdig.push([...lopend]);
    await wacht(opties.vertraging?.[script] ?? 1);
    lopend.delete(script);
    klaar.push(script);
    const rood = opties.rood?.includes(script) ?? false;
    return { script, code: rood ? 2 : 0, output: rood ? `FOUT-UIT ${script}\n` : `ok ${script}\n`, seconds: 0 };
  };
  return { run, gestart, klaar, gelijktijdig };
}

async function draai(opties: Parameters<typeof stub>[0] = {}) {
  const s = stub(opties);
  let tekst = '';
  const code = await gateFast(scripts, s.run, (t: string) => {
    tekst += t;
  });
  return { ...s, code, tekst };
}

describe('gate-fast', () => {
  test('elke snelle gate draait precies één keer', async () => {
    const { gestart } = await draai();

    expect(scripts.length).toBeGreaterThan(2);
    expect([...gestart].sort()).toStrictEqual([...scripts].sort());
  });

  test('banen: test:unit en lint elk een eigen baan, de rest in één baan in registervolgorde, niets weg of dubbel', () => {
    const resultaat = banen(scripts);
    const rest = scripts.filter((script) => script !== 'test:unit' && script !== 'lint');

    expect(resultaat).toContainEqual(['test:unit']);
    expect(resultaat).toContainEqual(['lint']);
    expect(resultaat).toContainEqual(rest);
    expect(resultaat).toHaveLength(3);
    expect([...resultaat.flat()].sort()).toStrictEqual([...scripts].sort());
  });

  test('binnen de rest-baan start een gate pas als de vorige klaar is', async () => {
    const rest = banen(scripts).find((baan) => baan.length > 1) ?? [];
    const { gelijktijdig } = await draai();

    expect(rest.length).toBeGreaterThan(1);
    for (const lopend of gelijktijdig)
      expect(lopend.filter((script) => rest.includes(script)).length).toBeLessThanOrEqual(1);
  });

  test('de uitvoer staat in registervolgorde, ook als een latere gate eerder klaar is', async () => {
    const laatste = scripts[scripts.length - 1] ?? '';
    const eerste = scripts[0] ?? '';
    const { tekst, klaar } = await draai({ rood: scripts, vertraging: { [eerste]: 40 } });

    expect(klaar.indexOf(laatste)).toBeLessThan(klaar.indexOf(eerste));
    const posities = scripts.map((script) => tekst.indexOf(`FOUT-UIT ${script}`));
    expect(posities.every((p) => p >= 0)).toBe(true);
    expect(posities).toStrictEqual([...posities].sort((a, b) => a - b));
  });

  test('exitcode 1 als de laatste gate faalt, met zijn uitvoer; 0 als alles groen is', async () => {
    const laatste = scripts[scripts.length - 1] ?? '';
    const rood = await draai({ rood: [laatste] });
    const groen = await draai();

    expect(rood.code).toBe(1);
    expect(rood.tekst).toContain(`FOUT-UIT ${laatste}`);
    expect(groen.code).toBe(0);
    expect(groen.tekst).not.toContain('FOUT-UIT');
  });

  test('een rode gate stopt de andere niet', async () => {
    const eerste = scripts[0] ?? '';
    const { gestart, code, tekst } = await draai({ rood: [eerste] });

    expect(code).toBe(1);
    expect([...gestart].sort()).toStrictEqual([...scripts].sort());
    for (const script of scripts.slice(1)) expect(tekst).toContain(`✓ ${script}`);
  });

  test('test:unit, lint en een gate uit de rest-baan lopen op enig moment tegelijk', async () => {
    const rest = banen(scripts).find((baan) => baan.length > 1) ?? [];
    const vertraging = Object.fromEntries(scripts.map((script) => [script, 20]));
    const { gelijktijdig } = await draai({ vertraging });

    expect(
      gelijktijdig.some(
        (lopend) =>
          lopend.includes('test:unit') && lopend.includes('lint') && lopend.some((script) => rest.includes(script)),
      ),
    ).toBe(true);
  });

  test('rode uitvoer komt vóór de ✓/✗-lijst, en de samenvatting als laatste', async () => {
    const rood = scripts[1] ?? '';
    const { tekst } = await draai({ rood: [rood] });

    const uitvoer = tekst.indexOf(`FOUT-UIT ${rood}`);
    const lijst = tekst.indexOf(`✗ ${rood}`);
    const samenvatting = tekst.indexOf('✗ gate:fast rood');
    expect(uitvoer).toBeGreaterThanOrEqual(0);
    expect(uitvoer).toBeLessThan(tekst.indexOf(`✓ ${scripts[0] ?? ''}`));
    expect(uitvoer).toBeLessThan(lijst);
    expect(lijst).toBeLessThan(samenvatting);
    expect(tekst.trimEnd().endsWith(`gate:fast rood: ${rood}`)).toBe(true);
  });

  test('als entrypoint (pad met spatie): elke gate aangeroepen, exitcode 1, samenvatting noemt de rode gate', async () => {
    const map = await mkdtemp(join(tmpdir(), 'gate fast '));
    try {
      const rood = scripts[1] ?? '';
      const log = join(map, 'aanroepen.log');
      const pnpm = join(map, 'pnpm');
      await writeFile(
        pnpm,
        `#!/bin/sh\necho "$1" >> "$GATE_LOG"\nif [ "$1" = "${rood}" ]; then echo "STUB-FOUT $1"; exit 3; fi\necho "ok $1"\n`,
      );
      await chmod(pnpm, 0o755);

      const env = { ...process.env, PATH: `${map}:${process.env.PATH ?? ''}`, GATE_LOG: log };
      const uitslag = { code: 0, stdout: '' };
      try {
        uitslag.stdout = (await promisify(execFile)(process.execPath, ['scripts/kit/gate-fast.mjs'], { env })).stdout;
      } catch (fout) {
        if (typeof fout !== 'object' || fout === null) throw new Error('onverwachte fout', { cause: fout });
        uitslag.code = 'code' in fout && typeof fout.code === 'number' ? fout.code : -1;
        uitslag.stdout = 'stdout' in fout && typeof fout.stdout === 'string' ? fout.stdout : '';
      }
      const aangeroepen = (await readFile(log, 'utf8')).split('\n').filter(Boolean);

      expect([...aangeroepen].sort()).toStrictEqual([...scripts].sort());
      expect(uitslag.code).toBe(1);
      expect(uitslag.stdout).toContain(`✗ gate:fast rood: ${rood}`);
      expect(uitslag.stdout.indexOf('STUB-FOUT')).toBeLessThan(uitslag.stdout.indexOf(`✗ ${rood}`));
      expect(uitslag.stdout.indexOf(`✗ ${rood}`)).toBeLessThan(uitslag.stdout.indexOf('✗ gate:fast rood'));
    } finally {
      await rm(map, { recursive: true, force: true });
    }
  });
});

// Leerpunt #1000: in de cloud wordt de uitvoer afgekapt en staat de oorzaak onderaan; daarom een kopblok bovenaan.
describe('gate-fast kopblok', () => {
  const FAIL_REGELS = (aantal: number) =>
    Array.from(
      { length: aantal },
      (_, i) => ` FAIL  |unit| src/a${String(i)}.test.ts > suite > test ${String(i)}`,
    ).join('\n');

  async function rapport(opties: { rood: string[]; fails?: number; naam?: string }) {
    const run = (script: string): Promise<Uitslag> => {
      const rood = opties.rood.includes(script);
      const fails = script === 'test:unit' && rood ? `${FAIL_REGELS(opties.fails ?? 0)}\n` : '';
      return Promise.resolve({
        script,
        code: rood ? 2 : 0,
        output: rood ? `${fails}FOUT-UIT ${script}\n` : `ok ${script}\n`,
        seconds: 0,
      });
    };
    let tekst = '';
    const keuze = opties.naam === undefined ? scripts : { scripts, naam: opties.naam };
    const code = await gateFast(keuze, run, (t: string) => {
      tekst += t;
    });
    return { code, tekst, regels: tekst.split('\n') };
  }

  test('de kop met de ✗-regel staat vóór de eerste ── -uitvoer en de samenvattingsregel blijft aan het slot staan', async () => {
    const { tekst, regels } = await rapport({ rood: ['lint'] });
    const kop = '✗ gate:fast rood: lint';

    expect(regels[0]).toBe(kop);
    expect(tekst.indexOf(kop)).toBeLessThan(tekst.indexOf('── '));
    expect(tekst.lastIndexOf(kop)).toBeGreaterThan(tekst.indexOf('── lint ──'));
    expect(tekst.trimEnd().endsWith(kop)).toBe(true);
  });

  test('rode test:unit met FAIL-regels: kop met ✗-regel en Falende tests: vóór de eerste ── , slot ongewijzigd', async () => {
    const { tekst, regels } = await rapport({ rood: ['test:unit'], fails: 2 });
    const lijst = ['src/a0.test.ts > suite > test 0', 'src/a1.test.ts > suite > test 1'];
    const blok = `Falende tests:\n${lijst.join('\n')}\n`;

    expect(regels[0]).toBe('✗ gate:fast rood: test:unit');
    expect(regels[1]).toBe('Falende tests:');
    expect(tekst.startsWith(`✗ gate:fast rood: test:unit\n${blok}── test:unit ──\n`)).toBe(true);
    expect(tekst.endsWith(blok)).toBe(true);
    expect(tekst.split('Falende tests:')).toHaveLength(3);
  });

  test('alleen lint rood (geen FAIL-regels): kop met alleen de ✗-regel, geen Falende tests: bovenaan', async () => {
    const { tekst, regels } = await rapport({ rood: ['lint'] });

    expect(regels[0]).toBe('✗ gate:fast rood: lint');
    expect(regels[1]).toBe('── lint ──');
    expect(tekst.split('Falende tests:')).toHaveLength(1);
  });

  test('rode test:unit zonder FAIL-regels: kop met alleen de ✗-regel', async () => {
    const { tekst, regels } = await rapport({ rood: ['test:unit'], fails: 0 });

    expect(regels.slice(0, 2)).toStrictEqual(['✗ gate:fast rood: test:unit', '── test:unit ──']);
    expect(tekst.split('Falende tests:')).toHaveLength(1);
  });

  test('alles groen: geen kopblok, uitvoer is alleen de ✓-lijst en de groene samenvatting', async () => {
    const { code, tekst } = await rapport({ rood: [] });
    const verwacht = `${scripts.map((script) => `✓ ${script} (0.0 s)\n`).join('')}✓ gate:fast groen\n`;

    expect(code).toBe(0);
    expect(tekst).toBe(verwacht);
  });

  test('een deelnaam komt letterlijk in de kop en in het slot', async () => {
    const naam = 'gate:fast (test-1)';
    const { tekst, regels } = await rapport({ rood: ['test:unit'], fails: 1, naam });
    const kop = `✗ ${naam} rood: test:unit`;

    expect(regels[0]).toBe(kop);
    expect(regels[1]).toBe('Falende tests:');
    expect(tekst.split(kop)).toHaveLength(3);
  });

  test('de kop kapt de lijst af op 20 en noemt de rest, net als het slot', async () => {
    const { tekst, regels } = await rapport({ rood: ['test:unit'], fails: 25 });
    const kop = regels.slice(0, regels.indexOf('── test:unit ──'));

    expect(kop).toHaveLength(1 + 1 + 20 + 1);
    expect(kop[2]).toBe('src/a0.test.ts > suite > test 0');
    expect(kop[21]).toBe('src/a19.test.ts > suite > test 19');
    expect(kop[22]).toBe('… en 5 meer');
    expect(tekst.trimEnd().endsWith(kop.slice(1).join('\n'))).toBe(true);
  });

  test('dubbele FAIL-regels staan in de kop één keer', async () => {
    const run = (script: string): Promise<Uitslag> =>
      Promise.resolve({
        script,
        code: script === 'test:unit' ? 1 : 0,
        output: script === 'test:unit' ? ' FAIL  a.test.ts > t\n FAIL  a.test.ts > t\n' : 'ok\n',
        seconds: 0,
      });
    let tekst = '';
    await gateFast(scripts, run, (t: string) => {
      tekst += t;
    });

    expect(tekst.startsWith('✗ gate:fast rood: test:unit\nFalende tests:\na.test.ts > t\n── test:unit ──\n')).toBe(
      true,
    );
  });
});
