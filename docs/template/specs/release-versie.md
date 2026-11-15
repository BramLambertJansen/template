---
status: voorstel
namespace: release-versie
---

# Templateversie, eigen wijzigingenlijst en de eerste release

## Doel

De template heeft een versie die een app kan noemen en een draaiende server kan tonen, en een eigen wijzigingenlijst die bij een template-update niet botst met die van de app; daarmee kan de eerste release `v0.1.0` worden getagd en kan de proef-app een echte update binnenhalen.

## Rollen en wie wat ziet

`GET /api/health` is openbaar (zonder sessie, R-UIT-03) en toont voortaan ook de templateversie en de build-SHA (eigenaarbesluit 2026-11-15). Geen permissie of scherm verandert.

## Ontwerp

- **Versie in code.** `src/core/shared/template-version.ts` exporteert `TEMPLATE_VERSION` (`'0.1.0'`, semver). Core is van de template, dus een app krijgt een nieuwe versie met de template-merge. Een test houdt de constante gelijk aan de nieuwste releasekop in de wijzigingenlijst van de template.
- **Eigen wijzigingenlijst.** De wijzigingen van de template verhuizen van `CHANGELOG.md` naar `docs/template/CHANGELOG.md` (templatezone), met `## [Unreleased]` en daaronder `## [0.1.0] - 2026-11-15` met alles wat nu onder `[Unreleased]` staat. `CHANGELOG.md` in de hoofdmap is van de app: in de template bevat het alleen een korte verwijzing naar het templatebestand. Bij een template-update wijzigt alleen het templatebestand, dus er is geen botsing meer met wat de app zelf schreef.
- **`pnpm app:init`** schrijft `CHANGELOG.md` van de app opnieuw met één regel `Gestart vanaf template v<versie> (<sha>)` en laat `docs/template/CHANGELOG.md` ongemoeid (nu vervangt het de hele sectie `[Unreleased]` in het gedeelde bestand).
- **Build-SHA.** Nieuwe optionele omgevingsvariabele `BUILD_SHA` in het env-schema (`src/core/api/env.ts`): 7 tot 40 hexadecimale tekens, anders weigert de server bij opstart. De `Dockerfile` krijgt `ARG BUILD_SHA` en zet hem als `ENV`; de job `image` geeft de commit mee. Lokaal en in tests is hij leeg.
- **Health.** `GET /api/health` geeft `{ ok: true, version: '<TEMPLATE_VERSION>', build: '<BUILD_SHA>' }`; zonder `BUILD_SHA` ontbreekt de sleutel `build`. De route blijft van niets afhangen (geen database, geen rate limit) en `createApp` krijgt de build als optioneel configveld van `composeServer`.
- **Wie de wijzigingenlijst van de template als doc telt.** `check-docs-drift`, de werkstraat-hook, de padtabel en `CODEOWNERS` kennen nu `CHANGELOG.md`. Het templatebestand valt onder `docs/template/**` (besluit eigenaar); de rij `CHANGELOG.md` met besluit `agent` blijft voor het bestand van de app. `check-docs-drift` en de hook tellen beide bestanden als docs.
- **De tag.** `v0.1.0` zet de eigenaar na de merge op de merge-commit; de agent tagt niet (R-REL-01).

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| GET | `/api/health` | geen (openbaar) | geen |

Antwoord: `200 { ok: true, version: string, build?: string }`. Geen invoer, geen padparameters.

## Kopieer de vorm van

- `src/core/shared/limits.ts` met zijn gelijkheidstest: een constante in core die een test gelijk houdt aan een tweede plek.
- `src/core/api/env.ts`: een optionele variabele met vormcontrole (zoals `CLIENT_IP_HEADER`).
- `scripts/kit/app-init.mjs` en `test/scripts/app-init.test.ts`.

## Hergebruik en UX

Geen schermen. De e2e en `scripts/check-image.sh` lezen `/api/health`; de laatste vergelijkt nu letterlijk met `{"ok":true}` en volgt het nieuwe antwoord.

## Acceptatiecriteria

- **release-versie/AC-1**: `TEMPLATE_VERSION` is een semver-tekst en gelijk aan de nieuwste kop `## [x.y.z] - JJJJ-MM-DD` in `docs/template/CHANGELOG.md`; een test faalt bij verschil, bij een kop zonder datum en als `[Unreleased]` ontbreekt.
- **release-versie/AC-2**: `docs/template/CHANGELOG.md` bevat `## [Unreleased]` en `## [0.1.0] - 2026-11-15`; elke regel die vóór deze wijziging onder `[Unreleased]` in `CHANGELOG.md` stond, staat nu onder `[0.1.0]` (geen regel verloren: de test vergelijkt de inhoud met de vorige versie uit git, of de PR toont de vergelijking).
- **release-versie/AC-3**: `CHANGELOG.md` in de hoofdmap van de template bevat alleen een kop en een verwijzing naar `docs/template/CHANGELOG.md`.
- **release-versie/AC-4**: `pnpm app:init` schrijft `CHANGELOG.md` met `## [Unreleased]` en de regel `- Gestart vanaf template v0.1.0 (<sha>).`, en wijzigt `docs/template/CHANGELOG.md` niet; de bestaande tests van `app-init` volgen (reden: de wijzigingenlijst is gesplitst).
- **release-versie/AC-5**: `GET /api/health` zonder `build` in de config geeft `200 { ok: true, version: TEMPLATE_VERSION }` zonder sleutel `build`; met `build: 'abc1234'` geeft het ook `build: 'abc1234'`. Zonder sessie, zonder databaseaanroep.
- **release-versie/AC-6**: `BUILD_SHA` ontbreekt of leeg: geldig, geen `build`. `BUILD_SHA=abc1234` (7 tekens) en 40 hexadecimale tekens: geldig. Zes tekens, 41 tekens, hoofdletters of een niet-hexadecimaal teken: de omgeving wordt geweigerd met de naam van de variabele in de melding, zonder de waarde.
- **release-versie/AC-7**: `composeServer` geeft `buildSha` uit de omgeving door, zodat de draaiende server hem toont (uitbreiding van `src/core/api/server/compose.test.ts`).
- **release-versie/AC-8**: De image gebouwd met `--build-arg BUILD_SHA=<sha>` antwoordt op `/api/health` met die `build`; `scripts/check-image.sh` toetst `ok`, `version` en `build` (de job `image` geeft de commit-SHA mee).
- **release-versie/AC-9**: Een PR die alleen code wijzigt en `docs/template/CHANGELOG.md` bijwerkt, geeft geen docs-drift-waarschuwing; hetzelfde geldt voor `CHANGELOG.md` van de app (bestaand gedrag).
- **release-versie/AC-10**: Alle andere bestaande tests blijven ongewijzigd groen.

## Raakt ook

- Nieuw: `src/core/shared/template-version.ts`, `docs/template/CHANGELOG.md`. Gewijzigd: `CHANGELOG.md`, `src/core/api/env.ts`, `src/core/api/http/create-app.ts`, `src/core/api/server/compose.ts`, `Dockerfile`, `.github/workflows/ci.yml` (job `image`: build-arg; de App mag geen workflow pushen, de eigenaar pusht deze branch), `scripts/check-image.sh`, `scripts/kit/app-init.mjs`, `scripts/kit/check-docs-drift.mjs`, `rails/hooks/lib/werkstraat.mjs`, `.env.example` (beschermd: de eigenaar voegt `BUILD_SHA=` toe of keurt het goed).
- Bestaande tests die volgen, met reden: `test/scripts/app-init.test.ts`, `test/scripts/app-init-template.test.ts` (gesplitste wijzigingenlijst); tests die het letterlijke antwoord `{"ok":true}` van health vastleggen (het antwoord krijgt `version`); `test/rails/check-docs-drift.test.ts` en `test/hooks/werkstraat-docs-drift.test.ts` alleen als ze het pad van de template-wijzigingenlijst vastleggen.
- Docs: R-DEPLOY-01 (`{ ok, version, build }`), `docs/nieuwe-app.md` (de wijzigingenlijst van de app), `docs/operations/agent-doorloop.md` en de skill `opleveren` waar ze `CHANGELOG.md` als plek voor templatewijzigingen noemen, ADR 0049 punt 1 (health toont versie en build) met herzieningsregel.
- Verwijzingen naar `CHANGELOG.md` in specs met status gebouwd of vervallen blijven staan.

## Buiten scope

De update-procedure in `docs/nieuwe-app.md` en de check op migratievolgorde (volgende PR); app-configuratie naast templateconfiguratie (padtabel, leerpunt-repo); een release-workflow.

## Open vragen

- **OV-1**: Staat de templateversie ook in `package.json` (`version`)? Aanbeveling: nee; `package.json` is van de app, en één bron (`TEMPLATE_VERSION`) volstaat.
- **OV-2**: Het bestand `docs/template/CHANGELOG.md` valt onder de paden van de code-eigenaar; een PR van de agent die alleen de wijzigingenlijst van de template bijwerkt, merget dan de eigenaar. Aanbeveling: zo laten; elke templatewijziging die een regel in die lijst verdient, raakt toch al een beschermd pad.
