---
status: goedgekeurd
namespace: meting-stuurt
---

# Meting die stuurt: verschil met de basis, echt leespad, herijken met trigger

## Doel

Meldingen van de meting gaan alleen af bij verandering en staan op de PR, het leespad telt wat een agent verplicht leest, en herijken gebeurt bij het sluiten van een fase ([ADR 0070](../adr/0070-meting-die-stuurt.md)). Aanleiding: bevindingen L5, L6 en L7 van de review van main op 2 november 2026.

## Rollen en wie wat ziet

n.v.t. — `pnpm leespad`, `pnpm meting --trend`, `feiten.mjs`, `check:roadmap`, `ratchet` en de CI-job `gate:fast`; geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `scripts/kit/leespad.mjs` — `--ref` (meting uit een git-ref) voor de meting van de basis
- `scripts/kit/check-roadmap.mjs` — de basis als `git merge-base origin/main HEAD`, en de foutmelding met `::error::` in CI
- `scripts/kit/meting-trend.mjs` — `trend()` (gemiddelde laatste tien tegen de tien daarvoor) en `getal()` (afronden op twee decimalen)
- `scripts/kit/feiten.mjs` — `--alle` bij `adr` (standaard kort, volledig op verzoek)

## Hergebruik en UX

n.v.t. — geen UI. Meldingen zijn Nederlands en beginnen met "let op:" of noemen de check, zoals nu.

## Acceptatiecriteria

- **meting-stuurt/AC-1** — `pnpm leespad` meet ook de basis: standaard `git merge-base origin/main HEAD`, met `--basis <ref>` een andere. `--ref` kiest zoals nu de gemeten boom; `--ref` en `--basis` gaan samen. De basis wordt gemeten met de huidige code van `leespad` en `feiten` op de bestanden van de basis, gelezen met `git show` (zoals `--ref`); er komt geen worktree en `leespad` schrijft niets. Een scenario krijgt "let op" alleen als het minstens 1 KB groter is dan op de basis (OV-3). Een soort krijgt "let op" alleen als een eenheid boven de streefwaarde staat die op de basis niet erboven stond, of een eenheid boven de streefwaarde groeide; de vergelijking gaat per eenheid op naam. Een gelijk gebleven of gedaalde overschrijding staat er zonder "let op" ("N erboven, gelijk aan de basis" of "N erboven, was M"). De meldingen vanaf 85 % van een harde grens (`grensMeldingen`) blijven zoals nu, zonder vergelijking. Is de basis niet te meten, dan meldt `leespad` dat in één regel en meet het zonder vergelijking. De exitcode blijft 0, behalve bij een ongeldige `--ref` of `--basis` die de gebruiker zelf meegaf: dan exit 1, zoals nu bij `--ref`.
- **meting-stuurt/AC-2** — `pnpm meting --trend` meldt "let op: <maat> steeg" alleen als het gemiddelde over de laatste tien, op twee decimalen afgerond en in honderdsten vergeleken (`Math.round(x * 100)`), minstens 0,5 hoger ligt dan dat over de tien daarvoor (ook afgerond) en, als dat vorige gemiddelde groter is dan 0, ook minstens 25 % hoger. Geen melding bij vorige 1,0 → laatste 1,2 en bij vorige 0,0 → laatste 0,1; wel bij 1,0 → 1,5, bij 0,0 → 0,5 en bij 0,7 → 1,2.
- **meting-stuurt/AC-3** — Is `$GITHUB_STEP_SUMMARY` gezet, dan schrijven `ratchet.mjs` (zijn meldingen) en `leespad.mjs` (zijn uitvoer tegen de basis) die er zelf naartoe, ook als de gate rood is. De job `gate:fast` in `.github/workflows/ci.yml` draait `pnpm leespad` in een eigen stap met `if: always()`. De workflow krijgt geen extra rechten. In `.claude/skills/opleveren/SKILL.md` zet de stap met de trend (sectie "CI-lus tot groen") ook de "let op"-regels van `pnpm leespad` in de PR-beschrijving; `allowed-tools` krijgt `Bash(pnpm leespad)` en `Bash(pnpm leespad *)`, en het rolhek laat de reviewer `--basis` lezen (`REVIEWER_READS`), net als `--ref`.
- **meting-stuurt/AC-4** — `pnpm leespad` leidt de `feiten.mjs`-aanroepen per scenario af uit de bestanden van dat scenario: elke injectie ``!`node scripts/kit/feiten.mjs <secties>` `` en de eerste aanroep tussen backticks van de vorm `` `node scripts/kit/feiten.mjs <secties> [--alle]` `` in een regel die begint met "1. Begin met de feiten" (agentbestanden) of "- Begin met taakrelevante feiten" (`AGENTS.md`). `hoofdstuk <n>` telt niet (het regelboek telt al via `docs/framework.md`), net als een kale `feiten.mjs …` zonder `node scripts/kit/`; `--alle` in een aanroep telt de uitvoer met `--alle`. De secties van alle aanroepen samen tellen één keer, met de bytes van één aanroep van `feiten.mjs` met die secties. Bij schrijven geeft dat: `nieuwe-feature` `gates specs fase adr routes permissies foutcodes`, `lichte-fix` `gates specs fase routes permissies foutcodes`, `review` `gates specs fase`. `nieuwe-feature` telt ook de padregels `.claude/rules/api.md`, `web.md` en `database.md` (een app-feature; `core.md` laadt alleen bij templatewerk). De uitvoer noemt per scenario welk deel uit bestanden, feiten-uitvoer en padregels komt. Faalt `feiten.mjs`, dan is dat deel "onbekend" met de reden, nooit 0 bytes, en vervalt de vergelijking voor dat scenario. Een test faalt als een scenariobestand een aanroep in die vormen bevat die `leespad` niet telt. Bekende ondertelling: de spec-review van de reviewer vraagt ook `routes permissies foutcodes`, buiten zijn stap 1.
- **meting-stuurt/AC-5** — `feiten.mjs specs` toont alleen specs op `voorstel` en `goedgekeurd`, daarna één regel met het aantal per andere status en de verwijzing naar `--alle` en `docs/specs/`. `feiten.mjs adr` toont de ADR's op `voorgesteld` en de tien geaccepteerde met het hoogste nummer, daarna één regel met het aantal overige en de verwijzing naar `--alle`. `feiten.mjs fase` toont alle open items onder "Nu", de eerste vijf onder "Volgende" in bestandsvolgorde, en daarna één regel met het aantal overige en de verwijzing naar `--alle`. Met `--alle` tonen alle drie de volledige lijst, zoals nu. `.claude/agents/architect.md` en `.claude/skills/spec/SKILL.md` zeggen dat een passende spec zoeken met `feiten.mjs specs --alle` of in `docs/specs/` gaat, op aanvraag, buiten stap 1 en niet als injectie. `adr --alle` is niet langer "alleen voor historie" maar ook om een geldig ADR buiten de tien te vinden: `CLAUDE.md`, R-WERK-01 in `docs/framework.md`, `AGENTS.md` en `architect.md` zeggen dat. `specs`, `adr` en `fase` worden pure functies over een lezer (voor `adr` de status uit de bestanden, niet uit de git-geschiedenis), zodat `leespad` en AC-6 ze op elke boom kunnen draaien.
- **meting-stuurt/AC-6** — Een test meet met een lezer (zonder repo-kopie) het leespad van elk scenario op de huidige bestanden en op dezelfde bestanden plus 200 extra specs (100 `gebouwd`, 100 `vervallen`), 50 extra geaccepteerde ADR's en 50 extra open items onder "Volgende". Het verschil is per scenario hoogstens 1 KB.
- **meting-stuurt/AC-7** — `pnpm check:roadmap` bepaalt per fase de open items van de basis (`git merge-base origin/main HEAD`) en van de werkmap. Open is een `- [ ]`-item onder `## Nu` of `## Volgende`. De fase komt uit de eerste regel van het item, via dezelfde functie als `feiten.mjs fase` (`faseVan`, geëxporteerd), gegroepeerd op fasenummer. `faseVan` verandert: "uit fase N" geeft geen fase, en `doorlopend` geeft geen fase en wint van een fasenummer; een kale `stuk X` blijft fase 1. Dat verandert ook `feiten.mjs fase`. Had een fase op de basis minstens één open item en in de werkmap geen (afvinken, parkeren of verhuizen), dan eist de check onder de kop die begint met `### Fase <n>` in `docs/roadmap-archief.md` (ontbreekt die kop, dan mag de PR hem toevoegen) een nieuwe regel die begint met `Herijking fase <n>:`, met een ISO-datum, `leespad` met minstens één getal in KB, en `trend`. Ontbreekt die, dan faalt de check met een melding die de fase en R-DOC-08 noemt. Items zonder fase en items "doorlopend" tellen niet. Een nieuw open item onder `## Nu` of `## Volgende` (nieuw zoals bij R4: eerste regel niet op de basis, dus ook een gewijzigde eerste regel) noemt een fase (`fase N` of `stuk X`) of `doorlopend`; bestaande items houden hun tekst. Zonder basis faalt de check zoals nu, lokaal en in CI.
- **meting-stuurt/AC-8** — `docs/specs/leesbudget.md` AC-7 noemt de lijst via REST (één `gh api …/pulls?state=closed`, de twintig nieuwste op `merged_at`) in plaats van `gh pr list`, "meet nooit meer dan twintig PR's" in plaats van "leest", en verwijst voor de drempel naar meting-stuurt/AC-2. De commit met die spec-wijziging komt vóór de eerste code van de bouw-PR.
- **meting-stuurt/AC-9** — R-DOC-08 noemt de trigger (`check:roadmap` bij het sluiten van een fase) en dat "let op" een verschil met de basis is. `docs/operations/agent-doorloop.md` beschrijft de vergelijking met de basis, de afgeleide feiten-aanroepen en de plafonds van `feiten.mjs`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Basis niet te meten (geen `origin/main` of geen merge-base) | `leespad`: één regel, meet zonder vergelijking, exit 0 | n.v.t. |
| `check:roadmap` zonder basis | Faalt zoals nu, lokaal en in CI | n.v.t. |
| `feiten.mjs` faalt bij het meten | Dat deel "onbekend" met reden; geen vergelijking voor dat scenario | n.v.t. |
| Trend met "onbekend" in een van beide helften | Geen melding voor die maat, zoals nu | n.v.t. |
| PR sluit twee fases tegelijk | Een herijkingsregel per fase | n.v.t. |
| Item heropend na een herijking | Geen nieuwe eis tot de fase weer sluit | n.v.t. |
| Eerste bouw-PR meet tegen een basis zonder plafond | Toont de daling; geen "let op" | n.v.t. |

## Raakt ook

`docs/framework.md` (R-DOC-08), `docs/adr/0065-grenzen-als-meting.md` blijft ongewijzigd (ADR 0070 wijzigt punt 2 en 4; een ADR wordt niet herschreven), `.claude/skills/opleveren/SKILL.md` (stap en `allowed-tools`), het rolhek (`REVIEWER_READS` in `rails/hooks/lib/rolhek.mjs`, `--basis`), `CLAUDE.md`, `.github/workflows/ci.yml` (job `gate:fast`), `scripts/kit/ratchet.mjs`, `.claude/agents/architect.md`, `.claude/skills/spec/SKILL.md`, `docs/operations/agent-doorloop.md`, `docs/specs/leesbudget.md`. De streefwaarden in `DOELEN` van `scripts/kit/leespad.mjs` stelt de bouw-PR opnieuw voor op basis van de eerlijke meting (ADR 0070 punt 4).

## Buiten scope

Nieuwe maten in de trend; een PR-comment door CI; padregels of feiten-uitvoer inkorten (dat volgt uit de meting). `lichte-fix` telt geen padregels, al laadt een fix in `src/api` `api.md`; dat is een bekende ondertelling.

## Testplan

Naast de bestaande tests in `test/rails/leesbudget.test.ts` en `test/rails/meting-kerncijfers-leespad.test.ts`: AC-1 in een tijdelijke repo met en zonder basis (de basis geeft een getal, geen "onbekend"), met per-eenheid-gevallen (een eenheid zakt onder de grens en een andere komt erboven); AC-2 tabelgedreven met de vijf genoemde gevallen (ook 0,7 → 1,2); AC-3 met een tijdelijk `GITHUB_STEP_SUMMARY`-bestand, en als teksttest op workflow en skill; AC-4 tegen de echte scenariobestanden en een fixture met een ongetelde aanroep; AC-5 tegen fixtures; AC-6 met pure functies en een lezer; AC-7 in een tijdelijke repo (sluiten door afvinken, parkeren en verhuizen; "uit fase N"; doorlopend naast een fasenummer; nieuw item zonder fase; zonder basis; kop ontbreekt); AC-8 en AC-9 als teksttests.

## Open vragen

- **OV-1** — Waar ziet de eigenaar de meldingen? Opties: samenvatting van de CI-job plus PR-beschrijving via `opleveren`; een PR-comment door CI; alleen de PR-beschrijving. Aanbeveling: de eerste, zonder extra rechten voor de workflow.
- **OV-2** — Drempel voor de trend: 0,5 en 25 %, of alleen een van beide. Aanbeveling: beide, zodat kleine en grote gemiddelden allebei ruis negeren.
- **OV-3 ✅ besloten** — Een scenario krijgt "let op" bij minstens 1 KB groei tegenover de basis (keuze eigenaar, 3 november 2026): het leespad ligt al ver boven het streefdoel en telt nu feiten-uitvoer, dus zonder minimale stap meldde elke nieuwe spec weer.
