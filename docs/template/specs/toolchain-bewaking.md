---
status: goedgekeurd
namespace: toolchain-bewaking
---

# Bewaking van de toolchain

## Doel

Een wekelijkse check meldt via één issue als Node, pnpm of TypeScript achterloopt op het beleid "hoogste binnen de
vertrouwde major" (R-PROV-04, ADR 0111), of als de volgende major klaar is.

**Aanleiding.** Plan "toolchain bijwerken en bijhouden" (eigenaar, 24-11-2026), PR 4. Renovate houdt de patches bij, maar
niemand merkte het toen een Renovate-PR wekenlang rood stond (#967). Een klaarstaande major viel pas op als iemand zocht.

**Eigenaarbesluiten 25-11:**

- De check meldt via één issue. De run blijft groen als het issue gelukt is.
- Achterstand telt vanaf de eerste toegestane opvolger van de pin.
- Een rode of te lang openstaande Renovate-PR blijft bij de spec `dependency-achterstand`. Daar gelden de grenzen 14/7/60
  dagen, en "CI rood" komt erbij (AC-9 daar).
- De workflow draait ook in apps.

Bewaking en `.github/**` zijn kritiek werk (R-WERK-05). Spec, code en tests gaan daarom in één PR, en de eigenaar merget.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| workflow `toolchain` (wekelijks en handmatig, op `main`, in de template en in elke app) | leest de npm-registry en de Node-releases; maakt één issue aan, werkt het bij of sluit het | iets anders schrijven dan dat ene issue en zijn comments |
| `pnpm check:toolchain` (lokaal, iedere rol) | leest dezelfde bronnen en print de meldingen | schrijven: zonder `--issue` alleen `GET` |
| eigenaar | krijgt een notificatie bij een nieuw issue of een nieuwe comment; werkt de pin bij, repareert de Renovate-PR of start een major via de majorchecklist | — |

## Kopieer de vorm van

Geen resource uit `docs/gouden-pad.md`. Railwerk volgt bestaande vormen:

- `scripts/kit/dependency-achterstand.mjs`: een pure beoordeling met `nu` als invoer, een API-laag met een injecteerbare
  `fetch`, exitcodes 0/1/2 en alleen `node:`- en relatieve imports.
- `scripts/kit/leerpunt-check.mjs`: een issue schrijven met het token van de workflow.
- `.github/workflows/dependency-achterstand.yml`: een wekelijkse job met `concurrency`, checkout zonder credentials en mise
  voor node.
- `test/rails/dependency-achterstand-workflow.test.ts`: workflowtoetsen op tekst.

## Hergebruik en UX

Geen scherm. Uitvoer in het Nederlands, één regel per melding. Hieronder is `<tool>` steeds `Node`, `pnpm` of
`TypeScript`.

**Meldingen**

- Achterstand:
  `achterstand: <tool> <gepind>, toegestaan <nieuwste>, achter sinds <JJJJ-MM-DD> (<n> dagen)`. "Achter sinds" is de
  releasedatum van de eerste toegestane opvolger plus 7 dagen; `<n>` is het aantal dagen sindsdien.
- Volgende major: `volgende major klaar: <tool> <major> (<reden>)`. De reden per tool:
  - Node: `LTS <codenaam>`
  - pnpm: `latest is <versie>`
  - TypeScript: `typescript-eslint <versie> staat typescript <bereik> toe`

**Afsluitregels**

- Achterstand: `Toolchain loopt achter: <n> melding(en). Werk de pin bij of zoek uit waarom Renovate vastzit.`
- Alleen een volgende major:
  `Toolchain bij, volgende major klaar: <n> melding(en). Start de major met de majorchecklist (R-PROV-04).`
- Groen: `Toolchain bij: Node <versie>, pnpm <versie>, TypeScript <versie>.`
- Na het issue (met `--issue`): de afsluitregel van hierboven, met daaronder één van:
  - `Issue #<nr> aangemaakt.`
  - `Issue #<nr> bijgewerkt.`
  - `Issue #<nr> ongewijzigd.`
  - `Issue #<nr> gesloten.`
  - `Geen issue nodig.`

**Fouten**

Bij een fout volgt één van deze regels:

- `Bron: <url>: HTTP <status>`
- `Bron: <url>: <foutmelding>`
- `Bron: <url>: <veld> ontbreekt`
- `<bestand>: <reden>`
- `onbekende waarde: <waarde>`
- `GitHub-API: <pad>: HTTP <status>`
- `GitHub-API: <pad>: <foutmelding>`
- `<NAAM> ontbreekt` (alleen met `--issue`, voor `GITHUB_TOKEN` of `GITHUB_REPOSITORY`)

**JSON**

`--json` geeft `{ "achterstand": [{ "tool", "gepind", "toegestaan", "sinds", "dagen" }], "volgendeMajor": [{ "tool",
"major", "reden" }] }`. Bij een fout geeft het `{ "fout": "<regel>" }`.

**Issue**

- Titel: `Toolchain: achterstand of volgende major`.
- Body: de meldingen als lijst, met als laatste regel `Bijgewerkt door de workflow toolchain op <JJJJ-MM-DD>.`
- Comment bij gewijzigde meldingen: `De meldingen zijn veranderd op <JJJJ-MM-DD>; zie de beschrijving.`
- Sluitcomment: `Geen melding meer op <JJJJ-MM-DD>: de toolchain volgt het beleid.`

## Acceptatiecriteria

### Bronnen

| Bron | Velden | Fout bij |
|---|---|---|
| `https://nodejs.org/dist/index.json` | een lijst met `version` (`v<x.y.z>`; de `v` valt weg), `date` (`JJJJ-MM-DD`) en `lts` (`false` of een codenaam) | geen lijst, of een element zonder deze velden |
| `https://registry.npmjs.org/pnpm`, `…/typescript`, `…/typescript-eslint` | `time` (versie → ISO-tijdstip), `dist-tags.latest` en voor typescript-eslint `versions.<v>.peerDependencies.typescript` | ontbrekend `time` of `dist-tags.latest`, of een ontbrekende peer bij de gebruikte versie |

### Gepinde versies

| Tool | Waar | Opmerking |
|---|---|---|
| Node | `node = "…"` in `mise.toml` | — |
| pnpm | `packageManager` in `package.json` | — |
| typescript-eslint | `devDependencies` in `package.json` | — |
| TypeScript | `version:` onder `importers:` › `.:` › `devDependencies:` › `typescript:` in `pnpm-lock.yaml` | `package.json` heeft voor TypeScript een bereik (`~6.0.3`) en geen pin. De lockfile houdt de opgeloste versie bij. |

### Rekenregels

- **Stabiel:** een versie van de vorm `x.y.z`, met alleen cijfers.
- **Dag:** de UTC-datum, `JJJJ-MM-DD`. Bij npm het datumdeel van het tijdstip, bij Node het veld `date`. Een verschil in
  dagen is het hele aantal dagen tussen twee datums om 00:00 UTC.
- **Oud genoeg:** de dag van de release plus 7 ≤ de dag van `nu`.
- **Opvolgers:** de stabiele versies in de major van de pin die nieuwer zijn dan de pin en oud genoeg. Voor TypeScript
  moeten ze ook binnen `peerDependencies.typescript` van de gepinde typescript-eslint vallen.
  - **Eerste:** de laagste opvolger.
  - **Nieuwste:** de hoogste opvolger.
- **Achterstand:** er is een opvolger, en de dag van `nu` min (de releasedag van de eerste + 7) > 14.
- **Volgende major:**
  - Node: de hoogste major boven die van de pin, met een release waarvan `lts` niet `false` is. De codenaam is die van de
    hoogste zo'n release.
  - pnpm: de major van `dist-tags.latest` is hoger dan die van de pin.
  - TypeScript: de peer van `dist-tags.latest` van typescript-eslint bevat `<major+1>.0.0`, en typescript heeft een
    stabiele versie in die major.
- **Bereiken:**
  - Toegestaan zijn `||`, een spatie als "en", de operatoren `>=`, `>`, `<=`, `<` en `=` direct gevolgd door een versie,
    een kale versie, en `^` en `~` met de semver-betekenis.
  - Elke andere vorm geeft `onbekende waarde: <bereik>`, ook een spatie tussen de operator en de versie.
- **Waarden in de uitvoer en het issue:**
  - Toegestaan zijn alleen stabiele versies, codenamen volgens `^[A-Za-z]+$` en bereiken in de bovenstaande vorm.
  - Elke andere waarde is een fout.

### Criteria

- **toolchain-bewaking/AC-1**
  - **Gegeven:**
    - een pin op Node 26.11.1;
    - de releases 26.12.0 (14-10), 26.12.1 (21-10), 26.13.0 (28-10) en 26.13.1 (10-11);
    - `nu` = 2026-11-25.
  - **Dan:** de check meldt `achterstand: Node 26.11.1, toegestaan 26.13.1, achter sinds 2026-10-21 (35 dagen)` en
    eindigt met exitcode 1.
  - **Grensgeval:** bij een pin op 26.13.0 en `nu` = 2026-11-25 komt er geen melding (8 dagen). Met `nu` = 2026-12-02
    komt die er wel (15 dagen).
  - Toets: `test/scripts/check-toolchain.test.ts`
- **toolchain-bewaking/AC-2**
  - **Gegeven:**
    - een pin op pnpm 12.21.0;
    - de releases 12.22.0 (01-11), 12.23.0 (08-11), 12.24.0 (15-11), 12.25.0 (17-11) en 13.0.0 (01-11);
    - `nu` = 2026-11-25.
  - **Dan:** de check meldt `achterstand: pnpm 12.21.0, toegestaan 12.25.0, achter sinds 2026-11-08 (17 dagen)`. De klok
    gaat dus niet terug door nieuwere releases, en 13.0.0 telt nooit als opvolger.
  - Toets: `test/scripts/check-toolchain.test.ts`
- **toolchain-bewaking/AC-3**
  - **Gegeven:**
    - een TypeScript-pin op 6.0.3;
    - de gepinde typescript-eslint met peer `>=4.8.4 <6.1.0`;
    - typescript 6.0.5 (oud genoeg) en 6.1.0.
  - **Dan:** de nieuwste opvolger is 6.0.5, niet 6.1.0, want 6.1.0 valt buiten de peer.
  - Toets: `test/scripts/check-toolchain.test.ts`
- **toolchain-bewaking/AC-4**
  - **Gegeven:**
    - een pin op Node 26;
    - de releases 27.2.0 (`lts: false`), 28.0.0 (`lts: false`) en 28.1.0 (`lts: "Neon"`).
  - **Dan:** de check meldt `volgende major klaar: Node 28 (LTS Neon)`.
  - **Zonder melding:** als alleen 27.x en 28.0.0 bestaan, allemaal zonder LTS.
  - Toets: `test/scripts/check-toolchain.test.ts`
- **toolchain-bewaking/AC-5**
  - **Gegeven:** pnpm `dist-tags.latest` 13.0.0 en een pin op 12.
  - **Dan:** de check meldt `volgende major klaar: pnpm 13 (latest is 13.0.0)`.
  - **Zonder melding:** als `latest` op 12.x staat.
  - Toets: `test/scripts/check-toolchain.test.ts`
- **toolchain-bewaking/AC-6**
  - **Gegeven:**
    - een TypeScript-pin op 6;
    - de nieuwste typescript-eslint, 8.80.0, met peer `>=4.8.4 <7.1.0`;
    - een stabiele typescript 7.0.2.
  - **Dan:** de check meldt
    `volgende major klaar: TypeScript 7 (typescript-eslint 8.80.0 staat typescript >=4.8.4 <7.1.0 toe)`.
  - **Zonder melding:** als de peer `<6.1.0` is, of als er geen stabiele 7.x is.
  - Toets: `test/scripts/check-toolchain.test.ts`
- **toolchain-bewaking/AC-7**
  - **Alleen meldingen over de volgende major:** de check eindigt met exitcode 0 en de bijbehorende afsluitregel.
  - **Geen enkele melding:** de check eindigt met exitcode 0 en de groene regel.
  - Toets: `test/scripts/check-toolchain.test.ts`
- **toolchain-bewaking/AC-8**
  - **Gegeven** één van deze gevallen:
    - een antwoord dat niet 2xx is;
    - een `fetch` die gooit;
    - een bron waarin een veld uit de tabel ontbreekt;
    - een onbekend bereik of een ongeldige codenaam;
    - een ontbrekende of ongeldige pin in `mise.toml`, `package.json` of `pnpm-lock.yaml`.
  - **Dan:** de check eindigt met exitcode 2 en de foutregel, ook met `--issue`. Bij `--issue` schrijft hij dan niets.
  - Hij wordt nooit groen zonder gelezen data.
  - Met `--json` geeft hij `{ "fout": … }`.
  - Toets: `test/scripts/check-toolchain.test.ts`
- **toolchain-bewaking/AC-9**
  - **Gegeven:** `--issue` met `GITHUB_TOKEN` en `GITHUB_REPOSITORY`. De check leest de open issues van
    `github-actions[bot]` met de vaste titel, met hooguit 10 pagina's van 100.
  - **Wel meldingen, geen open issue:** de check maakt er één aan (`POST`).
  - **Wel meldingen, al een open issue:**
    - Wijken de meldingen af van de body, dan zet hij de nieuwe body (`PATCH`) en daarna de comment over gewijzigde
      meldingen.
    - Zijn de meldingen gelijk, dan schrijft hij niets. Een achterstandsregel bevat het aantal dagen. Zolang er
      achterstand is, wijkt de body daardoor elke week af, en volgt er bewust elke week een comment als herinnering.
    - Zijn er meerdere open issues, dan gebruikt hij het oudste (laagste nummer).
  - **Geen meldingen, wel een open issue:** de check zet het sluitcomment en sluit het issue (`PATCH` met
    `state: closed`).
  - **Geen meldingen, geen open issue:** de check schrijft niets.
  - Een issue met dezelfde titel van een andere auteur telt niet.
  - **Exitcodes met `--issue`:**
    - 0 als het issue gelukt is, ook bij achterstand;
    - 2 als een `GET`, `POST` of `PATCH` niet 2xx is;
    - zonder `GITHUB_TOKEN` of `GITHUB_REPOSITORY` volgt `<NAAM> ontbreekt`.
  - Zonder `--issue` doet de check alleen `GET` op de bronnen en raakt hij de GitHub-API niet.
  - Toets: `test/scripts/check-toolchain.test.ts`
- **toolchain-bewaking/AC-10** — De workflow `.github/workflows/toolchain.yml`:
  - draait alleen op `schedule` met cron `41 6 * * 2` en op `workflow_dispatch`, niet op een PR of push;
  - heeft `concurrency` met de groep `toolchain` en `cancel-in-progress: false`;
  - heeft op workflowniveau `permissions: read-all`;
  - geeft de job precies `contents: read` en `issues: write` (een jobblok vervangt dat van de workflow);
  - doet de checkout met `persist-credentials: false`;
  - zet `GITHUB_TOKEN` alleen in de stap die het script draait;
  - draait `node scripts/kit/check-toolchain.mjs --issue`, zonder voorwaarde op de repo.
  - Toets: `test/rails/toolchain-workflow.test.ts`
- **toolchain-bewaking/AC-11**
  - **Gegeven:** de template, **wanneer** `pnpm template:status` draait.
  - **Dan:** de uitvoer bevat de regel `Toolchain: pnpm check:toolchain (wekelijks in de workflow toolchain)`, en het
    script haalt zelf niets op.
  - Toets: `test/scripts/template-status.test.ts`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| De pin is nieuwer dan elke opvolger, bijvoorbeeld handmatig vóór de 7 dagen bijgewerkt | geen opvolger, dus geen achterstand | — |
| De pin is een voorloopversie of geen `x.y.z` | `<bestand>: <reden>` | exit 2 |
| Node: de pin zit in een major zonder LTS (Current) | opvolgers zonder LTS-eis. Een eventuele volgende LTS-major wordt gemeld; de pin zelf niet. De review van de pin-PR toetst het beleid | — |
| De nieuwste typescript-eslint staat geen hogere major toe | geen melding over de volgende major | — |
| Alleen meldingen over de volgende major | het issue wordt aangemaakt of bijgewerkt; exit 0 | — |
| Een handmatige run tegelijk met de geplande | `concurrency` laat ze na elkaar draaien; de tweede vindt het issue van de eerste | — |

## Raakt ook

- **Spec `dependency-achterstand`.**
  - Nieuwe AC-9: een update-PR met een rode check-run op de head wordt gemeld, ongeacht de leeftijd. De run eindigt dan met
    exitcode 1.
  - De bronnen, de rol en het randgeval "Update-PR met rode CI" gaan mee.
  - De workflow blijft alleen-lezen (`permissions: read-all`; `check-runs` valt daaronder).
- **`docs/framework.md` §3:** de regel "Afgedwongen door" noemt `pnpm check:toolchain` en de workflow `toolchain`
  (R-PROV-04).
- **`test/scripts/github-ruleset.test.ts`:** `NIET_VERPLICHT` krijgt de job `toolchain`, want die draait niet op een PR
  (R-CI-01). De reden staat in de PR (R-TEST-02).
- **`package.json`:** het script `check:toolchain`.
- **`.github/workflows/toolchain.yml`:** nieuw, beschermd pad.
- **`scripts/kit/template-status.mjs`:** de verwijsregel (AC-11).

## Buiten scope

- Een update zelf doorvoeren; dat doen Renovate en de eigenaar met de majorchecklist.
- De Docker-images en de mise-tools buiten Node; die volgen via Renovate en `dependency-achterstand`.
- Een apart issue per tool.

## Testplan

- **Unit:**
  - de beoordeling is een pure functie over de pins, vaste registry-fixtures en `nu`;
  - de bron- en de issue-laag krijgen een nep-`fetch` die de aanroepen vastlegt;
  - er is geen netwerk.
- **Rails:** de workflowtekst, op dezelfde manier als `test/rails/dependency-achterstand-workflow.test.ts`.
- **Lokaal:** `pnpm check:toolchain` eenmaal tegen de echte bronnen; de uitslag komt in de PR.
- **Na de merge:** de eigenaar start de workflow eenmaal met `workflow_dispatch` en ziet het issue of `Geen issue nodig.`

## Open vragen

- **OV-1 ✅ besloten** — Melden via één issue. De run is groen als het issue gelukt is. Achterstand telt vanaf de eerste
  opvolger. Punt 3 van het plan blijft bij `dependency-achterstand`, met de grenzen 14/7/60 dagen in plaats van 7; "CI
  rood" komt daar bij. De workflow draait ook in apps. (eigenaar, 2026-11-25)
- **OV-2** — Wat gebeurt er met het issue als er geen melding meer is? Opties: sluiten met een comment, of laten staan.
  Aanbeveling: sluiten met een comment (AC-9). Een open issue betekent dan altijd dat er iets is, en het blijft vindbaar.
- **OV-3** — Het plan wil de check in `pnpm template:status`, maar dat script is bewust offline (spec `template-release`).
  Opties: een netwerkaanroep, of een verwijsregel. Aanbeveling: een verwijsregel (AC-11), zodat `template:status` offline
  blijft. Het issue heeft de actuele stand.
