import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

// Spec template-release (docs/template/specs/template-release.md), AC-5: onder `## [Unreleased]` in docs/template-changelog.md
// staat geen lijstitem en geen `###`-kop, alleen de verwijzing naar de fragmenten. Een PR die het oude patroon volgt (een regel
// onder [Unreleased]) ziet zo meteen waar de regel heen moet: in docs/template-changelog.d/.
const ROOT = path.join(import.meta.dirname, '../..');
const VERWIJZING = 'Nog niet uitgebrachte wijzigingen staan als fragment in `docs/template-changelog.d/`.';
const LIJSTITEM = /^\s*(?:[-*+]|\d+[.)])\s/;

/** De regels tussen `## [Unreleased]` en de volgende `## `-kop. */
function unreleasedBlok(changelog: string): string[] {
  const regels = changelog.split('\n');
  const begin = regels.indexOf('## [Unreleased]');
  if (begin === -1) throw new Error('geen "## [Unreleased]" in de wijzigingenlijst');
  const rest = regels.slice(begin + 1);
  const einde = rest.findIndex((regel) => regel.startsWith('## '));
  return einde === -1 ? rest : rest.slice(0, einde);
}

/** De overtredingen van AC-5, elk met de plek waar de wijziging heen moet. */
function overtredingen(changelog: string): string[] {
  return unreleasedBlok(changelog).flatMap((regel) => {
    if (LIJSTITEM.test(regel) || regel.startsWith('### ')) {
      return [
        `onder [Unreleased] staat "${regel.trim()}"; zet een wijziging als fragment in docs/template-changelog.d/`,
      ];
    }
    return [];
  });
}

const echt = readFileSync(path.join(ROOT, 'docs/template-changelog.md'), 'utf8');

test('template-release/AC-5: onder [Unreleased] in docs/template-changelog.md staat geen lijstitem en geen ###-kop', () => {
  expect(overtredingen(echt)).toStrictEqual([]);
});

test('template-release/AC-5: onder [Unreleased] staat alleen de verwijzing naar docs/template-changelog.d/', () => {
  const inhoud = unreleasedBlok(echt).filter((regel) => regel.trim() !== '');

  expect(inhoud).toStrictEqual([VERWIJZING]);
});

test('template-release/AC-5: de test vindt een lijstitem, een nummering en een ###-kop onder [Unreleased] en noemt de map', () => {
  const kop = '# Lijst\n\n## [Unreleased]\n\n';
  const oud = '\n## [0.1.0] - 2026-11-15\n\n- Oude regel.\n';

  expect(overtredingen(`${kop}- Nieuwe regel.\n${oud}`)).toHaveLength(1);
  expect(overtredingen(`${kop}1. Nieuwe regel.\n${oud}`)).toHaveLength(1);
  expect(overtredingen(`${kop}### Toegevoegd\n${oud}`)).toHaveLength(1);
  expect(overtredingen(`${kop}- Nieuwe regel.\n${oud}`)[0]).toContain('docs/template-changelog.d/');
  expect(overtredingen(`${kop}${VERWIJZING}\n${oud}`)).toStrictEqual([]);
});
