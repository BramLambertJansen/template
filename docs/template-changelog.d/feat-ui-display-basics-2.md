---
soort: toegevoegd
---

- Avatar, Image en StatTile in de UI-kit (spec `ui-weergave-basis`): foto of initialen in drie maten, een losse afbeelding
  met vaste beeldverhouding en fout-fallback, en een KPI-tegel met trend, toelichting en link; voorbeelden op
  `/design-system?vak=gegevens`, gebruik in `docs/ui-weergave-basis.md`. `initials()` woont nu in
  `src/core/web/ui/avatar.tsx`; `topbar.tsx` her-exporteert hem. Een app hoeft niets te doen; importeer de componenten
  uit `src/web/ui/index.ts` wanneer je ze nodig hebt.
