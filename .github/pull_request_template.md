## Spec

<!-- Welke spec(s) krijgen in deze PR een status of nieuwe inhoud, wat wordt er besloten (drie regels), en de uitslag van de spec-review. Geen spec: "n.v.t." met reden; kritiek werk in een app (ADR 0062): de besluit-PR. -->

## Wat en waarom

<!-- Eén onderwerp per PR. Link naar de spec in docs/specs/ als die er is. -->

## Gedrag

<!-- Per acceptatiecriterium: de test en de uitslag. Alleen docs of geen gedragsverandering: "n.v.t." met reden. -->

| Acceptatiecriterium | Test | Uitslag |
|---|---|---|
|  |  |  |

## Bewijs

- Fase(s) uit `docs/roadmap.md` en waarom:
- Acceptatiecriteria die deze PR afdekt (bijv. `notes/AC-1`) en de tests die ze bewijzen:
- Checkuitslag per exact commando (`gate:fast`, `gate:slow`, osv-scanner, CodeQL; wat nog niet bestaat: "niet beschikbaar"):
- Bij schermwerk: `ui:check` gedaan voor:
- Gewijzigde bestaande tests, met reden:
- R-id's die vervielen of waarvan de tekst veranderde (`docs/normen-vervallen.md`), of "geen":

## Majorchecklist

<!-- Alleen bij een major van Node, pnpm of TypeScript (R-PROV-04, ADR 0111); anders weglaten. Een ADR alleen als
werkwijze, configuratie of code verandert. -->

1. Changelog gelezen; per breaking change één regel wat die voor ons betekent:
2. CI groen plus `gate:slow` (bewijs):
3. `scripts/cloud-setup.sh` in een verse cloudsessie en `pnpm app:init` in een proefkopie:
4. Versie overal gelijk (`mise.toml`, `package.json`, Dockerfile, compose):
5. Terugdraaien in één zin:

## Leerpunt

<!-- Alleen als deze PR een issue met label `leerpunt` sluit (ADR 0078); anders weglaten. Per issue één regel:
- #<nr>: trede <Type|Check|Gouden pad of generator>; bewijs <testpad>
Het testpad is een `*.test.ts(x)` (bij Type een `*.test-d.ts`) die deze PR toevoegt of wijzigt; hij faalt op de basis op een
assertie en slaagt op de head. Bij een integratie- of e2e-test (noem die in de reden): `bewijs geen test: <reden>`; dan
merget de eigenaar. Bij een teksttrede (ADR 0107; recept: docs/operations/gedragsbaseline.md):
- #<nr>: trede <Skill|Padregel|AGENTS.md>; bewijs baseline: zonder <a>/3, met 3/3 (<model>)
- #<nr>: trede <Skill|Padregel|AGENTS.md>; bewijs geen baseline: <reden>
Bij baseline een blok `### Scenario #<nr>` met Prompt:, Beginstand:, Criterium: en zes runregels; de eigenaar merget.
Schrappen of vereenvoudigen (ADR 0081; het issue heeft die plek):
- #<nr>: trede Schrappen of vereenvoudigen; bewijs meting: <voor> → <na> (<bron>)
Voor en na zijn getallen; de bestaande tests blijven groen; de eigenaar merget. -->

## Checklist

- [ ] `docs/dod.md` doorlopen
- [ ] Raakt dit gedrag, API, configuratie of conventies? Dan zit de doc-wijziging in deze PR (of: n.v.t., reden)
- [ ] Geen bestaande migratie gewijzigd; geen test verwijderd of geskipt zonder akkoord
- [ ] Runnerchecks geïsoleerd uitgevoerd of werkelijke CI-uitslagen verzameld op de juiste SHA; geen agentoverride van hostcontroles (ADR 0044)
- [ ] Nieuwe `unsafeCast` heeft een reden
