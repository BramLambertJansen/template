---
status: goedgekeurd
namespace: vervallen-documenten-weg
---

# Vervallen template-documenten verdwijnen; git is de historie

## Doel

`docs/template/specs/` en `docs/template/adr/` bevatten alleen levende documenten: een vervallen document verdwijnt nadat
zijn levende acceptatiecriteria naar een levende spec zijn verhuisd, en `check-docs` houdt dat zo (R-CI-06; eigenaarbesluiten
2026-11-18 en 2026-11-19).

## Rollen en wie wat ziet

- **Architect:** schrijft deze spec en de doelspecs (`rolhek-vooraf`, `sandbox-plaatshouders`, de nieuwe AC's in
  `agent-samenvoegen` en `gebouwd-zonder-nummer`).
- **Hoofdsessie:** bouwt in dezelfde PR; zet `status: gebouwd` op de doelspecs en haalt de merktekens weg.
- **Eigenaar:** de merge is het besluit; de PR raakt beschermde paden (`rails/hooks/`, `scripts/kit/`, `docs/framework.md`,
  ADR's, tests), dus de eigenaar voegt samen.

## Kopieer de vorm van

- `scripts/kit/check-docs.mjs` — `statusViolations` (een melding per document met sleutel `docs:<pad>:<soort>`)
- `test/rails/adr-per-map.test.ts` — fixtures per map en statuswoord

## Hergebruik en UX

Geen UI. Nieuwe melding van `check-docs`, letterlijk, sleutel `docs:<pad>:vervallen-in-template`:
`<pad>: een vervallen of vervangen document staat niet in docs/template/ (R-CI-06); verhuis levende AC's naar een levende spec en verwijder het, git is de historie`.

## Werking

**Verhuistabel.** Doel-AC's staan letterlijk in de doelspecs. Een bron-AC die hier niet staat, beschrijft geen levende code of
test en verdwijnt met het document.

| Bron | Doel | Tests die het nu bewijzen (bouw: hernoemen naar het doel-id) |
|---|---|---|
| rolhek-vooraf-krimp/AC-1 | rolhek-vooraf/AC-1 | `test/hooks/rolhek-padcorpus-vooraf.test.ts:44`; commentaar `test/hooks/rolhek-padcorpus.ts:1` |
| rolhek-vooraf-krimp/AC-10 | rolhek-vooraf/AC-2 | `test/hooks/rolhek-gh-allowlist.test.ts:733-735`, `:1208-1209`, `:1220-1222`, `:1244-1246`, `:1264`; `test/hooks/rolhek-zelfladend.test.ts:242-244`, `:327-330` |
| rolhek-vooraf-krimp/AC-3 (lijst, regel, git) | rolhek-vooraf/AC-3 | `test/hooks/rolhek-zelfladend.test.ts:6`, `:41`, `:80`, `:213`, `:267-269`, `:357-359`, `:377-378`, `:389-390`, `:402`, `:423`, `:454`, `:526`; `test/hooks/shell-glob-klasse-bash.test.ts:9-10` en zijn describes |
| rolhek-vooraf-krimp/AC-11 | rolhek-vooraf/AC-4 | `test/hooks/rolhek-gh-allowlist.test.ts:1276-1285` |
| rolhek-vooraf-krimp/AC-3 (commondir) | rolhek-vooraf/AC-5 | `test/hooks/laden-commondir.test.ts:18`, `:163` |
| rolhek-vooraf-krimp/AC-3 (startvorm) | rolhek-vooraf/AC-6 | `test/hooks/rolhek-verse-main.test.ts:209-210`; "session-start op main" in `test/hooks/werkstraat.test.ts` |
| rolhek-effect/AC-11 (d), lijst | sandbox-plaatshouders/AC-1 | `test/hooks/sandbox-plaatshouders.test.ts:19`, `:134` |
| rolhek-effect/AC-11 (d), apparaat | sandbox-plaatshouders/AC-2 | `test/hooks/sandbox-plaatshouders.test.ts:140` |
| rolhek-effect/AC-11 (a) | sandbox-plaatshouders/AC-3 | `test/hooks/sandbox-plaatshouders.test.ts:164` |
| rolhek-effect/AC-11 (e) | sandbox-plaatshouders/AC-4 | `test/hooks/sandbox-plaatshouders.test.ts:183` |
| rolhek-effect/AC-12 | sandbox-plaatshouders/AC-5 | `test/hooks/sandbox-plaatshouders.test.ts:314` |
| agent-merge-niet-kritiek/AC-3 | agent-samenvoegen/AC-8 | `test/scripts/pr-merge.test.ts:4`, `:73` |
| agent-merge-niet-kritiek/AC-4 | agent-samenvoegen/AC-9 | `test/hooks/rolhek-pr-merge.test.ts:9`, `:45`, `:180` |
| agent-merge-niet-kritiek/AC-7 | agent-samenvoegen/AC-10 | `test/scripts/pr-merge-omvang-steekproef.test.ts:93` |
| agent-merge-niet-kritiek/AC-10 | agent-samenvoegen/AC-11 | `test/docs/geen-externe-review-docs.test.ts:4`, `:76`, `:104` |
| spec-en-bouw/AC-8 | gebouwd-zonder-nummer/AC-13 | `test/rails/spec-en-bouw.test.ts:27-28`; `test/hooks/rolhek-beslisroute.test.ts:148`, `:163`; commentaar `test/rails/check-roadmap-bewijsvorm.test.ts:74` |
| spec-en-bouw/AC-13 | gebouwd-zonder-nummer/AC-14 | `test/rails/spec-en-bouw.test.ts:49-62` |

Niet verhuisd: rolhek-vooraf-krimp AC-2 en AC-4 tot en met AC-9 en uit AC-3 `denyWrite`, de metingen en de leeslijst S2/S3
(ADR 0082 punt 1, ADR 0091 punt 1 en 3); rolhek-effect AC-1 tot en met AC-10, AC-11 (b), (c), (f), (g) en AC-13 (ADR 0091
punt 1); agent-merge-niet-kritiek AC-1, AC-2, AC-5, AC-6, AC-8, AC-9 (ADR 0089 punt 5, ADR 0093); spec-en-bouw AC-1 tot en
met AC-7 en AC-9 tot en met AC-12 (ADR 0089 punt 5, ADR 0095); en de specs adr-herzien-markering, agent-merge-bytegrens,
agent-token, document-status-lokaal en specplicht helemaal (hun code is weg: ADR 0089 punt 5, ADR 0093, ADR 0095).

**Vorm van een verwijzing naar een verwijderd document.** In docs (ook ADR's): platte tekst `spec <naam> (vervallen)` of
`ADR 0066 (vervallen)`, geen link; volgt er een AC die verhuisd is, dan daarachter `; nu <doel-id>` met een link naar de
doelspec. In code, commentaar en meldingen: alleen het doel-id (`spec rolhek-vooraf AC-3`). Een verwijzing die alleen
historie noemt en geen levend AC (ADR-kop "Uitwerking:", een `Herzien:`-regel), krijgt alleen de platte vorm.

## Acceptatiecriteria

- **vervallen-documenten-weg/AC-1** — Verhuizing. Gegeven de verhuistabel, wanneer de bouw-PR klaar is, dan staat elk
  doel-AC in zijn doelspec zoals deze PR het schrijft, noemt elke test uit de derde kolom het doel-id in describe- of testnaam
  (de verwachtingen ongewijzigd), en geeft `git grep -n -e 'rolhek-vooraf-krimp/AC' -e 'rolhek-effect/AC' -e
  'agent-merge-niet-kritiek/AC' -e 'spec-en-bouw/AC' -- test rails scripts` niets.
- **vervallen-documenten-weg/AC-2** — Status. `rolhek-vooraf` en `sandbox-plaatshouders` hebben `status: gebouwd`; in
  `agent-samenvoegen` (AC-8 tot en met AC-11) en `gebouwd-zonder-nummer` (AC-13, AC-14) is `(nog niet gebouwd)` weg; de
  AC-dekking van `check-docs` is groen zonder nieuwe baselineregel.
- **vervallen-documenten-weg/AC-3** — Verwijderen. `docs/template/specs/` adr-herzien-markering, agent-merge-bytegrens,
  agent-merge-niet-kritiek, agent-token, document-status-lokaal, rolhek-effect, rolhek-vooraf-krimp, spec-en-bouw-in-een-pr en
  specplicht, en `docs/template/adr/0066-schrijfgrens-op-effect.md`, bestaan niet; `git grep -n -i -e '^status: vervallen' -e
  '^status: vervangen door' -- docs/template` geeft niets.
- **vervallen-documenten-weg/AC-4** — Verwijzingen. `git grep -n` op elk van de negen specnamen en op `0066-schrijfgrens`,
  over de hele repo, geeft alleen: (a) docs in de vorm uit Werking (rondom de naam staat `(vervallen)`); (b) code en
  commentaar met het doel-id; (c) de uitzonderingen in Randgevallen. Geen Markdown-link wijst naar een verwijderd bestand
  (`check-docs`, sleutel `link`). Per groep, letterlijk naar de vorm uit Werking:
  - ADR-links: 0062 r.21; 0069 r.11, r.17, r.28 (r.28: `spec agent-merge-niet-kritiek (vervallen); de levende AC's staan in
    [spec agent-samenvoegen](../specs/agent-samenvoegen.md) AC-8 tot en met AC-11`); 0071 r.11, r.14; 0074 r.13; 0082 r.12;
    0083 r.13, r.16-17; 0084 r.8, r.10; 0086 r.7; 0089 r.13; 0091 r.7.
  - ADR-tekst zonder link: 0071 r.12, 0082 r.40, 0093 r.41 krijgen `(vervallen)` achter de specnaam; 0091 r.31-33 en r.56 volgen
    AC-8.
  - Specs: `agent-samenvoegen.md` r.72 en r.106, `templateregime.md` r.43 en r.45, `kooi.md` r.110, `leerlus.md` r.147,
    `template-repo.md` r.37 en r.90 (het pad `docs/template/specs/spec-en-bouw-in-een-pr.md:91` krijgt `(vervallen)`).
  - Overige docs: `docs/roadmap.md` r.252, r.263, r.439; `docs/operations/agent-doorloop.md` r.324 (`spec rolhek-vooraf
    AC-2`); `docs/template-changelog.md` r.842 alleen de link wordt platte tekst.
  - Code: `rails/hooks/lib/rolhek.mjs` r.200 (agent-samenvoegen AC-9) en r.621 (rolhek-vooraf AC-2);
    `rails/hooks/lib/shell.mjs` r.11 en r.77 (AC-2 (b) en (d)), r.118, r.189, r.249, r.284 (AC-3 en AC-2 (c));
    `rails/hooks/lib/zelfladend.mjs` r.1 en de zes meldingen r.358, r.364, r.366, r.382, r.384, r.390 (`spec rolhek-vooraf
    AC-3`), r.45 (`AC-2 (c)`); `scripts/kit/pr-merge.mjs` r.238 (agent-samenvoegen AC-10).
  - Testcommentaar dat alleen OV-1 noemt (`test/rails/leesbudget.test.ts:624`, `:728`,
    `test/rails/meting-kerncijfers-pr-tabel.test.ts:56`, `test/rails/meting-stuurt.test.ts:39`,
    `test/rails/meting-zonder-externe-review.test.ts:10`, `test/rails/padtabel-kit.ts:12`): `spec agent-merge-niet-kritiek
    (vervallen), OV-1`.
- **vervallen-documenten-weg/AC-5** — De test die `AC-3` in de `ask`-melding eist (`test/hooks/rolhek-gh-allowlist.test.ts:756`)
  slaagt ongewijzigd met de nieuwe meldingen van `zelfladend.mjs`.
- **vervallen-documenten-weg/AC-6** — Check. Gegeven een document in `docs/template/specs/` met `status: vervallen`, of in
  `docs/template/adr/` met `Status: vervallen` of `Status: vervangen door NNNN`, wanneer `check-docs` draait, dan meldt het
  `docs:<pad>:vervallen-in-template` met de tekst uit Hergebruik en UX. Geen melding voor `voorstel`, `goedgekeurd` en
  `gebouwd` (specs), `voorgesteld` en `geaccepteerd` (ADR's), en voor elke status in `docs/specs/` en `docs/adr/`. Fixtures in
  `test/rails/adr-per-map.test.ts`: per verboden status in elke templatemap één rood geval (faalt op de huidige code), per
  toegestane status een groen geval, en `vervallen` in `docs/specs/` en `docs/adr/` groen.
- **vervallen-documenten-weg/AC-7** — Regelboek, letterlijk in `docs/framework.md`:
  - R-WERK-07: "en een AC-id verdwijnt nooit: een vervallen AC wordt `Vervallen door ADR <nummer> … Was: …`" wordt "en een
    AC-id verdwijnt nooit binnen een levende spec: een vervallen AC wordt `Vervallen door ADR <nummer> … Was: …`; vervalt een
    hele template-spec, dan verhuizen eerst haar AC's met levende code of tests naar een levende spec en verdwijnt daarna het
    document (R-CI-06)".
  - R-CI-05: "vervallen ADR verandert niet" wordt "vervallen ADR verandert in een app niet; in de template verdwijnt een
    vervallen of vervangen ADR (R-CI-06)".
  - R-CI-06: na "git is de historie" komt "; `check-docs` weigert een document met status `vervallen` of `vervangen door NNNN`
    in die twee mappen".
- **vervallen-documenten-weg/AC-8** — ADR's met een `Herzien:`-regel (inhoud wijzigt):
  - 0091: `Herzien: 2026-11-19: punt 3 en Gevolgen: de specs rolhek-vooraf-krimp en rolhek-effect zijn verwijderd (R-CI-06); wat ervan leeft, staat in de specs rolhek-vooraf en sandbox-plaatshouders`;
    punt 3, laatste zin, wordt "De spec verdwijnt; wat ervan gebouwd is, staat in [spec rolhek-vooraf](../specs/rolhek-vooraf.md)."
    en Gevolgen "de spec `rolhek-effect` gaat naar `vervallen`" wordt "de spec rolhek-effect (vervallen) is verwijderd; de
    plaatshouders staan in [spec sandbox-plaatshouders](../specs/sandbox-plaatshouders.md)".
  - 0095: `Herzien: 2026-11-19: punt 6: het AC-id blijft staan zolang de spec leeft; vervalt een hele template-spec, dan verhuizen haar levende AC's naar een levende spec en verdwijnt het document (R-CI-06)`;
    punt 6 krijgt die zin aan het eind.
  Een link die alleen platte tekst wordt (AC-4), krijgt geen `Herzien:`-regel.
- **vervallen-documenten-weg/AC-9** — Bestaande tests en specs die meegaan (R-TEST-02, akkoord via de merge van deze spec):
  - `test/rails/adr-per-map.test.ts:137-156`: `vervangen door 0006` en `vervallen` in `docs/template/adr/` en `vervallen` in
    `docs/template/specs/` worden rood (AC-6); de titels noemen de nieuwe uitkomst.
  - `templateregime/AC-9` krijgt achter "de kopcontroles voor specs" de zin "en in de twee templatemappen geen document met
    status `vervallen` of `vervangen door NNNN` (spec vervallen-documenten-weg)".
  - `test/scripts/pr-merge-samenvoegen.test.ts:482-485` toetst dat `docs/template/specs/agent-token.md` (vervallen) niet
    bestaat; `agent-samenvoegen/AC-6` zegt "De spec agent-token (vervallen) is verwijderd" in plaats van "heeft status
    `vervallen`".
  - `compacte-kennisbasis-rails/AC-16` wordt `Vervallen door ADR 0089 punt 5 (de diff-guard is weg). Was: …`; in
    `compacte-kennisbasis-rails/AC-18` vervalt "de diff-guard noemt het pad (`verifyTestwijzigingen` geldt alleen in de
    feature-lane)".
- **vervallen-documenten-weg/AC-10** — `pnpm ratchet`, `pnpm lint`, `pnpm typecheck` en `pnpm test:unit` zijn groen;
  `.kit/baseline.json` krijgt geen regel erbij.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Naam als script, testbestand of map, niet als spec (`document-status-lokaal.mjs`, `agent-merge-bytegrens.test.ts`, de map `<git-dir>/rolhek-effect`) | blijft: `test/scripts/schrap-documentbewaking-templateregime.test.ts`, `docs/template/specs/templateregime.md` r.137-149, `docs/template/specs/padtabel.md` r.201, `test/hooks/effecttoets-weg.test.ts`, `docs/operations/agent-doorloop.md` r.497 | n.v.t. |
| Het woord "specplicht" in ADR 0056, 0057, 0058 | blijft: een begrip, geen verwijzing naar de spec | n.v.t. |
| `docs/template-changelog.md` | historie: alleen de link r.842 wordt platte tekst; geen nieuwe regel in deze stap | n.v.t. |
| App met een vervallen ADR in `docs/adr/` | geen melding (AC-6); R-CI-05 in een app ongewijzigd | n.v.t. |
| Nummer 0066 | wordt niet hergebruikt (R-CI-06) | n.v.t. |
| Andere test met een fixture `vervallen` in een templatemap | zie OV-2 | n.v.t. |

## Raakt ook

`scripts/kit/check-docs.mjs`, `test/rails/adr-per-map.test.ts`, `rails/hooks/lib/rolhek.mjs`, `rails/hooks/lib/shell.mjs`,
`rails/hooks/lib/zelfladend.mjs`, `scripts/kit/pr-merge.mjs`, de testbestanden uit de verhuistabel en AC-4 en AC-9,
`docs/framework.md`, ADR 0062, 0069, 0071, 0074, 0082, 0083, 0084, 0086, 0089, 0091, 0093, 0095, de specs uit AC-4 en AC-9,
`docs/roadmap.md`, `docs/operations/agent-doorloop.md`, `docs/template-changelog.md`. `.kit/baseline.json`: geen wijziging
(de dood-padregels van `kooi.md` en `tests-naar-vermogen.md` noemen testbestanden, geen verwijderd document). Geen migratie,
route, permissie of resource: niet `check:migrations`, `check:secdef`, `test:db`, `test/security/resources.ts`.

## Buiten scope

Opruimen van bestaande baselineregels; vervallen documenten in een app; een changelogregel (hoofdsessie, bij opleveren).

## Testplan

AC-6 eerst als falende fixtures in `test/rails/adr-per-map.test.ts`, dan de check. AC-1, AC-3, AC-4: de `git grep`-opdrachten
uit die AC's in de PR, plus `check-docs` (links, AC-dekking, dood pad). AC-10: de genoemde commando's.

## Open vragen

- **OV-1 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Geldt de check ook in een app (`docs/specs/`, `docs/adr/`)? Aanbeveling: nee; R-CI-06 gaat alleen over
  template-documenten, R-CI-05 laat een vervallen app-ADR staan, en een app kan nog een archiefmap hebben (R-ROL-08).
- **OV-2 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Andere tests met een fixture die een vervallen of vervangen document in een templatemap zet (bijvoorbeeld
  `gebouwd-zonder-nummer/AC-5`: een ADR met status `vervallen` in `docs/template/adr/`) krijgen een extra melding. Niet
  volledig nagelopen. Aanbeveling: de bouw draait `pnpm test:unit`, filtert in die tests de nieuwe sleutel weg of zet de
  fixture in `docs/adr/`, en noemt elk geval met reden in de PR (R-TEST-02, akkoord via deze spec).
- **OV-3 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — `Herzien:`-regel bij een link die alleen platte tekst wordt? Aanbeveling: nee; de inhoud verandert niet, alleen
  0091 en 0095 krijgen er een (AC-8).
- **OV-4 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Een changelogregel voor apps (zij krijgen de verwijdering en de check via een template-update). Aanbeveling: één
  regel, door de hoofdsessie bij opleveren; buiten deze spec.
