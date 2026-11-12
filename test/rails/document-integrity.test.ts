import { readFileSync } from 'node:fs';
import { afterEach, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';
import { git, maakRepo, opruimen, write } from '../hooks/follow-up-kit';

afterEach(opruimen);
const adr = (number: string, status = 'voorgesteld') => `# ${number} — Test\n\nStatus: ${status}\n`;
const fixture = () => maakRepo({ specs: [], mandaat: [], roadmap: [] });

test('check-docs telt actieve en gearchiveerde nummers samen', async () => {
  const f = fixture();
  write(f.root, 'docs/adr/0060-first.md', adr('0060'));
  write(f.root, 'docs/adr/archief/0060-second.md', adr('0060'));
  git(f.root, ['add', '.']);
  expect((await docsViolations(f.root)).some(({ key }) => key.includes('adr:0060:dubbel'))).toBe(true);
});

test('de historische 0039-uitzondering dekt geen derde ADR', async () => {
  const f = fixture();
  for (const name of ['lokale-gate-hergebruik', 'stack-provider-neutraal-en-toolchain', 'extra'])
    write(f.root, `docs/adr/0039-${name}.md`, adr('0039'));
  git(f.root, ['add', '.']);
  expect((await docsViolations(f.root)).some(({ key }) => key.startsWith('docs:adr:0039:dubbel:'))).toBe(true);
});

test.each(['1. OV-1 ⚠ open', '2) OV-1 ⚠ open', '+ OV-1 ⚠ open'])(
  'een goedgekeurde spec heeft ook geen open vraag in lijstvorm %s',
  async (item) => {
    const f = fixture();
    write(
      f.root,
      'docs/specs/test.md',
      `status: goedgekeurd\n\n## Hergebruik en UX\n\nKit.\n\n## Open vragen\n\n${item}\n`,
    );
    git(f.root, ['add', '.']);
    expect((await docsViolations(f.root)).some(({ key }) => key.endsWith(':open-vraag'))).toBe(true);
  },
);

test('bronvoorbeelden verwijzen naar het exacte repositorypad', async () => {
  const f = fixture();
  write(f.root, 'test/copies/src/api/example.ts', 'export {};');
  write(f.root, 'docs/specs/test.md', 'status: voorstel\n\n## Kopieer de vorm van\n\n`src/api/example.ts`\n');
  git(f.root, ['add', '.']);
  expect((await docsViolations(f.root)).some(({ key }) => key.endsWith(':vorm'))).toBe(true);
});

test('de twee historische 0039-bestanden blijven als bestaande ratchet-afwijking herkenbaar', async () => {
  const violations = await docsViolations();
  expect(violations.find(({ key }) => key === 'docs:adr:0039:dubbel')).toBeDefined();
  expect(readFileSync('.kit/baseline.json', 'utf8')).toContain('docs:adr:0039:dubbel');
});

test.each([
  'docs/adr/0060_second.md',
  'docs/adr/00600-second.md',
  'docs/adr/archief/060-second.md',
  'docs/adr/notes.md',
])('check-docs weigert een ADR-bestand buiten het patroon NNNN-slug.md: %s', async (file) => {
  const f = fixture();
  write(f.root, file, adr('0060'));
  git(f.root, ['add', '.']);
  expect((await docsViolations(f.root)).map(({ key }) => key)).toContain(`docs:${file}:adr-naam`);
});

test.each(['docs/adr/README.md', 'docs/adr/_template.md', 'docs/adr/archief/README.md', 'docs/adr/0060-goed.md'])(
  'README, sjablonen en goede namen zijn geen naamfout: %s',
  async (file) => {
    const f = fixture();
    write(f.root, file, adr('0060'));
    git(f.root, ['add', '.']);
    expect((await docsViolations(f.root)).filter(({ key }) => key.endsWith(':adr-naam'))).toStrictEqual([]);
  },
);
