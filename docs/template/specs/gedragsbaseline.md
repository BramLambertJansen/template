---
status: goedgekeurd # architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046)
namespace: gedragsbaseline
---

# Gedragsbaseline als sluitbewijs voor teksttreden

## Doel

Een PR die een leerpunt sluit met trede Skill, Padregel of `AGENTS.md` bewijst de tekstfix met een gedragsbaseline (drie
runs zonder, drie met), of met `geen baseline: <reden>`; de job `leerpunt-bewijs` toetst daarvan de vorm. Besluit:
[ADR 0107](../adr/0107-gedragsbaseline-voor-tekstwijzigingen.md); bouwt voort op [leerlus-bewijs](leerlus-bewijs.md) en
[leerlus-herzien](leerlus-herzien.md) (`meting:`).

Kritiek werk (`.github/`, skill, regelboek; R-WERK-05): in de template één PR, de eigenaar keurt goed en merget.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| hoofdsessie | legt het scenario vast vóór de eerste run, draait de zes runs als ad-hoc subagent (alleen lezen, R-ROL-02), schrijft regel en blok in `## Leerpunt` | de PR zelf mergen; transcripten in repo of meetopslag zetten |
| run (subagent) | voert de opdracht uit het recept uit op de meegegeven tekst | schrijven, committen, pushen |
| CI-job `leerpunt-bewijs` | toetst alleen de vorm van `baseline:`, `geen baseline:` en het scenarioblok; draait dan geen test | iets schrijven (ongewijzigd) |
| eigenaar | toetst of de runs echt gedraaid zijn en merget, zoals bij `geen test:` en `meting:` | — |

## Kopieer de vorm van

- `scripts/kit/leerpunt.mjs` — `METING`/`metingFout`: een regex voor de vorm, één fout per regel, een eigen veld in `Regel`;
  de normalisatie van `onderbouwingFouten` (`- `, `* `, `1. `, `**`) voor de labels in het scenarioblok
- `test/rails/leerlus-herzien.test.ts` — structuurtest op skill en PR-sjabloon (regelvorm, koppen), geen hele zinnen

## Hergebruik en UX

- Bestaande onderdelen: `leesLeerpuntSectie`, `regelFout`, `bewijsPlan`, `sluitOordeel`, `diffPaden`, de job `leerpunt-bewijs`.
  Geen nieuwe workflow, nieuw secret, nieuwe dependency of API-sleutel (ADR 0107 punt 6).
- `ZONDER_TEST` wordt `TEKSTTREDEN` (`['Skill', 'Padregel', 'AGENTS.md']`). `TEKSTPADEN` is `['.claude/agents/',
  '.claude/skills/', '.claude/rules/']` plus de exacte paden `AGENTS.md` en `CLAUDE.md`.
- Regelvorm in `## Leerpunt`, letterlijk (`<a>` is het aantal ja zonder de wijziging, 0–2):
  ```text
  - #<nr>: trede <Skill|Padregel|AGENTS.md>; bewijs baseline: zonder <a>/3, met 3/3 (<model>)
  - #<nr>: trede <Skill|Padregel|AGENTS.md>; bewijs geen baseline: <reden>
  ```
  Na `REGEL` en het weghalen van backticks: `^baseline:\s*(.*)$` → `baseline`, `^geen baseline:\s*(.*)$` → `geenBaseline`
  (allebei `string | null` in `Regel`; `pad` is dan null). Vorm van `baseline`:
  `BASELINE = /^zonder\s+([0-3])\/3,\s*met\s+([0-3])\/3\s*\(\s*(\S[^()]*?)\s*\)$/`.
- Scenarioblok, binnen `## Leerpunt` onder de regels. De kop is `^###\s+Scenario\s+#(\d+)\s*$`; het blok loopt tot de volgende
  regel die past op `^#{1,3}\s`. Per regel worden eerst de voorvoegsels `- `, `* ` en een genummerd `\d+\. ` en de `**`
  weggehaald, zoals `onderbouwingFouten` doet.
  - Labelregels `Prompt:`, `Beginstand:` en `Criterium:`. De waarde is de rest van de regel plus de volgende regels tot het
    volgende label of de eerste runregel; na trim mag die niet leeg zijn.
  - Runregel: `^(zonder|met)\s+([1-3]):\s*(ja|nee)\s*[—–-]\s*\S.*$` (hoofdletterongevoelig), precies één voor elk van
    zonder 1–3 en met 1–3.
  ```text
  ### Scenario #<nr>
  - Prompt: <letterlijke opdracht>
  - Beginstand: <sha merge-base>; <stappen>
  - Criterium: <ja als …, anders nee>
  - zonder 1: nee — <één zin>
  - zonder 2: ja — <één zin>
  - zonder 3: nee — <één zin>
  - met 1: ja — <één zin>
  - met 2: ja — <één zin>
  - met 3: ja — <één zin>
  ```
- Foutmeldingen van de job, letterlijk (`<nr>` is het issuenummer, `<t>` de trede):
  - `#<nr>: "baseline:" hoort alleen bij trede Skill, Padregel of AGENTS.md`
  - `#<nr>: "geen baseline:" hoort alleen bij trede Skill, Padregel of AGENTS.md`
  - `#<nr>: "geen baseline" zonder reden`
  - `#<nr>: baseline "<tekst>" heeft niet de vorm zonder <a>/3, met 3/3 (<model>)`
  - `#<nr>: met <b>/3: alle drie runs met de wijziging moeten ja geven`
  - `#<nr>: zonder 3/3: het scenario reproduceert niet; wijzig de tekst niet, de eigenaar beslist over het leerpunt`
  - `#<nr>: geen pad onder .claude/agents/, .claude/skills/, .claude/rules/, AGENTS.md of CLAUDE.md toegevoegd of gewijzigd in de diff`
  - `#<nr>: geen blok "### Scenario #<nr>" in de sectie ## Leerpunt`
  - `#<nr>: scenario zonder <Prompt|Beginstand|Criterium>` (één fout per ontbrekend of leeg label)
  - `#<nr>: scenario heeft niet precies één runregel voor zonder 1-3 en met 1-3`
  - `#<nr>: runregels geven zonder <x>/3, met <y>/3; de bewijsregel zegt zonder <a>/3, met <b>/3`
  - `#<nr>: bij trede <t> is het bewijs "baseline: …" of "geen baseline: <reden>", geen testpad`
  - `#<nr>: bij trede <t> is het bewijs "baseline: …" of "geen baseline: <reden>", geen "geen test:"` (besluit eigenaar
    2026-11-22, OV-1)
- Volgorde van de toets, met hooguit één fout per leerpunt: eerst onbekende trede, dan de trede (`baseline:` of
  `geen baseline:` bij een andere trede), dan de vorm, dan `met`, dan `zonder`, dan de diff (in `regelFout`). Daarna het
  scenarioblok, in `bewijsPlan` uit `body`: eerst de kop, dan de labels, dan de runregels, dan de tellingen.
- Opdrachttekst voor één run in `docs/operations/gedragsbaseline.md`, letterlijk:
  ```text
  Je bent één run van een gedragsbaseline (ADR 0107). Alleen lezen: schrijf, commit of push niets.
  Beginstand: <sha> — <stappen>.
  Voor deze run geldt de tekst hieronder letterlijk; die vervangt <pad> zoals je sessie hem laadde.
  <<<
  <tekst>
  >>>
  Opdracht: <Prompt uit het scenario>
  Sluit af met een eindbericht van hooguit vijf regels: wat je doet en welke commando's je draait of zou draaien.
  ```
  Het recept noemt ook de stappen: het scenario vastleggen vóór de eerste run; drie runs op de oude tekst; dan de tekst
  wijzigen; dan drie runs op de nieuwe tekst. Alle zes runs met hetzelfde model. Alleen gedrag dat zichtbaar is in het
  eindbericht of in de commando's telt; gedrag dat schrijven vraagt, krijgt `geen baseline: <reden>`. Zegt de regel
  `zonder 3/3`, dan wijzigt de PR de tekst niet. Er gaat geen transcript mee.
- Focusvolgorde en toetsenbord: n.v.t. — geen eigen UI.

## Acceptatiecriteria

- **gedragsbaseline/AC-1** — Gegeven een sectie `## Leerpunt` met `bewijs baseline: zonder 1/3, met 3/3 (opus)` of `` bewijs `geen baseline: schrijfgedrag` ``, wanneer `leesLeerpuntSectie` die leest, dan heeft de regel `baseline` respectievelijk `geenBaseline` gevuld en zijn `pad`, `reden` en `meting` null. Toets: `test/scripts/leerpunt-bewijs.test.ts`
- **gedragsbaseline/AC-2** — Gegeven trede Skill, Padregel of AGENTS.md met een correcte regel (zonder 0/3, 1/3 of 2/3; met 3/3; model niet leeg), een volledig scenarioblok met tellingen die erbij passen en een gewijzigd pad uit `TEKSTPADEN` in de diff, wanneer `bewijsPlan` draait, dan is `fouten` leeg en `runs` leeg. Toets: `test/scripts/leerpunt-bewijs.test.ts`
- **gedragsbaseline/AC-3** — Gegeven verder het geval van AC-2, wanneer één ding afwijkt (trede Check; `met 2/3`; `zonder 3/3`; model leeg of een vorm zonder `/3`; een diff met alleen `src/a.ts`), dan bevat `fouten` de bijbehorende melding uit "Hergebruik en UX". Toets: `test/scripts/leerpunt-bewijs.test.ts`
- **gedragsbaseline/AC-4** — Gegeven verder het geval van AC-2, wanneer het blok `### Scenario #<nr>` ontbreekt of een ander nummer heeft, een label ontbreekt of leeg is, een runregel ontbreekt of dubbel staat, of de ja's niet passen bij de bewijsregel, dan bevat `fouten` de bijbehorende melding; een `###`-blok binnen de sectie beëindigt de regels van `## Leerpunt` niet (dat deel is al waar op de basis: regressie). Toets: `test/scripts/leerpunt-bewijs.test.ts`
- **gedragsbaseline/AC-5** — Gegeven `bewijs geen baseline: <reden>`, wanneer de trede Skill, Padregel of AGENTS.md is en de reden niet leeg, dan is de regel goed zonder eis aan diff of scenario, en draait er niets; bij trede Type, Check, Gouden pad of generator of Schrappen of vereenvoudigen, of bij een lege reden, is de regel fout. Bij een teksttrede zijn `geen test: <reden>` en een testpad altijd fout, met de melding uit "Hergebruik en UX" (OV-1). Toets: `test/scripts/leerpunt-bewijs.test.ts`
- **gedragsbaseline/AC-6** — Gegeven een gemergde PR met voor nummer n een regel `bewijs baseline: …` of `bewijs geen baseline: …`, wanneer `sluitOordeel(n, …)` draait, dan is de uitslag `bewijs` (regressietest). Toets: `test/scripts/leerpunt-check.test.ts`
- **gedragsbaseline/AC-7** — Gegeven de gebouwde tekst, wanneer de structuur gelezen wordt, dan staan beide regelvormen uit "Hergebruik en UX" en de kop `### Scenario #<nr>` in `.github/pull_request_template.md` en in stap 8 van `opleveren`, verwijst stap 8 naar `docs/operations/gedragsbaseline.md`, bevat dat recept de opdrachttekst met `<<<` en `>>>`, en noemt R-WERK-13 `baseline:` en `0107`; in het sjabloon en in stap 8 staat `geen test` niet meer bij Skill, Padregel of AGENTS.md, en de regel met `bewijs <testpad>` noemt alleen Type, Check en Gouden pad of generator. Toets: `test/rails/gedragsbaseline.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| PR haalt alleen een regelbestand weg (diff `D`) | `diffPaden` neemt geen verwijderde paden mee, dus de diff-fout volgt; bewijs dan `geen baseline: <reden>` | n.v.t. |
| Eén PR sluit twee teksttreden-leerpunten | Elk een eigen regel en een eigen blok `### Scenario #<nr>` | n.v.t. |
| Oude gemergde PR met `geen test:` bij trede Skill | `sluitOordeel` blijft `bewijs`: het kijkt alleen naar het nummer | n.v.t. |
| Tekstwijziging onder `.claude/` zonder leerpunt | Niets: de job toetst alleen gesloten leerpunten | n.v.t. |
| Alle runs zonder geven ja | `zonder 3/3` wordt geweigerd; de PR wijzigt de tekst niet en de eigenaar beslist over het leerpunt | n.v.t. |

## Raakt ook

- Beschermd (`feiten.mjs pad`):
  - `scripts/kit/leerpunt.mjs` (voorReview);
  - `.github/pull_request_template.md` (altijdVragen; besluit besluit-pr);
  - `.claude/skills/opleveren/SKILL.md` (voorReview; schrijven alleen met Edit door de hoofdsessie met akkoord van de eigenaar,
    want de sandbox kan het niet);
  - `docs/framework.md` R-WERK-13 (voorReview).
- Vrij: `docs/operations/gedragsbaseline.md` (nieuw; besluit eigenaar) en een fragment in `docs/template-changelog.d/`.
- `scripts/kit/leerpunt-bewijs.mjs`: geen wijziging verwacht. `plan` geeft de fouten van `bewijsPlan` al door, en een
  baseline levert geen run.
- Tests (gate): `test/scripts/leerpunt-bewijs.test.ts`. Drie rijen van leerlus-bewijs/AC-4 (`geen test` bij Skill, Padregel en
  AGENTS.md is goed) worden fout volgens ADR 0107, Gevolgen. Dat is een wijziging onder R-TEST-02, met de reden in de PR en
  een `GEWIJZIGD`-commentaar. Verder `test/scripts/leerpunt-check.test.ts` en `test/rails/gedragsbaseline.test.ts` (nieuw).
  `test/rails/leerlus-herzien.test.ts` (leerlus-herzien/AC-6) eist nu de regel `bewijs <testpad>` met de trede
  `<Type|Check|Gouden pad of generator|Skill|Padregel|AGENTS.md>`; de trede wordt `<Type|Check|Gouden pad of generator>`,
  ook een wijziging onder R-TEST-02 met reden in de PR.
- Tekst die door de bouw onwaar wordt en mee verandert: de sectie Leerpunt van `.github/pull_request_template.md` en stap 8
  van `opleveren` ("Bij Skill, Padregel, AGENTS.md …: `bewijs geen test: <reden>`"); in spec `leerlus-bewijs` de regelvorm
  met `geen test:` bij de drie treden en leerlus-bewijs/AC-4, dat de bouw-PR markeert als `Gewijzigd door ADR 0107 … Was:`;
  het commentaar in `scripts/kit/pr-merge.mjs` (r. 9: de eigenaar merget bij `geen test:` of `meting:`) noemt ook
  `baseline:` en `geen baseline:`.
- Geen migratie, route, permissie of resource: `check:migrations`, `check:secdef`, `test:db` en `test/security/resources.ts`
  worden niet geraakt.

## Buiten scope

Een evalharnas met betaalde runs of headless runs in CI (ADR 0107 punt 8, na ST-09). Toetsen of runs echt gedraaid zijn (dat
doet de eigenaar). Transcripten opslaan. Een tekstwijziging zonder leerpunt.

## Testplan

Eerst de tests, rood op asserties op de basis: AC-1 tot en met AC-5 als tabellen in `test/scripts/leerpunt-bewijs.test.ts`,
AC-6 in `test/scripts/leerpunt-check.test.ts` (al groen op de basis; regressie), AC-7 in `test/rails/gedragsbaseline.test.ts`.
Daarna de code en de tekst. Handmatig na de merge: het eerstvolgende gedragsleerpunt sluit met een echte baseline. De
eigenaar ziet het blok en de groene job.

## Open vragen

- **OV-1** — Weigert de job bij een teksttrede een testpad of `geen test:`? ✅ Besloten door de eigenaar (2026-11-22): ja,
  alleen `baseline:` of `geen baseline: <reden>` (ADR 0107 Besluit 1 en Gevolgen). AC-5.
- **OV-1b** — Eist `geen baseline: <reden>` een tekstpad in de diff? ✅ Besloten door de eigenaar (2026-11-22): nee, alleen
  een niet-lege reden; zo kan ook een PR die alleen tekst verwijdert sluiten (randgeval "alleen een regelbestand weg").
- **OV-2** — Toetst de job ook de zes runregels en of hun tellingen passen bij de bewijsregel? Punt 5 schrijft per run één
  regel voor; punt 7 noemt alleen "de drie regels niet leeg". Aanbeveling: wel toetsen (AC-4). Het blijft een vormtoets en
  vangt tikfouten in de tellingen.
- **OV-3** — Moet `Beginstand:` een SHA bevatten (`[0-9a-f]{7,40}`)? Aanbeveling: nee, alleen niet leeg, zoals punt 7 het
  zegt. De eigenaar toetst de inhoud.
