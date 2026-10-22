# Contract: A4 in een besluit-PR (ADR 0046 punt 2, eigenaarbesluit 2026-10-22)

Aanleiding: eigenaarbesluit 2026-10-22 (sessie): één lijst ADR's. Een geaccepteerd ADR mag worden herschreven en een ADR met een
eigenaarstatus mag worden verwijderd, maar alleen in een besluit-PR. Deze PR wijzigt alleen code, tests en docs buiten `docs/adr/`;
de nieuwe tekst van 0046 punt 2 volgt in een aparte besluit-PR nadat deze op main staat (zoals bij 0038).

Begrippen
- **Besluit-PR**: de framework-lane van `laneVan` (`scripts/kit/lane.mjs`): de PR wijzigt alleen besluitdocumenten
  (`docs/adr/`, `docs/specs/`) en hun record.
- **Herzieningsregel**: een regel in het ADR (buiten de statusregel) van de vorm
  `Herzien: JJJJ-MM-DD (#NNN): <wat>` — bestaande kalenderdatum, PR-nummer > 0, niet-lege omschrijving.
  Regex: `^Herzien: (\d{4}-\d{2}-\d{2}) \(#([1-9]\d*)\): \S.*$`.

## Guard — `beslisOvergang` (rails/hooks/lib/document-state.mjs), puur

- B1. ADR `geaccepteerd` → `geaccepteerd` met andere inhoud (digest wijzigt) én de nieuwe tekst heeft meer geldige
  herzieningsregels dan de oude: uitslag `herzien` (nieuw), `nieuw: false`.
- B2. Zelfde als B1 maar zonder extra geldige herzieningsregel (geen, ongeldige datum, geen PR-nummer, lege omschrijving, of
  alleen een bestaande regel gewijzigd): uitslag `a4`.
- B3. Ongewijzigd: `geaccepteerd` → `voorgesteld` blijft `a4` (ook met herzieningsregel); de inhoud van een ADR met status
  `vervallen` of `vervangen door NNNN` wijzigen blijft `a4` (ook met herzieningsregel); de status van zo'n ADR wijzigen zonder
  inhoudswijziging blijft `geweigerd` (alleen met record); `geaccepteerd` → `vervangen door NNNN`/`vervallen` zonder
  inhoudswijziging blijft `besluit`. Alle overige bestaande uitslagen ongewijzigd.
- B4. `A4_MELDING` noemt de nieuwe regel: een geaccepteerd ADR wijzigt alleen in een besluit-PR, met een herzieningsregel, door
  architect of hoofdsessie; vervallen/vervangen ADR's wijzigen niet; nooit terug naar voorgesteld (ADR 0046 punt 2).

## Guard — `scripts/kit/check-document-status.mjs`

- G1. Uitslag `herzien` telt als besluit zonder record: het document gaat mee in `verifyInPrStatus`. In een besluit-PR slaagt de
  guard en de melding noemt het bestand; met een bestand buiten `docs/adr/`, `docs/specs/` en het record faalt hij
  (geen herkende lane). Een `herzien` ADR maakt de feature-lane nooit mogelijk.
- G2. `verifyGeenAdrWeg`: een verwijderd ADR (status `D`) met een eigenaarstatus op main (`geaccepteerd`, `vervallen`,
  `vervangen door NNNN`) is toegestaan in een besluit-PR en telt dan als besluit (genoemd in de melding). Met een ander bestand
  in de PR (code, test, andere docs dan `docs/adr/`/`docs/specs/`, behalve het record) faalt de guard met de A4-melding.
  Een PR die alleen ADR's verwijdert (zonder ander besluit) is ook een besluit-PR en slaagt.
- G3. Een rename (`R`) van een ADR met eigenaarstatus blijft geweigerd, ook in een besluit-PR (nummers blijven). Hetzelfde geldt
  voor een verwijderd ADR met eigenaarstatus naast een toegevoegd ADR met hetzelfde nummer (`D` + `A`, wat git niet als rename
  herkent): geweigerd met de A4-melding, ook in een besluit-PR.
- G4. Een `voorgesteld` ADR verwijderen blijft vrij (ongewijzigd).

Aanvulling na de Codex-review van #264:

- B5. Een herschrijving waarbij het nummer in de kop (`# NNNN — …`, regel 1) verandert ten opzichte van de oude tekst: uitslag `a4`,
  ook met een nieuwe herzieningsregel. `beslisOvergang` blijft puur (zonder PR-nummer).
- G5. Bij uitslag `herzien` moet elke nieuwe herzieningsregel (in de nieuwe tekst, niet in de oude) `(#<PR_NUMBER>)` dragen, met
  `PR_NUMBER` uit de omgeving (guard.yml geeft die al mee). Een ander nummer → de guard faalt met de A4-melding en noemt het
  verwachte nummer. Ontbreekt `PR_NUMBER` of is het geen positief geheel getal, dan faalt een `herzien` ADR (dicht). Bestaande oude
  regels met een ander PR-nummer blijven geldig.
- G6. Een ADR dat in de PR wordt toegevoegd (status `A`, of het doel van een `R`) met een nummer dat op de basis niet bestaat maar
  in de geschiedenis van de basis ooit als `docs/adr/NNNN-*.md` is verwijderd (`git log <base> --no-renames --diff-filter=D`):
  de guard faalt ("nummer NNNN is al gebruikt"). Een nieuw nummer dat nooit bestond, slaagt.
- G7. Verwijdert de PR een ADR, dan moet elk ADR dat na de PR overblijft met status `vervangen door NNNN` naar een ADR-nummer
  wijzen dat na de PR bestaat; anders faalt de guard en noemt hij het ADR met de losse verwijzing. Worden verwijzer en doel samen
  verwijderd, dan slaagt het.

## Rolhek — `rails/hooks/lib/rolhek.mjs` (lokaal; geen lane-controle, die doet CI)

- R1. Hoofdsessie en architect: Edit/Write van een geaccepteerd ADR met andere inhoud en status `geaccepteerd` → niet geweigerd
  (de gewone regels voor het pad gelden verder, zoals `ask` voor `voorReview`-paden — `docs/adr/` staat daar niet in).
  Of de herzieningsregel er staat, controleert alleen de guard.
- R2. Developer, tester, reviewer, docs: dezelfde wijziging → geweigerd met `A4_MELDING`.
- R3. Hoofdsessie en architect: een ADR met eigenaarstatus op main verwijderen (`rm`, `git rm`, `unlink`, ook als deel van
  `mv` als bron) → niet geweigerd. Andere rollen → geweigerd met `A4_MELDING`.
- R4. Ongewijzigd voor iedere rol: `geaccepteerd` → `voorgesteld` en de inhoud van een `vervallen`/`vervangen` ADR wijzigen
  → geweigerd met `A4_MELDING`. De status van een `vervallen`/`vervangen` ADR terugzetten → geweigerd zoals nu (de melding mag
  een andere zijn, bijv. de rolregel of "deze status…"); test daar alleen dat het geweigerd is. A4 blijft vergeleken met main (de vertrouwde basis), met de werkmap als terugval zonder authority.

## Docs (developer, in deze PR)

- D1. Waar `docs/` (niet `docs/adr/`) of `CHANGELOG.md` A4 of het verbod op verwijderen beschrijft, werkt de developer de tekst bij
  naar B1–R4, met de opmerking dat de tekst van 0046 punt 2 in een volgende besluit-PR volgt. `docs/adr/` blijft onaangeraakt.

## Bestaande tests

Tests die nu vastleggen dat een geaccepteerd ADR voor iedere rol niet wijzigt of nooit verdwijnt (o.a.
`test/hooks/rolhek-beslisroute.test.ts`, tests rond `verifyGeenAdrWeg`) wijzigen omdat deze opdracht dat gedrag verandert; de
tester past ze aan en ze staan met reden in de PR.
