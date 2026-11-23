---
status: goedgekeurd # #724
namespace: release-versie
---

# Templateversie, eigen wijzigingenlijst en de eerste release

## Doel

De template heeft een versie die een app kan noemen en een draaiende server kan tonen, en een eigen wijzigingenlijst die bij een template-update niet botst met die van de app; daarmee kan de eerste release `v0.1.0` worden getagd en kan de proef-app een echte update binnenhalen.

## Rollen en wie wat ziet

`GET /api/health` is openbaar (zonder sessie, R-UIT-03) en toont voortaan ook de templateversie en de build-SHA (eigenaarbesluit 2026-11-15). Aanvaard risico: een buitenstaander ziet welke templateversie en commit een host draait en kan bekende fouten van die versie opzoeken. Geen permissie of scherm verandert.

## Ontwerp

- **Versie in code.** `src/core/shared/template-version.ts` exporteert `TEMPLATE_VERSION` (`'0.1.0'`, semver). Core is van de template, dus een app krijgt een nieuwe versie met de template-merge. Een test houdt de constante gelijk aan de nieuwste releasekop in de wijzigingenlijst van de template. `package.json` krijgt geen versie: dat bestand is van de app.
- **Eigen wijzigingenlijst.** De wijzigingen van de template verhuizen van `CHANGELOG.md` naar `docs/template-changelog.md` (eigenaarbesluit 2026-11-15: een gewoon docs-bestand met besluit `agent`, zodat een PR met alleen app-code en een regel in de lijst geen eigenaarmerge vraagt), met `## [Unreleased]` en daaronder `## [0.1.0] - 2026-11-15` met alles wat nu onder `[Unreleased]` staat. `CHANGELOG.md` in de hoofdmap is van de app: in de template bevat het alleen een kop en een verwijzing naar het templatebestand, en de template wijzigt dat bestand daarna niet meer.
- **Overgang voor een bestaande app.** Haar eerste update na deze wijziging geeft één keer een conflict op `CHANGELOG.md` (de template vervangt het bestand, de app heeft het gewijzigd); de app houdt haar eigen versie. Daarna botst het niet meer. `docs/template-changelog.md` komt zonder conflict binnen. Dit staat als "Bij een update" in de wijzigingenlijst.
- **`pnpm app:init`** schrijft `CHANGELOG.md` van de app opnieuw met `## [Unreleased]` en één regel `- Gestart vanaf template v<TEMPLATE_VERSION> (<sha>).`, en laat `docs/template-changelog.md` ongemoeid. Het script importeert `TEMPLATE_VERSION` uit `src/core/shared/template-version.ts`.
- **Build-SHA.** Nieuwe optionele omgevingsvariabele `BUILD_SHA` in het env-schema (`src/core/api/env.ts`, veld `buildSha`): 7 tot 40 kleine hexadecimale tekens; leeg telt als niet gezet; een andere vorm weigert de server bij opstart. De `Dockerfile` krijgt in de runtime-stage, na de `COPY`-stappen, `ARG BUILD_SHA` en zet hem als `ENV`. Lokaal en in tests is hij leeg.
- **Het pad naar het antwoord.** `env.buildSha` → `ServerAppDeps.build?` (`src/core/api/server/compose.ts`, afwezig als de variabele leeg is) → `BuildAppConfig.build?` in `src/api/app.ts` (de compositie-root van de app geeft hem door) → het configveld `build?` van `createApp`. `createApp` importeert `TEMPLATE_VERSION` zelf.
- **Health.** `GET /api/health` geeft `{ ok: true, version: TEMPLATE_VERSION }` en, als `build` is meegegeven, ook `build`. De route blijft van niets afhangen (geen database, geen rate limit). `GET /api/ready` blijft `{ ok }`.
- **De image-check.** `scripts/check-image.sh` leest `version` en vergelijkt hem met `TEMPLATE_VERSION` uit het bronbestand. Met de omgevingsvariabele `EXPECT_BUILD_SHA` eist het script `build` gelijk aan die waarde; zonder eist het dat `build` ontbreekt. De job `image` blijft in deze PR zonder build-arg en is dus groen; de build-arg en `EXPECT_BUILD_SHA` in `.github/workflows/ci.yml` komen in een kleine vervolg-PR die de eigenaar pusht (de App mag geen workflow pushen), met `github.event.pull_request.head.sha || github.sha`.
- **De tag.** `v0.1.0` zet de eigenaar na de merge op de merge-commit; de agent tagt niet (R-REL-01).

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| GET | `/api/health` | geen (openbaar) | geen |

Antwoord: `200 { ok: true, version: string, build?: string }`. Geen invoer, geen padparameters.

## Kopieer de vorm van

- `src/core/shared/limits.ts` met zijn gelijkheidstest: een constante in core die een test gelijk houdt aan een tweede plek.
- `src/core/api/env.ts`: een optionele variabele met vormcontrole (zoals `CLIENT_IP_HEADER`) en `unsetIfEmpty`.
- `scripts/kit/app-init.mjs` met `test/scripts/app-init.test.ts`, en `test/scripts/check-image-inputs.test.ts` (het script met een nagebootste docker en curl).

## Hergebruik en UX

Geen schermen.

## Acceptatiecriteria

Bestaande tests blijven groen; alleen de onder "Raakt ook" genoemde tests wijzigen (een voorwaarde voor de hele wijziging, geen eigen testbaar criterium).

- **release-versie/AC-1**: `TEMPLATE_VERSION` is een semver-tekst en gelijk aan de nieuwste kop `## [x.y.z] - JJJJ-MM-DD` in `docs/template-changelog.md`; een test faalt bij verschil, bij een releasekop zonder datum en als `## [Unreleased]` ontbreekt of niet de eerste kop is.
- **release-versie/AC-2**: `docs/template-changelog.md` bevat `## [Unreleased]` en `## [0.1.0] - 2026-11-15`. Dat elke regel die onder `[Unreleased]` in `CHANGELOG.md` stond nu onder `[0.1.0]` staat, is eenmalig bewijs in de PR (de verplaatsing in de diff, door de reviewer getoetst), geen blijvende test.
- **release-versie/AC-3**: `CHANGELOG.md` in de hoofdmap van de template bevat alleen een kop en een verwijzing naar `docs/template-changelog.md` (de test legt vast dat er geen releasekop van de template in staat; hij geldt ook in een app, waar het bestand van de app is, en wordt nergens overgeslagen).
- **release-versie/AC-4**: `pnpm app:init` schrijft `CHANGELOG.md` met `## [Unreleased]` en de regel `- Gestart vanaf template v<TEMPLATE_VERSION> (<sha>).`, en wijzigt `docs/template-changelog.md` niet. Ontbreekt `src/core/shared/template-version.ts`, dan stopt het script met een melding die het bestand noemt.
- **release-versie/AC-5**: De compatibiliteitstest van `app:init` (`test/scripts/app-init-template.test.ts`, leest in een app de invoer uit de git-historie) blijft groen voor een app die met een oudere template is gestart, waar `template-version.ts` en `docs/template-changelog.md` niet in die historie staan.
- **release-versie/AC-6**: `GET /api/health` zonder `build` in de config geeft `200 { ok: true, version: TEMPLATE_VERSION }` zonder sleutel `build`; met `build: 'abc1234'` geeft het ook `build: 'abc1234'`. Zonder sessie, zonder databaseaanroep. `GET /api/ready` blijft `{ ok }`.
- **release-versie/AC-7**: `BUILD_SHA` ontbreekt of is leeg: geldig, `buildSha` is `undefined`. Zeven en veertig kleine hexadecimale tekens: geldig. Zes tekens, 41 tekens, een hoofdletter of een ander teken: de omgeving wordt geweigerd met de naam `BUILD_SHA` in de melding en zonder de waarde.
- **release-versie/AC-8**: `composeServer` geeft `build` in `deps` aan `buildApp` als `env.buildSha` gezet is, en laat de sleutel anders weg; `buildApp` van de app geeft hem door aan `createApp` (een test op `src/api/app.ts` met `build: 'abc1234'` ziet hem terug op `/api/health`).
- **release-versie/AC-9**: `scripts/check-image.sh` met de nagebootste docker en curl: slaagt bij `{"ok":true,"version":"<TEMPLATE_VERSION>"}` zonder `EXPECT_BUILD_SHA`; faalt bij een andere of ontbrekende `version`; faalt als `build` aanwezig is zonder `EXPECT_BUILD_SHA`; met `EXPECT_BUILD_SHA=abc1234` slaagt het alleen bij `"build":"abc1234"`. Dat de echte image met `--build-arg BUILD_SHA=<sha>` die waarde toont, is alleen in CI of bij de eigenaar te bewijzen en hoort bij de vervolg-PR.
- **release-versie/AC-10**: Een PR die code wijzigt en `docs/template-changelog.md` bijwerkt, geeft geen docs-drift-waarschuwing (`test/rails/check-docs-drift-template-changelog.test.ts`; `check-docs-drift` zelf verandert niet, het telt alles onder `docs/` al als docs).

## Raakt ook

- Kritiek werk (ADR 0049 wijzigt, `Dockerfile`, `scripts/**`, `src/core/**`): de eigenaar keurt de PR goed. Geen aparte tester: de developer schrijft de tests eerst (env-vorm, health, `app:init`, het imagescript).
- Nieuw: `src/core/shared/template-version.ts`, `docs/template-changelog.md`. Gewijzigd: `CHANGELOG.md`, `src/core/api/env.ts`, `src/core/api/http/create-app.ts`, `src/core/api/server/compose.ts`, `src/api/app.ts`, `Dockerfile`, `scripts/check-image.sh`, `scripts/kit/app-init.mjs`.
- Bestaande tests die volgen, met reden: `test/scripts/app-init.test.ts`, `test/scripts/app-init-template.test.ts` en `test/scripts/proef-fixture.ts` (gesplitste wijzigingenlijst, nieuw invoerbestand); `src/core/api/http/create-app.test.ts` (titel en verwachting "alleen { ok: true }"), `src/core/api/server/compose.test.ts` (de twee plekken die het health-antwoord vergelijken) en `test/scripts/check-image-inputs.test.ts` (het nagebootste antwoord): health krijgt `version`. De `{ ok: true }` van `/api/ready` in die tests blijft.
- Niet in deze PR: `.github/workflows/ci.yml`, `.env.example` (de variabele is optioneel), `scripts/kit/check-docs-drift.mjs`, `rails/hooks/**`, `.claude/gates.json` (de rij `CHANGELOG.md` met besluit `agent` blijft voor het bestand van de app; `docs/**` dekt het nieuwe bestand).
- Docs: R-DEPLOY-01 gesplitst (health `{ ok, version, build? }`, ready `{ ok }`) met spiegels, ADR 0049 punt 1 (health toont versie en build, met het aanvaarde risico) met herzieningsregel, `docs/README.md` (de link "wat een template-update verandert"), `docs/nieuwe-app.md` en `docs/operations/agent-doorloop.md` waar ze `CHANGELOG.md` als plek voor templatewijzigingen noemen, `AGENTS.md`/`CLAUDE.md` alleen als ze het pad noemen.
- Wijzigingenlijst, "Bij een update": een app houdt bij het conflict haar eigen `CHANGELOG.md`, en geeft `build` door in `buildApp` als ze haar config uitpakt in plaats van doorgeeft.
- Verwijzingen naar `CHANGELOG.md` in specs met status gebouwd of vervallen blijven staan. Roadmap: het item dat versie en build "onderaan in de app" vraagt, blijft open (alleen de API toont ze nu).

## Buiten scope

De build-arg in de CI-job (vervolg-PR van de eigenaar); de update-procedure in `docs/nieuwe-app.md` en de check op migratievolgorde (volgende PR); app-configuratie naast templateconfiguratie; een release-workflow; versie en build in de webapp.

## Open vragen

Geen. Besloten door de eigenaar op 2026-11-15: versie en build-SHA in het openbare health-antwoord; de wijzigingenlijst van de template staat in `docs/template-changelog.md`.
