# Definition of Done

De reviewer loopt deze lijst af; elk punt met bewijs in de PR.

- [ ] Alle checks groen (`gate:fast`, `gate:slow`), uitslag in de PR.
- [ ] Elk acceptatiecriterium heeft een test met inhoud (geen lege of triviale assertie).
- [ ] Nieuwe routes via `defineRoute` met permissie, plus een test per verboden rol.
- [ ] Nieuwe foutcodes hebben een tekst in `src/web/copy/errors.ts`.
- [ ] Geen nieuwe `unsafeCast` zonder reden.
- [ ] Nieuwe tabel: RLS aan, expliciete grants, elke policy een pgTAP-test.
- [ ] Geen bestaande migratie of bestaande test gewijzigd.
- [ ] Bij schermwerk: `pnpm ui:check <route>` gedaan (375 en 1280 px + axe).
- [ ] Spec-status bijgewerkt naar `gebouwd`.
