import { expect, test } from 'vitest';
import { driftWaarschuwing } from '../../scripts/kit/check-docs-drift.mjs';

// Spec release-versie (docs/template/specs/release-versie.md), AC-10: de wijzigingenlijst van de template staat in
// docs/template-changelog.md en telt daardoor als doc; check-docs-drift zelf verandert niet.
test('release-versie/AC-10: docs/template-changelog.md bij een wijziging in src/ is stil', () => {
  expect(driftWaarschuwing(['src/api/routes/notes.ts', 'docs/template-changelog.md'])).toBeNull();
});

test('release-versie/AC-10: dezelfde codewijziging zonder de wijzigingenlijst geeft de waarschuwing wel', () => {
  expect(driftWaarschuwing(['src/api/routes/notes.ts'])).toContain('src/ wijzigt (1 bestand)');
});
