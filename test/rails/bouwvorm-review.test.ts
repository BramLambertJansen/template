import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test } from 'vitest';
import { beslisOvergang, documentInfo } from '../../rails/hooks/lib/document-state.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { PR, SOURCE, commit, draaiDocsStatus, git, maakRepo, opruimen, read, write } from '../hooks/follow-up-kit';

// docs/specs/specarchief-en-bouwvorm.md (ADR 0080), aanvullende gevallen uit de review van de bouw-PR: een weggehaalde
// markering vraagt nieuw bouwbewijs (AC-7), nieuwe inhoud van een gebouwde spec hoort niet in een PR met code (AC-7), de
// markering telt alleen voor een spec niet mee in de digest (AC-7), een markering alleen op een spec die op main gebouwd is en
// niet in de mergecommit (AC-7, AC-10), en het rolhek kijkt naar elk pad onder docs/specs/archief/ (AC-3).
afterEach(opruimen);

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

describe('specarchief-en-bouwvorm/AC-7: de markering weghalen vraagt gebouwd # #<deze PR>', () => {
  test('specarchief-en-bouwvorm/AC-7 markering weg, verwijzing gelijk: gebouwd (nieuw bouwbewijs)', () => {
    const uitslag = beslisOvergang(
      SPEC,
      spec('gebouwd # #120', [AC1, AC2_GEMARKEERD]),
      spec('gebouwd # #120', [AC1, AC2]),
    );
    expect(uitslag.uitslag).toBe('gebouwd');
  });
});

describe('specarchief-en-bouwvorm/AC-7: de markering valt alleen bij een spec uit de digest', () => {
  test('specarchief-en-bouwvorm/AC-7 een ADR met en zonder markering heeft een andere digest', () => {
    const adr = (regel: string) => `# 0001 — Demo\n\nStatus: geaccepteerd\n\n${regel}\n`;
    const file = 'docs/adr/0001-demo.md';
    expect(documentInfo(file, adr(AC2_GEMARKEERD))?.digest).not.toBe(documentInfo(file, adr(AC2))?.digest);
  });
});

describe('specarchief-en-bouwvorm/AC-10: geen markering in de mergecommit', () => {
  test('specarchief-en-bouwvorm/AC-10 docs:status na de merge met een AC (nog niet gebouwd) in de spec: rood', () => {
    const { root } = maakRepo({ specs: [], mandaat: [], roadmap: [] });
    git(root, ['switch', '-q', 'main']);
    const tekst = spec('goedgekeurd', [AC1, AC2_GEMARKEERD], `Raakt \`${SOURCE}\`.`);
    write(root, SPEC, tekst);
    commit(root, 'docs(spec): demo (#129)');
    git(root, ['switch', '-q', '-c', 'feat/demo', 'main']);
    write(root, SOURCE, 'export const version = 2;\n');
    const prHead = commit(root, 'feat: demo');
    git(root, ['switch', '-q', 'main']);
    git(root, ['merge', '-q', '--squash', 'feat/demo']);
    const mergeSha = commit(root, `feat: demo (#${String(PR)})`);
    git(root, ['update-ref', 'refs/remotes/origin/main', mergeSha]);
    git(root, ['switch', '-q', '-c', 'docs/status-demo', 'main']);
    const env = { STUB_PR_MERGED: 'true', STUB_MERGE_SHA: mergeSha, STUB_PR_HEAD: prHead, STUB_PR_REF: 'feat/demo' };
    const uitvoer = draaiDocsStatus(root, [SPEC, 'gebouwd', '--pr', String(PR)], env);
    expect(uitvoer.stderr).toContain(
      'Gebouwd na de merge vereist de spec zonder AC (nog niet gebouwd) in de mergecommit',
    );
    expect(uitvoer.status).toBe(1);
    expect(read(root, SPEC)).toBe(tekst);
  });
});

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
