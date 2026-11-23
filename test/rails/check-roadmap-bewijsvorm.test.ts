import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { exportVan, roep, testpaden } from '../hooks/follow-up-kit';
import { expectAbsent } from '../support/absence';

// B2 (docs/specs/taakmandaat-vervolg.md, mandate-follow-up/AC-10 t/m AC-13 en AC-22): `check:roadmap` leest voor een spec die naar
// `gebouwd` gaat alleen `status: gebouwd # #<PR>; gevalideerd: <40 hex>`, met dezelfde code als het rolhek
// (`documentInfo` en `builtReference` in `rails/hooks/lib/document-state.mjs`). Inline invoer: elke regel van AC-10 is één statusregel in een spec die naar gebouwd gaat.
// De gewijzigde bestaande gevallen staan in test/rails/check-roadmap.test.ts (spec "Bestaande tests die wijzigen").
const ROADMAP_MODULE = ['../../scripts/kit', 'check-roadmap.mjs'].join('/');
const DOCUMENT_STATE_MODULE = ['../../rails/hooks/lib', 'document-state.mjs'].join('/');
const SCRIPT = path.join(import.meta.dirname, '../../scripts/kit/check-roadmap.mjs');

const SHA = 'a'.repeat(40);
const GOEDGEKEURD = '---\nstatus: goedgekeurd\n---\n\n# Spec A\n\nEen spec zonder verwijzing.\n';

function specMet(statusregel: string, extra = ''): string {
  return `---\n${statusregel}\n---\n\n# Spec A\n\nEen spec zonder verwijzing.\n${extra}`;
}

interface Melding {
  key: string;
  message: string;
}

function alsMeldingen(resultaat: unknown): Melding[] {
  if (!Array.isArray(resultaat)) throw new Error('geen lijst van meldingen');
  const lijst: unknown[] = resultaat;
  return lijst.map((item) => {
    if (
      typeof item === 'object' &&
      item !== null &&
      'key' in item &&
      typeof item.key === 'string' &&
      'message' in item &&
      typeof item.message === 'string'
    )
      return { key: item.key, message: item.message };
    throw new Error('geen { key, message }');
  });
}

interface Opties {
  basis: string | null;
  head: string;
  bestanden?: string[];
  hernoemd?: Record<string, string>;
  pad?: string;
}

async function meldingen(opties: Opties): Promise<Melding[]> {
  const pad = opties.pad ?? 'docs/specs/a.md';
  const oud = Object.values(opties.hernoemd ?? {})[0] ?? pad;
  const basis = {
    lees: (p: string) => (p === oud ? opties.basis : null),
    bestanden: opties.basis === null ? [] : [oud],
  };
  const head = {
    lees: (p: string) => (p === pad ? opties.head : null),
    bestanden: [pad, ...(opties.bestanden ?? [])],
    hernoemd: opties.hernoemd ?? {},
  };
  const resultaat = await roep(ROADMAP_MODULE, 'roadmapMeldingen', {
    basis,
    head,
    scripts: { 'test:unit': 'vitest' },
    testpaden: testpaden(),
  });
  return alsMeldingen(resultaat);
}

const STATUSREGELS: [regel: string, geldig: boolean, bestanden?: string[]][] = [
  [`status: gebouwd # #130; gevalideerd: ${SHA}`, true],
  // GEWIJZIGD (gebouwd-zonder-nummer/AC-13, ADR 0062): `gebouwd # #<PR>` zonder SHA is bouwbewijs in de eigen PR; het PR-nummer
  // toetst geen check meer (ADR 0089 punt 5), check:roadmap en builtReference lezen de vorm met dezelfde code.
  ['status: gebouwd # #130', true],
  ['status: gebouwd # test/rails/x.test.ts', false],
  ['status: gebouwd # db/tests/x.sql', false, ['db/tests/x.sql']],
  ['status: gebouwd # `pnpm test:unit`', false],
  ['status: gebouwd # gebouwd in PR #51', false],
  ['status: gebouwd', false],
  [`status: gebouwd # #130; gevalideerd: ${'a'.repeat(39)}`, false],
];

// GEWIJZIGD (gebouwd-zonder-nummer/AC-1, ADR 0095): elke statusregel `status: gebouwd` is bouwbewijs, met of zonder commentaar;
// geen invoer geeft nog spec:bewijs.
describe('mandate-follow-up/AC-10: elke gebouwd-regel is bewijs, geen invoer geeft spec:bewijs (gebouwd-zonder-nummer/AC-1)', () => {
  test.each(STATUSREGELS)('%s', async (regel, _geldig, bestanden = []) => {
    const keys = (await meldingen({ basis: GOEDGEKEURD, head: specMet(regel), bestanden })).map((m) => m.key);
    expect(keys).toStrictEqual([]);
  });

  test('de melding spec:bewijs bestaat niet meer', async () => {
    const resultaat = await meldingen({ basis: GOEDGEKEURD, head: specMet('status: gebouwd') });
    expect(resultaat.map((m) => m.message)).toStrictEqual([]);
  });
});

describe('mandate-follow-up/AC-12: dezelfde parser als het rolhek (document-state.mjs)', () => {
  // GEWIJZIGD (gebouwd-zonder-nummer/AC-1, ADR 0095): builtReference leest nog alleen de oude `# #<PR>`-vorm; check:roadmap
  // eist die niet meer, dus de uitkomst van check:roadmap hangt niet meer van builtReference af.
  test.each(STATUSREGELS)(
    'builtReference blijft de oude vorm lezen en check:roadmap meldt niets voor %s',
    async (regel, geldig, bestanden = []) => {
      const tekst = specMet(regel);
      const reference = await roep(DOCUMENT_STATE_MODULE, 'builtReference', tekst);
      const resultaat = await meldingen({ basis: GOEDGEKEURD, head: tekst, bestanden });
      expect(reference !== null).toBe(geldig);
      expect(resultaat).toStrictEqual([]);
    },
  );

  test('een gebouwd-regel in de frontmatter én een tweede regel die met status: begint: geen melding', async () => {
    const tekst = specMet(`status: gebouwd # #130; gevalideerd: ${SHA}`, '\nstatus: voorstel\n');
    const keys = (await meldingen({ basis: GOEDGEKEURD, head: tekst })).map((m) => m.key);
    expect(keys).toStrictEqual([]);
  });

  // GEWIJZIGD (ADR 0104, gebouwd-zonder-nummer/AC-24): check-roadmap leest de stand uit de gedeelde AC-dekking
  // (`acDekking`, rails/hooks/lib/ac-dekking.mjs) en niet meer uit `documentInfo` of `builtReference`.
  test('check-roadmap.mjs heeft geen eigen statusparser en gebruikt acDekking', () => {
    const bron = readFileSync(SCRIPT, 'utf8');
    expect(bron).toContain('acDekking');
    expect(bron).not.toContain('documentInfo');
    expect(bron).not.toContain('builtReference');
    expectAbsent(bron, /\bstatus:/, {
      recognizes: ['status: gebouwd', 'const STATUS = /^status:\\s*(voorstel)/m'],
      allows: ['// de status van de spec', 'eigenaarStatus'],
    });
    expect(bron).not.toContain('statusBewijs');
    expect(bron).not.toContain('roadmapBewijs');
  });

  test('heeftBewijs en leesItems worden geëxporteerd (hergebruik door de B1-controle)', async () => {
    expect(typeof (await exportVan(ROADMAP_MODULE, 'heeftBewijs'))).toBe('function');
    expect(typeof (await exportVan(ROADMAP_MODULE, 'leesItems'))).toBe('function');
  });
});

describe('mandate-follow-up/AC-13: alleen de overgang wordt gecontroleerd', () => {
  const OUD = specMet('status: gebouwd # gebouwd in PR #51');

  test('de basis was al gebouwd in een oude vorm en head wijzigt hem: geen melding', async () => {
    const head = specMet('status: gebouwd # gebouwd in PR #51', '\nBewerkt.\n');
    expect(await meldingen({ basis: OUD, head })).toStrictEqual([]);
  });

  test('hernoemd, in de basis al gebouwd in een oude vorm: geen melding', async () => {
    const resultaat = await meldingen({
      basis: OUD,
      head: OUD,
      pad: 'docs/specs/b.md',
      hernoemd: { 'docs/specs/b.md': 'docs/specs/a.md' },
    });
    expect(resultaat).toStrictEqual([]);
  });

  test('de basis was gebouwd en head heeft twee statusregels (documentInfo wijst hem af): nog steeds geen melding', async () => {
    const head = specMet('status: gebouwd # gebouwd in PR #51', '\nstatus: voorstel\n');
    expect(await meldingen({ basis: OUD, head })).toStrictEqual([]);
  });
});

describe('mandate-follow-up/AC-22: bewijs op een ingesprongen vervolgregel van het item van de taak', () => {
  test('check:roadmap slaagt: item met (#130) op een nieuwe vervolgregel en een spec met geldige gebouwd-regel', async () => {
    const bestanden = ['docs/roadmap.md', 'docs/specs/a.md'];
    const kop = '# Roadmap\n\n## Stuk\n\n';
    const basisTekst = `${kop}- [ ] Taak: \`docs/specs/a.md\`\n`;
    const headTekst = `${kop}- [x] Taak: \`docs/specs/a.md\`\n  (#130)\n`;
    const spec = specMet(`status: gebouwd # #130; gevalideerd: ${SHA}`);
    const resultaat = await roep(ROADMAP_MODULE, 'roadmapMeldingen', {
      basis: {
        lees: (p: string) => (p === 'docs/roadmap.md' ? basisTekst : p === 'docs/specs/a.md' ? GOEDGEKEURD : null),
        bestanden,
      },
      head: {
        lees: (p: string) => (p === 'docs/roadmap.md' ? headTekst : p === 'docs/specs/a.md' ? spec : null),
        bestanden,
        hernoemd: {},
      },
      scripts: {},
      testpaden: testpaden(),
    });
    expect(alsMeldingen(resultaat)).toStrictEqual([]);
  });
});
