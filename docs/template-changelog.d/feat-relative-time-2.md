---
soort: toegevoegd
---

- Relatieve tijd (spec `relatieve-tijd`): `format.relative(iso, now)` in `src/core/web/lib/format.ts` ("3 minuten geleden",
  "gisteren", "over 2 weken", via `Intl.RelativeTimeFormat`, vaste grenzen, afkappen richting nul) en het kitcomponent
  `RelativeTime` (`<time>` met de volledige datum als tooltip en voor schermlezers, statisch bij render), met voorbeeld op
  `/design-system?vak=gegevens` en gebruiksdoc `docs/ui-relative-time.md`. Geen dependency; bestaande schermen blijven
  `format.dateTime` gebruiken tot een app ze zelf ombouwt.
