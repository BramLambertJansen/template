import { describe, expect, test } from 'vitest';
import { sessionStart } from '../../rails/hooks/lib/werkstraat.mjs';

// Bewijstest van leerpunt #962 (spec rolhek-leerpunten/AC-7): `sessionStart` meldt dat de lokale `.claude/settings.json`
// (CLAUDE_PROJECT_DIR) in `sandbox.excludedCommands` afwijkt van het anker. Dit bestand importeert alleen modules die op de basis
// bestaan, zodat het daar op `toContain` faalt en niet op laden.
const ANKER = ['git commit *', 'git push origin HEAD'];
const MELDING = 'De lokale .claude/settings.json wijkt af van main in sandbox.excludedCommands';

interface NetwerkDeps {
  readonly anker: readonly string[];
  readonly lokaal: readonly string[] | undefined;
}

/** Nep-deps zoals test/hooks/werkstraat.test.ts; `netwerkvormen` is nieuw en weggelaten als het `undefined` is. */
function uitvoer(netwerkvormen?: NetwerkDeps): string {
  const basis = {
    run: () => ({ code: 0, output: 'feat/x' }),
    changed: () => ['src/a.ts'],
    read: () => null,
  };
  // Een variabele van een ruimer type, zodat de nieuwe dep geen excess-property-fout geeft.
  const deps = netwerkvormen === undefined ? basis : { ...basis, netwerkvormen };
  return sessionStart(deps).stdout ?? '';
}

describe('rolhek-leerpunten/AC-7 sessionStart meldt drift tussen de lokale settings en het anker', () => {
  test('rolhek-leerpunten/AC-7 ticketrij: de lokale lijst mist git commit *, dan staat het patroon in de melding', () => {
    const tekst = uitvoer({ anker: ANKER, lokaal: ['git push origin HEAD'] });

    expect(tekst).toContain(MELDING);
    expect(tekst).toContain('(ontbreekt: git commit *)');
    expect(tekst).toContain(
      'commit en push in de vorm die het rolhek eist draaien dan in de sandbox. Eigenaar: werk de hoofdcheckout bij naar main (spec rolhek-leerpunten/AC-7).',
    );
  });

  test('rolhek-leerpunten/AC-7 meerdere ontbrekende patronen: in ankervolgorde, gescheiden door een komma en spatie', () => {
    const tekst = uitvoer({ anker: ANKER, lokaal: [] });

    expect(tekst).toContain('(ontbreekt: git commit *, git push origin HEAD)');
  });

  test('rolhek-leerpunten/AC-7 de melding is een eigen regel in de uitvoer', () => {
    const regels = uitvoer({ anker: ANKER, lokaal: ['git push origin HEAD'] }).split('\n');

    expect(regels.some((regel) => regel.startsWith(MELDING))).toBe(true);
  });

  test('rolhek-leerpunten/AC-7 regressie: een volledige lokale lijst geeft geen melding', () => {
    expect(uitvoer({ anker: ANKER, lokaal: [...ANKER, 'gh api *'] })).not.toContain('wijkt af van main');
  });

  test('rolhek-leerpunten/AC-7 regressie: lokaal undefined (geen CLAUDE_PROJECT_DIR) geeft geen melding', () => {
    expect(uitvoer({ anker: ANKER, lokaal: undefined })).not.toContain('wijkt af van main');
  });

  test('rolhek-leerpunten/AC-7 regressie: zonder netwerkvormen in de deps geen melding', () => {
    const tekst = uitvoer();

    expect(tekst).toContain('Branch: feat/x');
    expect(tekst).not.toContain('wijkt af van main');
  });
});
