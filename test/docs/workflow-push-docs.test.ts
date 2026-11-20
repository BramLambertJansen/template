import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';

// Leerpunt #816: docs/nieuwe-app.md schreef het pushen van een workflowwijziging toe aan de eigenaar, omdat de agent geen
// workflowrecht zou hebben. ADR 0093 (Gevolgen): de agent werkt onder de gh-login van de eigenaar, inclusief `workflow`;
// `.github/**` blijft beschermd, dus de eigenaar voegt zo'n PR samen.
const nieuweApp = readFileSync(new URL('../../docs/nieuwe-app.md', import.meta.url), 'utf8');

describe('workflowpush in docs/nieuwe-app.md volgt ADR 0093 (leerpunt #816)', () => {
  test('nergens staat dat de agent geen workflowrecht heeft of dat de eigenaar de workflowwijziging pusht', () => {
    expectAbsent(nieuweApp, /geen `workflows?`-recht|pusht de eigenaar de branch|jij \(de eigenaar\) later template-updates/i, {
      recognizes: [
        'dan pusht de eigenaar de branch (de agent heeft geen `workflows`-recht)',
        'de agent heeft geen `workflow`-recht',
        'omdat jij (de eigenaar) later template-updates met `.github/workflows/` pusht',
      ],
      allows: [
        'De agent pusht ook een wijziging in `.github/workflows/`',
        'zo\'n PR voeg jij (de eigenaar) samen',
      ],
    });
  });

  test('stap 8 van de updateprocedure: de agent pusht, de eigenaar voegt samen', () => {
    expect(nieuweApp).toContain('De agent pusht ook een wijziging in `.github/workflows/`');
    expect(nieuweApp).toContain("`.github/**` is een beschermd pad, dus zo'n PR voeg jij (de eigenaar) samen.");
  });
});
