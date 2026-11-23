import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { docsKrimp } from '../../scripts/kit/check-docs.mjs';

// Leerpunt #877: een PR op een hergebruikte branchnaam overschreef een changelogfragment dat al op main stond en nog niet
// was uitgebracht. Een gewijzigd fragment (status M tegenover de merge-base met origin/main) is een blokkerende melding.
const MAP = 'docs/template-changelog.d';
const SLEUTEL = 'docs:fragment-behoud:';
const fragment = (tekst: string) => `---\nsoort: fix\n---\n\n- ${tekst}\n\n### Bij een update\n\n- niets\n`;

const mappen: string[] = [];
afterEach(() => {
  for (const map of mappen.splice(0)) rmSync(map, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): void {
  const uit = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    cwd: root,
  });
  expect(uit.status, uit.stderr.toString()).toBe(0);
}

function schrijf(root: string, naam: string, inhoud: string): void {
  mkdirSync(path.dirname(path.join(root, naam)), { recursive: true });
  writeFileSync(path.join(root, naam), inhoud);
}

/** Fixture-repo met een basis-commit die origin/main is; daarna kan de test wijzigen. */
function repo(bestanden: Record<string, string>, metOrigin = true): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fragment-behoud-'));
  mappen.push(root);
  git(root, 'init', '-q');
  for (const [naam, inhoud] of Object.entries(bestanden)) schrijf(root, naam, inhoud);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'basis');
  if (metOrigin) git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return root;
}

function commit(root: string): void {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'wijziging');
}

async function behoud(root: string) {
  const alle = await docsKrimp(root);
  return alle.filter(({ key }) => key.startsWith(SLEUTEL));
}

describe('docs:fragment-behoud: een gewijzigd fragment is een violation', () => {
  test('gecommitte wijziging (M) tegenover de merge-base: key met bestandsnaam', async () => {
    const root = repo({ [`${MAP}/x.md`]: fragment('oud') });
    schrijf(root, `${MAP}/x.md`, fragment('overschreven'));
    commit(root);

    expect((await behoud(root)).map(({ key }) => key)).toStrictEqual([`${SLEUTEL}x.md`]);
  });

  test('ongecommitte wijziging in de werkmap telt ook', async () => {
    const root = repo({ [`${MAP}/x.md`]: fragment('oud') });
    schrijf(root, `${MAP}/x.md`, fragment('overschreven'));

    expect((await behoud(root)).map(({ key }) => key)).toStrictEqual([`${SLEUTEL}x.md`]);
  });

  test('de message noemt het pad en de uitweg: nieuw fragment met achtervoegsel -2', async () => {
    const root = repo({ [`${MAP}/x.md`]: fragment('oud') });
    schrijf(root, `${MAP}/x.md`, fragment('overschreven'));
    const melding = (await behoud(root)).map(({ message }) => message).join('\n');

    expect(melding).toContain(`${MAP}/x.md`);
    expect(melding).toMatch(/nieuw fragment/);
    expect(melding).toContain('-2');
  });

  test('twee gewijzigde fragmenten geven elk een eigen key', async () => {
    const root = repo({ [`${MAP}/a.md`]: fragment('a'), [`${MAP}/b.md`]: fragment('b') });
    schrijf(root, `${MAP}/a.md`, fragment('a2'));
    schrijf(root, `${MAP}/b.md`, fragment('b2'));

    expect((await behoud(root)).map(({ key }) => key).sort()).toStrictEqual([`${SLEUTEL}a.md`, `${SLEUTEL}b.md`]);
  });
});

describe('docs:fragment-behoud: geen violation', () => {
  test('een nieuw fragment (A)', async () => {
    const root = repo({ [`${MAP}/x.md`]: fragment('oud') });
    schrijf(root, `${MAP}/x-2.md`, fragment('nieuw'));
    commit(root);

    expect((await behoud(root)).map(({ key }) => key)).toStrictEqual([]);
  });

  test('een verwijderd fragment (D): template:release verwijdert ze', async () => {
    const root = repo({ [`${MAP}/x.md`]: fragment('oud') });
    rmSync(path.join(root, MAP, 'x.md'));
    commit(root);

    expect((await behoud(root)).map(({ key }) => key)).toStrictEqual([]);
  });

  test('een gewijzigde README.md in de fragmentmap', async () => {
    const root = repo({ [`${MAP}/README.md`]: '# Fragmenten\n' });
    schrijf(root, `${MAP}/README.md`, '# Fragmenten\n\nmeer uitleg\n');

    expect((await behoud(root)).map(({ key }) => key)).toStrictEqual([]);
  });

  test('een gewijzigd bestand buiten de fragmentmap', async () => {
    const root = repo({ 'docs/ander.md': 'a\n' });
    schrijf(root, 'docs/ander.md', 'b\n');

    expect((await behoud(root)).map(({ key }) => key)).toStrictEqual([]);
  });

  test('geen merge-base (geen origin/main): niets van deze check', async () => {
    const root = repo({ [`${MAP}/x.md`]: fragment('oud') }, false);
    schrijf(root, `${MAP}/x.md`, fragment('overschreven'));

    expect((await behoud(root)).map(({ key }) => key)).toStrictEqual([]);
  });
});
