---
soort: toegevoegd
---

- App-thema's (spec `docs/template/specs/app-thema.md`, deel C): een register `src/web/styles/themes.ts` met
  `defineThemes`, themablokken `[data-app-theme='<naam>']` in `src/web/styles/theme.css`, `setAppTheme` en
  `applyStoredTheme(themes)` (bewaard onder `app-thema`, los van `thema`) in `src/core/web/lib/theme.ts`, het component
  `ThemeScope` voor een thema op een deel van de app, een contrasttest per thema (licht en donker) en een themakiezer op
  `/design-system`. De template levert twee voorbeeldthema's mee: `strak` en `zacht`.

### Bij een update

- `src/web/styles/theme.css` en `src/web/styles/themes.ts` zijn app-zone: had je `theme.css` al aangepast, dan krijg je een
  conflict met de twee voorbeeldthema's. Houd ze, of haal de blokken `[data-app-theme='strak']` en
  `[data-app-theme='zacht']` en hun registratie in `themes.ts` samen weg (`test/ui/themas.test.ts` eist dat ze gelijk zijn).
- Geef het register door bij het opstarten: `applyStoredTheme(themes)` in `src/web/main.tsx`, met
  `import { themes } from './styles/themes.ts'`, zoals in de template.
- Componentoverrides alleen op `:root` werken voor het hele document, maar binnen een `ThemeScope` pas als ze op
  `:root, [data-app-theme]` staan.
