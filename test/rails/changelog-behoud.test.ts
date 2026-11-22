import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { docsKrimp } from '../../scripts/kit/check-docs.mjs';

// Leerpunt #837: een PR voegde een regel toe aan een al uitgebrachte sectie `## [x.y.z]` in docs/template-changelog.md in
// plaats van een fragment in docs/template-changelog.d/; `template:release` neemt alleen fragmenten mee, dus de wijziging
// kwam in geen enkele release. Een uitgebrachte sectie moet tegenover de merge-base met origin/main ongewijzigd blijven.
const BESTAND = 'docs/template-changelog.md';
const UITWEG = 'docs/template-changelog.d/';
const SLEUTEL = 'docs:changelog-behoud:';

const INLEIDING = '# Changelog\n\nAlle wijzigingen van de template.\n\n';
const UNRELEASED = '## [Unreleased]\n\n### Toegevoegd\n\n- nog niet uitgebracht\n\n';
const S010 = '## [0.1.0] - 2026-11-15\n\n### Toegevoegd\n\n- eerste feature\n\n';
const S001 = '## [0.0.1] - 2026-11-01\n\n### Toegevoegd\n\n- allereerste\n';
const changelog = (...delen: string[]) => delen.join('');
const BASIS = changelog(INLEIDING, UNRELEASED, S010, S001);

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
  const root = mkdtempSync(path.join(tmpdir(), 'changelog-behoud-'));
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

const sleutels = async (root: string) => (await behoud(root)).map(({ key }) => key);

describe('docs:changelog-behoud: een gewijzigde uitgebrachte sectie is een violation', () => {
  test('gecommitte wijziging in een regel van sectie 0.1.0: key met versie', async () => {
    const root = repo({ [BESTAND]: BASIS });
    schrijf(root, BESTAND, BASIS.replace('- eerste feature', '- eerste feature, aangevuld'));
    commit(root);

    expect(await sleutels(root)).toStrictEqual([`${SLEUTEL}0.1.0`]);
  });

  test('ongecommitte wijziging in de werkmap telt ook', async () => {
    const root = repo({ [BESTAND]: BASIS });
    schrijf(root, BESTAND, BASIS.replace('- eerste feature', '- eerste feature, aangevuld'));

    expect(await sleutels(root)).toStrictEqual([`${SLEUTEL}0.1.0`]);
  });

  test('een gewijzigde datum in de kopregel telt', async () => {
    const root = repo({ [BESTAND]: BASIS });
    schrijf(root, BESTAND, BASIS.replace('## [0.1.0] - 2026-11-15', '## [0.1.0] - 2026-11-16'));

    expect(await sleutels(root)).toStrictEqual([`${SLEUTEL}0.1.0`]);
  });

  test('een verdwenen sectie telt', async () => {
    const root = repo({ [BESTAND]: BASIS });
    schrijf(root, BESTAND, changelog(INLEIDING, UNRELEASED, S001));

    expect(await sleutels(root)).toStrictEqual([`${SLEUTEL}0.1.0`]);
  });

  test('twee gewijzigde secties geven elk een eigen key', async () => {
    const root = repo({ [BESTAND]: BASIS });
    schrijf(
      root,
      BESTAND,
      BASIS.replace('- eerste feature', '- aangepast').replace('- allereerste', '- ook aangepast'),
    );

    expect((await sleutels(root)).sort()).toStrictEqual([`${SLEUTEL}0.0.1`, `${SLEUTEL}0.1.0`]);
  });

  test('een verwijderde changelog in de werkmap: elke uitgebrachte sectie van de basis is verdwenen', async () => {
    const root = repo({ [BESTAND]: BASIS });
    rmSync(path.join(root, BESTAND));

    expect((await sleutels(root)).sort()).toStrictEqual([`${SLEUTEL}0.0.1`, `${SLEUTEL}0.1.0`]);
  });

  test('de message noemt het pad, de versie en de uitweg: een fragment in docs/template-changelog.d/', async () => {
    const root = repo({ [BESTAND]: BASIS });
    schrijf(root, BESTAND, BASIS.replace('- eerste feature', '- aangepast'));
    const melding = (await behoud(root)).map(({ message }) => message).join('\n');

    expect(melding).toContain(BESTAND);
    expect(melding).toContain('0.1.0');
    expect(melding).toContain(UITWEG);
  });
});

describe('docs:changelog-behoud: geen violation', () => {
  test('een nieuwe sectie [0.2.0] erboven ingevoegd, 0.1.0 byte-gelijk (wat template:release doet)', async () => {
    const root = repo({ [BESTAND]: BASIS });
    const nieuw = '## [0.2.0] - 2026-11-20\n\n### Toegevoegd\n\n- tweede feature\n\n';
    schrijf(root, BESTAND, changelog(INLEIDING, UNRELEASED, nieuw, S010, S001));
    commit(root);

    expect(await sleutels(root)).toStrictEqual([]);
  });

  test('een wijziging alleen in de inleiding en onder [Unreleased]', async () => {
    const root = repo({ [BESTAND]: BASIS });
    const inleiding = '# Changelog\n\nAlle wijzigingen van de template, aangevuld.\n\n';
    const unreleased = '## [Unreleased]\n\n### Toegevoegd\n\n- nog niet uitgebracht\n- en nog iets\n\n';
    schrijf(root, BESTAND, changelog(inleiding, unreleased, S010, S001));

    expect(await sleutels(root)).toStrictEqual([]);
  });

  test('extra witregels aan het eind van een sectie tellen niet', async () => {
    const root = repo({ [BESTAND]: BASIS });
    schrijf(root, BESTAND, `${BASIS}\n\n`);

    expect(await sleutels(root)).toStrictEqual([]);
  });

  test('geen merge-base (geen origin/main): niets van deze check', async () => {
    const root = repo({ [BESTAND]: BASIS }, false);
    schrijf(root, BESTAND, BASIS.replace('- eerste feature', '- aangepast'));

    expect(await sleutels(root)).toStrictEqual([]);
  });

  test('het bestand ontbreekt op de basis', async () => {
    const root = repo({ 'docs/ander.md': 'a\n' });
    schrijf(root, BESTAND, BASIS);
    commit(root);

    expect(await sleutels(root)).toStrictEqual([]);
  });
});
