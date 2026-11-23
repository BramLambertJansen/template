---
soort: gewijzigd
---

- De securitysuite toetst dat de zoekterm de fixture vindt (spec `suite-volgt-contract`, AC-18,
  `test/security/controles.ts`). Een lijst met `q` en een `sample.create` zonder niet-lege tekstwaarde is nu een probleem in
  plaats van een stil overgeslagen zoekvariant. A moet met de zoekterm de eigen rij uit `sample.create` terugvinden.

### Bij een update

- Zet in `test/security/resources.ts` bij elke resource waarvan de lijst `q` kent het doorzochte veld als eerste niet-lege
  tekstwaarde in `sample.create`; anders is `pnpm test:db` rood met een probleem dat `sample.create` noemt.
