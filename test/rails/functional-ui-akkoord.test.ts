import { afterEach, describe, expect, test } from 'vitest';
import { readAuthority } from '../../rails/hooks/lib/authority-context.mjs';
import { openRefusal } from '../../rails/hooks/lib/built-evidence.mjs';
import { documentInfo } from '../../rails/hooks/lib/document-state.mjs';
import {
  BRANCH,
  commit,
  draaiDocsStatus,
  git,
  maakRepo,
  opruimen,
  PR,
  read,
  REPOSITORY,
  SOURCE,
  write,
} from '../hooks/follow-up-kit';

// templateregime/AC-13: het akkoord voor functionele UI in de template (R-WERK-18) leeft na het verdwijnen van
// functional-ui-status.mjs in `functionalUiApproval` (scripts/kit/document-status.mjs) en in de UI-tak van `approvedBefore`
// (rails/hooks/lib/built-evidence.mjs). Echte tijdelijke repositories en de gh-stub van de kit; geen applicatiemocks.
afterEach(opruimen);

const SPEC = 'docs/specs/toast-fix.md';
const MINI = [
  '---',
  'status: goedgekeurd',
  'namespace: toast-fix',
  'sjabloon: mini',
  'scope: functionele-ui',
  '---',
  '',
  '# Toastfix',
  '',
  '## Hergebruik en UX',
  '',
  'Bestaande toast. De versie verandert.',
  '',
].join('\n');
const ANDERE_INHOUD = MINI.replace('De versie verandert.', 'Een andere inhoud dan de goedgekeurde.');
const WEIGERING = 'Gebouwd vereist de juiste geopende PR op deze branch en code buiten docs/';
const GEBOUWD = `status: gebouwd # #${String(PR)}`;

function metStatus(tekst: string, status: string): string {
  return tekst.replace(/^status: .*$/m, `status: ${status}`);
}

/**
 * Een feature-branch met `MINI` (goedgekeurd) en een codewijziging. `opMain` is de spec zoals die al op origin/main stond;
 * ontbreekt hij, dan is de spec nieuw in deze PR. `remote` vervangt de herkomst van de repository.
 */
function uiPr(opties: { opMain?: string; remote?: string } = {}): string {
  const { root } = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  if (opties.opMain !== undefined) {
    write(root, SPEC, opties.opMain);
    git(root, ['update-ref', 'refs/remotes/origin/main', commit(root, 'docs: spec op main')]);
  }
  if (opties.remote !== undefined) git(root, ['remote', 'set-url', 'origin', opties.remote]);
  write(root, SPEC, MINI);
  commit(root, 'docs: spec');
  write(root, SOURCE, 'export const version = 2;\n');
  commit(root, 'feat: ui');
  return root;
}

function pullRequest(repository: string) {
  return {
    number: PR,
    repository,
    branch: BRANCH,
    headSha: 'a'.repeat(40),
    state: 'open',
    merged: false,
    mergeSha: null,
    baseBranch: 'main',
  };
}

describe('templateregime/AC-13: akkoord voor functionele UI via docs:status', () => {
  test('templateregime/AC-13 een nieuwe mini-spec met scope functionele-ui, in dezelfde PR goedgekeurd, krijgt gebouwd', () => {
    const root = uiPr();
    const result = draaiDocsStatus(root, [SPEC, 'gebouwd', '--pr', String(PR)]);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(read(root, SPEC)).toBe(metStatus(MINI, `gebouwd # #${String(PR)}`));
  });

  test('templateregime/AC-13 een spec die op main nog voorstel was krijgt gebouwd, ook als de inhoud in de PR veranderde', () => {
    const root = uiPr({ opMain: metStatus(ANDERE_INHOUD, 'voorstel') });
    const result = draaiDocsStatus(root, [SPEC, 'gebouwd', '--pr', String(PR)]);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(read(root, SPEC)).toContain(`${GEBOUWD}\n`);
  });

  test('templateregime/AC-13 zonder scope functionele-ui in de frontmatter geldt de uitzondering niet', () => {
    const root = uiPr();
    write(root, SPEC, MINI.replace('scope: functionele-ui\n', ''));
    commit(root, 'docs: scope weg');
    const result = draaiDocsStatus(root, [SPEC, 'gebouwd', '--pr', String(PR)]);

    expect(result.stderr).toContain(WEIGERING);
    expect(result.status).toBe(1);
    expect(read(root, SPEC)).not.toContain('gebouwd');
  });

  test('templateregime/AC-13 een spec die op main al goedgekeurd stond maar inhoudelijk afwijkt, krijgt geen akkoord', () => {
    const root = uiPr({ opMain: ANDERE_INHOUD });
    const result = draaiDocsStatus(root, [SPEC, 'gebouwd', '--pr', String(PR)]);

    expect(result.stderr).toContain(WEIGERING);
    expect(result.status).toBe(1);
    expect(read(root, SPEC)).toBe(MINI);
  });

  test('templateregime/AC-13 in een app-repository geldt de uitzondering niet', () => {
    const root = uiPr({ remote: 'https://github.com/owner/app.git' });
    const result = draaiDocsStatus(root, [SPEC, 'gebouwd', '--pr', String(PR)], {
      STUB_REPO: 'owner/app',
    });

    expect(result.stderr).toContain(WEIGERING);
    expect(result.status).toBe(1);
    expect(read(root, SPEC)).toBe(MINI);
  });
});

describe('templateregime/AC-13: de UI-tak van approvedBefore (openRefusal) toetst de digest en de repository', () => {
  const digest = (tekst: string) => documentInfo(SPEC, tekst)?.digest;
  const gebouwd = metStatus(MINI, `gebouwd # #${String(PR)}`);

  function weigert(opties: { repository?: string; uiApproval?: string | null | undefined }): boolean {
    const root = uiPr();
    const repository = opties.repository ?? REPOSITORY;
    const authority = readAuthority({ root, base: 'origin/main', repository });
    if (authority === null) throw new Error('geen authority voor de fixture');
    return openRefusal(
      { file: SPEC, text: gebouwd },
      {
        pr: pullRequest(repository),
        code: true,
        ...(opties.uiApproval === undefined ? {} : { uiApproval: opties.uiApproval }),
      },
      authority,
    );
  }

  test('templateregime/AC-13 de digest van de goedgekeurde inhoud geeft akkoord in de template', () => {
    expect(weigert({ uiApproval: digest(MINI) })).toBe(false);
  });

  test('templateregime/AC-13 een digest van een afwijkende spec geeft geen akkoord', () => {
    expect(digest(ANDERE_INHOUD)).not.toBe(digest(MINI));
    expect(weigert({ uiApproval: digest(ANDERE_INHOUD) })).toBe(true);
  });

  test.each([
    ['null', null],
    ['ontbrekend', undefined],
  ])('templateregime/AC-13 zonder akkoordbewijs (%s) wordt gebouwd geweigerd', (_naam, uiApproval) => {
    expect(weigert({ uiApproval })).toBe(true);
  });

  test('templateregime/AC-13 dezelfde digest geeft in een app-repository geen akkoord', () => {
    expect(weigert({ repository: 'owner/app', uiApproval: digest(MINI) })).toBe(true);
  });
});
