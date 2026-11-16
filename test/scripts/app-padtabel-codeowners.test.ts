import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { codeownersTekst } from '../../scripts/kit/codeowners.mjs';
import { APP_PAYMENTS } from '../rails/app-padtabel-kit';
import { nieuw, object } from '../rails/padtabel-kit';
import { draai, kopieerKit, nieuweMap, schrijf } from './app-padtabel-fixture';

// app-padtabel/AC-11 (en AC-5 voor de CLI): `node scripts/kit/codeowners.mjs [--schrijf]` leest `.claude/gates.json` en, als het
// bestaat, `.claude/gates.app.json` uit zijn eigen repo-map. De CLI draait daarom in een kopie van de kit in een fixture-map.
const dirs: string[] = [];
const EIGENAAR = 'bram';

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const gates = (): Record<string, unknown> => ({ ...nieuw(), goedkeurders: [EIGENAAR] });

function fixture(app?: string | object): string {
  const dir = nieuweMap('app-padtabel-codeowners-', dirs);
  kopieerKit(dir);
  schrijf(dir, { '.claude/gates.json': JSON.stringify(gates()), '.github/leeg': '' });
  if (app !== undefined)
    schrijf(dir, { '.claude/gates.app.json': typeof app === 'string' ? app : JSON.stringify(app) });
  return dir;
}

const cli = (dir: string, ...args: string[]) => draai(dir, [process.execPath, 'scripts/kit/codeowners.mjs', ...args]);
const lees = (dir: string) => readFileSync(path.join(dir, '.github/CODEOWNERS'), 'utf8');

/** Wat de CODEOWNERS moet zijn: de gates.json met de app-rijen na de templaterijen (onafhankelijk van `samengevoegd`). */
function verwacht(app: { paden: object }): string {
  const samen = { ...gates(), paden: { ...object(gates()['paden']), ...app.paden } };
  return codeownersTekst(samen, EIGENAAR);
}

describe('app-padtabel/AC-11 codeowners.mjs --schrijf met een app-bestand', () => {
  test('app-padtabel/AC-11: --schrijf schrijft de app-rij, met de eigenaar, naar .github/CODEOWNERS', () => {
    const dir = fixture(APP_PAYMENTS);

    const uit = cli(dir, '--schrijf');

    expect(uit.status).toBe(0);
    expect(lees(dir)).toBe(verwacht(APP_PAYMENTS));
    expect(
      lees(dir)
        .split('\n')
        .some((regel) => /^\/payments\/\s+@bram$/.test(regel)),
    ).toBe(true);
  });

  test('app-padtabel/AC-11: de app-rij staat na de templaterijen en heeft de eigenaar', () => {
    const dir = fixture(APP_PAYMENTS);
    cli(dir, '--schrijf');
    const regels = lees(dir).split('\n');
    const index = regels.findIndex((regel) => /^\/payments\/\s+@bram$/.test(regel));

    expect(index).toBeGreaterThan(-1);
    expect(index).toBe(regels.length - 2); // laatste rij vóór de eindregel
  });

  test('app-padtabel/AC-11: de kop noemt .claude/gates.app.json, met en zonder app-bestand', () => {
    for (const app of [APP_PAYMENTS, undefined]) {
      const dir = fixture(app);
      cli(dir, '--schrijf');
      const kop = lees(dir)
        .split('\n')
        .filter((regel) => regel.startsWith('#'))
        .join('\n');

      expect(kop).toContain('.claude/gates.app.json');
    }
  });

  test('app-padtabel/AC-11: zonder --schrijf gaat dezelfde tekst naar stdout en blijft .github/CODEOWNERS onaangeroerd', () => {
    const dir = fixture(APP_PAYMENTS);

    const uit = cli(dir);

    expect(uit.status).toBe(0);
    expect(uit.stdout).toBe(verwacht(APP_PAYMENTS));
    expect(() => lees(dir)).toThrow();
  });

  test('app-padtabel/AC-11: een app-bestand met een verboden agent maakt de CODEOWNERS niet losser', () => {
    const app = { paden: { 'payments/**': { besluit: 'agent' } } };
    const dir = fixture(app);

    cli(dir, '--schrijf');

    expect(
      lees(dir)
        .split('\n')
        .some((regel) => /^\/payments\/\s*$/.test(regel)),
    ).toBe(false);
    expect(
      lees(dir)
        .split('\n')
        .some((regel) => /^\/payments\/\s+@bram$/.test(regel)),
    ).toBe(true);
  });

  test('app-padtabel/AC-11: een app-bestand dat geen paden heeft, laat de CLI falen (geen stil negeren)', () => {
    const dir = fixture('{}');

    expect(cli(dir, '--schrijf').status).not.toBe(0);
  });

  test('app-padtabel/AC-11: ongeldige JSON in het app-bestand laat de CLI falen', () => {
    const dir = fixture('{kapot');

    expect(cli(dir, '--schrijf').status).not.toBe(0);
  });
});

describe('app-padtabel/AC-5 codeowners.mjs zonder app-bestand', () => {
  test('app-padtabel/AC-5: zonder app-bestand is de uitvoer gelijk aan codeownersTekst van gates.json alleen (plus de nieuwe kop)', () => {
    const dir = fixture();

    const uit = cli(dir);

    expect(uit.status).toBe(0);
    expect(uit.stdout).toBe(codeownersTekst(gates(), EIGENAAR));
    expect(uit.stdout).not.toContain('payments');
  });
});
