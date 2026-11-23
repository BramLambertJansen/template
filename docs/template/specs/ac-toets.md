---
status: goedgekeurd
namespace: ac-toets
---

# Elke nieuwe of gewijzigde AC noemt zijn testbestand

## Doel

Een acceptatiecriterium dat in een PR nieuw is of verandert, noemt achter `Toets:` het testbestand dat het toetst; zonder
dat veld is de ratchet rood, zodat een AC zonder test al bij de spec opvalt en niet pas bij `gebouwd` (leerpunt #793, #834).

## Rollen en wie wat ziet

Geen gebruikersrollen: een check in `pnpm ratchet` (lokaal, pre-push via `gate:fast`, CI). Wie een spec schrijft (architect
in een app, hoofdsessie in de template) ziet de melding met spec, AC-id en de vorm die ontbreekt.

## Kopieer de vorm van

- `scripts/kit/leesbudget.mjs` — `basisVan`, `toen` en `zonderBasis`: vergelijken met `git merge-base origin/main HEAD`,
  de werkmap als nieuwe stand, zonder basis lokaal een melding en in CI rood.
- `scripts/kit/ratchet.mjs` — registratie in `strikt`: nooit in `.kit/baseline.json`, ook niet met `--update`.
- `scripts/kit/onderdrukkingen.mjs` — hernoemen herkennen met `git diff -M` tussen merge-base en werkmap.
- `scripts/kit/check-docs.mjs` — `SPEC_BESTAND` (welke bestanden), de grens van een item zoals in `NIEUWE_AC`, `TESTBESTAND`
  (wat een testpad is) en `VERVALLEN_AC` met `vervallenAcs` (wanneer een AC vervallen is); exporteren en hergebruiken,
  geen derde parser.

## Hergebruik en UX

n.v.t. — geen UI; de melding volgt de vorm van de andere ratchetmeldingen (`✗ <check>: <sleutel>` en een regel uitleg).

## Acceptatiecriteria

Een AC-item is een regel `- **<ns>/AC-<n>** …` in kolom 0, met `<ns>` gelijk aan de bestandsnaam of de `namespace` van de
spec, plus de vervolgregels tot een regel die met `-` of `#` begint of leeg is (zoals `NIEUWE_AC`). Alleen bestanden direct in
`docs/specs/` of `docs/template/specs/` tellen (`SPEC_BESTAND`: niet `archief/`, niet `_template.md`, `_mini.md` of een ander
`_`-bestand), en alleen getrackte bestanden zoals ze in de werkmap staan, ook als ze nog niet gecommit zijn; een niet-getrackt
bestand telt pas na `git add`, zoals bij `check-docs`. Een `Toets:` telt als er een pad tussen backticks op volgt dat een
testbestand is volgens `TESTBESTAND`, eindigt op een bestandsnaam met extensie en geen `<` bevat (een plaatshouder); een
AC-item mag meer `Toets:`-velden hebben, één geldige volstaat. Vergelijken gebeurt op het hele item, id inbegrepen, na
normaliseren: elke reeks witruimte (ook regeleinden en inspringing) wordt één spatie, en de merktekens `(vervallen)`,
`(nieuw)` en `(voorbeeld)` vallen weg (besluit eigenaar 2026-11-19).

- **ac-toets/AC-1** — Gegeven een spec met een AC-item dat op de merge-base ontbreekt en geen `Toets:` met een pad tussen
  backticks dat een testbestand is, wanneer `pnpm ratchet` draait, dan is de uitslag rood met sleutel
  `docs:ac-toets:<bestand>:<regel>:<AC-n>` en een melding die bestand, regel en de vereiste vorm noemt; met een geldig
  testpad, ook met `(nieuw)` erachter, geen melding. Rood blijft het met alleen een plaatshouder (`<testbestand>`), een
  commando (`pnpm test:unit`), een kale map (`test/`) of een pad dat geen testbestand is (`src/x.ts` (voorbeeld)).
  Toets: `test/rails/ac-toets.test.ts`
- **ac-toets/AC-2** — Gegeven een AC-item dat in hetzelfde bestand op de merge-base een gelijk genormaliseerd item heeft, dan
  geen melding, ook zonder `Toets:`; dat geldt ook als alleen witruimte, regelafbreking of een merkteken `(vervallen)`,
  `(nieuw)` of `(voorbeeld)` verschilt. Is de tekst verder anders, dan geldt AC-1.
  Toets: `test/rails/ac-toets.test.ts`
- **ac-toets/AC-3** — Gegeven een spec die op de merge-base niet bestaat, dan telt elk AC-item als nieuw; herkent git het
  bestand als hernoemd (`git diff -M` tussen merge-base en werkmap), dan wordt vergeleken met het oude bestand en geldt AC-2
  (besluit eigenaar 2026-11-19). Toets: `test/rails/ac-toets.test.ts`
- **ac-toets/AC-4** — Geen melding voor een AC-item dat vervallen is zoals regel 6 van `check-docs` het telt (`VERVALLEN_AC`
  met een geaccepteerd ADR in de ADR-map naast de specmap), voor een spec met `status: vervallen` en voor bestanden buiten
  `SPEC_BESTAND`; een AC met `Vervallen door ADR 9999` (onbekend) zonder geldige `Toets:` is wel rood.
  Toets: `test/rails/ac-toets.test.ts`
- **ac-toets/AC-5** — Zonder merge-base (geen `origin/main` of een ondiepe checkout) toetst de check niets: lokaal één regel
  `let op: geen merge-base met origin/main; ac-toets toetst niets` in de meldingen van de ratchet, in CI (`GITHUB_ACTIONS`)
  een strikte overtreding `docs:ac-toets:geen-basis`. Toets: `test/rails/ac-toets.test.ts`
- **ac-toets/AC-6** — De check staat in `strikt` van `scripts/kit/ratchet.mjs`: een overtreding is altijd rood en
  `pnpm ratchet:update` neemt haar niet op in `.kit/baseline.json`. Toets: `test/rails/ac-toets.test.ts`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Bestaande gebouwde spec, AC ongewijzigd | geen melding (AC-2) | n.v.t. |
| Bestaande AC krijgt alleen `(vervallen)` achter een pad | geen melding (AC-2) | n.v.t. |
| AC wordt `Vervallen door ADR …` met geaccepteerd ADR | geen melding (AC-4) | n.v.t. |
| Nieuwe AC `(nog niet gebouwd)` in een gebouwde spec | nieuw: `Toets:` nodig (AC-1) | n.v.t. |
| De bouw-PR haalt `(nog niet gebouwd)` weg | tekst gewijzigd (geen merkteken): `Toets:` nodig (AC-1) | n.v.t. |
| `Toets:` zonder backticks, met een leeg pad of een plaatshouder | telt niet (AC-1) | n.v.t. |
| Spec hernoemd zonder inhoudelijke wijziging | geen melding (AC-3) | n.v.t. |
| Zelfde AC-id twee keer in een spec | elk item apart getoetst; de regel in de sleutel onderscheidt ze | n.v.t. |
| Spec getrackt maar niet gecommit | de werkmap telt als nieuwe stand | n.v.t. |
| Spec niet getrackt | telt pas na `git add` | n.v.t. |

## Raakt ook

`scripts/kit/ac-toets.mjs`, `scripts/kit/ratchet.mjs` (strikt, meldingen en kopcommentaar),
`scripts/kit/check-docs.mjs` (exports voor hergebruik), `scripts/kit/gates.mjs` (beschrijving van `pnpm ratchet`),
`test/rails/ac-toets.test.ts`, `test/scripts/ratchet-modules-los.test.ts` (de nieuwe module, leerpunt #752),
`docs/specs/_template.md`, `docs/specs/_mini.md` en `scripts/kit/templates/spec.md.tmpl` (de zin over wat de checks
toetsen), skill `spec` stap 2 en 6, een changelogfragment. `check:migrations`, `check:secdef`, `test:db`/policies,
`test/security/resources.ts` en permissietests: n.v.t. (geen database, route of permissie).

## Buiten scope

Bestaande specs aanvullen met `Toets:` (besluit eigenaar 2026-11-19); toetsen dat het genoemde testbestand het AC-id noemt
(regel 6 van `check-docs` toetst het id in alle testbestanden, regel 14 het pad vanaf `gebouwd`).

## Testplan

`test/rails/ac-toets.test.ts`: per AC een tijdelijke git-repository met een `origin/main` (basis) en een werkmap (head),
zoals `test/rails/leesbudget.test.ts` de krimpcontrole toetst; de pure vergelijking van AC-items daarnaast als unit-test.
Per AC minstens één fout geval dat rood moet zijn (R-PRINC-04).

## Open vragen

- **OV-1 ✅ besloten** — Alleen nieuwe of gewijzigde AC's, geen bestaande specs (eigenaar 2026-11-19).
- **OV-2 ✅ besloten** — Hernoemen herkennen met `git diff -M` (eigenaar 2026-11-19).
- **OV-3 ✅ besloten** — Merktekens `(vervallen)`, `(nieuw)`, `(voorbeeld)` tellen niet als wijziging (eigenaar 2026-11-19).
