---
soort: toegevoegd
---

- Versie en build-SHA onderaan in elke schil: `ShellFrame` krijgt de prop `buildInfo` en toont een kleine voet
  `Versie x.y.z · build abc1234` (zonder `BUILD_SHA` alleen de versie, zonder antwoord niets). Nieuw: `buildInfo()` in de
  API-client (`src/core/web/lib/api-client.ts`), `buildInfo` in `ShellProps`, een contractgeval in `shellContract`
  (`src/core/web/ui/testing.tsx`). Spec `release-versie` (addendum, AC-11 tot AC-14).

### Bij een update

- `src/web/features/layout/app-layout.tsx` en `queries.ts` zijn van de app, dus de voet verschijnt niet vanzelf. Neem
  `useBuildInfo` over uit `src/web/features/layout/queries.ts` van de template, roep het in `AppLayout` aan vóór elke vroege
  `return` (bijvoorbeeld `if (me.data === undefined) return null;`; anders wisselt het aantal hooks per render en gooit React),
  en geef `buildInfo={buildInfo}` aan je schil, met `const buildInfo = useBuildInfo(toontBuildInfo(location.pathname)).data ?? undefined;` (`toontBuildInfo` uit
  `schil-voorbeeld.ts` van de template: op `/design-system` geen aanroep, design-system/AC-10).
- Heeft de app een eigen schil op `ShellFrame`, geef dan `buildInfo` uit `ShellProps` door aan `ShellFrame`; anders faalt het
  nieuwe geval van haar `shellContract`-suite.
