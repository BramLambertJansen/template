import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

// tests-naar-vermogen AC-1, AC-2, AC-6 (CI-kenmerk) en AC-7 met een geïnjecteerde proef.
// Vorm van test/setup/vermogen.ts:
//   export default function setup(project: { provide(sleutel: 'kooi', waarde: Kooi): void }, proef?: () => Proef)
//   export function vermogen(naam: 'kooi', lees?: (sleutel: string) => unknown): { ontbreekt: boolean; melding: string }
// `Proef` is `{ soort: 'goed' | 'start-niet' | 'schermt-niet-af', melding: string }` (kooi.mjs `oordeelProef`).
// De setup geeft de uitslag door via provide('kooi', proef); `vermogen` leest hem met `inject` (of `lees`).
type Proef = { soort: 'goed' | 'start-niet' | 'schermt-niet-af'; melding: string };
type Project = { provide: (sleutel: string, waarde: unknown) => void };
type Setup = (project: Project, proef?: () => Proef) => unknown;
type VermogenFn = (naam: string, lees?: (sleutel: string) => unknown) => { ontbreekt: boolean; melding: string };

const START_NIET: Proef = {
  soort: 'start-niet',
  melding: '✗ kooi: bubblewrap start niet (ENOSYS); het commando is niet uitgevoerd',
};
const GOED: Proef = { soort: 'goed', melding: 'goed' };
const SCHERMT_NIET_AF: Proef = {
  soort: 'schermt-niet-af',
  melding: '✗ kooi: de proef schreef buiten de werkmap; het commando is niet uitgevoerd',
};

function isSetup(waarde: unknown): waarde is Setup {
  return typeof waarde === 'function';
}

function isVermogen(waarde: unknown): waarde is VermogenFn {
  return typeof waarde === 'function';
}

async function laad(): Promise<{ setup?: Setup; vermogen?: VermogenFn }> {
  try {
    const mod: unknown = await import(/* @vite-ignore */ path.join(import.meta.dirname, 'vermogen.ts'));
    if (typeof mod !== 'object' || mod === null) return {};
    const setup: unknown = Reflect.get(mod, 'default');
    const vermogen: unknown = Reflect.get(mod, 'vermogen');
    return { ...(isSetup(setup) ? { setup } : {}), ...(isVermogen(vermogen) ? { vermogen } : {}) };
  } catch {
    return {};
  }
}

async function metProef(proef: () => Proef): Promise<{ ontbreekt: boolean; melding: string } | undefined> {
  const { setup, vermogen } = await laad();
  expect(setup, 'default export van test/setup/vermogen.ts').toBeTypeOf('function');
  expect(vermogen, 'export vermogen van test/setup/vermogen.ts').toBeTypeOf('function');
  if (setup === undefined || vermogen === undefined) return undefined;
  const geleverd = new Map<string, unknown>();
  await setup({ provide: (sleutel, waarde) => void geleverd.set(sleutel, waarde) }, proef);
  return vermogen('kooi', (sleutel) => geleverd.get(sleutel));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

function geenCi() {
  vi.stubEnv('CI', '');
  vi.stubEnv('GITHUB_ACTIONS', '');
}

describe('vermogen kooi (AC-1)', () => {
  test('AC-1: soort goed: kooi aanwezig', async () => {
    geenCi();
    expect(await metProef(() => GOED)).toStrictEqual({ ontbreekt: false, melding: GOED.melding });
  });

  test('AC-1: soort start-niet: kooi ontbreekt, met de melding van de proef', async () => {
    geenCi();
    expect(await metProef(() => START_NIET)).toStrictEqual({ ontbreekt: true, melding: START_NIET.melding });
  });

  test('AC-1: soort schermt-niet-af: kooi aanwezig (de tests falen), ook lokaal', async () => {
    geenCi();
    const v = await metProef(() => SCHERMT_NIET_AF);
    expect(v?.ontbreekt).toBe(false);
  });
});

describe('dicht vallen (AC-2)', () => {
  test('AC-2: gooit de proef zelf, dan faalt de setup met die fout (geen overslaan)', async () => {
    geenCi();
    const { setup } = await laad();
    expect(setup, 'default export van test/setup/vermogen.ts').toBeTypeOf('function');
    if (setup === undefined) return;
    const aangeroepen: string[] = [];
    const run = () =>
      Promise.resolve().then(() =>
        setup({ provide: (sleutel) => void aangeroepen.push(sleutel) }, () => {
          throw new Error('proef kapot');
        }),
      );
    await expect(run()).rejects.toThrow('proef kapot');
    expect(aangeroepen).toStrictEqual([]);
  });

  test('AC-2: vermogen() zonder geleverde uitslag gooit met de projectnaam, nooit ontbreekt: true', async () => {
    const { vermogen } = await laad();
    expect(vermogen, 'export vermogen van test/setup/vermogen.ts').toBeTypeOf('function');
    if (vermogen === undefined) return;
    // Dit bestand draait in het project `unit`.
    expect(() => vermogen('kooi', () => undefined)).toThrow(/unit/);
  });
});

describe('CI-kenmerk en ontbrekende kooi (AC-6, AC-7)', () => {
  const MELDING_CI = `✗ kooi ontbreekt in CI (${START_NIET.melding}); in CI slaat geen test over (ADR 0088)`;

  test.each([
    ['GITHUB_ACTIONS', 'true'],
    ['GITHUB_ACTIONS', '1'],
    ['CI', 'true'],
    ['CI', '1'],
    ['CI', 'yes'],
  ])('AC-7: %s=%s en kooi ontbreekt: de setup faalt met de CI-melding', async (naam, waarde) => {
    geenCi();
    vi.stubEnv(naam, waarde);
    const { setup } = await laad();
    expect(setup, 'default export van test/setup/vermogen.ts').toBeTypeOf('function');
    if (setup === undefined) return;
    await expect(Promise.resolve().then(() => setup({ provide: () => undefined }, () => START_NIET))).rejects.toThrow(
      MELDING_CI,
    );
  });

  test.each([
    ['CI', ''],
    ['CI', 'false'],
    ['CI', '0'],
    ['GITHUB_ACTIONS', ''],
    ['GITHUB_ACTIONS', 'false'],
    ['GITHUB_ACTIONS', '0'],
  ])('AC-6: %s=%j telt niet als CI: ontbrekende kooi blijft overslaan', async (naam, waarde) => {
    geenCi();
    vi.stubEnv(naam, waarde);
    expect(await metProef(() => START_NIET)).toStrictEqual({ ontbreekt: true, melding: START_NIET.melding });
  });

  test('AC-7: in CI met een werkende kooi faalt de setup niet', async () => {
    geenCi();
    vi.stubEnv('CI', 'true');
    expect(await metProef(() => GOED)).toStrictEqual({ ontbreekt: false, melding: GOED.melding });
  });

  test('AC-7: in CI met schermt-niet-af faalt de setup niet (de tests falen zelf)', async () => {
    geenCi();
    vi.stubEnv('CI', 'true');
    expect((await metProef(() => SCHERMT_NIET_AF))?.ontbreekt).toBe(false);
  });
});
