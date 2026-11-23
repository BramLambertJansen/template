# 0103 — Procesbewijs in vier goedgekeurde specs vervalt

Status: geaccepteerd

Een ADR omdat het AC's laat vervallen, procesdelen uit AC's laat schrappen en twee AC's wijzigt (R-WERK-07: een AC-id
verdwijnt nooit, een vervallen AC noemt het ADR). Het past het principe van ADR 0100 toe op vier specs die nog op
`goedgekeurd` staan; het wijzigt geen geaccepteerd ADR. Voorstel van de hoofdsessie op verzoek van de eigenaar (2026-11-22);
de merge door de eigenaar is het besluit.

## Context

Vijf goedgekeurde specs zijn grotendeels gebouwd en getest: `audit-log`, `compacte-kennisbasis-rails`, `security-suite`,
`templateregime` en `accountstatus-en-laatste-login`. Ze kunnen niet op `gebouwd`: `check-docs` regel 6 eist dan voor elk
eigen AC een testbestand dat `<namespace>/AC-n` noemt. De meeste gaten zijn tests die het id kort schrijven (`AC-4`); dat lost
de bouw-PR op door het volledige id toe te voegen. Een kleiner deel beschrijft geen gedrag maar bewijs in of na de bouw-PR:
een groene gate, docs in de PR, een proef-PR van de GitHub App. ADR 0100 noemde alleen acht AC's bij naam, dus deze vallen
er niet onder.

De proeven van `templateregime` (AC-4, AC-5) en de docs-eisen over de App (AC-12) zijn daarnaast ingehaald: ADR 0093 punt 1 en 2
schaffen de App en de verplichte review van een code-eigenaar af.

## Besluit

1. **Deze vijf AC's vervallen** door dit ADR, met hun tekst achter `Was:`:
   - `audit/AC-21`: `check:snapshot` groen en `check-policies` vindt elke policy (uitslag van een gate);
   - `security/AC-15`: docs bijgewerkt in de PR;
   - `templateregime/AC-4` en `templateregime/AC-5`: proef-PR's van de App, geleverd op 2026-11-12 (#694, #695) en ingehaald
     door ADR 0093;
   - `templateregime/AC-12`: reviewpunten in de docs, deels ingehaald door ADR 0093 punt 1 en 2 (geen App, geen review van
     een code-eigenaar).
2. **Bij drie gemengde AC's vervalt alleen het procesdeel;** het gedragsdeel blijft het criterium, met de geschrapte tekst
   achter `Procesdeel vervallen door ADR 0103. Was:`:
   - `audit/AC-19`: "`pnpm check:secdef` groen" vervalt; de functiecatalogus blijft;
   - `compacte-kennisbasis-rails/AC-13`: "`EVENTS` in `rails/hooks/lib/meting.mjs` verandert niet in PR 6a en 6b" vervalt;
     de docs-drift-herinnering alleen bij Stop blijft;
   - `security/AC-14`: "Gegeven `pnpm gate:slow`" en "valt binnen de bestaande runner" vervallen; blijven: de suite tegen
     de echte lokale stack, zonder gemockte API of database en zonder `skip` of `todo`, met als enige afwijking de sessie
     van de probe-app via de test-gateway van `asUser`.
3. **Twee AC's volgen het gebouwde gedrag,** als `Gewijzigd door ADR 0103 … Was:`: de bewaartermijn uit
   `db/migrations/20261019120000_retention.sql` (beschreven in de spec `achtergrondtaken`, nog `voorstel`) geeft
   `app.audit_log` een vierde policy en laat `app_definer` regels ouder dan een jaar verwijderen.
   - `audit/AC-5`: vier policies in plaats van drie;
   - `audit/AC-10`: `update` en `truncate` falen voor `app_definer` en `app_migrator`; `delete` raakt alleen regels ouder
     dan de bewaartermijn.
4. **Geen schijndekking** (ADR 0100 punt 3): de bouw-PR die deze specs op `gebouwd` zet, voegt een id alleen toe aan een test
   die dat AC echt toetst. Een gedragsdeel zonder toets krijgt een nieuwe test, geen kopregel.

## Alternatieven

- **ADR 0100 uitbreiden met deze namen:** herschrijft een geaccepteerd ADR na de bouw; een eigen ADR houdt de herkomst per
  spec leesbaar.
- **De specs op `goedgekeurd` laten:** het gebouwde gedrag blijft zonder status en de roadmap zegt er niets over.
- **Procesdelen als test nabootsen** (een test die de PR-beschrijving of CI-uitslag leest): toetst geen gedrag en is
  schijndekking.

## Gevolgen

- De PR van dit ADR markeert de vijf AC's uit punt 1. Een vervolg-PR past punt 2 en 3 toe (elk herschreven AC krijgt daar
  zijn `Toets:`, spec ac-toets), voegt de volledige id's toe aan de bestaande tests, schrijft de ontbrekende tests (onder
  meer: geen `skip`, `todo` of mock in `test/security/`) en zet de vier specs op `gebouwd`. `accountstatus-en-laatste-login`
  volgt pas met een groene CI-run inclusief `e2e/account-lifecycle.spec.ts`; die spec heeft geen procesbewijs-AC en valt
  niet onder dit ADR.
- ST-04 blijft open voor `/admin/audit` en audit van revoke en reset-link; die vallen buiten de AC's van `audit-log`.
