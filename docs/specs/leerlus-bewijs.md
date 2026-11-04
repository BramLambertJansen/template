---
status: goedgekeurd
namespace: leerlus-bewijs
---

# Leerlus met bewijs (stap 2)

## Doel

Een leerpunt gaat pas dicht met bewijs dat de les blijft hangen, en elk leerpunt-issue klopt met het sjabloon, wie of wat het
ook aanmaakte. Besluit: [ADR 0078](../adr/0078-leerlus-met-bewijs.md); stap 1 is [leerlus](leerlus.md).

**Toets aan framework §1.** Aanleiding: herbeoordeling van 4 november 2026. Nulmeting op main `30cc352`: 34 gesloten
leerpunten, 0 met getoetst sluitbewijs; 4 van 40 issues zonder sjabloon; 16 van 40 aangemaakt buiten het rolhek (MCP en Codex);
fixes die zelf een nieuw leerpunt opleverden: #424 → #432, #411 → #444, #317 → #334.

Dit is kritiek werk (elk ADR, `.github/`, skills; R-WERK-05): deze besluit-PR bevat ADR en spec; de bouw volgt in een eigen PR
zodra deze op main staat.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| hoofdsessie | schrijft de sectie `## Leerpunt` in een PR die een leerpunt sluit; dient leerpunten in via `gh` of, in de cloud, via de MCP-tool voor issues | via MCP iets anders schrijven dan een leerpunt-issue in de template-repo |
| reviewer | toetst bij `geen test: <reden>` of de reden klopt, en meldt dat als bevinding | iets indienen of sluiten (ongewijzigd) |
| CI-job `leerpunt-bewijs` | draait het bewijsbestand tegen basis en head | iets schrijven |
| workflow `leerpunt-check` | zet of haalt de labels `leerpunt-onvolledig` en `leerpunt-zonder-bewijs` weg, met één comment | sluiten, heropenen, de body bewerken |
| eigenaar | maakt de twee labels aan, zet het workflowbestand (GitHub App heeft geen `workflows`-recht), merget PR's met `geen test` | — |

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen HTTP-route.

## Kopieer de vorm van

n.v.t. voor `docs/gouden-pad.md` (geen resource); railwerk volgt bestaande vormen:

- `.github/workflows/guard.yml` — job `agent-merge` als verplichte job met eigen script onder `scripts/kit/`, `permissions: read-all`
- `test/rails/leerpunt-sjabloon.test.ts` — sjabloon regelgebaseerd lezen zonder YAML-dependency; de nieuwe body-parser hergebruikt die lezer
- `scripts/kit/kooi.mjs` — wie code van de basis uitcheckt naast de werkmap, doet dat in een eigen tijdelijke map

## Hergebruik en UX

- Bestaande onderdelen: issue form `leerpunt.yml` als enige bron van koppen en keuzes; `gh` in CI met `GITHUB_TOKEN`; vitest.
  Geen nieuwe dependency.
- Sectie in de PR-beschrijving, letterlijk, één blok per gesloten leerpunt:

  ```text
  ## Leerpunt

  - #<nr>: trede <Type|Check|Gouden pad of generator|Skill|Padregel|AGENTS.md>; bewijs <testpad>
  - #<nr>: trede <Skill|Padregel|AGENTS.md>; bewijs geen test: <reden>
  ```

- Comment van de workflow bij `leerpunt-onvolledig`, letterlijk de eerste regel: `Dit leerpunt volgt het sjabloon niet:`,
  daarna per fout één regel (`ontbreekt: <kop>`, `leeg: <kop>`, `onbekende waarde bij <kop>: <waarde>`, `volgorde: <kop>`).
- Comment bij `leerpunt-zonder-bewijs`, letterlijk: `Gesloten zonder sluitbewijs (ADR 0078): geen gemergde PR met een sectie Leerpunt voor dit issue en geen comment "achterhaald: <reden>".`
- De workflow schrijft per issue hooguit één comment per soort; bij een volgende fout werkt hij die comment bij.
- Focusvolgorde en toetsenbord: n.v.t. — geen eigen UI.

## Acceptatiecriteria

- **leerlus-bewijs/AC-1** — Een PR waarvan de beschrijving `Fixes|Closes|Resolves #n` bevat voor een issue met label
  `leerpunt`, zonder regel `- #n:` in de sectie `## Leerpunt`, maakt de job `leerpunt-bewijs` rood met de melding welk nummer
  ontbreekt. Een PR zonder zo'n verwijzing laat de job slagen zonder iets te draaien.
- **leerlus-bewijs/AC-2** — Bij `bewijs <testpad>`: het pad moet in de diff van de PR staan als toegevoegd of gewijzigd
  `*.test.ts(x)`-bestand buiten `*.int.test.ts` en `e2e/`. Anders rood.
- **leerlus-bewijs/AC-3** — Het bewijsbestand draait in een tijdelijke kopie van de basis (merge-base) met alleen dat bestand
  uit de head en moet daar falen; het draait op de head en moet slagen. Slaagt het op de basis, of faalt het op de head, dan
  rood met beide uitslagen. Een fixture: een PR-kopie waarin de test ook op de basis slaagt, maakt de job rood.
- **leerlus-bewijs/AC-4** — `geen test: <reden>` is alleen geldig bij trede Skill, Padregel of AGENTS.md, of bij een
  integratie- of e2e-test, met een niet-lege reden; dan slaagt de job en geeft het oordeel agent-merge `nee` met reden
  `leerpunt zonder test`. Bij een andere trede of lege reden: rood.
- **leerlus-bewijs/AC-5** — De workflow `leerpunt-check` op `issues` (opened, edited, labeled) toetst een issue met label
  `leerpunt` tegen `leerpunt.yml`: elke kop aanwezig en in volgorde, verplichte velden niet leeg (`_No response_` telt als leeg),
  `Soort` en `Voorstel voor de plek` exact een optie. Bij fouten: label `leerpunt-onvolledig` en de comment uit "Hergebruik en UX";
  zonder fouten: label weg. Tabeltest per fout met echte bodies, ook #424, #487, #500 en #504 als vorm.
- **leerlus-bewijs/AC-6** — Bij `closed` op een leerpunt: zonder gemergde PR die het issue sluit en een sectie `## Leerpunt` met
  dat nummer heeft, en zonder comment die begint met `achterhaald:`, zet de workflow `leerpunt-zonder-bewijs` met de comment.
  Bij heropenen haalt hij het label weg.
- **leerlus-bewijs/AC-7** — De workflow heeft `permissions: issues: write` en verder niets; een test leest het bestand en faalt
  bij elk ander recht en bij elke aanroep die sluit, heropent of de body bewerkt.
- **leerlus-bewijs/AC-8** — De skill `opleveren` stap 8 noemt de MCP-schrijfweg voor de cloud (alleen template-repo, label
  `leerpunt`, dezelfde body) en de sectie `## Leerpunt`; `.github/pull_request_template.md` heeft de sectie `## Leerpunt` met de
  regelvorm. `docs/framework.md` R-SEC-09 en R-WERK-13 noemen de uitzondering en het sluitbewijs met ADR 0078.
- **leerlus-bewijs/AC-9** — De voorsortering staat als prompt in `docs/operations/leerpunten-voorsorteren.md`, zonder
  verwijzing naar een uitbreidingsstop, en noemt de labels `leerpunt-onvolledig` en `leerpunt-zonder-bewijs` als eigen bak.
- **leerlus-bewijs/AC-10** — Spec `leerlus.md` krijgt `status: gebouwd # #312`; het ST-09-protocol telt "opgepakt" als
  gesloten met sluitbewijs of achterhaald (ADR 0078 punt 6).

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| PR sluit twee leerpunten | Twee regels in `## Leerpunt`; elk bewijs apart getoetst | n.v.t. |
| Eén test bewijst twee leerpunten | Hetzelfde pad op twee regels mag | n.v.t. |
| Bewijstest heeft een nieuwe helper nodig die op de basis niet bestaat | Op de basis faalt hij dan op de import: telt als rood, dus geldig; de reviewer let erop dat de test het gedrag toetst | n.v.t. |
| Basis kan het testbestand niet laden door een gewijzigde configuratie | Telt als rood op de basis; melding met de uitvoer | n.v.t. |
| Issue zonder label `leerpunt` | Workflow en job doen niets | n.v.t. |
| Issue in een app-repo (via template-merge) | Workflow draait alleen als `github.repository` gelijk is aan `onderhoud.repository` | n.v.t. |
| Body door GitHub-formulier ingevuld | Zelfde koppen; `_No response_` bij `eerder` is goed | n.v.t. |
| Leerpunt gesloten vóór de bouw | Niet opnieuw beoordeeld (ADR 0078, Gevolgen) | n.v.t. |
| Fork-PR of ontbrekend token | Job rood met "geen toegang tot issuelabels"; de eigenaar beoordeelt | n.v.t. |

## Raakt ook

- Nieuw: `scripts/kit/leerpunt-bewijs.mjs`, `scripts/kit/leerpunt-check.mjs` (gedeelde sjabloonlezer), job in
  `.github/workflows/guard.yml`, workflow `.github/workflows/leerpunt.yml`, `docs/operations/leerpunten-voorsorteren.md`.
- Gewijzigd: `.claude/skills/opleveren/SKILL.md`, `.github/pull_request_template.md`, `docs/framework.md` (R-SEC-09, R-WERK-13),
  `docs/operations/st-09-praktijkproef.md`, `scripts/kit/lane.mjs` of de agent-merge-uitslag (AC-4), `docs/specs/leerlus.md`.
- Verplichte check: `leerpunt-bewijs` in de ruleset (`scripts/github-ruleset.sh`) en `requiredChecks`.
- Na de merge: de routine "Leerpunten voorsorteren" verwijst naar het bestand uit AC-9.

## Buiten scope

Herhalingen en clusters in de voorsortering (voorstel V3) en meting uit GitHub voor kosten (V4): later, apart. Bestaande
gesloten leerpunten opnieuw beoordelen. De workflow laten sluiten of heropenen. Een privé kanaal voor railgaten (ADR 0078 punt 7).

## Testplan

Fase 1. De tester schrijft vóór de bouw, rood op asserties:

- `test/scripts/leerpunt-bewijs.test.ts` — AC-1 t/m AC-4 met PR-beschrijvingen en diffs als tabel; AC-3 met een fixture-repo
  in een tijdelijke map: één test die op de basis faalt (geldig), één die op beide slaagt (rood).
- `test/scripts/leerpunt-check.test.ts` — AC-5 en AC-6 met echte issuebodies als tabel.
- `test/rails/leerpunt-workflow.test.ts` — AC-7.
- `test/rails/opleveren-skill.test.ts` en `test/rails/leerpunt-sjabloon.test.ts` uitbreiden (toevoegen) — AC-8 t/m AC-10.

Handmatig na de merge: één proefleerpunt met een lege kop indienen en zien dat het label en de comment komen; daarna sluiten
als achterhaald.

## Open vragen

- **OV-1 ✅ besloten** — V1, V2 en V5 samen; openbare leerpunten zijn prima (eigenaar, 4 november 2026).
- **OV-2** — Draait het bewijs op de basis in `guard.yml` of in een eigen workflow? Aanbeveling: een job in `guard.yml`, naast
  `agent-merge`, omdat die al de PR-beschrijving en diff leest.
- **OV-3** — Mag `achterhaald:` ook van een agent komen? Aanbeveling: ja, met verwijzing naar het bestand of de PR die het
  overbodig maakte; de voorsortering toont deze sluitingen zodat de eigenaar ze ziet.
