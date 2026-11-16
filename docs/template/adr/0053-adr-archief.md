# 0053 — Afgesloten ADR's naar `docs/adr/archief/`

Status: geaccepteerd

Herzien: 2026-10-30 (#385): de gevolgregel over mandaatrecords in `.claude/decisions.json` vervalt; de records gaan weg
([0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md)).
Herzien: 2026-11-12 (#692): door ADR 0089 punt 2, in de template deels: punt 1 en 2, vervalt: het archief wijzigt niet en verdwijnt niet; blijft: verhuizen onder dezelfde naam mag, nummers worden niet hergebruikt
Herzien: 2026-11-12 (#696): door ADR 0089 punt 1, 5, 6 en 7, de vorige regel vervalt: punt 1, 2, 3, 4 en 5 vervallen; het archief verdwijnt bij de verhuizing, de guard die het bewaakte verdwijnt, en `docs/template/adr/` heeft geen archief (git is de historie); nummers zijn uniek per map; `feiten.mjs adr` toont twee lijsten, app eerst
Herzien: 2026-11-16 (#744): ingekort tot wat nog geldt; de puntnummers zijn ongewijzigd, de oude tekst staat in git; anders dan de regel van #696 zegt, blijven punt 1 tot en met 5 gelden voor het archief in een app

Drempel: A4 (de route uit [0046](0046-werkstraat-en-beslisroute.md) punt 2 en 5 voor ADR's met een eigenaarstatus) en A3 (een
guard laat een overgang toe die hij nu weigert).

## Context

Van de 53 ADR's in `docs/adr/` zijn er 39 `vervangen door NNNN` of `vervallen`: 284 van de 393 KB. De consolidatie (0039–0052)
heeft hun inhoud overgenomen, maar elke `grep`, elke lijst uit `feiten.mjs adr` en elke agent die "het ADR over X" zoekt, raakt
eerst de oude tekst. Aanleiding (framework §1): gemeten wrijving uit de eigenaarreview "template slanker en sneller".

## Besluit

`docs/template/adr/` heeft geen archief (0089 punt 1); wat hieronder staat, dwingen rolhek en checks nog af voor
`docs/adr/archief/` in een app.

1. **Verhuizen mag, wijzigen niet.** Een ADR dat op main `vervangen door NNNN` of `vervallen` heeft, mag verhuizen naar
   `docs/adr/archief/` onder dezelfde bestandsnaam, byte-gelijk. Elke andere schrijfactie in `archief/` weigert het rolhek.
2. **A4 geldt ook in het archief.** Een gearchiveerd ADR is een ADR-document: tekst en status veranderen niet en het wordt niet
   verwijderd; elke inhoudswijziging daar geeft `a4`.
3. **Nummers lopen door.** Het volgende vrije nummer en de controle op dubbele nummers tellen `docs/adr/` en `archief/` samen;
   een nummer wordt nooit hergebruikt.
4. **Links blijven toetsbaar.** `check-docs` lost een link naar `docs/adr/NNNN-*.md` op tegen `docs/adr/` of `archief/`, en een
   relatieve link vanuit `archief/` alsof het bestand nog in `docs/adr/` stond. Links buiten `docs/adr/` gaan in dezelfde PR
   naar het nieuwe pad.
5. **Lijsten tonen het actieve deel.** `feiten.mjs adr` toont `docs/adr/` zonder archief; het archief telt mee voor nummers en
   voor `vervangen door NNNN`-verwijzingen.
6. *(vervallen: uitgevoerd)*

## Alternatieven

- **Laten staan:** niets te bouwen, maar de ruis blijft en groeit met elke consolidatie.
- **Verhuizen en links herschrijven:** links kloppen op GitHub, maar de tekst verandert; dan is "onwijzigbaar" niet meer
  byte-toetsbaar en vraagt elke correctie een oordeel.

## Gevolgen

- Relatieve links in gearchiveerde ADR's wijzen op GitHub naar een niet-bestaand pad; de check vangt ze, een lezer niet.
- Een `vervangen door`-keten blijft volgbaar: het nummer verwijst, niet het pad.
