---
soort: opgelost
---

- Schaduwmodus, vervolg (spec `schaduwmodus` B-7 t/m B-11, #918): `schaduw-register` meldt een andere drempel terwijl
  `aangepast` op 0 bleef (een aanpassing hoogt `aangepast` op) en accepteert als `spec` alleen een bestaand, al genormaliseerd
  `.md`-bestand onder `docs/template/specs/` (`..` omzeilt de mapcontrole niet meer). Bij een dubbele naam tellen voor de
  termijn, de meldingen en de uitvoerders alleen de eerste regel (`scripts/kit/schaduw.mjs`). `pnpm template:release` weigert
  ook een register dat geen JSON-lijst is (`scripts/kit/template-release.mjs`). De reviewer mag `pnpm meting --schaduw`
  draaien (`rails/hooks/lib/rolhek.mjs`, spec `rolhek-lezen`).
