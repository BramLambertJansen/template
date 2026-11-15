import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { TEMPLATE_VERSION } from '../../src/core/shared/template-version.ts';

// Spec release-versie (docs/template/specs/release-versie.md), AC-1 t/m AC-3: de versie in code is gelijk aan de nieuwste
// releasekop in de wijzigingenlijst van de template, en CHANGELOG.md in de hoofdmap is van de app.
const ROOT = path.join(import.meta.dirname, '../..');
const RELEASE = /^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/;
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

// De nieuwste releaseversie uit de lijst; gooit als de koppen niet de afgesproken vorm hebben.
function latestRelease(changelog: string): string {
  const heads = changelog.split('\n').filter((line) => line.startsWith('## '));
  if (heads[0] !== '## [Unreleased]') throw new Error('de eerste kop is niet "## [Unreleased]"');
  const releases = heads.slice(1);
  const first = releases[0];
  if (first === undefined) throw new Error('geen releasekop onder "## [Unreleased]"');
  for (const head of releases) {
    if (!RELEASE.test(head)) throw new Error(`releasekop zonder de vorm "## [x.y.z] - JJJJ-MM-DD": ${head}`);
  }
  const version = RELEASE.exec(first)?.[1];
  if (version === undefined) throw new Error(`geen versie in: ${first}`);
  return version;
}

test('release-versie/AC-1: TEMPLATE_VERSION is gelijk aan de nieuwste releasekop in docs/template-changelog.md', () => {
  expect(latestRelease(read('docs/template-changelog.md'))).toBe(TEMPLATE_VERSION);
});

test('release-versie/AC-1: een andere nieuwste releasekop is een verschil', () => {
  const changelog = '# Lijst\n\n## [Unreleased]\n\n## [9.9.9] - 2026-11-15\n\n## [0.1.0] - 2026-11-01\n';
  expect(latestRelease(changelog)).toBe('9.9.9');
  expect(TEMPLATE_VERSION).not.toBe('9.9.9');
});

test.each([
  ['een releasekop zonder datum', '# Lijst\n\n## [Unreleased]\n\n## [0.1.0]\n', /releasekop zonder de vorm/],
  [
    'een oudere releasekop zonder datum',
    '# Lijst\n\n## [Unreleased]\n\n## [0.2.0] - 2026-12-01\n\n## [0.1.0]\n',
    /releasekop zonder de vorm/,
  ],
  ['geen "## [Unreleased]"', '# Lijst\n\n## [0.1.0] - 2026-11-15\n', /eerste kop is niet/],
  [
    '"## [Unreleased]" niet als eerste kop',
    '# Lijst\n\n## [0.1.0] - 2026-11-15\n\n## [Unreleased]\n',
    /eerste kop is niet/,
  ],
  ['alleen "## [Unreleased]"', '# Lijst\n\n## [Unreleased]\n', /geen releasekop/],
])('release-versie/AC-1: %s faalt', (_case, changelog, melding) => {
  expect(() => latestRelease(changelog)).toThrow(melding);
});

test('release-versie/AC-2: de wijzigingenlijst van de template heeft [Unreleased] en [0.1.0] - 2026-11-15', () => {
  const heads = read('docs/template-changelog.md')
    .split('\n')
    .filter((line) => line.startsWith('## '));
  expect(heads[0]).toBe('## [Unreleased]');
  expect(heads).toContain('## [0.1.0] - 2026-11-15');
});

// In een app is CHANGELOG.md van de app (app:init herschrijft hem); de eis geldt alleen in de template zelf.
const isTemplate = read('package.json').includes('"name": "app-template"');

test.skipIf(!isTemplate)(
  'release-versie/AC-3: CHANGELOG.md in de hoofdmap heeft alleen een kop en een verwijzing, geen releasekop',
  () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog.split('\n').filter((line) => /^#{1,6} /.test(line))).toStrictEqual(['# Changelog']);
    expect(changelog).toContain('](docs/template-changelog.md)');
    expect(changelog.includes('## [')).toBe(false);
  },
);
