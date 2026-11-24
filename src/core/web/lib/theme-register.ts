import { assert } from '#core/shared/assert.ts';

// Het register van de app-thema's (spec app-thema, deel C): naam (kebab-case) → label voor een kiezer. De app maakt het in
// src/web/styles/themes.ts en geeft het door (main.tsx); core importeert het register nooit (R-LAAG-02). Zonder DOM:
// test/ui/themas.test.ts laadt het register in de node-tests. Gebruik via theme.ts, dat dit her-exporteert.
export interface ThemeDefinition {
  readonly label: string;
}
export type ThemeRegister = Readonly<Record<string, ThemeDefinition>>;

const THEME_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function defineThemes<const T extends ThemeRegister>(themes: T): T {
  for (const name of Object.keys(themes)) assert(THEME_NAME.test(name), `Themanaam niet in kebab-case: ${name}`);
  return themes;
}
