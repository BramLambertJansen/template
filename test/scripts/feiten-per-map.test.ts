import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { adrOverzicht, nextAdr } from '../../scripts/kit/feiten-tekst.mjs';
import { expectAbsent } from '../support/absence';
import { commit, git, tempDir, opruimen, write } from '../hooks/follow-up-kit';

// templateregime/AC-11 (ADR 0089 punt 1 en 6): `feiten adr` en `feiten specs` tonen twee lijsten met een kop per map, de map van
// de app eerst; het volgende ADR-nummer telt per map (volledige lijst, verwijderde en door main gebruikte nummers blijven
// gereserveerd, een nummer in de ene map reserveert niets in de andere). De reeks 0001-0099 / 0100+ bestaat niet meer.
afterEach(opruimen);
const REPO = path.resolve('.');
const script = path.resolve('scripts/kit/feiten.mjs');
const APP = 'docs/adr/';
const TEMPLATE = 'docs/template/adr/';
const APP_SPECS = 'docs/specs/';
const TEMPLATE_SPECS = 'docs/template/specs/';

const adr = (nummer: string, status: string, titel = 'Demo'): string => `# ${nummer} — ${titel}\n\nStatus: ${status}\n`;
const spec = (status: string): string =>
  `---\nstatus: ${status}\nnamespace: demo\n---\n\n# Demo\n\n## Hergebruik en UX\n\nKit.\n`;

/** Een repo met één commit, die ook `origin/main` is; de docs-mappen vullen de tests zelf. */
function leeg(): { root: string; base: string } {
  const root = tempDir('feiten-per-map-');
  git(root, ['init', '-q', '-b', 'main']);
  write(root, 'README.md', 'Voorbeeld.\n');
  const base = commit(root, 'baseline');
  git(root, ['update-ref', 'refs/remotes/origin/main', base]);
  return { root, base };
}

function draai(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CLAUDECODE: '0' },
  });
}

function uitvoer(cwd: string, ...args: string[]): string {
  const result = draai(cwd, ...args);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

/** De regels `- ...` onder elke kop `docs/.../:`, in volgorde van de koppen. */
function lijsten(tekst: string): Map<string, string[]> {
  const uit = new Map<string, string[]>();
  let huidige: string[] | undefined;
  for (const regel of tekst.split('\n')) {
    const kop = /^(docs\/[\w/]+\/):$/.exec(regel)?.[1];
    if (kop !== undefined) uit.set(kop, (huidige = []));
    else if (regel.startsWith('- ')) huidige?.push(regel);
  }
  return uit;
}

/** Het vrije nummer per map uit de regel `volgende: 0003 (docs/adr/) · 0002 (docs/template/adr/)`. */
function volgende(tekst: string): Record<string, string> {
  const regel = tekst.split('\n').find((r) => r.startsWith('volgende: ')) ?? '';
  return Object.fromEntries(
    [...regel.matchAll(/(\d{4}) \((docs\/[\w/]+\/)\)/g)].map(([, nummer = '', map = '']) => [map, nummer]),
  );
}

const volgendeVan = (root: string, ...args: string[]) => volgende(uitvoer(root, 'adr', ...args));

describe('templateregime/AC-11 feiten adr: twee lijsten met een kop per map, app eerst', () => {
  test('templateregime/AC-11 elke map een eigen kop en lijst, de map van de app voor die van de template', () => {
    const { root } = leeg();
    write(root, 'docs/adr/0001-app.md', adr('0001', 'geaccepteerd', 'App-besluit'));
    write(root, 'docs/template/adr/0002-template.md', adr('0002', 'geaccepteerd', 'Template-besluit'));
    commit(root);

    const tekst = uitvoer(root, 'adr');
    const perMap = lijsten(tekst);

    expect([...perMap.keys()]).toStrictEqual([APP, TEMPLATE]);
    expect(perMap.get(APP)).toStrictEqual(['- 0001 · App-besluit · geaccepteerd']);
    expect(perMap.get(TEMPLATE)).toStrictEqual(['- 0002 · Template-besluit · geaccepteerd']);
    expect(tekst.indexOf(`${APP}:`)).toBeLessThan(tekst.indexOf(`${TEMPLATE}:`));
  });

  test('templateregime/AC-11 een lege map van de app blijft zichtbaar als kop zonder rijen', () => {
    const { root } = leeg();
    write(root, 'docs/template/adr/0002-template.md', adr('0002', 'geaccepteerd'));
    commit(root);

    const perMap = lijsten(uitvoer(root, 'adr'));

    expect([...perMap.keys()]).toStrictEqual([APP, TEMPLATE]);
    expect(perMap.get(APP)).toStrictEqual([]);
    expect(perMap.get(TEMPLATE)).toHaveLength(1);
  });

  test('templateregime/AC-11 de telregel (overig) staat per map onder zijn eigen kop', () => {
    const { root } = leeg();
    write(root, 'docs/adr/0001-app.md', adr('0001', 'vervallen'));
    write(root, 'docs/template/adr/0001-template.md', adr('0001', 'vervangen door 0002'));
    write(root, 'docs/template/adr/0002-template.md', adr('0002', 'geaccepteerd'));
    commit(root);

    const tekst = uitvoer(root, 'adr');

    expect(tekst).toContain(`overig ${APP}: 0 oudere geaccepteerd, 1 vervangen/vervallen`);
    expect(tekst).toContain(`overig ${TEMPLATE}: 0 oudere geaccepteerd, 1 vervangen/vervallen`);
    expect(lijsten(tekst).get(APP)).toStrictEqual([]);
  });

  test('templateregime/AC-11 --alle toont per map de volledige lijst en geen telregel', () => {
    const { root } = leeg();
    write(root, 'docs/adr/0001-app.md', adr('0001', 'vervallen', 'Oud'));
    write(root, 'docs/template/adr/0001-template.md', adr('0001', 'vervangen door 0002', 'Ouder'));
    commit(root);

    const tekst = uitvoer(root, 'adr', '--alle');

    expect(lijsten(tekst).get(APP)).toStrictEqual(['- 0001 · Oud · vervallen']);
    expect(lijsten(tekst).get(TEMPLATE)).toStrictEqual(['- 0001 · Ouder · vervangen door 0002']);
    expect(tekst).not.toContain('overig ');
  });
});

describe('templateregime/AC-11 feiten specs: twee lijsten met een kop per map, app eerst', () => {
  test('templateregime/AC-11 elke map een eigen kop en lijst, de map van de app voor die van de template', () => {
    const { root } = leeg();
    write(root, 'docs/specs/app-spec.md', spec('goedgekeurd'));
    write(root, 'docs/template/specs/template-spec.md', spec('voorstel'));
    commit(root);

    const tekst = uitvoer(root, 'specs');
    const perMap = lijsten(tekst);

    expect([...perMap.keys()]).toStrictEqual([APP_SPECS, TEMPLATE_SPECS]);
    expect(perMap.get(APP_SPECS)).toStrictEqual(['- app-spec.md · goedgekeurd']);
    expect(perMap.get(TEMPLATE_SPECS)).toStrictEqual(['- template-spec.md · voorstel']);
    expect(tekst.indexOf(`${APP_SPECS}:`)).toBeLessThan(tekst.indexOf(`${TEMPLATE_SPECS}:`));
  });

  test('templateregime/AC-11 sjablonen (_template.md, _mini.md) staan in geen lijst', () => {
    const { root } = leeg();
    write(root, 'docs/specs/_template.md', '# Sjabloon\n');
    write(root, 'docs/specs/_mini.md', '# Mini\n');
    write(root, 'docs/template/specs/echt.md', spec('goedgekeurd'));
    commit(root);

    const perMap = lijsten(uitvoer(root, 'specs'));

    expect(perMap.get(APP_SPECS)).toStrictEqual([]);
    expect(perMap.get(TEMPLATE_SPECS)).toStrictEqual(['- echt.md · goedgekeurd']);
  });

  test('templateregime/AC-11 de telregel telt per map de specs met een andere status dan voorstel en goedgekeurd', () => {
    const { root } = leeg();
    write(root, 'docs/specs/oud.md', spec('gebouwd'));
    write(root, 'docs/template/specs/a.md', spec('gebouwd'));
    write(root, 'docs/template/specs/b.md', spec('gebouwd'));
    write(root, 'docs/template/specs/c.md', spec('vervallen'));
    commit(root);

    const tekst = uitvoer(root, 'specs');

    expect(tekst).toContain(`overig ${APP_SPECS}: 1 gebouwd (feiten specs --alle of ${APP_SPECS})`);
    expect(tekst).toContain(
      `overig ${TEMPLATE_SPECS}: 2 gebouwd, 1 vervallen (feiten specs --alle of ${TEMPLATE_SPECS})`,
    );
  });

  test('templateregime/AC-11 --alle toont per map alle specs, ook gebouwde', () => {
    const { root } = leeg();
    write(root, 'docs/specs/oud.md', spec('gebouwd'));
    write(root, 'docs/template/specs/nieuw.md', spec('vervallen'));
    commit(root);

    const tekst = uitvoer(root, 'specs', '--alle');

    expect(lijsten(tekst).get(APP_SPECS)).toStrictEqual(['- oud.md · gebouwd']);
    expect(lijsten(tekst).get(TEMPLATE_SPECS)).toStrictEqual(['- nieuw.md · vervallen']);
    expect(tekst).not.toContain('overig ');
  });
});

describe('templateregime/AC-11 het volgende ADR-nummer telt per map', () => {
  test('templateregime/AC-11 een lege map begint bij 0001', () => {
    const { root } = leeg();

    expect(volgendeVan(root)).toStrictEqual({ [APP]: '0001', [TEMPLATE]: '0001' });
  });

  test('templateregime/AC-11 het volgende nummer rekent over de volledige lijst, ook als de hoogste vervallen is', () => {
    const { root } = leeg();
    write(root, 'docs/adr/0010-actief.md', adr('0010', 'geaccepteerd'));
    write(root, 'docs/adr/0052-laatste.md', adr('0052', 'vervallen'));
    write(root, 'docs/template/adr/0020-actief.md', adr('0020', 'geaccepteerd'));
    write(root, 'docs/template/adr/0031-laatste.md', adr('0031', 'vervangen door 0020'));
    commit(root);

    expect(volgendeVan(root)).toStrictEqual({ [APP]: '0053', [TEMPLATE]: '0032' });
  });

  test('templateregime/AC-11 standaard en --alle geven hetzelfde volgende nummer', () => {
    const { root } = leeg();
    write(root, 'docs/adr/0052-laatste.md', adr('0052', 'vervallen'));
    write(root, 'docs/template/adr/0031-laatste.md', adr('0031', 'vervallen'));
    commit(root);

    expect(volgendeVan(root, '--alle')).toStrictEqual(volgendeVan(root));
  });

  test('templateregime/AC-11 een verwijderd nummer blijft in zijn map gereserveerd zonder fictief ADR in de lijst', () => {
    const { root } = leeg();
    write(root, 'docs/adr/0070-oud.md', adr('0070', 'vervallen'));
    write(root, 'docs/template/adr/0080-oud.md', adr('0080', 'vervallen'));
    commit(root);
    git(root, ['rm', 'docs/adr/0070-oud.md', 'docs/template/adr/0080-oud.md']);
    commit(root);

    const tekst = uitvoer(root, 'adr', '--alle');

    expect(volgende(tekst)).toStrictEqual({ [APP]: '0071', [TEMPLATE]: '0081' });
    expect(lijsten(tekst).get(APP)).toStrictEqual([]);
    expect(lijsten(tekst).get(TEMPLATE)).toStrictEqual([]);
    expectAbsent(tekst, /^- (0070|0080) /m, {
      recognizes: ['- 0070 · Demo · vervallen', '- 0080 · Demo · vervallen'],
      allows: ['- 0071 · Demo · vervallen'],
    });
  });

  test('templateregime/AC-11 een nummer dat main na het aftakken in een map gebruikte wordt in die map vermeden', () => {
    const { root, base } = leeg();
    write(root, 'docs/adr/0070-main.md', adr('0070', 'geaccepteerd'));
    write(root, 'docs/template/adr/0080-main.md', adr('0080', 'geaccepteerd'));
    const main = commit(root);
    git(root, ['update-ref', 'refs/remotes/origin/main', main]);
    git(root, ['checkout', '--detach', base]);

    expect(volgendeVan(root)).toStrictEqual({ [APP]: '0071', [TEMPLATE]: '0081' });
  });

  test('templateregime/AC-11 een nummer in docs/adr/ reserveert niets in docs/template/adr/', () => {
    const { root } = leeg();
    write(root, 'docs/adr/0090-app.md', adr('0090', 'geaccepteerd'));
    commit(root);

    expect(volgendeVan(root)).toStrictEqual({ [APP]: '0091', [TEMPLATE]: '0001' });
  });

  test('templateregime/AC-11 een nummer in docs/template/adr/ reserveert niets in docs/adr/', () => {
    const { root } = leeg();
    write(root, 'docs/template/adr/0090-template.md', adr('0090', 'geaccepteerd'));
    commit(root);

    expect(volgendeVan(root)).toStrictEqual({ [APP]: '0001', [TEMPLATE]: '0091' });
  });

  test('templateregime/AC-11 een verwijderd nummer in de ene map reserveert niets in de andere', () => {
    const { root } = leeg();
    write(root, 'docs/template/adr/0090-oud.md', adr('0090', 'vervallen'));
    commit(root);
    git(root, ['rm', 'docs/template/adr/0090-oud.md']);
    commit(root);

    expect(volgendeVan(root)).toStrictEqual({ [APP]: '0001', [TEMPLATE]: '0091' });
  });

  test('templateregime/AC-11 een niet-ADR-bestand in de docs-mappen reserveert geen nummer', () => {
    const { root } = leeg();
    write(root, 'docs/adr/README.md', '# ADR\n');
    write(root, 'docs/template/specs/0099-geen-adr.md', spec('voorstel'));
    commit(root);

    expect(volgendeVan(root)).toStrictEqual({ [APP]: '0001', [TEMPLATE]: '0001' });
  });
});

// Het archief is met de verhuizing weggehaald (spec templateregime AC-11), maar `docs/adr/archief/` telt zolang het bestaat nog
// in `docs/adr/` (scripts/kit/adr-numbers.mjs); de oude archieftests (compacte-kennisbasis-rails/AC-3) in de nieuwe vorm.
describe('templateregime/AC-11 een overgebleven docs/adr/archief/ telt mee voor docs/adr/ en niet voor de template', () => {
  test('templateregime/AC-11 het archief telt mee, ook als dat het hoogste nummer heeft', () => {
    const { root } = leeg();
    write(root, 'docs/adr/0050-actief.md', adr('0050', 'geaccepteerd'));
    write(root, 'docs/adr/archief/0090-oud.md', adr('0090', 'vervallen'));

    expect(volgendeVan(root)).toStrictEqual({ [APP]: '0091', [TEMPLATE]: '0001' });
  });

  test('templateregime/AC-11 docs/adr/ telt mee, ook als het archief lager eindigt', () => {
    const { root } = leeg();
    write(root, 'docs/adr/0090-actief.md', adr('0090', 'geaccepteerd'));
    write(root, 'docs/adr/archief/0050-oud.md', adr('0050', 'vervallen'));

    expect(volgendeVan(root)).toStrictEqual({ [APP]: '0091', [TEMPLATE]: '0001' });
  });

  test('templateregime/AC-11 de lijst toont het archief niet', () => {
    const { root } = leeg();
    write(root, 'docs/adr/0050-actief.md', adr('0050', 'geaccepteerd'));
    write(root, 'docs/adr/archief/0049-oud.md', adr('0049', 'geaccepteerd'));
    write(root, 'docs/adr/archief/0048-oud.md', adr('0048', 'vervangen door 0050'));

    const tekst = uitvoer(root, 'adr', '--alle');

    expect(lijsten(tekst).get(APP)).toStrictEqual(['- 0050 · Demo · geaccepteerd']);
    expectAbsent(tekst, /^- (0049|0048) /m, {
      recognizes: ['- 0049 · Demo · geaccepteerd', '- 0048 · Demo · vervangen door 0050'],
      allows: ['- 0050 · Demo · geaccepteerd'],
    });
  });
});

describe('templateregime/AC-11 feiten-tekst: het volgende nummer van één map', () => {
  const ADRS = [
    { nummer: '0001', titel: 'Oud', status: 'vervangen door 0039' },
    { nummer: '0039', titel: 'Stack', status: 'geaccepteerd' },
    { nummer: '0039', titel: 'Lintcache', status: 'vervallen' },
    { nummer: '0040', titel: 'Geparkeerd', status: 'voorgesteld' },
  ];

  test('templateregime/AC-11 nextAdr levert één kaal nummer: de hoogste plus één, dubbele nummers en gaten tellen mee', () => {
    expect(nextAdr([])).toBe('0001');
    expect(nextAdr([{ nummer: '0039' }, { nummer: '0039' }, { nummer: '0101' }])).toBe('0102');
  });

  test('templateregime/AC-11 adrOverzicht rekent het volgende nummer over de volledige lijst, ook als de hoogste vervallen is', () => {
    const lijst = [...ADRS, { nummer: '0052', titel: 'Laatste', status: 'vervallen' }];

    expect(adrOverzicht(lijst, false).volgende).toBe('0053');
    expect(adrOverzicht(lijst, true).volgende).toBe('0053');
  });

  test('templateregime/AC-11 adrOverzicht telt gereserveerde nummers (verwijderd, van main) mee', () => {
    expect(adrOverzicht(ADRS, false, ['0070']).volgende).toBe('0071');
    expect(adrOverzicht(ADRS, false, ['0010']).volgende).toBe('0041');
  });

  test('templateregime/AC-11 een gereserveerd nummer komt niet als ADR in de lijst', () => {
    expect(adrOverzicht(ADRS, true, ['0070']).lijst.map(({ nummer }) => nummer)).not.toContain('0070');
  });
});

describe('templateregime/AC-11 feiten in de echte repo', () => {
  const telling = (tekst: string) => tekst.split('\n').filter((regel) => regel.startsWith('- ')).length;

  test("templateregime/AC-11 --alle toont meer ADR's dan standaard en hetzelfde volgende nummer per map", () => {
    const standaard = uitvoer(REPO, 'adr');
    const alles = uitvoer(REPO, 'adr', '--alle');

    expectAbsent(standaard, /· (vervallen|vervangen door \d{4})$/m, {
      recognizes: ['- 0001 · Oud · vervallen', '- 0001 · Oud · vervangen door 0039'],
      allows: ['- 0039 · Stack · geaccepteerd'],
    });
    expect(standaard).toMatch(
      /^overig docs\/template\/adr\/: \d+ oudere geaccepteerd, \d+ vervangen\/vervallen \(feiten adr --alle/m,
    );
    expect(alles).not.toContain('overig ');
    expect(telling(alles)).toBeGreaterThan(telling(standaard));
    expect(Object.keys(volgende(standaard))).toStrictEqual([APP, TEMPLATE]);
    expect(volgende(alles)).toStrictEqual(volgende(standaard));
  });

  test('templateregime/AC-11 adr en specs tonen de kop van de app-map voor die van de template-map', () => {
    expect([...lijsten(uitvoer(REPO, 'adr')).keys()]).toStrictEqual([APP, TEMPLATE]);
    expect([...lijsten(uitvoer(REPO, 'specs')).keys()]).toStrictEqual([APP_SPECS, TEMPLATE_SPECS]);
  });

  test('templateregime/AC-11 de uitvoer noemt de reeks 0099/0100 (template tot 0099, app vanaf 0100) niet meer', () => {
    const tekst = `${uitvoer(REPO, 'adr', '--alle')}\n${uitvoer(REPO, 'adr')}`;

    expectAbsent(tekst, /tot 0099|vanaf 0100|\((?:template|app)(?:,|\))/, {
      recognizes: ['0053 (template, tot 0099) · 0100 (app, vanaf 0100)', '0053 (template)', '0100 (app)'],
      allows: ['volgende: 0090 (docs/adr/) · 0090 (docs/template/adr/)'],
    });
  });

  test('templateregime/AC-11 het volgende nummer van een map staat in de volledige uitvoer zonder sectienaam', () => {
    const tekst = uitvoer(REPO);

    expect(Object.keys(volgende(tekst))).toStrictEqual([APP, TEMPLATE]);
  });
});

describe('templateregime/AC-11 feiten --json', () => {
  const adrRij = z.strictObject({ nummer: z.string(), titel: z.string(), status: z.string() });
  const specRij = z.strictObject({ spec: z.string(), status: z.string() });
  const adrJson = z.strictObject({
    adr: z.strictObject({
      [APP]: z.array(adrRij),
      [`overig ${APP}`]: z.string(),
      [TEMPLATE]: z.array(adrRij),
      [`overig ${TEMPLATE}`]: z.string(),
      volgende: z.string(),
    }),
  });
  const adrAlleJson = z.strictObject({
    adr: z.strictObject({ [APP]: z.array(adrRij), [TEMPLATE]: z.array(adrRij), volgende: z.string() }),
  });
  const specsJson = z.strictObject({
    specs: z.strictObject({
      [APP_SPECS]: z.array(specRij),
      [`overig ${APP_SPECS}`]: z.string(),
      [TEMPLATE_SPECS]: z.array(specRij),
      [`overig ${TEMPLATE_SPECS}`]: z.string(),
    }),
  });
  const specsAlleJson = z.strictObject({
    specs: z.strictObject({ [APP_SPECS]: z.array(specRij), [TEMPLATE_SPECS]: z.array(specRij) }),
  });

  function fixture() {
    const { root } = leeg();
    write(root, 'docs/adr/0001-app.md', adr('0001', 'geaccepteerd', 'App'));
    write(root, 'docs/template/adr/0002-template.md', adr('0002', 'vervallen', 'Template'));
    write(root, 'docs/specs/app.md', spec('goedgekeurd'));
    write(root, 'docs/template/specs/template.md', spec('gebouwd'));
    commit(root);
    return root;
  }

  test('templateregime/AC-11 adr --json: een lijst en een telregel per map plus één regel volgende', () => {
    const json = adrJson.parse(JSON.parse(uitvoer(fixture(), 'adr', '--json')));

    expect(json.adr[APP]).toStrictEqual([{ nummer: '0001', titel: 'App', status: 'geaccepteerd' }]);
    expect(json.adr[TEMPLATE]).toStrictEqual([]);
    expect(json.adr[`overig ${TEMPLATE}`]).toContain('1 vervangen/vervallen');
    expect(json.adr.volgende).toBe(`0002 (${APP}) · 0003 (${TEMPLATE})`);
  });

  test('templateregime/AC-11 adr --alle --json: de volledige lijst per map, zonder telregels', () => {
    const json = adrAlleJson.parse(JSON.parse(uitvoer(fixture(), 'adr', '--alle', '--json')));

    expect(json.adr[TEMPLATE]).toStrictEqual([{ nummer: '0002', titel: 'Template', status: 'vervallen' }]);
  });

  test('templateregime/AC-11 specs --json: een lijst en een telregel per map', () => {
    const json = specsJson.parse(JSON.parse(uitvoer(fixture(), 'specs', '--json')));

    expect(json.specs[APP_SPECS]).toStrictEqual([{ spec: 'app.md', status: 'goedgekeurd' }]);
    expect(json.specs[TEMPLATE_SPECS]).toStrictEqual([]);
    expect(json.specs[`overig ${TEMPLATE_SPECS}`]).toBe(`1 gebouwd (feiten specs --alle of ${TEMPLATE_SPECS})`);
  });

  test('templateregime/AC-11 specs --alle --json: alle specs per map, zonder telregels', () => {
    const json = specsAlleJson.parse(JSON.parse(uitvoer(fixture(), 'specs', '--alle', '--json')));

    expect(json.specs[TEMPLATE_SPECS]).toStrictEqual([{ spec: 'template.md', status: 'gebouwd' }]);
  });
});
