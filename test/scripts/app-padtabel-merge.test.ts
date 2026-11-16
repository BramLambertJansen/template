import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { padNiveau } from '../../rails/hooks/lib/padtabel.mjs';
import { codeownersTekst } from '../../scripts/kit/codeowners.mjs';
import { APP_PAYMENTS, laadLoadConfig, laadSamengevoegd } from '../rails/app-padtabel-kit';
import { object } from '../rails/padtabel-kit';
import { ONDERHOUD_REGEL, draai, gatesTekst, git, kopieerKit, nieuweMap, schrijf } from './app-padtabel-fixture';

// app-padtabel/AC-12: een app begint met de uitvoer van `app:init` (`goedkeurders` gewijzigd, `onderhoud` weg, dezelfde
// bewerkingen als scripts/kit/app-init.mjs) en heeft een eigen `.claude/gates.app.json`. De template voegt een rij toe aan
// `.claude/gates.json` en de app doet `git merge template/main`: geen conflict in gates.json, beide rijen gelden.
// CODEOWNERS kan conflicteren; het herstel is opnieuw genereren (docs/nieuwe-app.md).
const dirs: string[] = [];
const APP_EIGENAAR = 'appowner';
const TEMPLATE_RIJ = '"deploy/**": { "schrijven": "gate" }';

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const lees = (dir: string, rel: string) => readFileSync(path.join(dir, rel), 'utf8');
const json = (tekst: string): Record<string, unknown> => object(JSON.parse(tekst));

/** De bewerkingen van `app:init` op gates.json: de onderhoudsregel weg en de handle van de eigenaar op één plek. */
function naAppInit(tekst: string): string {
  expect(tekst).toContain(ONDERHOUD_REGEL);
  return tekst
    .replace(ONDERHOUD_REGEL, '')
    .replace(/"goedkeurders"\s*:\s*\[[^\]]*\]/, `"goedkeurders": ["${APP_EIGENAAR}"]`);
}

/** CODEOWNERS voor een gates-tekst, met de rijen uit een app-tekst erbij (onafhankelijk van `samengevoegd`). */
function codeowners(gates: string, app: string | null, eigenaar: string): string {
  const ruw = json(gates);
  const rijen = app === null ? {} : object(json(app)['paden']);
  return codeownersTekst({ ...ruw, paden: { ...object(ruw['paden']), ...rijen } }, eigenaar);
}

interface Samenvoeging {
  app: string;
  merge: { status: number | null; stderr: string; stdout: string };
  ongemerged: string[];
}

/** Template (commit 1 en 2) en app (init, app-rij), daarna `git merge template/main` in de app. */
function bouw(): Samenvoeging {
  const template = nieuweMap('app-padtabel-template-', dirs);
  const base = gatesTekst();
  git(template, 'init', '-q', '-b', 'main');
  kopieerKit(template);
  schrijf(template, { '.claude/gates.json': base, '.github/CODEOWNERS': codeowners(base, null, 'bramlambertjansen') });
  git(template, 'add', '-A');
  git(template, 'commit', '-q', '-m', 'template: basis');

  const app = path.join(nieuweMap('app-padtabel-app-', dirs), 'app');
  git(template, 'clone', '-q', '-o', 'template', template, app);
  const init = naAppInit(base);
  schrijf(app, { '.claude/gates.json': init, '.github/CODEOWNERS': codeowners(init, null, APP_EIGENAAR) });
  git(app, 'commit', '-q', '-am', 'chore: app:init');
  const appTekst = `${JSON.stringify(APP_PAYMENTS, null, 2)}\n`;
  schrijf(app, { '.claude/gates.app.json': appTekst, '.github/CODEOWNERS': codeowners(init, appTekst, APP_EIGENAAR) });
  git(app, 'add', '-A');
  git(app, 'commit', '-q', '-m', 'feat: payments beschermd pad');

  const nieuweBasis = gatesTekst(TEMPLATE_RIJ);
  schrijf(template, {
    '.claude/gates.json': nieuweBasis,
    '.github/CODEOWNERS': codeowners(nieuweBasis, null, 'bramlambertjansen'),
  });
  git(template, 'commit', '-q', '-am', 'template: rij voor deploy/**');
  git(app, 'fetch', '-q', 'template');
  const merge = draai(app, ['git', 'merge', '--no-edit', 'template/main']);
  const ongemerged = git(app, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
  return { app, merge, ongemerged };
}

describe('app-padtabel/AC-12 een template-update in een app met een app-bestand', () => {
  test('app-padtabel/AC-12: .claude/gates.json geeft geen conflict; alleen CODEOWNERS mag conflicteren', () => {
    const { app, ongemerged } = bouw();
    const gates = lees(app, '.claude/gates.json');

    expect(ongemerged.filter((bestand) => bestand !== '.github/CODEOWNERS')).toEqual([]);
    expect(gates.split('\n').filter((regel) => /^(?:<<<<<<<|>>>>>>>)/.test(regel))).toEqual([]);
    // De template-rij is binnengekomen en de wijzigingen van app:init zijn gebleven.
    expect(gates).toContain(TEMPLATE_RIJ);
    expect(gates).toContain(`"goedkeurders": ["${APP_EIGENAAR}"]`);
    expect(gates).not.toContain('"onderhoud"');
    expect(lees(app, '.claude/gates.app.json')).toContain('payments/**');
  });

  test('app-padtabel/AC-12: de nieuwe templaterij en de app-rij gelden allebei (padNiveau op het samengevoegde object)', async () => {
    const { app } = bouw();
    const samen = (await laadSamengevoegd())(
      json(lees(app, '.claude/gates.json')),
      json(lees(app, '.claude/gates.app.json')),
    );

    expect(padNiveau('deploy/x.ts', samen)).toMatchObject({ schrijven: 'gate' });
    expect(padNiveau('payments/x.ts', samen)).toMatchObject({ schrijven: 'voorReview', besluit: 'besluit-pr' });
    // Een template-update zonder de app-rij lost payments niet: zonder samenvoegen is payments/x.ts vrij.
    expect(padNiveau('payments/x.ts', json(lees(app, '.claude/gates.json'))).schrijven).toBe('vrij');
  });

  test('app-padtabel/AC-12: het rolhek leest beide: loadConfig(gates, app) heeft deploy/** en payments/** als gate', async () => {
    const { app } = bouw();
    const config = (await laadLoadConfig())(lees(app, '.claude/gates.json'), lees(app, '.claude/gates.app.json'));

    expect(config.gates).toEqual(expect.arrayContaining(['deploy/**', 'payments/**']));
    expect(config.voorReview).toContain('payments/**');
    expect(config.kritiek).toContain('payments/**');
  });

  test('app-padtabel/AC-12: het herstel is CODEOWNERS opnieuw genereren: de CLI geeft de afleiding uit beide bestanden', () => {
    const { app } = bouw();

    const uit = draai(app, [process.execPath, 'scripts/kit/codeowners.mjs', '--schrijf']);

    expect(uit.status).toBe(0);
    const verwacht = codeowners(lees(app, '.claude/gates.json'), lees(app, '.claude/gates.app.json'), APP_EIGENAAR);
    expect(lees(app, '.github/CODEOWNERS')).toBe(verwacht);
    expect(verwacht.split('\n').some((regel) => /^\/payments\/\s+@appowner$/.test(regel))).toBe(true);
    expect(verwacht.split('\n').some((regel) => /^\/deploy\/\s+@appowner$/.test(regel))).toBe(true);
  });
});
