import { spawnSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { OUDE_KRITIEK, afgeleid, padNiveau } from '../../rails/hooks/lib/padtabel.mjs';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';
import { OUD, REPO, nieuw, nieuwePaden, repo } from './padtabel-kit';

async function meldingen(paden: Record<string, unknown>): Promise<string[]> {
  return (await docsViolations(repo({ gatesTekst: JSON.stringify(nieuw(paden)) }))).map((v) => v.message);
}

describe('padtabel/AC-1 strengste wint, per kolom, in elke volgorde', () => {
  test.each([
    ['src/** eerst', { 'src/**': { besluit: 'agent' }, 'src/core/**': { schrijven: 'gate' } }],
    ['src/core/** eerst', { 'src/core/**': { schrijven: 'gate' }, 'src/**': { besluit: 'agent' } }],
  ])('%s: src/core/x.ts is schrijven gate en besluit eigenaar (padtabel/AC-1)', (_naam, paden) => {
    expect(padNiveau('src/core/x.ts', { paden })).toMatchObject({ schrijven: 'gate', besluit: 'eigenaar' });
  });

  test('src/web/x.ts valt alleen onder src/**: vrij en agent (padtabel/AC-1)', () => {
    const paden = { 'src/core/**': { schrijven: 'gate' }, 'src/**': { besluit: 'agent' } };
    expect(padNiveau('src/web/x.ts', { paden })).toMatchObject({ schrijven: 'vrij', besluit: 'agent' });
  });
});

describe('padtabel/AC-4 onleesbare rij telt streng, een lege rij als vrij/eigenaar', () => {
  test.each([
    ['onbekende kolom', { schrijven: 'gate', kleur: 'rood' }, 'onbekende sleutel kleur'],
    ['onbekende waarde', { schrijven: 'streng' }, 'onbekende waarde streng'],
  ])('%s: padNiveau altijdVragen/besluit-pr en check-docs rood (padtabel/AC-4)', async (_naam, rij, tekst) => {
    const paden = { ...nieuwePaden(), 'extra/**': rij };
    expect(padNiveau('extra/x.ts', { paden })).toMatchObject({ schrijven: 'altijdVragen', besluit: 'besluit-pr' });
    expect(await meldingen(paden)).toContain(`.claude/gates.json: paden.extra/**: ${tekst}`);
  });

  test('een rij die geen object is telt bij lezen als altijdVragen/besluit-pr (padtabel/AC-4)', () => {
    expect(padNiveau('extra/x.ts', { paden: { 'extra/**': 'gate' } })).toMatchObject({
      schrijven: 'altijdVragen',
      besluit: 'besluit-pr',
    });
  });

  test('{}: padNiveau vrij/eigenaar en check-docs rood met "rij zonder kolom" (padtabel/AC-4)', async () => {
    const paden = { ...nieuwePaden(), 'extra/**': {} };
    expect(padNiveau('extra/x.ts', { paden })).toMatchObject({ schrijven: 'vrij', besluit: 'eigenaar' });
    expect(await meldingen(paden)).toContain('.claude/gates.json: paden.extra/**: rij zonder kolom');
  });

  test('paden geen object: de lezer gooit (padtabel/AC-4)', () => {
    expect(() => afgeleid({ ...nieuw(), paden: ['src/**'] })).toThrow();
  });
});

describe('padtabel/AC-6 de oude vorm van 30cc352 levert precies de lijsten van 30cc352', () => {
  test('oude vorm zonder voorReview en altijdVragen: ontbrekend blijft ontbrekend (padtabel/AC-6)', () => {
    const kaal = Object.fromEntries(
      Object.entries(OUD.ruw).filter(([sleutel]) => sleutel !== 'voorReview' && sleutel !== 'altijdVragen'),
    );
    const lijsten = afgeleid(kaal);
    expect(lijsten.voorReview).toBeUndefined();
    expect(lijsten.altijdVragen).toBeUndefined();
    expect(lijsten.kritiek).toEqual([...OUD.kritiek, ...OUD.gates]);
  });
});

describe('padtabel/AC-12 KRITIEK staat alleen nog bevroren in padtabel.mjs', () => {
  test('OUDE_KRITIEK is gelijk aan de fixture van 30cc352 (padtabel/AC-12)', () => {
    expect(OUDE_KRITIEK).toEqual(OUD.kritiek);
  });

  test('alleen padtabel.mjs definieert OUDE_KRITIEK, buiten tests en docs (padtabel/AC-12)', () => {
    // Ook ongetrackte bestanden, zodat de test in de werkmap van de bouw-PR al telt; geen treffer is exit 1, geen fout.
    const definities = spawnSync(
      'git',
      ['grep', '--untracked', '-l', '-E', 'OUDE_KRITIEK\\s*=', '--', '*.mjs', '*.ts', '*.js'],
      { cwd: REPO, encoding: 'utf8' },
    )
      .stdout.split('\n')
      .filter((file) => file !== '' && !file.startsWith('test/') && !/\.(?:test|spec)\./.test(file));
    expect(definities).toEqual(['rails/hooks/lib/padtabel.mjs']);
  });
});
