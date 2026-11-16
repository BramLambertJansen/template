import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { APP_PAYMENTS } from '../rails/app-padtabel-kit';
import { nieuw } from '../rails/padtabel-kit';
import { ROOT, draai, nieuweMap, schrijf } from './app-padtabel-fixture';

// app-padtabel/AC-10: `node scripts/kit/feiten.mjs pad <pad>` leest `.claude/gates.json` en het app-bestand uit de werkmap en
// noemt een bron uit het app-bestand als `<glob> (app)`. De CLI draait in een fixture-map (cwd), het script is dat van de repo.
const FEITEN = path.join(ROOT, 'scripts/kit/feiten.mjs');
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function feitenPad(pad: string, opzet: { app?: string | object }) {
  const dir = nieuweMap('app-padtabel-feiten-', dirs);
  schrijf(dir, { '.claude/gates.json': JSON.stringify(nieuw()) });
  if (opzet.app !== undefined)
    schrijf(dir, { '.claude/gates.app.json': typeof opzet.app === 'string' ? opzet.app : JSON.stringify(opzet.app) });
  return draai(dir, [process.execPath, FEITEN, 'pad', pad]);
}

describe('app-padtabel/AC-10 feiten.mjs pad met het app-bestand', () => {
  test('app-padtabel/AC-10: payments/x.ts toont schrijven voorReview en besluit besluit-pr, beide uit payments/** (app)', () => {
    const uit = feitenPad('payments/x.ts', { app: APP_PAYMENTS });

    expect(uit.status).toBe(0);
    expect(uit.stdout).toBe(
      'payments/x.ts: schrijven voorReview (payments/** (app)), besluit besluit-pr (payments/** (app))\n',
    );
  });

  test('app-padtabel/AC-10: zonder app-bestand is payments/x.ts vrij en eigenaar uit de standaard (zoals nu)', () => {
    const uit = feitenPad('payments/x.ts', {});

    expect(uit.status).toBe(0);
    expect(uit.stdout).toBe('payments/x.ts: schrijven vrij (standaard), besluit eigenaar (standaard)\n');
  });

  test('app-padtabel/AC-10: een templaterij blijft zonder (app); zonder app-bestand en met een app-bestand', () => {
    const zonder = feitenPad('src/core/x.ts', {});
    const met = feitenPad('src/core/x.ts', { app: APP_PAYMENTS });

    expect(zonder.status).toBe(0);
    expect(zonder.stdout).toContain('schrijven gate (src/core/**)');
    expect(zonder.stdout).not.toContain('(app)');
    expect(met.stdout).toBe(zonder.stdout);
  });

  test('app-padtabel/AC-10: een app-rij die één kolom aanscherpt, noemt de app als bron van die kolom en de template van de andere', () => {
    const uit = feitenPad('src/core/api/x.ts', { app: { paden: { 'src/core/api/**': { besluit: 'besluit-pr' } } } });

    expect(uit.status).toBe(0);
    expect(uit.stdout).toBe(
      'src/core/api/x.ts: schrijven gate (src/core/**), besluit besluit-pr (src/core/api/** (app))\n',
    );
  });

  test('app-padtabel/AC-10: een app-rij met agent telt als eigenaar en noemt de app-glob als bron', () => {
    const uit = feitenPad('payments/x.ts', { app: { paden: { 'payments/**': { besluit: 'agent' } } } });

    expect(uit.status).toBe(0);
    expect(uit.stdout).toContain('besluit eigenaar');
    expect(uit.stdout).not.toContain('besluit agent');
  });

  test('app-padtabel/AC-10: een app-bestand met ongeldige JSON geeft exit 1, geen niveau', () => {
    const uit = feitenPad('payments/x.ts', { app: '{kapot' });

    expect(uit.status).toBe(1);
    expect(uit.stdout).toBe('');
  });

  test('app-padtabel/AC-10: een app-bestand zonder paden geeft exit 1, geen niveau', () => {
    const uit = feitenPad('payments/x.ts', { app: '{}' });

    expect(uit.status).toBe(1);
    expect(uit.stdout).toBe('');
  });
});
