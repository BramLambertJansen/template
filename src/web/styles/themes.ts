import { defineThemes } from '#core/web/lib/theme-register.ts';

// De app-thema's van deze app (spec app-thema, deel C): naam (kebab-case) → label voor een kiezer. Elk thema heeft een blok
// `[data-app-theme='<naam>']` in theme.css (en optioneel een donker blok); test/ui/themas.test.ts houdt beide gelijk.
// De template levert twee voorbeelden mee; een app haalt ze weg of vervangt ze. Zonder thema geldt :root.
export const themes = defineThemes({
  strak: { label: 'Strak' },
  zacht: { label: 'Zacht' },
});
