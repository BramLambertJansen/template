---
status: goedgekeurd # #771
namespace: app-agentregels
---

# Eigen agentinstructies van een app

## Doel

Een app zet wat elke sessie over die app moet weten in één eigen bestand, `docs/app.md`, dat `CLAUDE.md` importeert, zodat `CLAUDE.md` en `AGENTS.md` van de template blijven, een template-update er geen conflict op geeft en de hoofdsessie een wijziging van die feiten zelf kan mergen.

**Toets aan framework §1.** Aanleiding: de vraag van de eigenaar op 2026-11-17 naar een `CLAUDE.md` die een app overneemt en aanvult, en zijn keuzes via de vraagprompt ("App-bestand, nu bouwen", "Agent mag zelf mergen", "docs/app.md met import"). Gemeten gat: `docs/nieuwe-app.md` verbiedt een app `AGENTS.md`, `CLAUDE.md` en `.claude/` aan te raken, dus niets app-eigens laadt automatisch. Geen nieuwe dependency.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| elke rol die `CLAUDE.md` krijgt | krijgt ook `docs/app.md` bij de sessiestart in context (Claude Code, via de import) | — |
| hoofdsessie en developer (in een app) | vullen het na de intake en werken het bij in de PR die een feit erin wijzigt (`feiten.mjs pad docs/app.md`: schrijven vrij, besluit agent) | er een norm in zetten |
| hoofdsessie (in een app) | merget een PR die alleen zulke paden raakt via `pnpm pr:merge` (R-REPO-01) | — |
| eigenaar | keurt deze PR goed (`CLAUDE.md`, `docs/framework.md`, scripts) | — |

## Het probleem

`CLAUDE.md`, `AGENTS.md` en `.claude/` komen in een app uit de template en worden via `git merge template/main` bijgehouden. Past een app ze aan, dan conflicteert elke template-update die hetzelfde bestand raakt. Daarom staat er nu "raak ze niet aan", met als gevolg dat een agent in een app het doel, de gekozen provider, de rollen en de begrippen van die app elke sessie opnieuw uit ADR's en code moet halen.

Een bestand onder `.claude/` (bijvoorbeeld een regelbestand zonder `paths`) laadt vanzelf, maar is altijd van de code-eigenaar: de rij `**/.*/**` zet elke puntmap op besluit `eigenaar` en per kolom wint de strengste rij. De eigenaar wil dat de agent deze feiten zelf kan bijhouden; daarom staat het bestand onder `docs/`.

## Ontwerp

- **Bestand en laden.** `docs/app.md`. `CLAUDE.md` krijgt direct onder `@AGENTS.md` de regel `@docs/app.md`; Claude Code laadt een import samen met het bestand dat ernaar verwijst (documentatie van Claude Code, "memory", gelezen op 2026-11-17). Het bestand hoort bij wat altijd nodig is, dus een import past (R-DOC-04).
- **In de template: een vaste stub.** Het doel van een import moet bestaan, dus de template levert `docs/app.md` met precies deze tekst:

  ```markdown
  # Deze repo

  Dit is de template zelf; er is geen app. In een app beschrijft dit bestand de app: `pnpm app:init` schrijft het skelet.
  ```

  De template wijzigt de stub daarna niet meer: een app herschrijft het bestand, en een latere templatewijziging gaf dan in elke app een conflict. `check-docs` maakt een wijziging zichtbaar: zonder dat `APP_STUB` meegaat is hij rood, en met `APP_STUB` erbij ziet de reviewer het (randgeval hieronder). Voorganger van deze vorm: `CHANGELOG.md`, dat `app:init` ook herschrijft (spec [release-versie](release-versie.md)).
- **In een app: het skelet.** `app:init` herschrijft het bestand met precies deze tekst, met `<App-naam>` ingevuld; de tekst staat op één plek, de functie `appAgentregels()` in `scripts/kit/app-init.mjs`:

  ```markdown
  # <App-naam>

  Feiten van deze app, geen regels (die staan in `docs/framework.md` en de app-ADR's in `docs/adr/`). Elke sessie laadt dit bestand: houd het kort en werk het bij in de PR die een feit wijzigt.

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

- **Inhoud.** Alleen feiten van de app: wat de app is, provider en host, rollen, begrippen, eigen commando's en valkuilen (wat faalt, en waardoor). Geen kopie van het regelboek en geen norm: een norm van de app staat in een app-ADR (framework, inleiding) en het bestand verwijst ernaar met zijn nummer.
- **Vullen.** `docs/nieuwe-app.md`: de zin "raak `docs/` … niet aan" krijgt `docs/app.md` als uitzondering; na de intake vult de hoofdsessie "Wat de app is" en, zodra het app-ADR er is, "Provider en host"; een naslagkop "Eigen agentinstructies van de app" zegt wat erin hoort en wat niet, en verwijst voor het skelet naar `appAgentregels()`. De tabel van `app:init` krijgt de rij; de tabel met rode checks bij een template-update krijgt de rij "conflict op `docs/app.md`: houd de versie van de app".
- **Bijhouden.** Nieuwe regel R-DOC-11 in `docs/framework.md` §9: "Een app zet wat elke sessie over die app moet weten (doel, provider en host, rollen, begrippen, eigen commando's en valkuilen) als feiten in `docs/app.md`, dat `CLAUDE.md` importeert; in de template is het een vaste stub; het bevat geen norm, wordt gemeten in `pnpm leespad` (R-DOC-01) en gaat mee in de PR die een van die feiten wijzigt (fw)". De reviewer toetst het met de bestaande vraag naar docs in dezelfde PR (R-WERK-15). De regel "Afgedwongen door" van §9 noemt bij `check-docs` ook de stub van `docs/app.md`.
- **check-docs, nieuwe regel 13** (sleutel `docs:app-md:<…>`, tekst na `docs/app.md: `; het kopcommentaar van `check-docs.mjs` krijgt het nummer):
  - in de template (`onderhoud.repository` staat in `.claude/gates.json`): `wijkt af van de stub; de template wijzigt dit bestand niet (een app herschrijft het, spec app-agentregels)`, als de inhoud niet byte-gelijk is aan de stub;
  - overal: `ontbreekt; CLAUDE.md importeert het`, als het bestand niet getrackt is terwijl `CLAUDE.md` de regel `@docs/app.md` heeft.

  De stubtekst staat op één plek in code (`APP_STUB`, geëxporteerd uit `scripts/kit/app-init.mjs`); `check-docs` en de tests lezen hem daar.
- **Omvang.** Alleen meten (keuze van de eigenaar): `pnpm leespad` krijgt in `SOORTEN` de soort `app` (`{ streefwaarde: 60, eenheid: 'regels', pad: /^docs\/app\.md$/ }`), nooit rood, zoals R-DOC-01 voor alles buiten `AGENTS.md` en `CLAUDE.md` zegt; in R-DOC-01 wordt "rule 60 en skill 200 regels" "rule 60, `docs/app.md` 60 en skill 200 regels". Het getal staat alleen daar. Het bestand telt mee in elk scenario dat `CLAUDE.md` bevat ("nieuwe-feature" en "lichte-fix").
- **Krimp.** Speelt niet: `docs/app.md` is geen bindend document voor R-DOC-07 (`bindend()` in `scripts/kit/normen.mjs` noemt het niet).
- **Bescherming.** Geen wijziging van de padtabel: `docs/**` heeft besluit `agent` en schrijven vrij. Een PR die alleen `docs/app.md` raakt, kan de hoofdsessie dus mergen via `pnpm pr:merge`.

## Kopieer de vorm van

- `scripts/kit/app-init.mjs` — `appChangelog` en de rij voor `CHANGELOG.md` in `planAppInit`: een templatebestand dat van de app wordt.
- `scripts/kit/check-docs.mjs` — de app-regels van het app-bestand van de padtabel (`APP_TEMPLATE`) voor "in de template".
- `test/scripts/app-padtabel-merge.test.ts` — de template-update in tijdelijke repo's.
- `test/scripts/app-init-changelog.test.ts` — de test op een herschreven bestand.

## Hergebruik en UX

Geen schermen. De meldingen van `check-docs`, de stub en het skelet staan letterlijk in het Ontwerp. `app:init --dry-run` noemt `docs/app.md` in zijn lijst, in dezelfde vorm als de andere bestanden.

## Acceptatiecriteria

- **app-agentregels/AC-1** — `planAppInit` op een templatekopie levert een rij voor `docs/app.md` met precies het skelet uit het Ontwerp en `<App-naam>` vervangen door de opgegeven naam; `--dry-run` noemt het pad en schrijft niets.
- **app-agentregels/AC-2** — check-docs in de template: met de stub groen; met één gewijzigd teken in `docs/app.md` rood met "wijkt af van de stub"; `docs/app.md` in de repo zelf is byte-gelijk aan `APP_STUB`.
- **app-agentregels/AC-3** — check-docs in een app (zonder `onderhoud`): het skelet uit AC-1 en een ingevuld bestand zijn groen; zonder `docs/app.md` en met `@docs/app.md` in `CLAUDE.md` rood met "ontbreekt"; zonder beide groen.
- **app-agentregels/AC-4** — In een tijdelijke app-repo die begint met de uitvoer van `app:init` en waarin `docs/app.md` daarna is ingevuld: de template wijzigt `CLAUDE.md`, `AGENTS.md` en een bestand onder `.claude/rules/`, en de app doet `git merge template/main`; er is geen conflict, `docs/app.md` is ongewijzigd en de drie templatebestanden hebben de nieuwe inhoud.
- **app-agentregels/AC-5** — `CLAUDE.md` heeft de regel `@docs/app.md` buiten een codeblok, en `pnpm leespad` telt de bytes van `docs/app.md` mee in "nieuwe-feature" en "lichte-fix" en niet in "review"; een `docs/app.md` van 61 regels geeft tegenover een basis met hooguit 60 regels de melding `let op: app: docs/app.md 61 regels, nieuw boven de streefwaarde 60 regels` en exit 0, een van 60 regels geeft die niet.
- **app-agentregels/AC-6** — `feiten.mjs pad docs/app.md` geeft `schrijven vrij` en `besluit agent`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| De template | de stub laadt in elke sessie (drie regels) | n.v.t. |
| Bestaande app met de stub | geen melding; `app:init` draait daar niet meer, dus de hoofdsessie schrijft het skelet uit `appAgentregels()` | n.v.t. |
| De template moet de stub toch wijzigen | elke app krijgt eenmalig een conflict op `docs/app.md`; herstel: de versie van de app houden (`docs/nieuwe-app.md`); in de template moet `APP_STUB` in dezelfde PR mee | n.v.t. |
| Runtime die `@`-imports niet volgt | laadt het bestand niet; R-DOC-11 zegt waar het staat | n.v.t. |
| `docs/app.md` noemt `feiten.mjs` | telt mee als feiten-aanroep van het scenario, net als de andere leespadbestanden; een onherkende aanroep maakt het totaal onbekend, zoals nu | n.v.t. |
| Explore- en Plan-subagents | krijgen `CLAUDE.md` niet en dit bestand dus ook niet (gedrag van Claude Code) | n.v.t. |

## Raakt ook

- Geen risicowerk en niet kritiek (`feiten.mjs pad`: de geraakte paden zijn hooguit `voorReview` met besluit `eigenaar`). Wel beschermde paden: `CLAUDE.md`, `docs/framework.md`, `docs/nieuwe-app.md`, `scripts/kit/check-docs.mjs`, `scripts/kit/app-init.mjs`; de eigenaar keurt de PR goed.
- `CLAUDE.md` wijzigt alleen met de importregel; `AGENTS.md` staat niet in de diff (de reviewer toetst dat). `CLAUDE.md` staat ook in de open PR's #768 en #770, op andere regels.
- Code: `scripts/kit/app-init.mjs`, `scripts/kit/check-docs.mjs`, `scripts/kit/leespad.mjs`.
- Docs: `docs/app.md` (nieuw, de stub), `docs/framework.md` (R-DOC-11 nieuw, R-DOC-01), `docs/nieuwe-app.md`, `docs/template-changelog.md`.
- Bestaande tests (R-TEST-02, met reden in de PR): `test/scripts/app-init.test.ts`, `test/scripts/app-init-changelog.test.ts` en `test/scripts/app-init-template.test.ts` leggen de volledige lijst van `planAppInit` vast en krijgen de rij; tests die de lijst of de bytes van een leespadscenario vastleggen (`test/rails/leesbudget*.test.ts`, `test/rails/meting-*-leespad.test.ts`) krijgen het bestand.

## Buiten scope

- Een eigen padregel van een app onder `.claude/rules/`: pas bij een app die het nodig heeft.
- Een wijzer in `AGENTS.md` voor andere runtimes: `AGENTS.md` zit op 93 % van zijn grens en wat erbij komt moet er netto uit (R-DOC-06); geen gebruikte runtime mist het bestand.
- Een check op normwoorden in `docs/app.md`, of een check die eist dat een app het skelet heeft ingevuld: eerst zien wat een app erin zet (de proef-app).
- Templatestatus uit `AGENTS.md` halen: PR #770.

## Testplan

- Unit: AC-1 tegen `planAppInit` en de CLI in `test/scripts/app-agentregels-init.test.ts`; AC-2 en AC-3 met fixture-mappen in `test/rails/check-docs-app-agentregels.test.ts`; AC-4 met tijdelijke git-repo's in `test/scripts/app-agentregels-merge.test.ts`; AC-5 in `test/rails/app-agentregels-leespad.test.ts`; AC-6 in `test/scripts/app-agentregels-feiten.test.ts`. In AC-4 heeft de app-geschiedenis de templatecommit met de stub als voorouder, zoals na de koppeling.
- R-DOC-11 en R-DOC-01 in het regelboek: de reviewer toetst de tekst (R-WERK-15); geen test op doctekst.
- Regressie, geen eigen criterium: de verplichte job `check:new-resource` draait `app:init` met het skelet en daarna `gate:fast` (`scripts/kit/draai-proef.mjs`).
- Volgorde: geen risicowerk, dus de developer schrijft eerst de tests.

## Open vragen

- **OV-1 ✅ besloten** — Vorm van de app-laag: één app-eigen bestand dat altijd laadt, naast de gedeelde `CLAUDE.md` (eigenaar, vraagprompt 2026-11-17).
- **OV-2 ✅ besloten** — Omvang: alleen meten tegen 60 regels, geen harde grens (eigenaar, vraagprompt 2026-11-17).
- **OV-3 ✅ besloten** — De agent mag een wijziging zelf mergen; daarom `docs/app.md` met een import in plaats van een bestand onder `.claude/` (eigenaar, vraagprompt 2026-11-17).
