import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { releasesUit } from '../../scripts/kit/template-release.mjs';
import { TEMPLATE_VERSION } from '../../src/core/shared/template-version.ts';

// Spec release-versie (docs/template/specs/release-versie.md), AC-1 t/m AC-3: de versie in code is gelijk aan de nieuwste
// releasekop in de wijzigingenlijst van de template, en CHANGELOG.md in de hoofdmap is van de app.
const ROOT = path.join(import.meta.dirname, '../..');
const RELEASE = /^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/;
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

// De nieuwste releaseversie uit de lijst; gooit als de koppen niet de afgesproken vorm hebben. Eén ontleding, gedeeld
// met template:release en template:status (spec template-release, AC-2).
function latestRelease(changelog: string): string | undefined {
  return releasesUit(changelog)[0]?.versie;
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

// CHANGELOG.md in de hoofdmap is van de app (app:init herschrijft hem); in de template is het alleen een verwijzing. In beide
// gevallen staat er geen release van de template in: geen kop uit docs/template-changelog.md komt er letterlijk in voor.
// Niet overslaan buiten de template: een overgeslagen test is in CI rood (ADR 0088), ook in een app.
test('release-versie/AC-3: CHANGELOG.md in de hoofdmap bevat geen releasekop van de template', () => {
  const templateReleases = read('docs/template-changelog.md')
    .split('\n')
    .filter((line) => RELEASE.test(line));
  const rootLines = read('CHANGELOG.md').split('\n');

  expect(templateReleases.length).toBeGreaterThan(0);
  expect(rootLines.filter((line) => templateReleases.includes(line))).toStrictEqual([]);
});
