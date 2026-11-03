---
status: goedgekeurd
namespace: meting-stuurt
---

# Meting die stuurt: verschil met main, echt leespad, herijken met trigger

## Doel

Meldingen van de meting gaan alleen af bij verandering en staan op de PR, het leespad telt wat een agent verplicht leest, en herijken gebeurt bij het sluiten van een fase ([ADR 0070](../adr/0070-meting-die-stuurt.md)). Aanleiding: bevindingen L5, L6 en L7 van de review van main op 2 november 2026.

## Rollen en wie wat ziet

n.v.t. — `pnpm leespad`, `pnpm meting --trend`, `feiten.mjs`, `check:roadmap` en de CI-job `gate:fast`; geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `scripts/kit/leespad.mjs` — `--ref` (meting uit een git-ref) voor de vergelijking met de basis
- `scripts/kit/meting-trend.mjs` — `trend()` (gemiddelde laatste tien tegen de tien daarvoor)
- `scripts/kit/feiten.mjs` — `--alle` bij `adr` (standaard kort, volledig op verzoek)
- `scripts/kit/check-roadmap.mjs` — de foutmelding met `::error::` in CI

## Hergebruik en UX

n.v.t. — geen UI. Meldingen zijn Nederlands en beginnen met "let op:" of noemen de check, zoals nu.

## Acceptatiecriteria

- **meting-stuurt/AC-1** — `pnpm leespad` meet ook de basis (`origin/main`, of `--basis <ref>`). Per scenario en per soort komt "let op" alleen als de waarde of het aantal boven de streefwaarde hoger is dan op de basis. Een overschrijding die gelijk bleef of daalde, staat er als "N erboven, gelijk aan main" of "N erboven, was M", zonder "let op". Is de basis niet te lezen, dan meldt `leespad` dat in één regel en meet het zoals nu. De exitcode blijft 0.
- **meting-stuurt/AC-2** — `pnpm meting --trend` meldt "let op: <maat> steeg" alleen als het gemiddelde over de laatste tien minstens 0,5 hoger ligt dan over de tien daarvoor en, als dat vorige gemiddelde groter is dan 0, ook minstens 25 % hoger. Bij 1,0 tegen 1,2 en bij 0,1 tegen 0,0 geen melding; bij 1,0 tegen 1,5 en bij 0,0 tegen 0,5 wel.
- **meting-stuurt/AC-3** — In CI schrijft de job `gate:fast` de meldingen van de ratchet en de uitvoer van `pnpm leespad` tegen de basis van de PR naar `$GITHUB_STEP_SUMMARY`, ook als de job groen is. De workflow krijgt geen extra rechten. Stap 8 van `.claude/skills/opleveren/SKILL.md` zet naast de trend ook de "let op"-regels van `pnpm leespad` in de PR-beschrijving.
- **meting-stuurt/AC-4** — Elk scenario in `pnpm leespad` telt naast zijn bestanden de bytes van de uitvoer van zijn verplichte `feiten.mjs`-aanroepen: `nieuwe-feature` en `lichte-fix` `gates specs fase`, `review` geen. `nieuwe-feature` telt ook `.claude/rules/api.md`, `web.md` en `database.md`. De uitvoer van `leespad` noemt per scenario welk deel uit bestanden, uitvoer en padregels komt.
- **meting-stuurt/AC-5** — `node scripts/kit/feiten.mjs specs` toont alleen specs op `voorstel` en `goedgekeurd`, en daarna één regel met het aantal per andere status en de verwijzing naar `--alle`. `feiten.mjs fase` toont alle open items onder "Nu", hoogstens vijf onder "Volgende" en daarna één regel met het aantal overige en de verwijzing naar `--alle`. Met `--alle` tonen beide de volledige lijst, zoals nu.
- **meting-stuurt/AC-6** — Een test bouwt een repo-kopie met 200 extra specs (helft `gebouwd`) en 50 extra open items onder "Volgende". Het leespad van elk scenario groeit daarin hoogstens 1 KB tegenover de kopie zonder die extra's.
- **meting-stuurt/AC-7** — `pnpm check:roadmap` vergelijkt met de basis. Heeft een fase op de basis minstens één open item en na de PR geen, dan eist de check in `docs/roadmap-archief.md` een nieuwe regel die begint met `Herijking fase <n>:`, gevolgd door een ISO-datum en de woorden `leespad` en `trend`. Ontbreekt die, dan faalt de check met een melding die de fase en R-DOC-08 noemt. Items met "fase onbekend" tellen niet. Zonder basis: lokaal een melding en exitcode 0, in CI (`GITHUB_ACTIONS=true`) rood.
- **meting-stuurt/AC-9** — `docs/specs/leesbudget.md` AC-7 noemt de lijst via REST (één `gh api …/pulls?state=closed`, de twintig nieuwste op `merged_at`) in plaats van `gh pr list`, "meet nooit meer dan twintig PR's" in plaats van "leest", en verwijst voor de drempel naar meting-stuurt/AC-2.
- **meting-stuurt/AC-8** — R-DOC-08 noemt de trigger (`check:roadmap` bij het sluiten van een fase) en dat "let op" een verschil met main is; `docs/operations/agent-doorloop.md` beschrijft de vergelijking met de basis en de plafonds van `feiten.mjs`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Basis niet te lezen (geen `origin/main`) | `leespad`: één regel, meet zonder vergelijking; `check:roadmap`: lokaal melding, CI rood | n.v.t. |
| Trend met "onbekend" in een van beide helften | Geen melding voor die maat, zoals nu | n.v.t. |
| PR sluit twee fases tegelijk | Een herijkingsregel per fase | n.v.t. |
| Fase sluit doordat items naar een andere fase verhuizen | Telt ook als sluiten; de herijking hoort erbij | n.v.t. |
| Item heropend na een herijking | Geen nieuwe eis tot de fase weer sluit | n.v.t. |

## Raakt ook

`docs/framework.md` (R-DOC-08), `.claude/skills/opleveren/SKILL.md`, `.github/workflows/` (job `gate:fast`), `docs/operations/agent-doorloop.md`. De streefwaarden in `DOELEN` van `scripts/kit/leespad.mjs` stelt de bouw-PR opnieuw voor op basis van de eerlijke meting (ADR 0070 punt 4).

## Buiten scope

Nieuwe maten in de trend; een PR-comment door CI; padregels inkorten (dat volgt uit de meting, niet uit deze spec).

## Testplan

Unit- en procestests naast de bestaande in `test/rails/leesbudget.test.ts` en `test/rails/meting-kerncijfers-leespad.test.ts`: AC-1 met een tijdelijke repo met en zonder basis; AC-2 tabelgedreven met de vier genoemde grensgevallen; AC-4 en AC-5 tegen fixtures; AC-6 als groeitest; AC-7 in een tijdelijke repo met `GITHUB_ACTIONS=''` en `'true'`; AC-3 en AC-8 als teksttests op workflow, skill en docs.

## Open vragen

- **OV-1** — Waar ziet de eigenaar de meldingen? Opties: samenvatting van de CI-job plus PR-beschrijving via `opleveren`; een PR-comment door CI; alleen de PR-beschrijving. Aanbeveling: de eerste, zonder extra rechten voor de workflow.
- **OV-2** — Drempel voor de trend: 0,5 en 25 %, of alleen een van beide. Aanbeveling: beide, zodat kleine en grote gemiddelden allebei ruis negeren.
