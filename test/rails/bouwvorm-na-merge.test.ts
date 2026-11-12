import { afterEach, describe, expect, test } from 'vitest';
import { PR, SOURCE, commit, draaiDocsStatus, git, maakRepo, opruimen, read, write } from '../hooks/follow-up-kit';

// docs/specs/specarchief-en-bouwvorm.md (ADR 0080 punt 5), AC-10 en AC-11: na de merge van PR N schrijft docs:status alleen
// `gebouwd # #N`, en de guard toetst die regel via de gemergde route met de head uit GitHub. De oude vorm met SHA toetst als
// nu. Echte tijdelijke repositories (squash-merge op main, daarna een status-PR); GitHub komt van de `gh`-stub.
afterEach(opruimen);

const SPEC = 'docs/specs/bouw.md';
const FEATURE = 'feat/bouw';
const STATUS_BRANCH = 'docs/status-bouw';
const ARGS = [SPEC, 'gebouwd', '--pr', String(PR)];
const REGEL = `gebouwd # #${String(PR)}`;

function specTekst(status = 'goedgekeurd', extra = ''): string {
  return `---\nstatus: ${status}\nnamespace: bouw\n---\n\n# Spec bouw\n\n## Raakt ook\n\n- \`${SOURCE}\`\n${extra}`;
}

interface Merge {
  root: string;
  prHead: string;
  mergeSha: string;
}

/** main met de goedgekeurde spec, PR N squash-gemerged (met `bron` als bouw), daarna de statusbranch vanaf main. */
function gemergdePr(opties: { bron?: Record<string, string>; naMerge?: string } = {}): Merge {
  const { root } = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  git(root, ['switch', '-q', 'main']);
  write(root, SPEC, specTekst());
  const main = commit(root, 'docs(spec): bouw (#129)');
  git(root, ['switch', '-q', '-c', FEATURE, main]);
  for (const [pad, inhoud] of Object.entries(opties.bron ?? { [SOURCE]: 'export const version = 2;\n' }))
    write(root, pad, inhoud);
  const prHead = commit(root, 'feat: bouw');
  git(root, ['switch', '-q', 'main']);
  git(root, ['merge', '-q', '--squash', FEATURE]);
  const mergeSha = commit(root, `feat: bouw (#${String(PR)})`);
  if (opties.naMerge !== undefined) {
    write(root, SPEC, opties.naMerge);
    commit(root, 'docs: erratum');
  }
  git(root, ['update-ref', 'refs/remotes/origin/main', git(root, ['rev-parse', 'HEAD'])]);
  git(root, ['switch', '-q', '-c', STATUS_BRANCH, 'main']);
  return { root, prHead, mergeSha };
}

function gemergd(merge: Merge, extra: Record<string, string> = {}): Record<string, string> {
  return {
    STUB_PR_MERGED: 'true',
    STUB_MERGE_SHA: merge.mergeSha,
    STUB_PR_HEAD: merge.prHead,
    STUB_PR_REF: FEATURE,
    ...extra,
  };
}

describe('specarchief-en-bouwvorm/AC-10: kernscenario, gebouwd # #N na de merge', () => {
  test('specarchief-en-bouwvorm/AC-10 docs:status schrijft status: gebouwd # #N na een squash-merge met groene checks', () => {
    const merge = gemergdePr();
    const uitvoer = draaiDocsStatus(merge.root, ARGS, gemergd(merge));
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
    expect(read(merge.root, SPEC)).toBe(specTekst(REGEL));
  });
});
