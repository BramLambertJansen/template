import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { beslisOvergang, documentInfo, documentKind, isArchief } from '../../rails/hooks/lib/document-state.mjs';
import { specs } from '../../scripts/kit/feiten-secties.mjs';
import { metingen } from '../../scripts/kit/leespad.mjs';

// docs/specs/specarchief-en-bouwvorm.md (ADR 0080), de pure delen: het specarchief in `documentKind`/`isArchief` (AC-1),
// feiten en leespad zonder archief (AC-6), de digest zonder markering en de overgangen van een gebouwde spec (AC-7, AC-12),
// en één vorm `gebouwd # #<PR>` (AC-13).
const SHA = 'a'.repeat(40);
const SPEC = 'docs/specs/demo.md';

/** Een gebouwde spec met AC-1 en, optioneel, extra AC-regels. */
function spec(status: string, extra: string[] = []): string {
  return [
    '---',
    `status: ${status}`,
    'namespace: demo',
    '---',
    '',
    '# Demo',
    '',
    '## Hergebruik en UX',
    '',
    'Bestaande kit.',
    '',
    '## Acceptatiecriteria',
    '',
    '- **demo/AC-1** — Gegeven iets, dan iets.',
    ...extra,
    '',
  ].join('\n');
}

const NIEUW_GEMARKEERD = '- **demo/AC-2** (nog niet gebouwd) — Gegeven meer, dan meer.';
const NIEUW_KAAL = '- **demo/AC-2** — Gegeven meer, dan meer.';

describe('specarchief-en-bouwvorm/AC-1: documentKind en isArchief kennen docs/specs/archief/', () => {
  test('specarchief-en-bouwvorm/AC-1 docs/specs/archief/a.md is een spec in het archief', () => {
    expect([documentKind('docs/specs/archief/a.md'), isArchief('docs/specs/archief/a.md')]).toStrictEqual([
      'spec',
      true,
    ]);
  });

  test.each(['docs/specs/archief/_a.md', 'docs/specs/archief/x/a.md'])(
    'specarchief-en-bouwvorm/AC-1 %s is geen spec en geen archief',
    (pad) => {
      expect([documentKind(pad), isArchief(pad)]).toStrictEqual([null, false]);
    },
  );

  test.each(['docs/specs/a.md', 'docs/template/specs/a.md'])(
    'specarchief-en-bouwvorm/AC-1 %s is een spec, maar niet in het archief',
    (pad) => {
      expect([documentKind(pad), isArchief(pad)]).toStrictEqual(['spec', false]);
    },
  );
});

describe('specarchief-en-bouwvorm/AC-6: feiten en leespad tellen het archief niet (bewaakt tegen terugval)', () => {
  const BESTANDEN: Record<string, string> = {
    'docs/specs/a.md': spec('goedgekeurd'),
    'docs/specs/archief/b.md': spec('vervallen'),
    'docs/specs/archief/x/c.md': spec('vervallen'),
  };
  const MAPPEN: Record<string, string[]> = {
    'docs/specs': ['a.md', 'archief'],
    'docs/specs/archief': ['b.md', 'x'],
    'docs/specs/archief/x': ['c.md'],
  };
  const lezer = { lees: (pad: string) => BESTANDEN[pad] ?? null, lijst: (map: string) => MAPPEN[map] ?? [] };

  test('specarchief-en-bouwvorm/AC-6 feiten.mjs specs noemt alleen docs/specs/a.md', () => {
    // GEWIJZIGD (gebouwd-zonder-nummer/AC-16, ADR 0104): `feiten specs` toont ook de afgeleide stand en de AC-tellingen.
    expect(specs(lezer)).toStrictEqual([{ spec: 'a.md', status: 'goedgekeurd', stand: 'niet', gebouwd: 0, levend: 1 }]);
  });

  test('specarchief-en-bouwvorm/AC-6 pnpm leespad telt één spec, ook met een geneste map in het archief', () => {
    const meting = metingen(Object.keys(BESTANDEN), (pad: string) => BESTANDEN[pad] ?? null).specs;
    expect([meting?.aantal, meting?.grootste.map(({ naam }) => naam)]).toStrictEqual([1, ['docs/specs/a.md']]);
  });
});

describe('specarchief-en-bouwvorm/AC-7: een levende spec en de markering (nog niet gebouwd)', () => {
  test('specarchief-en-bouwvorm/AC-7 de digest telt zonder markering: alleen weghalen is geen inhoudswijziging', () => {
    const met = documentInfo(SPEC, spec('gebouwd # #120', [NIEUW_GEMARKEERD]));
    const zonder = documentInfo(SPEC, spec('gebouwd # #120', [NIEUW_KAAL]));
    expect(met?.digest).toBe(zonder?.digest);
  });

  test('specarchief-en-bouwvorm/AC-7 gebouwd naar gebouwd met dezelfde verwijzing en nieuwe inhoud is een besluit', () => {
    const uitslag = beslisOvergang(SPEC, spec('gebouwd # #120'), spec('gebouwd # #120', [NIEUW_GEMARKEERD]));
    expect(uitslag.uitslag).toBe('besluit');
  });

  // GEWIJZIGD (gebouwd-zonder-nummer/AC-20, ADR 0104): `beslisOvergang` kent geen uitslag `gebouwd` meer; markering weg met
  // een ander PR-nummer in de statusregel (commentaar) en gelijke inhoud is een vrije wijziging.
  test('specarchief-en-bouwvorm/AC-7 markering weg met gebouwd # #<deze PR>: vrij (geen bouwbewijs meer)', () => {
    const uitslag = beslisOvergang(
      SPEC,
      spec('gebouwd # #120', [NIEUW_GEMARKEERD]),
      spec('gebouwd # #130', [NIEUW_KAAL]),
    );
    expect(uitslag.uitslag).toBe('vrij');
  });
});

describe('specarchief-en-bouwvorm/AC-12: de SHA weghalen uit een gebouwd-regel', () => {
  test('specarchief-en-bouwvorm/AC-12 alleen ; gevalideerd: <sha> weg bij gelijke inhoud: vrij', () => {
    expect(beslisOvergang(SPEC, spec(`gebouwd # #130; gevalideerd: ${SHA}`), spec('gebouwd # #130')).uitslag).toBe(
      'vrij',
    );
  });

  // GEWIJZIGD (gebouwd-zonder-nummer/AC-9, ADR 0095): het nummer is commentaar; een ander nummer bij gelijke inhoud is vrij.
  test('specarchief-en-bouwvorm/AC-12 een ander PR-nummer bij gelijke inhoud: vrij', () => {
    expect(beslisOvergang(SPEC, spec(`gebouwd # #130; gevalideerd: ${SHA}`), spec('gebouwd # #131')).uitslag).toBe(
      'vrij',
    );
  });

  // GEWIJZIGD (gebouwd-zonder-nummer/AC-9, ADR 0095): nieuwe inhoud zonder weggehaald merkteken is een besluit, geen bouwbewijs.
  test('specarchief-en-bouwvorm/AC-12 SHA weg en inhoud gewijzigd: besluit', () => {
    const na = spec('gebouwd # #130', ['- **demo/AC-2** — Andere tekst.']);
    expect(beslisOvergang(SPEC, spec(`gebouwd # #130; gevalideerd: ${SHA}`), na).uitslag).toBe('besluit');
  });
});

describe('specarchief-en-bouwvorm/AC-13: één vorm gebouwd # #<PR>', () => {
  // GEWIJZIGD (spec gebouwd-zonder-nummer, ADR 0095): de gevallen van `changeStatus` zijn weg met `pnpm docs:status`.
  test('specarchief-en-bouwvorm/AC-13 geen spec in docs/specs/ heeft gevalideerd: in de statusregel', () => {
    const metSha = readdirSync('docs/specs')
      .filter((naam) => naam.endsWith('.md') && !naam.startsWith('_'))
      .filter((naam) => /^status:.*gevalideerd:/m.test(readFileSync(`docs/specs/${naam}`, 'utf8')));
    expect(metSha).toStrictEqual([]);
  });
});
