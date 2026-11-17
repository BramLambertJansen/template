---
status: goedgekeurd
namespace: app-agentregels
---

# Eigen agentinstructies van een app

## Doel

Een app zet wat elke sessie over die app moet weten in één eigen bestand, app.md onder `.claude/rules/`, dat Claude Code bij elke sessiestart laadt en dat de template niet meelevert, zodat `CLAUDE.md` en `AGENTS.md` van de template blijven en een template-update er geen conflict op geeft.

**Toets aan framework §1.** Aanleiding: de vraag van de eigenaar op 2026-11-17 naar een `CLAUDE.md` die een app overneemt en aanvult, en zijn keuze via de vraagprompt voor "App-bestand, nu bouwen". Gemeten gat: `docs/nieuwe-app.md` verbiedt een app `AGENTS.md`, `CLAUDE.md` en `.claude/` aan te raken, dus niets app-eigens laadt automatisch. Geen nieuwe dependency.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| elke rol die `CLAUDE.md` krijgt (in een app) | krijgt ook app.md bij de sessiestart in context (Claude Code); `pnpm leespad` volgt zijn bestaande scenario's | — |
| hoofdsessie (in een app) | vult het na de intake en werkt het bij in de PR die een feit erin wijzigt; het pad is `voorReview` (rij `.claude/**`) | er een norm in zetten |
| developer, architect, tester, reviewer, docs | — | het bestand schrijven (bestaande rij `.claude/**`) |
| eigenaar | keurt elke PR die het bestand raakt goed (code-eigenaar van `.claude/`); zo'n PR kan dus niet via `pnpm pr:merge` | — |

## Het probleem

`CLAUDE.md`, `AGENTS.md` en `.claude/` komen in een app uit de template en worden via `git merge template/main` bijgehouden. Past een app ze aan, dan conflicteert elke template-update die hetzelfde bestand raakt. Daarom staat er nu "raak ze niet aan", met als gevolg dat een agent in een app het doel, de gekozen provider, de rollen en de begrippen van die app elke sessie opnieuw uit ADR's en code moet halen.

## Ontwerp

- **Bestand.** In een app: app.md onder `.claude/rules/`, zonder frontmatter. Claude Code laadt een regelbestand zonder `paths` bij elke sessiestart met dezelfde prioriteit als `CLAUDE.md` (documentatie van Claude Code, "memory", gelezen op 2026-11-17); met `paths` zou het pas laden bij een passend bestand, dus frontmatter is rood. De template heeft het bestand niet: er is dus niets om bij een update mee te botsen. Voorganger van deze vorm: het app-bestand van de padtabel (spec [app-padtabel](app-padtabel.md)).
- **Inhoud.** Alleen feiten van de app: wat de app is, provider en host, rollen, begrippen, eigen commando's en valkuilen (wat faalt, en waardoor). Geen kopie van het regelboek en geen norm: een norm van de app staat in een app-ADR (framework, inleiding) en app.md verwijst ernaar met zijn nummer; het regelboek blijft het enige bindende (R-DOC-03). Een R-id in het bestand moet in het regelboek staan: dat toetst de bestaande regel 10 van `check-docs` al voor elk bestand onder `.claude/rules/`.
- **Skelet.** `app:init` schrijft het bestand met precies deze tekst, met `<App-naam>` ingevuld; de tekst staat op één plek, de functie `appAgentregels()` in `scripts/kit/app-init.mjs`. Het script maakt de map aan als die ontbreekt.

  ```markdown
  # <App-naam>

  <!-- Van de app, niet van de template. Elke sessie laadt dit bestand: kort en feitelijk. Regels staan in docs/framework.md; hier staat alleen wat deze app eigen is. Werk het bij in de PR die een feit hieronder wijzigt. -->

  ## Wat de app is

  Nog in te vullen na de intake: doel en gebruikers in één alinea.

  ## Provider en host

  Nog geen app-ADR.

  ## Rollen

  Zie `src/shared/permissions.ts`.

  ## Begrippen

  Nog geen.

  ## Eigen commando's en valkuilen

  Nog geen.
  ```

  Claude Code haalt een HTML-commentaar op blokniveau weg voordat het bestand de context in gaat; de toelichting kost dus geen tokens. De slotregel van `app:init` zegt `git add -A` en daarna `git commit -m …`, omdat `git commit -am` een nieuw bestand niet meeneemt.
- **Vullen.** `docs/nieuwe-app.md`: de uitzondering op "raak `.claude/` niet aan" noemt ook dit bestand; na de intake vult de hoofdsessie "Wat de app is" en, zodra het app-ADR er is, "Provider en host"; een naslagkop "Eigen agentinstructies van de app" zegt wat erin hoort en wat niet, en verwijst voor het skelet naar `appAgentregels()` in plaats van de tekst te herhalen. De tabel van `app:init` krijgt de rij.
- **Bijhouden.** Nieuwe regel R-DOC-11 in `docs/framework.md` §9: "Een app zet wat elke sessie over die app moet weten (doel, provider en host, rollen, begrippen, eigen commando's en valkuilen) als feiten in app.md onder `.claude/rules/`, zonder `paths`; het bestand bestaat niet in de template, bevat geen norm en gaat mee in de PR die een van die feiten wijzigt (fw)". De reviewer toetst het met de bestaande vraag naar docs in dezelfde PR (R-WERK-15). `AGENTS.md` en `CLAUDE.md` wijzigen niet.
- **check-docs, nieuwe regels** (sleutel `docs:rules-app:<…>`, tekst na `.claude/rules/app.md: `), alleen als het bestand getrackt is:
  - `bestaat in de template zelf (onderhoud.repository staat in .claude/gates.json); het bestand is van een app`;
  - `frontmatter: zonder paths laadt het bestand in elke sessie; haal de frontmatter weg`, als het bestand, na een eventuele BOM, met `---` begint.

  Het kopcommentaar van `check-docs.mjs` krijgt deze regels als nummer 13.
- **Omvang (OV-2).** Met de aanbeveling: `pnpm leespad` meet het bestand al tegen de streefwaarde voor een rule (`SOORTEN.rules` in `scripts/kit/leespad.mjs`, 60 regels), nooit rood, zoals R-DOC-01 voor elke rule zegt; daar is geen code voor nodig. Kiest de eigenaar de harde grens, dan komt er een derde melding `<n> regels, grens 60 (R-DOC-11)` bij, gemeten met `aantalRegels` uit `scripts/kit/leesbudget.mjs` als gewone `GRENZEN`-rij (ratchet en baseline, melding vanaf 85 %, zoals `AGENTS.md` en `CLAUDE.md`), en noemen R-DOC-01, de kop "Afgedwongen door" van §9 en het kopcommentaar van `check-docs.mjs` de nieuwe grens.
- **Krimp.** app.md is geen bindend document voor R-DOC-07: `bindend()` in `scripts/kit/normen.mjs` sluit het uit, en R-DOC-07 krijgt "(behalve app.md, R-DOC-11)". Anders is een app die het bestand inkort alleen te herstellen in `docs/normen-vervallen.md`, een bestand van de template.
- **leespad.** `pnpm leespad` telt het bestand, als het bestaat, mee in elk scenario dat `CLAUDE.md` bevat; zonder het bestand is de uitvoer byte-gelijk aan nu.
- **Bescherming.** Geen nieuwe rij: `.claude/**` is `voorReview` met besluit `eigenaar`, en `/.claude/` staat in CODEOWNERS. In een app (onderhoudsmodus uit) weigert het rolhek de developer en vraagt het de hoofdsessie.

## Kopieer de vorm van

- `scripts/kit/app-init.mjs` — `appChangelog` en de rij in `planAppInit` voor een bestand dat van de app wordt.
- `scripts/kit/check-docs.mjs` — de app-regels van het app-bestand van de padtabel (`APP_TEMPLATE`, "alleen als het getrackt is").
- `test/scripts/app-padtabel-merge.test.ts` — de template-update in tijdelijke repo's.
- `test/rails/check-docs-app-padtabel.test.ts` — check-docs met fixture-mappen.

## Hergebruik en UX

Geen schermen. De meldingen van `check-docs` en het skelet staan letterlijk in het Ontwerp. `app:init --dry-run` noemt het bestand in zijn lijst, in dezelfde vorm als de andere bestanden.

## Acceptatiecriteria

- **app-agentregels/AC-1** — `planAppInit` op een templatekopie levert een rij voor app.md onder `.claude/rules/` met precies het skelet uit het Ontwerp, `<App-naam>` vervangen door de opgegeven naam en geen regel die met `---` begint; `--dry-run` noemt het pad en schrijft niets; op een kopie zonder de map `.claude/rules/` schrijft `app:init` het bestand toch; de slotregel noemt `git add -A`.
- **app-agentregels/AC-2** — check-docs in de template (met `onderhoud.repository`) en een getrackt app.md onder `.claude/rules/`: rood met de melding "bestaat in de template zelf"; zonder het bestand: geen melding met sleutel `docs:rules-app:`.
- **app-agentregels/AC-3** — check-docs in een app (zonder `onderhoud`): het skelet uit AC-1 is groen en een leeg bestand ook; hetzelfde bestand met frontmatter is rood met de frontmatter-melding, ook met een BOM ervoor en met `\r\n`.
- **app-agentregels/AC-4** — In een tijdelijke app-repo die begint met de uitvoer van `app:init` en waarin app.md daarna is ingevuld: de template wijzigt `CLAUDE.md`, `AGENTS.md` en een bestaand bestand onder `.claude/rules/`, en de app doet `git merge template/main`; er is geen conflict, app.md is ongewijzigd en de drie templatebestanden hebben de nieuwe inhoud.
- **app-agentregels/AC-5** — `pnpm leespad` met een app.md van bekende grootte telt die bytes mee in "nieuwe-feature" en "lichte-fix" en niet in "review"; zonder het bestand noemt geen scenario app.md, ook niet onder `ontbreekt`, en zijn de bytes per scenario gelijk aan de som van de bestaande paden.
- **app-agentregels/AC-6** — Een app.md dat van 3 KB naar 1 KB krimpt of verdwijnt, geeft geen krimpmelding; `.claude/rules/web.md` met dezelfde krimp blijft rood.
- **app-agentregels/AC-7** — `docs/framework.md` §9 definieert R-DOC-11 één keer, met app.md en `paths`; R-DOC-07 en R-DOC-03 noemen "behalve app.md".

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| De template (geen app-bestand) | alles zoals nu | n.v.t. |
| Bestaande app zonder het bestand | geen melding; `app:init` draait daar niet meer, dus de hoofdsessie maakt het met de tekst uit `appAgentregels()` | n.v.t. |
| App-bestand alleen op een branch, of ongetrackt | Claude Code laadt het in die werkmap; check-docs toetst het pas als het getrackt is | n.v.t. |
| Template voegt later zelf een app.md toe | kan niet: AC-2 is rood in de template | n.v.t. |
| Runtime zonder `.claude/rules/` | laadt het bestand niet; R-DOC-11 zegt waar het staat | n.v.t. |
| Een R-id in app.md die niet in het regelboek staat | rood door de bestaande regel 10 van check-docs; geen nieuw criterium, want deze PR verandert die regel niet | n.v.t. |
| app.md noemt `feiten.mjs` | telt mee als feiten-aanroep van het scenario, net als de andere leespadbestanden; een onherkende aanroep maakt het totaal onbekend, zoals nu | n.v.t. |
| App wil een padgebonden regel | eigen bestand onder `.claude/rules/` met `paths`; buiten deze spec, zie Buiten scope | n.v.t. |

## Raakt ook

- Geen risicowerk en niet kritiek (`feiten.mjs pad`: alle geraakte paden `voorReview`, besluit `eigenaar`). Wel beschermde paden: `docs/framework.md`, `scripts/kit/check-docs.mjs`, `scripts/kit/app-init.mjs`, `scripts/kit/normen.mjs`; de eigenaar keurt de PR goed.
- Code: `scripts/kit/app-init.mjs`, `scripts/kit/check-docs.mjs`, `scripts/kit/normen.mjs`, `scripts/kit/leespad.mjs`.
- `AGENTS.md` en `CLAUDE.md` staan niet in de diff; de reviewer toetst dat.
- Docs: `docs/framework.md` (R-DOC-11 nieuw; R-DOC-07 en R-DOC-03 krijgen "behalve app.md"; R-DOC-01 krijgt na "rule 60" de toevoeging "(ook app.md, R-DOC-11)"), `docs/nieuwe-app.md` (uitzondering, vulstap, naslag, tabel van `app:init`), `docs/template-changelog.md`.
- Bestaande tests (R-TEST-02, met reden in de PR): `test/scripts/app-init.test.ts`, `test/scripts/app-init-changelog.test.ts` en `test/scripts/app-init-template.test.ts` leggen de volledige lijst van `planAppInit` vast en krijgen de rij; in de laatste blijft app.md buiten de invoerlijst, want het bestaat niet in de template.

## Buiten scope

- Een eigen padregel van een app (bestand met `paths` onder `.claude/rules/`): de naam kan botsen met een latere templateregel; pas bij een app die het nodig heeft.
- Een wijzer in `AGENTS.md` voor andere runtimes: `AGENTS.md` zit op 93 % van zijn grens en wat erbij komt moet er netto uit (R-DOC-06); geen gebruikte runtime mist het bestand.
- Normwoorden in app.md als check (regel 12 over het hele bestand): eerst zien wat een app erin zet (ST-09).
- Templatestatus uit `AGENTS.md` halen: PR #770.
- Een check die eist dat een app het bestand hééft of heeft ingevuld: geen aanleiding vóór de proef-app (ST-09); die meet of het skelet gevuld raakt.

## Testplan

- Unit: AC-1 tegen `planAppInit` en de CLI in `test/scripts/app-agentregels-init.test.ts`; AC-2 en AC-3 met fixture-mappen in `test/rails/check-docs-app-agentregels.test.ts`; AC-4 met tijdelijke git-repo's in `test/scripts/app-agentregels-merge.test.ts`; AC-5 in `test/rails/app-agentregels-leespad.test.ts`; AC-6 in `test/rails/app-agentregels-krimp.test.ts`; AC-7 in `test/rails/app-agentregels-docs.test.ts`.
- Regressie, geen eigen criterium: de verplichte job `check:new-resource` draait `app:init` met het skelet en daarna `gate:fast` (`scripts/kit/draai-proef.mjs`).
- Volgorde: geen risicowerk, dus de developer schrijft eerst de tests.

## Open vragen

- **OV-1 ✅ besloten** — Vorm van de app-laag: één app-eigen bestand dat altijd laadt, naast de gedeelde `CLAUDE.md` (keuze van de eigenaar via de vraagprompt, 2026-11-17).
- **OV-2** — Omvang van het bestand: alleen meten in `pnpm leespad` tegen de streefwaarde van 60 regels, of een harde grens van 60 regels in check-docs (een gate-wijziging: R-DOC-01 zegt nu dat alleen `AGENTS.md` en `CLAUDE.md` hard zijn). Aanbeveling: alleen meten; de proef-app (ST-09) laat zien of het bestand groeit, en een grens kan daarna met een aanleiding. Bij keuze voor de grens komt er een criterium bij (melding vanaf 85 %, rood boven 60, baseline alleen omlaag) en wijzigt R-DOC-01.
- **OV-3** — app.md uitzonderen van de krimpcheck (R-DOC-07). Aanbeveling: ja; het bestand bevat geen normen en een app kan `docs/normen-vervallen.md` niet bijwerken.
- **OV-4** — Elke wijziging van app.md vraagt de goedkeuring van de eigenaar, omdat het onder `.claude/` valt. Aanbeveling: zo laten; het bestand stuurt elke sessie aan.
