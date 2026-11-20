import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Leerpunt #816: docs/nieuwe-app.md schreef het pushen van een workflowwijziging toe aan de eigenaar, omdat de agent geen
// workflowrecht zou hebben. ADR 0093 (Gevolgen): de agent werkt onder de gh-login van de eigenaar, inclusief `workflow`;
// `.github/**` blijft beschermd, dus de eigenaar voegt zo'n PR samen. Positieve asserties op de nieuwe tekst; een
// gevonden oude tekst via expectAbsent telt sinds leerpunt #875 ook als assertie.
const nieuweApp = readFileSync(new URL('../../docs/nieuwe-app.md', import.meta.url), 'utf8');

describe('workflowpush in docs/nieuwe-app.md volgt ADR 0093 (leerpunt #816)', () => {
  test('4.1: de scope workflow is nodig omdat de agent onder de login van de eigenaar pusht', () => {
    expect(nieuweApp).toContain(
      '`workflow` is nodig omdat de agent onder deze login later template-updates met `.github/workflows/` pusht.',
    );
  });

  test('stap 8 van de updateprocedure: de agent pusht, de eigenaar voegt samen', () => {
    expect(nieuweApp).toContain('De agent pusht ook een wijziging in `.github/workflows/`');
    expect(nieuweApp).toContain("`.github/**` is een beschermd pad, dus zo'n PR voeg jij (de eigenaar) samen.");
  });
});
