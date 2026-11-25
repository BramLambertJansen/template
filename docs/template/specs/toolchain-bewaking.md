---
status: goedgekeurd
namespace: toolchain-bewaking
---

# Bewaking van de toolchain

## Doel

Een wekelijkse check meldt het als Node, pnpm of TypeScript achterloopt op het beleid "hoogste binnen de vertrouwde major"
(R-PROV-04, ADR 0111), of als de volgende major klaar is. Bij een melding maakt of werkt hij één issue bij.

**Aanleiding.** Plan "toolchain bijwerken en bijhouden" (eigenaar, 24-11-2026), PR 4. Renovate houdt de patches bij, maar
niemand merkte het toen een Renovate-PR wekenlang rood stond (#967). En een klaarstaande major viel pas op als iemand ernaar
zocht. Eigenaarbesluit 25-11: de check meldt via één issue. Een rode of te lang openstaande Renovate-PR blijft bij de spec
`dependency-achterstand`; die krijgt daarvoor AC-9 (zie "Raakt ook").

Bewaking en `.github/**`, dus kritiek werk (R-WERK-05): spec, code en tests in één PR, en de eigenaar merget.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| workflow `toolchain` (wekelijks en handmatig, op `main`) | leest de npm-registry en de Node-releases; maakt, werkt bij of sluit één issue | iets anders schrijven dan dat ene issue: geen label op een ander issue, geen PR, geen commit |
| `pnpm check:toolchain` (lokaal, iedere rol) | leest dezelfde bronnen en print de meldingen | schrijven: lokaal nooit een issue |
| eigenaar | ziet het issue; werkt de pin bij, repareert de Renovate-PR of start een major via de majorchecklist | — |

## Kopieer de vorm van

Geen resource uit `docs/gouden-pad.md`. Railwerk volgt bestaande vormen:

- `scripts/kit/dependency-achterstand.mjs`: een pure beoordeling met `nu` als invoer, een API-laag met een injecteerbare
  `fetch`, exitcodes 0/1/2 en alleen `node:`- en relatieve imports.
- `scripts/kit/leerpunt-check.mjs`: een issue schrijven met het token van de workflow.
- `.github/workflows/dependency-achterstand.yml`: een wekelijkse job met checkout zonder credentials en mise voor node.
- `test/rails/dependency-achterstand-workflow.test.ts`: workflowtoetsen op tekst.

## Hergebruik en UX

Er is geen scherm. De uitvoer is Nederlands, één regel per melding:

- Achterstand: `achterstand: <tool> <gepind>, toegestaan <versie> sinds <JJJJ-MM-DD> (<n> dagen)`. Daarbij is `<tool>`
  `Node`, `pnpm` of `TypeScript`, en "sinds" is de releasedatum plus 7 dagen.
- Volgende major: `volgende major klaar: <tool> <major> (<reden>)`. De reden per tool:
  - Node: `LTS <codenaam>`;
  - pnpm: `latest is <versie>`;
  - TypeScript: `typescript-eslint <versie> staat typescript <bereik> toe`.
- Afsluiting bij achterstand (exitcode 1): `Toolchain loopt achter: <n> melding(en). Werk de pin bij of zoek uit waarom
  Renovate vastzit.`
- Afsluiting als er alleen meldingen over de volgende major zijn (exitcode 0): `Toolchain bij, volgende major klaar:
  <n> melding(en). Start de major met de majorchecklist (R-PROV-04).`
- Groen: `Toolchain bij: Node <versie>, pnpm <versie>, TypeScript <versie>.`
- Fout (exitcode 2), één van:
  - `Bron: <url>: HTTP <status>`
  - `Bron: <url>: <foutmelding>`
  - `<bestand>: <reden>`
  - `onbekend bereik: <bereik>`
- `--json`: `{ "achterstand": [{ "tool", "gepind", "toegestaan", "sinds", "dagen" }], "volgendeMajor": [{ "tool",
  "major", "reden" }] }`, of bij een fout `{ "fout": "<regel>" }`. De exitcodes zijn gelijk aan die van de tekstuitvoer.
- Issue: titel `Toolchain: achterstand of volgende major`. De body bevat de meldingen als lijst en eindigt met
  `Bijgewerkt door de workflow toolchain op <JJJJ-MM-DD>.`
- Sluitcomment: `Geen melding meer op <JJJJ-MM-DD>: de toolchain volgt het beleid.`

## Acceptatiecriteria

**Bronnen.**

- `https://nodejs.org/dist/index.json`
- `https://registry.npmjs.org/pnpm`, `https://registry.npmjs.org/typescript` en `https://registry.npmjs.org/typescript-eslint`
  (het veld `time` voor de releasedatum en `dist-tags.latest` voor de nieuwste versie)

**Gepinde versies.**

- Node: `node = "…"` in `mise.toml`.
- pnpm: `packageManager` in `package.json`.
- TypeScript: de versie bij `typescript` onder `importers: .:` in `pnpm-lock.yaml`.
- typescript-eslint: de versie in `package.json`.

**Regels.**

- Een stabiele versie is `x.y.z`, zonder voorloopversie.
- **Oud genoeg:** releasedatum + 7 dagen ≤ `nu`.
- **Toegestaan:** de nieuwste stabiele versie die oud genoeg is, binnen de major van de pin. Voor TypeScript moet die ook
  binnen de `peerDependencies.typescript` van de gepinde typescript-eslint vallen.
- **Achterstand:** toegestaan > gepind, en `nu` − (releasedatum toegestaan + 7 dagen) > 14 dagen.
- Bereiken: `||`, spaties als "en", de operatoren `>=`, `>`, `<=`, `<` en `=`, kale versies, en `^` en `~` met de
  semver-betekenis. Elke andere vorm is een fout.

**Criteria.**

- **toolchain-bewaking/AC-1** — **Gegeven:**
  - een pin op Node 26.11.1;
  - releases 26.13.0 (28-10) en 26.13.1 (10-11);
  - `nu` = 25-11.

  **Wanneer** de check draait, **dan** meldt hij geen Node-achterstand: 26.13.1 is pas sinds 17-11 toegestaan, dat is 8
  dagen. Met `nu` = 02-12 (15 dagen) meldt hij `achterstand: Node 26.11.1, toegestaan 26.13.1 sinds 2026-11-17 (15
  dagen)` en eindigt hij met exitcode 1.
  Toets: `test/scripts/check-toolchain.test.ts` (nieuw)
- **toolchain-bewaking/AC-2** — **Gegeven:**
  - een pin op pnpm 12.21.0;
  - pnpm 12.22.0 (17-11) en 12.23.0 (22-11);
  - `nu` = 25-11.

  **Wanneer** de check draait, **dan** is 12.22.0 de toegestane versie, en is er nog geen melding (0 dagen voorbij de
  wachttijd). Een 13.0.0 telt nooit als toegestaan, want dat is een andere major.
  Toets: `test/scripts/check-toolchain.test.ts` (nieuw)
- **toolchain-bewaking/AC-3** — **Gegeven:**
  - een TypeScript-pin op 6.0.3;
  - typescript-eslint 8.71.0 met peer `>=4.8.4 <6.1.0`;
  - typescript 6.0.5 (ruim oud genoeg) en 6.1.0.

  **Wanneer** de check draait, **dan** is 6.0.5 toegestaan, niet 6.1.0, want die valt buiten het peer-bereik.
  Toets: `test/scripts/check-toolchain.test.ts` (nieuw)
- **toolchain-bewaking/AC-4** — **Gegeven** een Node-release 28.0.0 met `lts: "Neon"` en een pin op 26, **wanneer** de
  check draait, **dan** meldt hij `volgende major klaar: Node 28 (LTS Neon)`. Een 27.x zonder LTS geeft geen melding.
  Toets: `test/scripts/check-toolchain.test.ts` (nieuw)
- **toolchain-bewaking/AC-5** — **Gegeven** pnpm `dist-tags.latest` 13.0.0 en een pin op 12, **wanneer** de check draait,
  **dan** meldt hij `volgende major klaar: pnpm 13 (latest is 13.0.0)`. Met `latest` op 12.x volgt geen melding.
  Toets: `test/scripts/check-toolchain.test.ts` (nieuw)
- **toolchain-bewaking/AC-6** — **Gegeven:**
  - een TypeScript-pin op 6;
  - de nieuwste typescript-eslint (`dist-tags.latest`) met peer `>=4.8.4 <7.1.0`;
  - een stabiele typescript 7.0.2.

  **Wanneer** de check draait, **dan** meldt hij `volgende major klaar: TypeScript 7 (typescript-eslint <versie> staat
  typescript >=4.8.4 <7.1.0 toe)`. Met peer `<6.1.0` volgt geen melding.
  Toets: `test/scripts/check-toolchain.test.ts` (nieuw)
- **toolchain-bewaking/AC-7** — **Gegeven** alleen meldingen over de volgende major, **wanneer** de check draait, **dan**
  eindigt hij met exitcode 0 en de bijbehorende afsluitregel. Zonder enige melding eindigt hij met de groene regel.
  Toets: `test/scripts/check-toolchain.test.ts` (nieuw)
- **toolchain-bewaking/AC-8** — **Gegeven** een van deze gevallen:
  - een antwoord dat niet 2xx is;
  - een `fetch` die gooit;
  - een antwoord zonder `time` of `versions`;
  - een onbekend bereik in `peerDependencies`;
  - een ontbrekende of ongeldige pin in `mise.toml`, `package.json` of `pnpm-lock.yaml`.

  **Wanneer** de check draait, **dan** eindigt hij met exitcode 2 en de foutregel. Hij wordt nooit groen zonder gelezen
  data. Met `--json` geeft hij `{ "fout": … }`.
  Toets: `test/scripts/check-toolchain.test.ts` (nieuw)
- **toolchain-bewaking/AC-9** — **Gegeven** meldingen en de optie `--issue` met `GITHUB_TOKEN` en `GITHUB_REPOSITORY`:
  - **Er is nog geen open issue met de titel van github-actions[bot]:** dan maakt de check er één aan.
  - **Er is er al één:** dan werkt hij de body van dat issue bij, met `PATCH`. Er komt nooit een tweede issue.
  - **Er zijn geen meldingen, maar wel een open issue:** dan zet hij het sluitcomment en sluit hij het issue.
  - **Een issue met dezelfde titel van een andere auteur:** telt niet.

  Zonder `--issue` doet de check alleen `GET`.
  Toets: `test/scripts/check-toolchain.test.ts` (nieuw)
- **toolchain-bewaking/AC-10** — De workflow `toolchain`:
  - draait alleen op `schedule` (dinsdag na de Renovate-run) en `workflow_dispatch`, niet op een PR of push;
  - heeft op workflowniveau `permissions: read-all`, en alleen de job heeft `issues: write` erbij;
  - doet de checkout met `persist-credentials: false`;
  - geeft het token alleen in de stap die het script draait;
  - draait het script met `--issue`.

  Toets: `test/rails/toolchain-workflow.test.ts` (nieuw)
- **toolchain-bewaking/AC-11** — **Gegeven** de template, **wanneer** `pnpm template:status` draait, **dan** staat in de
  uitvoer de regel `Toolchain: pnpm check:toolchain (wekelijks in de workflow toolchain)`. De check zelf haalt niets op.
  Toets: `test/scripts/template-status.test.ts`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| De gepinde versie is nieuwer dan de toegestane (bijvoorbeeld handmatig vóór de 7 dagen) | geen achterstand | — |
| De pin staat op een voorloopversie | `<bestand>: <reden>` (alleen `x.y.z`) | exit 2 |
| Node: de pin is geen LTS-major (Current) | toegestaan = nieuwste oude-genoeg patch van die major, zonder LTS-eis | — |
| De nieuwste typescript-eslint staat dezelfde major toe als de gepinde | geen melding over de volgende major | — |
| Er zijn alleen meldingen over de volgende major | het issue wordt aangemaakt of bijgewerkt, exit 0 | — |

## Raakt ook

- **Spec `dependency-achterstand`.** Nieuwe AC-9: een update-PR met een rode check-run op de head wordt gemeld als
  `#<nr> <titel>: CI rood (<checknaam>)`, ongeacht de leeftijd, en de check eindigt met exitcode 1. Het randgeval "Update-PR
  met rode CI" wijzigt mee (eigenaarbesluit 25-11). De bron is `GET repos/<repo>/commits/<sha>/check-runs`. Rood is een
  `conclusion` van `failure`, `timed_out`, `cancelled` of `action_required`. De workflow blijft alleen-lezen
  (`permissions: read-all`).
- **`docs/framework.md` §3:** de regel "Afgedwongen door" noemt `pnpm check:toolchain` en de workflow `toolchain`
  (R-PROV-04).
- **`test/scripts/github-ruleset.test.ts`:** `NIET_VERPLICHT` krijgt de job `toolchain`, want die draait niet op een PR
  (R-CI-01). De reden komt in de PR (R-TEST-02).
- **`package.json`:** het script `check:toolchain`.
- **`.github/workflows/toolchain.yml`:** nieuw bestand, beschermd pad.

## Buiten scope

- Een update zelf doorvoeren: dat doet Renovate, of de eigenaar met de majorchecklist.
- De Docker-images en de mise-tools buiten Node: die volgen via Renovate en `dependency-achterstand`.
- Een melding per tool in een apart issue.

## Testplan

- **Unit:**
  - de beoordeling is een pure functie over de pins, de registry-antwoorden (vaste fixtures) en `nu`;
  - de API-laag en de issue-laag krijgen een nep-`fetch`;
  - geen netwerk.
- **Rails:** de workflowtekst, op dezelfde manier als `test/rails/dependency-achterstand-workflow.test.ts`.
- **Lokaal:** `pnpm check:toolchain` eenmaal tegen de echte bronnen; de uitslag komt in de PR.
- **Na de merge:** de eigenaar start de workflow eenmaal met `workflow_dispatch` en ziet het issue verschijnen, of de
  groene regel.

## Open vragen

- **OV-1 ✅ besloten** — De check meldt via één issue, niet via een rode run. Punt 3 van het plan blijft bij
  `dependency-achterstand`, met AC-9 daar (eigenaar, 25-11).
- **OV-2** — Wat gebeurt er met het issue als er niets meer te melden is? Opties: sluiten met een comment, of laten
  staan. Aanbeveling: sluiten met een comment (AC-9). Een open issue betekent dan altijd dat er iets is, en het blijft
  vindbaar.
- **OV-3** — Het plan wil de check in `pnpm template:status`, maar dat script is bewust offline (spec `template-release`:
  geen netwerk). Opties: een netwerkaanroep in `template:status`, of alleen een verwijsregel. Aanbeveling: een
  verwijsregel (AC-11). Dan blijft `template:status` offline, en het issue heeft de actuele stand.
