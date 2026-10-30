import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// compacte-kennisbasis-rails PR 2 (docs/specs/compacte-kennisbasis-rails.md, ADR 0063 punt 1 t/m 4, ADR 0053 punt 3 en 4):
// `check-docs` (docsViolations) op echte, tijdelijke git-repositories. Gemeten wordt wat een wijziging TOEVOEGT aan de
// meldingen van een schone basis, zodat de exacte sleutelvorm de test niet vastlegt. Een nieuwe melding noemt het bestand,
// en waar het om een regel gaat het regelnummer, en verwijst naar een framework-§ of R-id, nooit naar een ADR.
interface Melding {
  key: string;
  message: string;
}

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'archief-check-docs-'));
  const all = { 'package.json': JSON.stringify({ scripts: {} }), ...files };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function meldingen(files: Record<string, string>): Promise<Melding[]> {
  return (await docsViolations(repo(files))).map(({ key, message }) => ({ key, message }));
}

/** De meldingen die `files` heeft bovenop die van `basis`. */
async function toegevoegd(basis: Record<string, string>, files: Record<string, string>): Promise<Melding[]> {
  const voor = new Set((await meldingen(basis)).map(({ key }) => key));
  return (await meldingen({ ...basis, ...files })).filter(({ key }) => !voor.has(key));
}

const adr = (nr: string, status: string, extra = ''): string => `# ${nr} — Demo\n\nStatus: ${status}\n${extra}`;
const noemtBestandEnRegel = (melding: Melding, file: string, regel: number): boolean =>
  melding.message.includes(file) && new RegExp(`(?<!\\d)${String(regel)}(?!\\d)`).test(melding.message);

describe('compacte-kennisbasis-rails/AC-3: een nummer in beide mappen is rood', () => {
  test('compacte-kennisbasis-rails/AC-3 hetzelfde nummer in docs/adr/ en archief/', async () => {
    const nieuw = await toegevoegd(
      { 'docs/adr/0060-doel.md': adr('0060', 'geaccepteerd') },
      { 'docs/adr/archief/0060-oud.md': adr('0060', 'vervallen') },
    );
    expect(nieuw.map(({ key }) => key).join(' ')).toMatch(/0060/);
  });

  test('compacte-kennisbasis-rails/AC-3 verschillende nummers in beide mappen: groen', async () => {
    const nieuw = await toegevoegd(
      { 'docs/adr/0060-doel.md': adr('0060', 'geaccepteerd') },
      { 'docs/adr/archief/0059-oud.md': adr('0059', 'vervallen') },
    );
    expect(nieuw).toStrictEqual([]);
  });
});

describe('compacte-kennisbasis-rails/AC-4: links lossen op naar archief/', () => {
  const DOEL = adr('0060', 'vervallen');
  const ADR_ACTIEF = adr('0061', 'geaccepteerd');
  const spec = 'status: voorstel\n';

  test("compacte-kennisbasis-rails/AC-4 een link tussen ADR's in docs/adr/ naar een ADR dat in archief/ staat: groen", async () => {
    const nieuw = await toegevoegd(
      { 'docs/adr/archief/0060-doel.md': DOEL },
      { 'docs/adr/0061-actief.md': `${ADR_ACTIEF}\nZie [0060](0060-doel.md).\n` },
    );
    expect(nieuw).toStrictEqual([]);
  });

  test('compacte-kennisbasis-rails/AC-4 een link met anker naar een ADR in archief/: groen', async () => {
    const nieuw = await toegevoegd(
      { 'docs/adr/archief/0060-doel.md': DOEL },
      { 'docs/adr/0061-actief.md': `${ADR_ACTIEF}\nZie [0060](0060-doel.md#besluit).\n` },
    );
    expect(nieuw).toStrictEqual([]);
  });

  test('compacte-kennisbasis-rails/AC-4 een link vanuit archief/ naar een ADR in docs/adr/ (alsof het bestand nog daar stond): groen', async () => {
    const nieuw = await toegevoegd(
      { 'docs/adr/0061-actief.md': ADR_ACTIEF },
      { 'docs/adr/archief/0060-oud.md': `${DOEL}\nZie [0061](0061-actief.md).\n` },
    );
    expect(nieuw).toStrictEqual([]);
  });

  test('compacte-kennisbasis-rails/AC-4 een link vanuit archief/ naar een ADR in archief/: groen', async () => {
    const nieuw = await toegevoegd(
      { 'docs/adr/archief/0061-oud.md': adr('0061', 'vervallen') },
      { 'docs/adr/archief/0060-oud.md': `${DOEL}\nZie [0061](0061-oud.md).\n` },
    );
    expect(nieuw).toStrictEqual([]);
  });

  test('compacte-kennisbasis-rails/AC-4 een relatieve link vanuit archief/ naar een spec (../specs/..): groen', async () => {
    const nieuw = await toegevoegd(
      { 'docs/specs/demo.md': spec },
      { 'docs/adr/archief/0060-oud.md': `${DOEL}\nZie [spec](../specs/demo.md).\n` },
    );
    expect(nieuw).toStrictEqual([]);
  });

  // Eigenaarbesluit (ADR 0053): links buiten docs/adr/ blijven streng, geen terugval; ze gaan in dezelfde PR naar het nieuwe pad.
  test('compacte-kennisbasis-rails/AC-4 een link buiten docs/adr/ naar docs/adr/NNNN-*.md dat in archief/ staat: rood', async () => {
    const nieuw = await toegevoegd(
      { 'docs/adr/archief/0060-doel.md': DOEL },
      { 'docs/specs/demo.md': `${spec}\nZie [0060](../adr/0060-doel.md).\n` },
    );
    expect(nieuw.some(({ message }) => message.includes('docs/specs/demo.md'))).toBe(true);
  });

  test('compacte-kennisbasis-rails/AC-4 een link buiten docs/adr/ rechtstreeks naar het archiefpad: groen', async () => {
    const nieuw = await toegevoegd(
      { 'docs/adr/archief/0060-doel.md': DOEL },
      { 'docs/specs/demo.md': `${spec}\nZie [0060](../adr/archief/0060-doel.md).\n` },
    );
    expect(nieuw).toStrictEqual([]);
  });

  test.each([
    { naam: 'vanuit docs/adr/', file: 'docs/adr/0061-actief.md', link: '[x](0099-weg.md)', kop: ADR_ACTIEF },
    {
      naam: 'vanuit archief/',
      file: 'docs/adr/archief/0061-oud.md',
      link: '[x](0099-weg.md)',
      kop: adr('0061', 'vervallen'),
    },
    {
      naam: 'vanuit archief/ naar een spec die niet bestaat',
      file: 'docs/adr/archief/0061-oud.md',
      link: '[x](../specs/weg.md)',
      kop: adr('0061', 'vervallen'),
    },
    {
      naam: 'naar een pad in archief/ dat niet bestaat',
      file: 'docs/adr/0061-actief.md',
      link: '[x](archief/0099-weg.md)',
      kop: ADR_ACTIEF,
    },
  ])('compacte-kennisbasis-rails/AC-4 een niet-bestaand pad $naam: rood', async ({ file, link, kop }) => {
    const nieuw = await toegevoegd({ 'docs/adr/archief/0060-doel.md': DOEL }, { [file]: `${kop}\n${link}\n` });
    expect(nieuw.some(({ message }) => message.includes(file))).toBe(true);
  });
});

describe('compacte-kennisbasis-rails/AC-5: een spec onder docs/template/specs/ valt onder AC-traceerbaarheid', () => {
  const spec = (status: string): string =>
    [
      '---',
      `status: ${status}`,
      'namespace: mijn',
      '---',
      '',
      '# Mijn spec',
      '',
      '## Hergebruik en UX',
      '',
      'Geen nieuwe UI.',
      '',
      '## Acceptatiecriteria',
      '',
      '- **mijn/AC-1** — Gegeven iets, dan dit.',
      '',
    ].join('\n');
  const SPEC = 'docs/template/specs/mijn-spec.md';

  test('compacte-kennisbasis-rails/AC-5 een gebouwde spec zonder test voor AC-1: docs:ac:mijn-spec:AC-1', async () => {
    const keys = (await meldingen({ [SPEC]: spec('gebouwd') })).map(({ key }) => key);
    expect(keys).toContain('docs:ac:mijn-spec:AC-1');
  });

  test('compacte-kennisbasis-rails/AC-5 met een test die mijn/AC-1 noemt: geen overtreding', async () => {
    const keys = (
      await meldingen({ [SPEC]: spec('gebouwd'), 'test/rails/mijn.test.ts': "test('mijn/AC-1: iets', () => {});\n" })
    ).map(({ key }) => key);
    expect(keys.filter((key) => key.startsWith('docs:ac:'))).toStrictEqual([]);
  });

  test('compacte-kennisbasis-rails/AC-5 een niet-gebouwde spec heeft geen AC-plicht', async () => {
    const keys = (await meldingen({ [SPEC]: spec('goedgekeurd') })).map(({ key }) => key);
    expect(keys.filter((key) => key.startsWith('docs:ac:'))).toStrictEqual([]);
  });
});

describe('compacte-kennisbasis-rails/AC-6: framework §N buiten §1 t/m §12 en §11a is rood', () => {
  const bestanden = [
    ['docs/dod.md', 'docs/dod.md'],
    ['AGENTS.md', 'AGENTS.md'],
    ['een skill', '.claude/skills/demo/SKILL.md'],
    ['een spec', 'docs/specs/demo.md'],
  ] as const;

  test.each([
    'framework §13',
    'framework.md §13',
    'framework §0',
    'framework.md §99',
    'framework §11b',
    'framework §12a',
    'docs/framework.md §14',
  ])('compacte-kennisbasis-rails/AC-6 %s in docs/dod.md: rood met bestand en regel', async (verwijzing) => {
    const nieuw = await toegevoegd({}, { 'docs/dod.md': `# Dod\n\nZie (${verwijzing}) voor de regel.\n` });
    const melding = nieuw.find(({ message }) => message.includes('docs/dod.md'));
    expect(melding, JSON.stringify(nieuw)).toBeDefined();
    expect(noemtBestandEnRegel(melding ?? { key: '', message: '' }, 'docs/dod.md', 3)).toBe(true);
    expect(melding?.message).not.toMatch(/ADR \d{4}/);
  });

  test.each(bestanden)('compacte-kennisbasis-rails/AC-6 framework §13 in %s: rood', async (_naam, file) => {
    const nieuw = await toegevoegd({}, { [file]: 'status: voorstel\n\nZie framework §13.\n' });
    expect(nieuw.some(({ message }) => message.includes(file))).toBe(true);
  });

  test.each([
    'framework §1',
    'framework §8',
    'framework §10',
    'framework §12',
    'framework §11a',
    'framework.md §1',
    'framework.md §11a',
    'docs/framework.md §6',
  ])('compacte-kennisbasis-rails/AC-6 %s: groen', async (verwijzing) => {
    const nieuw = await toegevoegd({}, { 'docs/dod.md': `# Dod\n\nZie (${verwijzing}) voor de regel.\n` });
    expect(nieuw).toStrictEqual([]);
  });

  test.each([
    ['docs/adr/0061-actief.md', adr('0061', 'geaccepteerd', '\nDit volgt framework §13 en framework.md §99.\n')],
    ['docs/adr/archief/0061-oud.md', adr('0061', 'vervallen', '\nDit volgt framework §13 en framework.md §99.\n')],
  ])('compacte-kennisbasis-rails/AC-6 een ADR is onwijzigbaar, uitzondering voor %s', async (file, tekst) => {
    const nieuw = await toegevoegd({}, { [file]: tekst });
    expect(nieuw).toStrictEqual([]);
  });
});

describe('compacte-kennisbasis-rails/AC-7: een backtick-pad in docs/framework.md bestaat of is gemarkeerd', () => {
  const BASIS = { 'scripts/kit/echt.mjs': 'export {};\n' };
  const framework = (regel: string): Record<string, string> => ({ 'docs/framework.md': `# Framework\n\n${regel}\n` });

  test('compacte-kennisbasis-rails/AC-7 een pad dat niet bestaat en niet gemarkeerd is: rood met bestand en regel', async () => {
    const nieuw = await toegevoegd(BASIS, framework('Zie `scripts/kit/weg.mjs` voor details.'));
    const melding = nieuw.find(({ message }) => message.includes('docs/framework.md'));
    expect(melding, JSON.stringify(nieuw)).toBeDefined();
    expect(noemtBestandEnRegel(melding ?? { key: '', message: '' }, 'docs/framework.md', 3)).toBe(true);
    expect(melding?.message).toContain('scripts/kit/weg.mjs');
  });

  test('compacte-kennisbasis-rails/AC-7 een pad dat niet bestaat met (nog niet gebouwd) direct erachter: groen', async () => {
    expect(
      await toegevoegd(BASIS, framework('Zie `scripts/kit/weg.mjs` (nog niet gebouwd) voor details.')),
    ).toStrictEqual([]);
  });

  test('compacte-kennisbasis-rails/AC-7 een bestaand pad zonder markering: groen', async () => {
    expect(await toegevoegd(BASIS, framework('Zie `scripts/kit/echt.mjs` voor details.'))).toStrictEqual([]);
  });

  test('compacte-kennisbasis-rails/AC-7 de markering bij een bestaand pad: rood', async () => {
    const nieuw = await toegevoegd(BASIS, framework('Zie `scripts/kit/echt.mjs` (nog niet gebouwd) voor details.'));
    const melding = nieuw.find(({ message }) => message.includes('docs/framework.md'));
    expect(melding, JSON.stringify(nieuw)).toBeDefined();
    expect(noemtBestandEnRegel(melding ?? { key: '', message: '' }, 'docs/framework.md', 3)).toBe(true);
  });

  test.each([
    ['de markering staat niet direct erachter', 'Zie `scripts/kit/weg.mjs`, later (nog niet gebouwd).'],
    ['een andere markering', 'Zie `scripts/kit/weg.mjs` (niet gebouwd).'],
    [
      'de markering hoort bij een ander pad',
      'Zie `scripts/kit/weg.mjs` en `scripts/kit/ook-weg.mjs` (nog niet gebouwd).',
    ],
  ])('compacte-kennisbasis-rails/AC-7 %s: rood', async (_naam, regel) => {
    const nieuw = await toegevoegd(BASIS, framework(regel));
    expect(nieuw.some(({ message }) => message.includes('docs/framework.md'))).toBe(true);
  });

  test('compacte-kennisbasis-rails/AC-7 een niet-bestaand pad in een ander document dan framework.md valt buiten deze regel', async () => {
    const nieuw = await toegevoegd(BASIS, { 'docs/dod.md': '# Dod\n\nZie `scripts/kit/weg.mjs`.\n' });
    expect(nieuw).toStrictEqual([]);
  });

  // Een runtime-artefact (door .gitignore genegeerd) bestaat in een verse kopie of CI niet; het wordt niet getoetst.
  const NEGEER = { ...BASIS, '.gitignore': 'scripts/kit/.cache/\n*.log\n' };

  test.each(['scripts/kit/.cache/', 'scripts/kit/.cache/x.json', 'scripts/kit/run.log'])(
    'compacte-kennisbasis-rails/AC-7 een genegeerd pad dat niet bestaat (%s): groen',
    async (pad) => {
      expect(await toegevoegd(NEGEER, framework(`Zie \`${pad}\` voor details.`))).toStrictEqual([]);
    },
  );

  test('compacte-kennisbasis-rails/AC-7 een niet-genegeerd pad dat niet bestaat, naast een .gitignore: rood', async () => {
    const nieuw = await toegevoegd(NEGEER, framework('Zie `scripts/kit/weg.mjs` voor details.'));
    expect(nieuw.some(({ message }) => message.includes('scripts/kit/weg.mjs'))).toBe(true);
  });

  // Een pad achter een symlink kan git niet tracken (zoals `node_modules/.bin` in de proef-kopie); niet in .gitignore.
  /** De meldingen over docs/framework.md in een repo met `vendorlink` als symlink naar een map buiten de repo. */
  async function metSymlink(regel: string): Promise<Melding[]> {
    const { symlinkSync } = await import('node:fs');
    const root = repo({ ...BASIS, ...framework(regel) });
    const ergens = mkdtempSync(path.join(tmpdir(), 'archief-check-docs-ergens-'));
    symlinkSync(ergens, path.join(root, 'vendorlink'), 'dir');
    execFileSync('git', ['add', '-A'], { cwd: root });
    return (await docsViolations(root)).filter(({ message }) => message.includes('docs/framework.md'));
  }

  test('compacte-kennisbasis-rails/AC-7 een pad achter een symlink (vendorlink/x.json): groen', async () => {
    expect(await metSymlink('Zie `vendorlink/x.json` voor details.')).toStrictEqual([]);
  });

  test('compacte-kennisbasis-rails/AC-7 een niet-bestaand pad naast een symlink: rood', async () => {
    const meldingen = await metSymlink('Zie `vendorlink/x.json` en `scripts/kit/weg2.mjs` voor details.');
    expect(meldingen.map(({ message }) => message).join('\n')).toContain('scripts/kit/weg2.mjs');
    expect(meldingen.some(({ message }) => message.includes('vendorlink/x.json'))).toBe(false);
  });
});

describe("compacte-kennisbasis-rails/AC-8: R-id's in .claude/rules/* en het regelboek", () => {
  const REGEL = 'R-DB-03 Elke tabel heeft RLS aan en geforceerd (0042)';
  const boek = (...regels: string[]): Record<string, string> => ({
    'docs/framework.md': `# Framework\n\nDeze regels gelden altijd.\n\n${regels.join('\n')}\n`,
  });
  const padregel = (...regels: string[]): Record<string, string> => ({
    '.claude/rules/database.md': `# Database\n\n${regels.join('\n')}\n`,
  });

  test('compacte-kennisbasis-rails/AC-8 een R-id in .claude/rules/* dat niet in het regelboek staat: rood', async () => {
    const nieuw = await toegevoegd(boek('R-DB-01 Iets anders (0042)'), padregel(REGEL));
    const melding = nieuw.find(({ message }) => message.includes('R-DB-03'));
    expect(melding, JSON.stringify(nieuw)).toBeDefined();
    expect(melding?.message).toContain('.claude/rules/database.md');
  });

  test('compacte-kennisbasis-rails/AC-8 een R-id in .claude/rules/* zonder regelboek: rood', async () => {
    const nieuw = await toegevoegd({}, padregel(REGEL));
    expect(nieuw.some(({ message }) => message.includes('R-DB-03'))).toBe(true);
  });

  test('compacte-kennisbasis-rails/AC-8 een R-id dat letterlijk in het regelboek staat: groen', async () => {
    expect(await toegevoegd({}, { ...boek(REGEL), ...padregel(REGEL) })).toStrictEqual([]);
  });

  test("compacte-kennisbasis-rails/AC-8 meerdere R-id's: alleen het ontbrekende id is rood", async () => {
    const nieuw = await toegevoegd(
      {},
      { ...boek(REGEL), ...padregel(REGEL, 'R-DB-04 Elke policy heeft een test (0042)') },
    );
    expect(nieuw.some(({ message }) => message.includes('R-DB-04'))).toBe(true);
    expect(nieuw.some(({ message }) => message.includes('R-DB-03'))).toBe(false);
  });

  test('compacte-kennisbasis-rails/AC-8 een id met ander nummer telt niet als letterlijk gelijk (R-DB-03 versus R-DB-030): rood', async () => {
    const nieuw = await toegevoegd(boek('R-DB-030 Iets anders (0042)'), padregel(REGEL));
    expect(nieuw.some(({ message }) => message.includes('R-DB-03'))).toBe(true);
  });

  test('compacte-kennisbasis-rails/AC-8 een dubbele R-id in het regelboek: rood en het id wordt genoemd', async () => {
    const nieuw = await toegevoegd({}, boek(REGEL, 'R-DB-04 Andere regel (0042)', 'R-DB-03 Nog een regel (0048)'));
    const melding = nieuw.find(({ message }) => message.includes('R-DB-03'));
    expect(melding, JSON.stringify(nieuw)).toBeDefined();
    expect(melding?.message).toContain('docs/framework.md');
  });

  test("compacte-kennisbasis-rails/AC-8 unieke R-id's in het regelboek: groen", async () => {
    expect(await toegevoegd({}, boek(REGEL, 'R-DB-04 Andere regel (0042)', 'R-API-01 Een route (0045)'))).toStrictEqual(
      [],
    );
  });

  test("compacte-kennisbasis-rails/AC-8 zonder R-id's: groen", async () => {
    expect(
      await toegevoegd({}, { ...boek('Een gewone regel zonder id.'), ...padregel('Een padregel zonder id.') }),
    ).toStrictEqual([]);
  });
});
