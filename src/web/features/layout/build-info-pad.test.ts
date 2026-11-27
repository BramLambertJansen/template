import { describe, expect, test } from 'vitest';
import { toontBuildInfo } from './schil-voorbeeld.ts';

// Spec release-versie, addendum: /design-system doet geen aanroep buiten /api/me (design-system/AC-10, R-WEB-08), dus daar
// haalt AppLayout geen buildInfo op en staat er geen voet.
describe('release-versie/AC-14: geen buildInfo op /design-system', () => {
  test('release-versie/AC-14: alle paden tonen de voet, behalve /design-system (ook met slash)', () => {
    const paden = ['/', '/accounts', '/account', '/design-systemen', '/design-system', '/design-system/'];
    expect(paden.filter(toontBuildInfo)).toStrictEqual(['/', '/accounts', '/account', '/design-systemen']);
  });
});
