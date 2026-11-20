# Relatieve tijd: `format.relative` en `RelativeTime`

Toon een tijdstip ten opzichte van nu ("3 minuten geleden", "gisteren", "over 2 dagen"). Spec:
`docs/template/specs/relatieve-tijd.md`. Geen dependency, route, permissie of migratie: de tekst komt uit het ingebouwde
`Intl.RelativeTimeFormat('nl-NL', { numeric: 'auto' })`.

## Gebruik

- `format.relative(iso, now)` (`src/core/web/lib/format.ts`) geeft de tekst. `now` is verplicht: de functie leest nooit
  zelf de klok en is daardoor deterministisch testbaar. Een ongeldige `iso` gooit dezelfde fout als `format.dateTime`;
  een ongeldige `now` gooit `format: geen geldig referentietijdstip`.
- `<RelativeTime iso={...} now={...} />` (`src/core/web/ui/relative-time.tsx`, via `src/web/ui/index.ts`) rendert een
  `<time dateTime>` met de volledige datum (`format.dateTime`) als `title` en als verborgen tekst voor schermlezers. Zonder
  `now` rekent het met het moment van renderen. Het component heeft geen eigen kleur of typografie: zet het in `Text`,
  `TableCell` of `DescriptionList`. Het is niet interactief en staat niet in de tabvolgorde.
- Statisch bij render: geen timer of live-verversing. Rendert de ouder opnieuw (bijvoorbeeld na een query-refetch), dan
  rekent het opnieuw. Wil een scherm live tekst, dan geeft het zelf een `now` door.
- Gebruik `format.dateTime` in plaats hiervan waar de exacte datum het doel is (audit, facturen, juridische tijdstippen).

## Grenzen

Verschil `d` in seconden (negatief = verleden), afgekapt richting nul; een maand is 30 dagen, een jaar 365 dagen. Geen
kalenderrekening of tijdzone: 26 uur geleden is "gisteren", ook als het kalendermatig eergisteren was.

| Absoluut verschil | Eenheid | Voorbeelden |
|---|---|---|
| < 60 s | — | `nu` |
| 60 s – < 1 u | minuut | `1 minuut geleden`, `over 5 minuten` |
| 1 u – < 1 dag | uur | `23 uur geleden`, `over 2 uur` |
| 1 – < 7 dagen | dag | `gisteren`, `overmorgen`, `6 dagen geleden` |
| 7 – < 30 dagen | week | `vorige week`, `over 2 weken`, `4 weken geleden` |
| 30 – < 365 dagen | maand | `vorige maand`, `12 maanden geleden` |
| ≥ 365 dagen | jaar | `vorig jaar`, `3 jaar geleden` |

Het voorbeeld staat op `/design-system?vak=gegevens`, sectie "RelativeTime", met een vaste `now`.

## Tests per criterium

| Criterium | Test |
|---|---|
| AC-1 t/m AC-6 | `src/core/web/lib/format-relative.test.ts` |
| AC-7, AC-8, AC-9 (geen `tabIndex`/rol) | `src/core/web/ui/relative-time.test.tsx` |
| AC-9 (barrel), AC-10 | `src/web/features/design-system/relative-time-examples.test.tsx`; `pnpm check:catalogus` |
| AC-11 | `e2e/relative-time.spec.ts` |
| AC-12 | `git diff origin/main -- package.json pnpm-lock.yaml` leeg; volledige testsuite |
