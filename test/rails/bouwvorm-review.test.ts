import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { beslisOvergang, documentInfo } from '../../rails/hooks/lib/document-state.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// docs/specs/specarchief-en-bouwvorm.md (ADR 0080), aanvullende gevallen uit de review van de bouw-PR: een weggehaalde
// markering vraagt nieuw bouwbewijs (AC-7), nieuwe inhoud van een gebouwde spec hoort niet in een PR met code (AC-7), de
// markering telt alleen voor een spec niet mee in de digest (AC-7), een markering alleen op een spec die op main gebouwd is en
// niet in de mergecommit (AC-7, AC-10), en het rolhek kijkt naar elk pad onder docs/specs/archief/ (AC-3).
const SPEC = 'docs/specs/demo.md';
const AC1 = '- **demo/AC-1** — Gegeven iets, dan iets.';
const AC2 = '- **demo/AC-2** — Gegeven meer, dan meer.';
const AC2_GEMARKEERD = '- **demo/AC-2** (nog niet gebouwd) — Gegeven meer, dan meer.';

function spec(status: string, acs: string[] = [AC1], proza = 'Bestaande kit.'): string {
  return [
    '---',
    `status: ${status}`,
    'namespace: demo',
    '---',
    '',
    '# Spec demo',
    '',
    '## Hergebruik en UX',
    '',
    proza,
    '',
    '## Acceptatiecriteria',
    '',
    ...acs,
    '',
  ].join('\n');
}

// GEWIJZIGD (gebouwd-zonder-nummer/AC-20, ADR 0104): `beslisOvergang` kent geen uitslag `gebouwd` meer; de markering weghalen
// is geen bouwbewijs maar een vrije wijziging (de markering telt niet mee in de digest).
describe('specarchief-en-bouwvorm/AC-7: de markering weghalen geeft geen nieuw bouwbewijs meer', () => {
  test('specarchief-en-bouwvorm/AC-7 markering weg, verwijzing gelijk: vrij (geen bouwbewijs meer)', () => {
    const uitslag = beslisOvergang(
      SPEC,
      spec('gebouwd # #120', [AC1, AC2_GEMARKEERD]),
      spec('gebouwd # #120', [AC1, AC2]),
    );
    expect(uitslag.uitslag).toBe('vrij');
  });
});

describe('specarchief-en-bouwvorm/AC-7: de markering valt alleen bij een spec uit de digest', () => {
  test('specarchief-en-bouwvorm/AC-7 een ADR met en zonder markering heeft een andere digest', () => {
    const adr = (regel: string) => `# 0001 — Demo\n\nStatus: geaccepteerd\n\n${regel}\n`;
    const file = 'docs/adr/0001-demo.md';
    expect(documentInfo(file, adr(AC2_GEMARKEERD))?.digest).not.toBe(documentInfo(file, adr(AC2))?.digest);
  });
});

// GEWIJZIGD (spec gebouwd-zonder-nummer, ADR 0095): het geval van specarchief-en-bouwvorm/AC-10 (docs:status na de merge) is
// weg met het script.

describe('specarchief-en-bouwvorm/AC-3: het rolhek kijkt naar elk pad onder docs/specs/archief/', () => {
  const ROOT = '/repo';
  const MELDING = 'het archief is onwijzigbaar; via Bash alleen';
  const ctx: Parameters<typeof decide>[1] = {
    root: ROOT,
    cwd: ROOT,
    config: loadConfig(readFileSync('.claude/gates.json', 'utf8')),
    read: () => null,
    committed: () => false,
    isDir: (rel: string) => ['docs', 'docs/specs', 'docs/specs/archief'].includes(rel),
    files: () => [],
    branch: 'feat/x',
  };

  test.each(['docs/specs/archief/_a.md', 'docs/specs/archief/x/a.md'])(
    'specarchief-en-bouwvorm/AC-3 echo x > %s is deny met de melding',
    (pad) => {
      const besluit = decide({ tool_name: 'Bash', tool_input: { command: `echo x > ${pad}` } }, ctx);
      expect(besluit.deny.join('\n')).toContain(MELDING);
    },
  );
});
