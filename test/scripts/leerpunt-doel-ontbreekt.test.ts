import { describe, expect, test } from 'vitest';
import { teltAlsOntbrekend } from '../../scripts/kit/leerpunt-check.mjs';

// Spec leerlus-bewijs AC-13: een duplicaatdoel dat niet bestaat geeft geen fout maar "bestaat niet". GitHub geeft een 404
// voor een onbekend nummer en een 410 (Gone) voor een verwijderd issue; beide tellen als ontbrekend doel, zodat de job het
// label nog zet en de volgende duplicaatcomment nog toetst. Zonder `magOntbreken` blijft elke fout een fout.
describe('leerlus-bewijs/AC-13 een ontbrekend of verwijderd doel crasht de job niet', () => {
  test.each([404, 410])('leerlus-bewijs/AC-13: doelopvraag met status %i telt als ontbrekend', (status) => {
    expect(teltAlsOntbrekend(status, { magOntbreken: true })).toBe(true);
  });

  test.each([401, 403, 422, 500])('leerlus-bewijs/AC-13: doelopvraag met status %i blijft een fout', (status) => {
    expect(teltAlsOntbrekend(status, { magOntbreken: true })).toBe(false);
  });

  test.each([404, 410])('leerlus-bewijs/AC-13: zonder magOntbreken blijft status %i een fout', (status) => {
    expect(teltAlsOntbrekend(status, {})).toBe(false);
  });

  test('leerlus-bewijs/AC-13: DELETE van een label dat al weg is (404) telt als ontbrekend, 410 niet', () => {
    expect(teltAlsOntbrekend(404, { method: 'DELETE' })).toBe(true);
    expect(teltAlsOntbrekend(410, { method: 'DELETE' })).toBe(false);
  });
});
