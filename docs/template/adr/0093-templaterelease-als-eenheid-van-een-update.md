# 0093 — Templaterelease als eenheid van een update

Status: geaccepteerd

Wijzigt [0040](0040-template-app-en-grens-core-app.md) punt 1 (na de koppeling merget een app een releasetag, niet
`template/main`) en [0059](0059-leerlus-van-app-naar-template.md) punt 5 (verspreiden via de volgende release). Drempel: A1
(het contract tussen template en app verandert) en A4. Besluiten van de eigenaar, 2026-11-18 (OV-1 tot en met OV-8).
Uitwerking: [spec template-release](../specs/template-release.md).

## Context

Een app werkt bij met `git merge template/main`. `TEMPLATE_VERSION` blijft daarbij gelijk, terwijl onder `[Unreleased]` in
`docs/template-changelog.md` tientallen wijzigingen staan, een deel met een "Bij een update"-notitie. Na de merge ziet een
app niet welke notities ze al heeft uitgevoerd, en een script kan de notities niet per release vinden. Daarnaast voegt elke
template-PR een regel toe bovenaan dezelfde secties van de wijzigingenlijst, zodat open PR's daar vrijwel altijd
conflicteren.

## Besluit

1. **Een release is de eenheid van een update.** Een release is een commit op `main` van de template met een releasekop in
   de wijzigingenlijst, `TEMPLATE_VERSION` gelijk aan die versie en een geannoteerde tag `template-vx.y.z`. Na de koppeling
   merget een app een releasetag in plaats van `template/main`; een app die releases overslaat, merget de nieuwste tag en
   voert de notities van elke tussenliggende release uit, op oplopende versie.
2. **Tagvorm `template-v`.** Het voorvoegsel voorkomt een botsing met de eigen `v*`-tags van een app. Een app haalt de
   template op met `--no-tags` en alleen de `template-v*`-tags. `template-v0.1.0` komt op de commit van `v0.1.0`, dat blijft
   bestaan.
3. **Versieschema semver in de `0.x`-reeks.** Minor bij een release met minstens één "Bij een update"-notitie, anders patch.
   `1.0.0` alleen op een eigen besluit.
4. **De eigenaar tagt met de hand**, na de merge van de release-PR, op de squash-commit op `main`. De agent tagt niet en CI
   krijgt geen schrijfrecht op tags. De hoofdsessie maakt de release-PR op verzoek van de eigenaar.
5. **Een release-tag is onveranderlijk.** Verplaatsen of opnieuw zetten mag niet; een fout herstel je met een nieuwe
   release.
6. **Wijzigingen staan als fragment klaar tot de release.** Een template-PR die een app of gebruiker merkt, voegt een
   fragment toe in plaats van een regel in de wijzigingenlijst; de release voegt de fragmenten samen. Een ontbrekend
   fragment geeft een waarschuwing, geen blokkade.
7. **De stand van een app is zichtbaar met één alleen-lezend commando.** Het meldt openstaande releases en hun notities,
   adviserend; het haalt niets op en schrijft niets.

## Alternatieven

- **Blijven mergen van `template/main`:** geen werk, maar een app weet niet welke notities openstaan en de versie zegt niets.
- **Tags in de vorm `v*`:** botst met de productietags van een app (R-REL-01 schrijft geen vorm voor).
- **Een workflow die tagt of een GitHub Release maakt:** geeft CI schrijfrecht op tags; een vergeten tag is ook zonder
  workflow zichtbaar in de statusmelding.
- **CI eist een fragment bij elke PR:** te veel valse rood bij interne wijzigingen; de reviewer beoordeelt of een app het
  merkt. Herzien als een release een gemiste notitie blijkt te hebben.
- **Core als npm-pakket met versies** ([0040](0040-template-app-en-grens-core-app.md)): blijft te zwaar zolang core niet stabiel is.

## Gevolgen

- Een app wacht op de tag van de eigenaar; tot dan meldt de statuscontrole dat de tag ontbreekt.
- Een app die toch `template/main` merget, blijft door `check-core` geaccepteerd (een tag staat op `template/main`), maar
  krijgt een waarschuwing over templatecommits buiten een release.
- Een app van vóór dit besluit leest de notities van de eerste release met `git show` op de tag; daarna heeft ze het
  statuscommando.
- Docs die `git merge template/main` als updateweg noemen, gaan mee met de bouw; historische stukken blijven.
