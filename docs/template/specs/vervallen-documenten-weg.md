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
- **Hoofdsessie:** bouwt in twee PR's (Werking, "Twee bouw-PR's"); zet in PR 1 `status: gebouwd` op de doelspecs en haalt
  de merktekens weg, in PR 2 `status: gebouwd` op deze spec. De wijzigingen in ADR's doet de hoofdsessie (A4, zie Werking).
- **Eigenaar:** de merge is het besluit; beide PR's raken beschermde paden (`rails/hooks/`, `scripts/kit/`,
  `docs/framework.md`, ADR's, tests), dus de eigenaar voegt samen.

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
| rolhek-vooraf-krimp/AC-1 | rolhek-vooraf/AC-1 | `test/hooks/rolhek-padcorpus-vooraf.test.ts:7`, `:44`; commentaar `test/hooks/rolhek-padcorpus.ts:1` |
| rolhek-vooraf-krimp/AC-10 | rolhek-vooraf/AC-2 | `test/hooks/rolhek-gh-allowlist.test.ts:733-735` (de describe met de titel `vangnetten per segment` heet daarna `rolhek-vooraf/AC-2: vangnetten per segment`), `:1208-1209`, `:1220-1222`, `:1244-1246`, `:1264`; `test/hooks/rolhek-zelfladend.test.ts:242-244`, `:327-330` |
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
| spec-en-bouw/AC-8 | gebouwd-zonder-nummer/AC-13 | `test/rails/spec-en-bouw.test.ts:17`, `:27-28`; `test/hooks/rolhek-beslisroute.test.ts:148`, `:163`; commentaar `test/rails/check-roadmap-bewijsvorm.test.ts:74` |
| spec-en-bouw/AC-13 | gebouwd-zonder-nummer/AC-14 | `test/rails/spec-en-bouw.test.ts:49-62` |

Niet verhuisd: rolhek-vooraf-krimp/AC-2, rolhek-vooraf-krimp/AC-4 tot en met rolhek-vooraf-krimp/AC-9 en uit
rolhek-vooraf-krimp/AC-3 `denyWrite`, de metingen en de leeslijst S2/S3 (ADR 0082 punt 1, ADR 0091 punt 1 en 3);
rolhek-effect/AC-1 tot en met rolhek-effect/AC-10, rolhek-effect/AC-11 (b), (c), (f), (g) en rolhek-effect/AC-13 (ADR 0091
punt 1); agent-merge-niet-kritiek/AC-1, /AC-2, /AC-5, /AC-6, /AC-8, /AC-9 (ADR 0089 punt 5, ADR 0093); spec-en-bouw/AC-1 tot
en met spec-en-bouw/AC-7 en spec-en-bouw/AC-9 tot en met spec-en-bouw/AC-12 (ADR 0089 punt 5, ADR 0095); en de specs
adr-herzien-markering, agent-merge-bytegrens, agent-token, document-status-lokaal en specplicht helemaal (hun code is weg:
ADR 0089 punt 5, ADR 0093, ADR 0095).

**Vorm van een verwijzing naar een verwijderd document.** In docs (ook ADR's): platte tekst `spec <naam> (vervallen)` of
`ADR 0066 (vervallen)`, geen link en geen pad; volgt er een AC die verhuisd is, dan daarachter `; nu <doel-id>` met een link
naar de doelspec. In code, commentaar en meldingen: alleen het doel-id (`spec rolhek-vooraf AC-3`). Een verwijzing die alleen
historie noemt en geen levend AC (ADR-kop "Uitwerking:", een `Herzien:`-regel), krijgt alleen de platte vorm. Een kaal
AC-nummer na een spec telt in een gebouwde spec als eigen AC van die spec (`check-docs`, AC-dekking); noem in een spec dus
alleen een nummer dat die spec zelf heeft, of het doel-id.

**Twee bouw-PR's** (eigenaarbesluit 2026-11-19). Eén spec, geen twee: de AC-dekking van `check-docs` toetst alleen een
gebouwde spec, dus PR 1 is groen zonder test voor AC-6, en een tweede spec zou dezelfde Werking dubbel moeten dragen. Deze
spec blijft `goedgekeurd` tot PR 2 en gaat daar naar `gebouwd`.

- **PR 1** (geen gedragswijziging): de verhuistabel (tests en commentaar hernoemen), de verwijzingen omzetten (vorm hierboven,
  ook in ADR 0091 en 0093 alleen `(vervallen)` achter de specnaam), de doelspecs naar gebouwd, de negen specs en ADR 0066
  verwijderen, en de bestaande tests en specs die daarmee meegaan (hieronder, "In PR 1"). Bewijst AC-1, AC-2, AC-3, AC-4,
  AC-5 en AC-7, met de tests uit het Testplan.
- **PR 2**: de check (AC-6), de regelboektekst, de `Herzien:`-regels in ADR 0091 en 0095, `A4_MELDING`, en de bestaande
  tests en specs uit "In PR 2". Bewijst AC-6 en opnieuw AC-7; zet `status: gebouwd` op deze spec.

**Werkstappen zonder AC** (eigenaarbesluit 2026-11-19: tekst, geen gedrag; de review toetst ze letterlijk).

- *Regelboek, PR 2*, letterlijk in `docs/framework.md`:
  - R-WERK-07: "en een AC-id verdwijnt nooit: een vervallen AC wordt `Vervallen door ADR <nummer> … Was: …`" wordt "en een
    AC-id verdwijnt nooit binnen een levende spec: een vervallen AC wordt `Vervallen door ADR <nummer> … Was: …`; vervalt een
    hele template-spec, dan verhuizen eerst haar AC's met levende code of tests naar een levende spec en verdwijnt daarna het
    document (R-CI-06)".
  - R-CI-05: "vervallen ADR verandert niet" wordt "vervallen ADR verandert in een app niet; in de template verdwijnt een
    vervallen of vervangen ADR (R-CI-06)".
  - R-CI-06: na "git is de historie" komt "; `check-docs` weigert een document met status `vervallen` of `vervangen door NNNN`
    in die twee mappen".
- *`A4_MELDING`, PR 2*: in `rails/hooks/lib/document-state.mjs` wordt "een vervallen of vervangen ADR wijzigt niet" "een
  vervallen of vervangen ADR wijzigt in een app niet (in de template verdwijnt het, R-CI-06)"; de rest van de melding blijft.
- *`Herzien:`-regels, PR 2* (de inhoud wijzigt):
  - 0091: `Herzien: 2026-11-19: punt 3 en Gevolgen: de specs rolhek-vooraf-krimp en rolhek-effect zijn verwijderd (R-CI-06); wat ervan leeft, staat in de specs rolhek-vooraf en sandbox-plaatshouders`;
    punt 3, laatste zin, wordt "De spec verdwijnt; wat ervan gebouwd is, staat in [spec rolhek-vooraf](../specs/rolhek-vooraf.md)."
    en Gevolgen "de spec `rolhek-effect` (vervallen) gaat naar `vervallen`" (de vorm na PR 1) wordt "de spec rolhek-effect
    (vervallen) is verwijderd; de plaatshouders staan in [spec sandbox-plaatshouders](../specs/sandbox-plaatshouders.md)".
  - 0095: `Herzien: 2026-11-19: punt 6: het AC-id blijft staan zolang de spec leeft; vervalt een hele template-spec, dan verhuizen haar levende AC's naar een levende spec en verdwijnt het document (R-CI-06)`;
    punt 6 krijgt die zin aan het eind.
  - Een link die alleen platte tekst wordt (PR 1), krijgt geen `Herzien:`-regel (OV-3).
- *ADR-wijzigingen en het rolhek.* Een andere tekst in een geaccepteerd ADR zonder nieuwe `Herzien:`-regel geeft in
  `beslisOvergang` (`rails/hooks/lib/document-state.mjs`) de uitslag `a4`; het rolhek laat die herschrijving alleen aan
  hoofdsessie en architect (`a4Toegestaan`), een developer krijgt `A4_MELDING`. De bouw toetst dit vooraf met één ADR. Gaat
  de Edit van de hoofdsessie niet door, dan krijgt elk geraakt ADR de regel
  `Herzien: 2026-11-19: link naar de vervallen spec <naam> wordt platte tekst` (de veilige uitvoering; geen omweg). Dat
  geldt niet voor ADR 0089, waar de link in een bestaande `Herzien:`-regel staat: die regel wijzigen geeft altijd `a4`; gaat
  dat niet door, dan stopt de bouw en vraagt de eigenaar.
- *Bestaande tests en specs die meegaan* (R-TEST-02, akkoord via de merge van deze spec):
  - In PR 1: `test/scripts/pr-merge-samenvoegen.test.ts:482-485` toetst dat `docs/template/specs/agent-token.md` niet
    bestaat, met de titel `agent-samenvoegen/AC-6: de spec agent-token (vervallen) is verwijderd`; `agent-samenvoegen/AC-6`
    zegt "De spec agent-token (vervallen) is verwijderd" in plaats van "heeft status `vervallen`".
    `compacte-kennisbasis-rails/AC-16` wordt `Vervallen door ADR 0089 punt 5 (de diff-guard is weg). Was: …`; in
    `compacte-kennisbasis-rails/AC-18` vervalt "de diff-guard noemt het pad (`verifyTestwijzigingen` geldt alleen in de
    feature-lane)". De test bij rolhek-vooraf/AC-2 (hoofdsessie na `cd $TMPDIR`, `test/hooks/rolhek-gh-allowlist.test.ts:752`)
    krijgt `vervallen-documenten-weg/AC-5` in de titel.
  - In PR 2: `test/rails/adr-per-map.test.ts:137-156`: `vervangen door 0006` en `vervallen` in `docs/template/adr/` en
    `vervallen` in `docs/template/specs/` gaan uit de groene gevallen naar de rode gevallen van AC-6; de titels noemen de
    nieuwe uitkomst. `templateregime/AC-9` krijgt achter "de kopcontroles voor specs" de zin "en in de twee templatemappen
    geen document met status `vervallen` of `vervangen door NNNN` (spec vervallen-documenten-weg)".
  - Nagelopen zonder wijziging: `test/rails/gebouwd-zonder-nummer.test.ts:260-261` (de fixture `vervallen` en
    `vervangen door 0096` in `docs/template/adr/`) filtert al op `docs:ac:` (`sleutels`), dus de nieuwe sleutel telt daar
    niet; `test/rails/archief-spec-links.test.ts:37` zet zijn fixture in `docs/adr/archief/` en filtert op linkmeldingen.
    Geeft `pnpm test:unit` in PR 2 toch een extra melding, dan filtert de bouw de nieuwe sleutel weg of zet de fixture in
    `docs/adr/`, en noemt elk geval met reden in de PR (OV-2).

## Acceptatiecriteria

- **vervallen-documenten-weg/AC-1** — Verhuizing (PR 1). Gegeven de verhuistabel, wanneer PR 1 klaar is, dan staat elk
  doel-id als AC-regel (`- **<doel-id>**`) in zijn doelspec, bevat elk testbestand uit de derde kolom het doel-id van zijn rij
  als heel woord (de verwachtingen ongewijzigd), en geeft `git grep -n -e 'rolhek-vooraf-krimp/AC' -e 'rolhek-effect/AC' -e
  'agent-merge-niet-kritiek/AC' -e 'spec-en-bouw/AC' -- test rails scripts ':!test/docs/vervallen-documenten-weg.test.ts'`
  niets.
- **vervallen-documenten-weg/AC-2** — Status (PR 1). `rolhek-vooraf` en `sandbox-plaatshouders` hebben `status: gebouwd`; in
  `agent-samenvoegen` en `gebouwd-zonder-nummer` staat geen AC meer met `(nog niet gebouwd)`; `docsViolations` op de repo
  geeft geen sleutel `docs:ac:` voor een van die vier specs, en `.kit/baseline.json` heeft er geen.
- **vervallen-documenten-weg/AC-3** — Verwijderen (PR 1). `docs/template/specs/` adr-herzien-markering, agent-merge-bytegrens,
  agent-merge-niet-kritiek, agent-token, document-status-lokaal, rolhek-effect, rolhek-vooraf-krimp, spec-en-bouw-in-een-pr en
  specplicht (elk `.md`), en `docs/template/adr/0066-schrijfgrens-op-effect.md`, bestaan niet; `git grep -n -i -e
  '^status: vervallen' -e '^status: vervangen door' -- docs/template` geeft niets.
- **vervallen-documenten-weg/AC-4** — Verwijzingen (PR 1). Buiten `docs/template-changelog.md` (historie),
  `docs/template/specs/vervallen-documenten-weg.md` en `test/docs/vervallen-documenten-weg.test.ts`:
  - (a) `git grep -n` met per verwijderde spec `-e 'specs/<naam>.md'` (de negen namen uit AC-3), per namespace
    `-e '<namespace>/AC-'` (adr-herzien, agent-merge-bytegrens, agent-merge-niet-kritiek, agent-token, document-status-lokaal,
    rolhek-effect, rolhek-vooraf-krimp, spec-en-bouw, specplicht) en `-e '0066-schrijfgrens'`, over de hele repo, geeft
    niets. Bestandsnamen van levende ADR's (Randgevallen) vallen er niet onder.
  - (b) Elke vermelding `spec <naam>` van een van de negen namen (hoofdletterongevoelig, de naam eventueel tussen backticks,
    niet gevolgd door een letter, cijfer of `-`) wordt gevolgd door witruimte met hooguit één regeleinde en `(vervallen)`.
  - (c) `check-docs` geeft geen sleutel `link` naar een verwijderd bestand (via AC-7).

  Per groep, letterlijk naar de vorm uit Werking:
  - ADR-links: 0062 r.21; 0069 r.11, r.17, r.28 (r.28: `spec agent-merge-niet-kritiek (vervallen); de levende AC's staan in
    [spec agent-samenvoegen](../specs/agent-samenvoegen.md), agent-samenvoegen/AC-8 tot en met agent-samenvoegen/AC-11`); 0071 r.11, r.14; 0074 r.13; 0082 r.12;
    0083 r.13, r.16-17; 0084 r.8, r.10; 0086 r.7; 0089 r.13; 0091 r.7.
  - ADR-tekst zonder link: 0071 r.12, 0082 r.40, 0091 r.31 en r.56, 0093 r.41 krijgen `(vervallen)` achter de specnaam
    (de inhoud van 0091 volgt in PR 2).
  - Specs: `agent-samenvoegen.md` r.72 (Werking, "In PR 1") en r.136 (de twee backtick-paden worden `spec
    agent-merge-niet-kritiek (vervallen)` en `spec agent-token (vervallen)`), `templateregime.md` r.43 en r.45, `kooi.md` r.110, `leerlus.md` r.147,
    `template-repo.md` r.37 (het pad naar spec-en-bouw-in-een-pr wordt `spec spec-en-bouw-in-een-pr (vervallen), regel 91`)
    en r.90.
  - Overige docs: `docs/roadmap.md` r.252, r.263, r.439 (de paden worden `spec agent-merge-niet-kritiek (vervallen)`);
    `docs/operations/agent-doorloop.md` r.324 (`spec rolhek-vooraf AC-2`); `docs/template-changelog.md` r.842 alleen de link
    wordt platte tekst.
  - Code, met het doel-id in de vorm `spec <doelspec> AC-n`: `rails/hooks/lib/rolhek.mjs` r.200 (agent-samenvoegen/AC-9) en
    r.621 (rolhek-vooraf/AC-2); `rails/hooks/lib/shell.mjs` r.11 en r.77 (rolhek-vooraf/AC-2 (b) en (d)), r.118, r.189,
    r.249, r.284 (rolhek-vooraf/AC-3 en rolhek-vooraf/AC-2 (c)); `rails/hooks/lib/zelfladend.mjs` r.1 en de zes meldingen
    r.358, r.364, r.366, r.382, r.384, r.390 (`(spec rolhek-vooraf AC-3)`), r.45 (rolhek-vooraf/AC-2 (c));
    `scripts/kit/pr-merge.mjs` r.238 (agent-samenvoegen/AC-10).
  - Testcommentaar met een pad of oud id: `test/hooks/sandbox-plaatshouders.test.ts:19` (`spec sandbox-plaatshouders`),
    `test/rails/spec-en-bouw.test.ts:17` (`spec gebouwd-zonder-nummer`, ADR 0062), en het overige commentaar uit de
    verhuistabel met het doel-id.
  - Testcommentaar dat alleen OV-1 noemt (`test/docs/geen-externe-review-docs.test.ts:28`, `test/rails/leesbudget.test.ts:624`,
    `:728`, `test/rails/meting-kerncijfers-pr-tabel.test.ts:56`, `test/rails/meting-stuurt.test.ts:39`,
    `test/rails/meting-zonder-externe-review.test.ts:10`, `test/rails/padtabel-kit.ts:12`): `spec agent-merge-niet-kritiek
    (vervallen), OV-1`.
- **vervallen-documenten-weg/AC-5** — Meldingen (PR 1). De test die in de `ask`-melding `AC-3` eist
  (`test/hooks/rolhek-gh-allowlist.test.ts:752-756`) slaagt met ongewijzigde verwachtingen tegen de nieuwe meldingen van
  `zelfladend.mjs`, en `rails/hooks/lib/zelfladend.mjs` bevat precies zes keer `(spec rolhek-vooraf AC-3)`.
- **vervallen-documenten-weg/AC-6** — Check (PR 2). Gegeven een document in `docs/template/specs/` met `status: vervallen`, of
  in `docs/template/adr/` met `Status: vervallen` of `Status: vervangen door NNNN`, wanneer `check-docs` draait, dan meldt het
  `docs:<pad>:vervallen-in-template` met de tekst uit Hergebruik en UX. Geen melding voor `voorstel`, `goedgekeurd` en
  `gebouwd` (specs), `voorgesteld` en `geaccepteerd` (ADR's), en voor elke status in `docs/specs/` en `docs/adr/`. Fixtures in
  `test/rails/adr-per-map.test.ts`: per verboden status in elke templatemap één rood geval (faalt op de huidige code), per
  toegestane status een groen geval, en `vervallen` in `docs/specs/` en `docs/adr/` groen.
- **vervallen-documenten-weg/AC-7** — Groen (PR 1 en PR 2). `docsViolations` op de repo geeft geen sleutel buiten
  `.kit/baseline.json`, en geen baselinesleutel bevat `specs/<naam>.md` van een verwijderde spec, `0066-schrijfgrens` of
  `docs:ac:<naam>:` van een verwijderde spec; `pnpm ratchet`, `pnpm lint`, `pnpm typecheck` en `pnpm test:unit` zijn groen.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Naam als script, testbestand of map, niet als spec (`document-status-lokaal.mjs`, `agent-merge-bytegrens.test.ts`, `test/hooks/rolhek-effect.test.ts`, de map `<git-dir>/rolhek-effect`) | blijft, onder andere: `test/scripts/schrap-documentbewaking-templateregime.test.ts`, `docs/template/specs/templateregime.md` r.137-149, `docs/template/specs/padtabel.md` r.201, `docs/template/specs/kooi.md` r.74 en r.108, `docs/template/specs/tests-naar-vermogen.md` r.75 en r.77, ADR 0072 r.30, `.kit/baseline.json` r.25, r.58, r.59 en r.62, `test/hooks/effecttoets-weg.test.ts`, `docs/operations/agent-doorloop.md` r.497 | n.v.t. |
| Bestandsnaam van een levend ADR die een specnaam bevat (`0062-spec-en-bouw-in-een-pr.md`, `0069-agent-merge-niet-kritiek.md`) en elke link of elk pad ernaar | blijft: het ADR leeft | n.v.t. |
| Het woord "specplicht" in ADR 0056, 0057, 0058 | blijft: een begrip, geen verwijzing naar de spec | n.v.t. |
| `docs/template-changelog.md` | historie: alleen de link r.842 wordt platte tekst; geen nieuwe regel in deze stap | n.v.t. |
| App met een vervallen ADR in `docs/adr/` | geen melding (AC-6); R-CI-05 in een app ongewijzigd | n.v.t. |
| Nummer 0066 | wordt niet hergebruikt (R-CI-06) | n.v.t. |
| Andere test met een fixture `vervallen` in een templatemap | Werking, "Bestaande tests en specs die meegaan" (OV-2) | n.v.t. |

## Raakt ook

- PR 1: `rails/hooks/lib/rolhek.mjs`, `rails/hooks/lib/shell.mjs`, `rails/hooks/lib/zelfladend.mjs`,
  `scripts/kit/pr-merge.mjs` (alleen commentaar en meldingtekst); de testbestanden uit de verhuistabel en AC-4;
  `test/scripts/pr-merge-samenvoegen.test.ts`; nieuw `test/docs/vervallen-documenten-weg.test.ts`; ADR 0062, 0069, 0071,
  0074, 0082, 0083, 0084, 0086, 0089, 0091, 0093 (platte tekst); de specs uit AC-4, `rolhek-vooraf`,
  `sandbox-plaatshouders`, `agent-samenvoegen`, `gebouwd-zonder-nummer`, `compacte-kennisbasis-rails`; `docs/roadmap.md`,
  `docs/operations/agent-doorloop.md`, `docs/template-changelog.md`.
- PR 2: `scripts/kit/check-docs.mjs`, `test/rails/adr-per-map.test.ts`, `rails/hooks/lib/document-state.mjs`
  (`A4_MELDING`), `docs/framework.md`, ADR 0091 en 0095 (`Herzien:`), spec `templateregime`.
- `.kit/baseline.json`: geen wijziging (de dood-padregels van `kooi.md` en `tests-naar-vermogen.md` noemen testbestanden,
  geen verwijderd document). Geen migratie, route, permissie of resource: niet `check:migrations`, `check:secdef`,
  `test:db`, `test/security/resources.ts`, geen permissietest per verboden rol.

## Buiten scope

Opruimen van bestaande baselineregels; vervallen documenten in een app; een changelogregel (hoofdsessie, bij opleveren).

## Testplan

Elk AC heeft een test met `vervallen-documenten-weg/AC-n` in de describe- of testnaam.

- PR 1, nieuw `test/docs/vervallen-documenten-weg.test.ts`: AC-1 (de doel-id's in de doelspecs en de testbestanden uit de
  verhuistabel, en de `git grep` uit AC-1), AC-3 (de bestanden bestaan niet, en de `git grep` uit AC-3), AC-4 (de
  `git grep` uit (a) en de regel uit (b) over de getrackte bestanden), AC-5 (precies zes keer `(spec rolhek-vooraf AC-3)`),
  AC-2 en AC-7 (`docsViolations` op de repo en `.kit/baseline.json`). AC-5 ook in `test/hooks/rolhek-gh-allowlist.test.ts:752`
  (titel met het AC-id, verwachtingen ongewijzigd). De greps sluiten het testbestand zelf uit (pathspec), omdat het de
  patronen bevat.
- PR 2: AC-6 eerst als falende fixtures in `test/rails/adr-per-map.test.ts`, dan de check; AC-7 draait opnieuw.

## Open vragen

- **OV-1 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Geldt de check ook in een app (`docs/specs/`, `docs/adr/`)? Aanbeveling: nee; R-CI-06 gaat alleen over
  template-documenten, R-CI-05 laat een vervallen app-ADR staan, en een app kan nog een archiefmap hebben (R-ROL-08).
- **OV-2 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Andere tests met een fixture die een vervallen of vervangen
  document in een templatemap zet, krijgen een extra melding. Nagelopen: `test/rails/gebouwd-zonder-nummer.test.ts:260-261`
  en `test/rails/archief-spec-links.test.ts:37` filtern al (Werking). Aanbeveling: de bouw draait `pnpm test:unit`, filtert
  in een ander geval de nieuwe sleutel weg of zet de fixture in `docs/adr/`, en noemt elk geval met reden in de PR
  (R-TEST-02, akkoord via deze spec).
- **OV-3 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — `Herzien:`-regel bij een link die alleen platte tekst wordt? Aanbeveling: nee; de inhoud verandert niet, alleen
  0091 en 0095 krijgen er een (Werking). Laat het rolhek de Edit niet toe, dan geldt de terugval uit Werking.
- **OV-4 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Een changelogregel voor apps (zij krijgen de verwijdering en de check via een template-update). Aanbeveling: één
  regel, door de hoofdsessie bij opleveren; buiten deze spec.
- **OV-5 ✅ besloten** (eigenaar 2026-11-19) — Regelboektekst en `Herzien:`-regels zijn werkstappen, geen AC's; de bouw gaat
  in twee PR's (Werking).
