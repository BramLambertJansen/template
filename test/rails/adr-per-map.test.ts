import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { documentKind } from '../../rails/hooks/lib/document-state.mjs';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// templateregime/AC-9 (ADR 0089 punt 1, 4 en 6): `check-docs` toetst `docs/adr/`, `docs/specs/`, `docs/template/adr/` en
// `docs/template/specs/` gelijk: links, statuswoorden, unieke nummers per map, kopnummer gelijk aan bestandsnummer en AC naar
// test. Een nummer telt per map; de reeks 0001-0099 / 0100+ bestaat niet meer.
const ADR_MAPPEN = ['docs/adr', 'docs/template/adr'] as const;
const SPEC_MAPPEN = ['docs/specs', 'docs/template/specs'] as const;
const DUBBEL_PREFIX: Record<(typeof ADR_MAPPEN)[number], string> = {
  'docs/adr': 'docs:adr',
  'docs/template/adr': 'docs:template/adr',
};

const adr = (nummer: string, status = 'geaccepteerd', kop = nummer): string =>
  `# ${kop} — Demo\n\nStatus: ${status}\n\nHet besluit.\n`;

function spec(status: string, extra = ''): string {
  return [
    '---',
    `status: ${status}`,
    'namespace: kaart',
    '---',
    '',
    '# Kaart',
    '',
    '## Hergebruik en UX',
    '',
    'Geen nieuwe UI.',
    '',
    '## Acceptatiecriteria',
    '',
    '- **kaart/AC-1** — Gegeven iets, dan dit.',
    extra,
    '',
  ].join('\n');
}

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'adr-per-map-'));
  const all = { 'package.json': JSON.stringify({ scripts: {} }), ...files };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

// Alleen de meldingen over de documentmappen: de fixture is bewust klein en de rest van check-docs doet hier niet mee.
const DOCUMENT = /^docs:(?:docs\/(?:template\/)?(?:adr|specs)\/|(?:template\/)?adr:\d{4}:dubbel|ac:)/;

async function sleutels(files: Record<string, string>): Promise<string[]> {
  const violations = await docsViolations(repo(files));
  return violations.map((violation) => violation.key).filter((key) => DOCUMENT.test(key));
}

describe('templateregime/AC-9 nummers zijn uniek per map', () => {
  test('templateregime/AC-9 hetzelfde nummer in docs/adr/ en docs/template/adr/ is geen dubbel', async () => {
    const keys = await sleutels({
      'docs/adr/0005-eerste.md': adr('0005'),
      'docs/template/adr/0005-tweede.md': adr('0005'),
    });

    expect(keys).toStrictEqual([]);
  });

  test('templateregime/AC-9 elk nummer van beide mappen mag tegelijk bestaan, ook 0099 en 0100 (de oude reeks is vervallen)', async () => {
    const keys = await sleutels({
      'docs/adr/0042-app.md': adr('0042'),
      'docs/adr/0100-app.md': adr('0100'),
      'docs/template/adr/0042-template.md': adr('0042'),
      'docs/template/adr/0100-template.md': adr('0100'),
      'docs/template/adr/0099-template.md': adr('0099'),
    });

    expect(keys).toStrictEqual([]);
  });

  test.each(ADR_MAPPEN)('templateregime/AC-9 twee keer hetzelfde nummer in %s is rood', async (map) => {
    const keys = await sleutels({
      [`${map}/0005-eerste.md`]: adr('0005'),
      [`${map}/0005-tweede.md`]: adr('0005'),
    });

    expect(keys).toStrictEqual([`${DUBBEL_PREFIX[map]}:0005:dubbel`]);
  });

  test('templateregime/AC-9 een dubbel in de ene map laat de andere map met hetzelfde nummer ongemoeid', async () => {
    const keys = await sleutels({
      'docs/adr/0005-eerste.md': adr('0005'),
      'docs/adr/0005-tweede.md': adr('0005'),
      'docs/template/adr/0005-enige.md': adr('0005'),
    });

    expect(keys).toStrictEqual(['docs:adr:0005:dubbel']);
  });

  test('templateregime/AC-9 een dubbel in beide mappen geeft twee aparte meldingen', async () => {
    const keys = await sleutels({
      'docs/adr/0005-eerste.md': adr('0005'),
      'docs/adr/0005-tweede.md': adr('0005'),
      'docs/template/adr/0005-eerste.md': adr('0005'),
      'docs/template/adr/0005-tweede.md': adr('0005'),
    });

    expect(keys.sort()).toStrictEqual(['docs:adr:0005:dubbel', 'docs:template/adr:0005:dubbel']);
  });
});

describe('templateregime/AC-9 het kopnummer is het bestandsnummer', () => {
  test.each(ADR_MAPPEN)('templateregime/AC-9 een kop met een ander nummer in %s is rood (adr-kop)', async (map) => {
    const bestand = `${map}/0005-demo.md`;

    expect(await sleutels({ [bestand]: adr('0005', 'geaccepteerd', '0006') })).toStrictEqual([
      `docs:${bestand}:adr-kop`,
    ]);
  });

  test.each(ADR_MAPPEN)('templateregime/AC-9 een kop met het bestandsnummer in %s is groen', async (map) => {
    expect(await sleutels({ [`${map}/0005-demo.md`]: adr('0005') })).toStrictEqual([]);
  });
});

describe('templateregime/AC-9 statuswoorden', () => {
  test.each(ADR_MAPPEN)('templateregime/AC-9 een ongeldig statuswoord in een ADR in %s is rood', async (map) => {
    const bestand = `${map}/0005-demo.md`;

    expect(await sleutels({ [bestand]: adr('0005', 'bedacht') })).toStrictEqual([`docs:${bestand}:status`]);
  });

  test.each(['voorgesteld', 'geaccepteerd', 'vervangen door 0006', 'vervallen'])(
    'templateregime/AC-9 het statuswoord "%s" in docs/template/adr/ is groen',
    async (status) => {
      expect(await sleutels({ 'docs/template/adr/0005-demo.md': adr('0005', status) })).toStrictEqual([]);
    },
  );

  test.each(SPEC_MAPPEN)('templateregime/AC-9 een ongeldig statuswoord in een spec in %s is rood', async (map) => {
    const bestand = `${map}/kaart.md`;
    const keys = await sleutels({ [bestand]: spec('bedacht') });

    expect(keys).toStrictEqual([`docs:${bestand}:status`]);
  });

  test.each(['voorstel', 'goedgekeurd', 'vervallen'])(
    'templateregime/AC-9 het statuswoord "%s" in docs/template/specs/ is groen',
    async (status) => {
      expect(await sleutels({ 'docs/template/specs/kaart.md': spec(status) })).toStrictEqual([]);
    },
  );

  test('templateregime/AC-9 een goedgekeurde template-spec zonder "Hergebruik en UX" is rood', async () => {
    const zonder = spec('goedgekeurd').replace('## Hergebruik en UX\n\nGeen nieuwe UI.\n', '');

    expect(await sleutels({ 'docs/template/specs/kaart.md': zonder })).toStrictEqual([
      'docs:docs/template/specs/kaart.md:hergebruik',
    ]);
  });
});

describe('templateregime/AC-9 links', () => {
  test('templateregime/AC-9 een gebroken link in een template-spec is rood', async () => {
    const keys = await sleutels({
      'docs/template/specs/kaart.md': spec('voorstel', 'Zie [de rest](bestaat-niet.md).'),
    });

    expect(keys).toStrictEqual(['docs:docs/template/specs/kaart.md:link:bestaat-niet.md']);
  });

  test.each([...ADR_MAPPEN, ...SPEC_MAPPEN])(
    'templateregime/AC-9 een gebroken link in een document in %s is rood',
    async (map) => {
      const bestand = ADR_MAPPEN.some((adrMap) => adrMap === map) ? `${map}/0005-demo.md` : `${map}/kaart.md`;
      const tekst = ADR_MAPPEN.some((adrMap) => adrMap === map)
        ? `${adr('0005')}\nZie [elders](bestaat-niet.md).\n`
        : spec('voorstel', 'Zie [elders](bestaat-niet.md).');

      expect(await sleutels({ [bestand]: tekst })).toStrictEqual([`docs:${bestand}:link:bestaat-niet.md`]);
    },
  );

  test('templateregime/AC-9 een link in een template-spec naar een bestaand template-ADR is groen', async () => {
    const keys = await sleutels({
      'docs/template/adr/0005-demo.md': adr('0005'),
      'docs/template/specs/kaart.md': spec('voorstel', 'Zie [het besluit](../adr/0005-demo.md).'),
    });

    expect(keys).toStrictEqual([]);
  });

  test('templateregime/AC-9 een link in een template-spec naar een ADR dat alleen in docs/adr/ staat is rood', async () => {
    const keys = await sleutels({
      'docs/adr/0005-demo.md': adr('0005'),
      'docs/template/specs/kaart.md': spec('voorstel', 'Zie [het besluit](../adr/0005-demo.md).'),
    });

    expect(keys).toStrictEqual(['docs:docs/template/specs/kaart.md:link:../adr/0005-demo.md']);
  });
});

describe('templateregime/AC-9 AC naar test voor gebouwde template-specs', () => {
  const SPEC = 'docs/template/specs/kaart.md';

  test('templateregime/AC-9 een gebouwde template-spec met een AC zonder test is rood', async () => {
    expect(await sleutels({ [SPEC]: spec('gebouwd') })).toStrictEqual(['docs:ac:kaart:AC-1']);
  });

  test('templateregime/AC-9 een test met <namespace>/AC-n dekt het AC van een gebouwde template-spec', async () => {
    const keys = await sleutels({
      [SPEC]: spec('gebouwd'),
      'test/rails/kaart.test.ts': "test('kaart/AC-1 doet iets', () => {});\n",
    });

    expect(keys).toStrictEqual([]);
  });

  test('templateregime/AC-9 een test buiten de testpaden dekt het AC niet', async () => {
    const keys = await sleutels({ [SPEC]: spec('gebouwd'), 'src/kaart.ts': '// kaart/AC-1\n' });

    expect(keys).toStrictEqual(['docs:ac:kaart:AC-1']);
  });

  test('templateregime/AC-9 een goedgekeurde template-spec zonder test wordt niet op AC getoetst', async () => {
    expect(await sleutels({ [SPEC]: spec('goedgekeurd') })).toStrictEqual([]);
  });
});

describe('templateregime/AC-9 documentKind', () => {
  test.each(ADR_MAPPEN)('templateregime/AC-9 %s/0001-x.md is een adr', (map) => {
    expect(documentKind(`${map}/0001-x.md`)).toBe('adr');
  });

  test.each(SPEC_MAPPEN)('templateregime/AC-9 %s/x.md is een spec', (map) => {
    expect(documentKind(`${map}/x.md`)).toBe('spec');
  });

  test.each([
    'docs/template/adr/x.md',
    'docs/template/specs/0001-x.md.bak',
    'docs/template/other/x.md',
    'docs/template/x.md',
  ])('templateregime/AC-9 %s is geen document', (file) => {
    expect(documentKind(file)).toBeNull();
  });
});
