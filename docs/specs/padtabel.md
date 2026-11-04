---
status: goedgekeurd
namespace: padtabel
model: opus
---

# Eén padtabel

## Doel

Hoe zwaar een pad beschermd is, staat op één plek (`paden` in `.claude/gates.json`) en wordt overal afgeleid, zonder dat één
pad losser wordt ([ADR 0078](../adr/0078-een-padtabel.md)); `.claude/decisions.json` verliest zijn dode records.

**Toets aan framework §1.** Aanleiding: vraag van de eigenaar (4 november 2026), bevinding A en B. Geen nieuwe dependency.
Raakt rolhek, lane en agent-merge (kritiek), daarom eerst deze besluit-PR.

## Rollen en wie wat ziet

| Rol | Doet | Mag niet |
|---|---|---|
| elke rol | leest het niveau met `feiten.mjs pad <pad>` | — |
| hoofdsessie / developer | schrijft volgens het afgeleide niveau | `gates.json` wijzigen zonder besluit-PR |
| eigenaar | merget de bouw-PR, beslist over de terugval | — |

## Datawijzigingen (met grants)

n.v.t.: geen migratie, tabel of policy. Wel een configvorm:
`"paden": { "<glob>": { "schrijven"?: "gate"|"voorReview"|"altijdVragen", "besluit"?: "agent"|"eigenaar"|"besluit-pr" } }`.
Vervalt: `gates`, `voorReview`, `altijdVragen`, `agentMerge.toegestaan` en `.kritiek`; de rest blijft.

## Routes en foutcodes

n.v.t.: geen API-route, permissie of foutcode.

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

## Kopieer de vorm van

- `scripts/kit/agent-merge.mjs`: `leesMergeConfig` (ontbrekend of onleesbaar valt dicht) en `padReden` (oordeel per pad).
- `rails/hooks/lib/rolhek.mjs`: `loadConfig` (vorm van de afgeleide `Config`, die gelijk blijft).
- `scripts/kit/check-docs.mjs`: `agentMergeViolations` (elk getrackt pad plus `voorbeeldPad` per glob).
- `scripts/kit/feiten.mjs`: `hoofdstuk <n>` (CLI-vorm met één argument, foutmelding en exit 1).

## Hergebruik en UX

- Hergebruikt: `globMatch` uit `rails/hooks/lib/rolhek.mjs`, `padReden` en `kritiekPad` (signatuur ongewijzigd),
  `voorbeeldPad` uit `check-docs.mjs`.
- Bestaande componenten, staten per scherm, focusvolgorde: n.v.t., geen UI.
- Alle zichtbare tekst letterlijk:
  - `feiten.mjs pad <pad>`: `<pad>: schrijven <niveau> (<globs>), besluit <niveau> (<globs>)`; zonder passende glob
    `(geen rij)`; vrij heet `vrij`.
  - zonder argument: `Gebruik: node scripts/kit/feiten.mjs pad <pad>` en exit 1.
  - check-docs, telkens na `.claude/gates.json: paden.<glob>: `: `altijdVragen vraagt besluit besluit-pr`,
    `schrijven <niveau> met besluit agent`, `onbekende <sleutel of waarde> <x>`, `rij zonder kolom`; en
    `.claude/gates.json: paden naast gates, voorReview of altijdVragen`.

### Werking (bindend)

1. **Lezer.** `rails/hooks/lib/padtabel.mjs` exporteert `padNiveau(pad, ruw)` → `{ schrijven, besluit, bronnen }` en
   `afgeleid(ruw)` → `{ gates, voorReview, altijdVragen, kritiek, agentMerge: { toegestaan, kritiek } }`. Orde:
   vrij < gate < voorReview < altijdVragen; agent < eigenaar < besluit-pr. Elke passende rij telt mee met haar waarde of de
   standaard (vrij, eigenaar). Afgeleid: `gates` = schrijven ≥ gate zonder `jsonGates`-bestanden; `kritiek` = besluit-pr;
   `agentMerge.toegestaan` = besluit agent; `agentMerge.kritiek` = elke andere rij.
2. **Oude vorm.** Zonder `paden` levert `afgeleid` de lijsten zoals ze staan, met `kritiek` = de bevroren lijst `OUDE_KRITIEK`
   (de `KRITIEK` van `lane.mjs` op 30cc352) plus `altijdVragen ?? voorReview ?? gates`. `paden` naast een van de oude lijsten:
   fout (de lezer gooit, de aanroeper faalt dicht zoals nu).
3. **Aanroepers.** `loadConfig`, diff-guard `leesConfig` en `leesMergeConfig` roepen `afgeleid` aan en geven dezelfde vorm
   terug als nu, plus `kritiek`. `kritiekPad(pad, config)` gebruikt `config.kritiek`, en zonder dat veld de oude regel.
4. **Onleesbare rij.** Een rij die geen object is of een onbekende waarde heeft, telt bij lezen als
   `{ schrijven: altijdVragen, besluit: besluit-pr }`; `paden` zelf geen object: de lezer gooit.
5. **decisions.json.** `readRegistry` accepteert `{ version, requiredChecks }` en `{ version, requiredChecks, decisions }`,
   en geeft `decisions: []` als de sleutel ontbreekt. Elke andere sleutel blijft een fout.

## Acceptatiecriteria

- **padtabel/AC-1** — Gegeven twee rijen `src/**` (agent) en `src/core/**` (gate), dan is `padNiveau('src/core/x.ts')`
  schrijven gate, besluit eigenaar, ongeacht de volgorde van de rijen in het object.
- **padtabel/AC-2** — Gegeven de fixture van main 30cc352 (oude lijsten plus `OUDE_KRITIEK`) en de nieuwe `gates.json`, dan is
  voor elk pad uit `git ls-files` en elk `voorbeeldPad` van een glob uit beide: het rolhekniveau (vrij < gate < voorReview <
  altijdVragen, `jsonGates` apart) nieuw ≥ oud; `kritiekPad` oud waar ⇒ nieuw waar; `padReden` (status `M` en `A`) oud niet
  null ⇒ nieuw niet null. De paden waar nieuw strenger is, zijn precies `docs/adr/**` voor `kritiekPad`; elk ander verschil
  is rood.
- **padtabel/AC-3** — Gegeven een rij met `schrijven: altijdVragen` zonder `besluit: besluit-pr`, of `schrijven` ≥ gate met
  `besluit: agent`, dan geeft `check-docs` de melding uit Hergebruik en UX.
- **padtabel/AC-4** — Gegeven een onbekende kolom, een onbekende waarde of `{}` als rij, dan is `check-docs` rood, en geeft
  `padNiveau` voor die glob altijdVragen en besluit-pr.
- **padtabel/AC-5** — Gegeven `paden` en `gates` (of `voorReview`, `altijdVragen`) tegelijk, dan gooien `loadConfig`,
  `leesConfig` en `leesMergeConfig`; het rolhek weigert de schrijfactie en `pr:merge` merget niet.
- **padtabel/AC-6** — Gegeven de oude `gates.json` van 30cc352, dan leveren de drie lezers precies dezelfde lijsten als op
  30cc352, en `kritiekPad` dezelfde uitslag voor elk pad uit AC-2.
- **padtabel/AC-7** — CODEOWNERS noemt precies de globs met `schrijven` plus de `jsonGates`-bestanden; de Edit-`ask` in
  `.claude/settings.json` is precies de globs met `schrijven: altijdVragen`; een afwijking is rood.
- **padtabel/AC-8** — `scripts/kit/lane.mjs` bevat geen lijst met paden voor kritiek meer; `OUDE_KRITIEK` staat alleen in
  `padtabel.mjs` en een test eist dat hij gelijk is aan de fixture.
- **padtabel/AC-9** — `feiten.mjs pad docs/adr/0001-x.md` toont `schrijven gate (docs/adr/**)` en
  `besluit besluit-pr (docs/adr/**)`; `feiten.mjs pad` zonder argument geeft exit 1 met de gebruiksregel.
- **padtabel/AC-10** — `.claude/decisions.json` heeft precies de sleutels `version` en `requiredChecks` (ongewijzigde
  waarden); `readRegistry` leest het, en leest ook het register van 30cc352 met zijn 26 records.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Onleesbare rij (geen object, onbekende waarde) | lezen: strengste niveau in beide kolommen; check-docs rood | n.v.t. |
| Oude en nieuwe vorm tegelijk | ongeldig: lezers gooien, hook en agent-merge falen dicht | n.v.t. |
| Glob zonder kolommen (`{}`) | lezen: vrij/eigenaar (sluit `agent` van een bredere glob uit); check-docs rood: schrijf `besluit: eigenaar` | n.v.t. |
| Pad in `jsonGates` (`package.json`) | geen gate voor het rolhek (sleutels bewaakt zoals nu), wel `voorReview`, `altijdVragen` en `besluit-pr` | n.v.t. |
| Pad zonder passende glob | vrij en eigenaar: geen agent-merge (zoals een onbekend pad nu) | n.v.t. |
| App voegt eigen rijen toe | mag, in een besluit-PR (`gates.json` is besluit-pr); strengste-wint maakt template-rijen niet losser | n.v.t. |
| Oude code leest nieuwe `gates.json` uit main | `list('gates')` gooit of valt op `['**']`: dicht tot rebase | n.v.t. |

## Raakt ook

- Code: `rails/hooks/lib/padtabel.mjs` (nieuw), `rails/hooks/lib/rolhek.mjs` (`loadConfig`), `scripts/kit/lane.mjs`
  (`KRITIEK` weg), `scripts/kit/agent-merge.mjs`, `scripts/kit/diff-guard.mjs` (`leesConfig`), `scripts/kit/check-docs.mjs`
  (spiegelregels tussen lijsten vervangen door AC-3/AC-4; CODEOWNERS en `ask` volgens AC-7), `scripts/kit/feiten.mjs`
  (`pad <pad>`), `rails/hooks/lib/task-authority.mjs` (`readRegistry`).
- Config: `.claude/gates.json` (`paden`, `$comment`), `.claude/decisions.json`, commentaar in `.github/CODEOWNERS`.
- Docs: `docs/framework.md` §8 (R-WERK-05 verwijst naar `besluit: besluit-pr`; R-WERK-10, R-WERK-24, R-ROL-01/02) en §10
  (R-REPO-01, R-REPO-03), `AGENTS.md` waar het "kritiek" noemt, `CHANGELOG.md`. Geen R-id verdwijnt.
- Herzien-markering (R-CI-05): ADR 0046 punt 27, 0062 punt 2, 0069 punt 1 (in deze besluit-PR).
- Tests die de ruwe vorm van de echte `gates.json` lezen of samenstellen (o.a. in `test/rails/`: `spec-en-bouw`,
  `check-docs-voorreview`, `check-docs-onderhoud`, `agent-merge`; in `test/hooks/`: `rolhek-onderhoud`, `authority-git`):
  alleen het lezen gaat via `afgeleid`, verwachte uitkomsten gelijk, reden in de PR (R-TEST-02, OV-1).

## Buiten scope

- De structurele vangnetten in code (agent-merge: `VANZELF_GELADEN`, `CONTRACT`, testpaden, omvang, permissieregels; lane:
  `BEKEND`, `INSTRUCTIES`, migratieregels; rolhek: vrije `docs/specs/`), `schrijfrecht`, `zelfladend`, `gegenereerd`.
- Een ander niveau voor een pad dan nu (alleen `docs/adr/**` wordt expliciet `besluit-pr`).

## Testplan

- Unit: AC-1, AC-3 t/m AC-6, AC-8 en AC-10 tegen `padtabel.mjs`, de drie lezers, `check-docs` en `readRegistry`; AC-7 tegen
  de echte bestanden; AC-9 als CLI-test van `feiten.mjs`.
- Gelijkwaardigheid (AC-2): fixture `test/rails/fixtures/padtabel/` met `gates.json` van 30cc352 en `OUDE_KRITIEK`.
- Negatief bewijs in de PR: een tijdelijke commit die één `besluit-pr` weghaalt, met de rode AC-2 als link.
- **Vangnet**: (1) de samenhangregels (AC-3, AC-4) en de lezer die dicht faalt nemen de spiegelregels tussen de lijsten
  over; (2) bewijs: de gelijkwaardigheidstest (AC-2, AC-6) en de bestaande tests van rolhek, lane en agent-merge met
  ongewijzigde verwachte uitkomsten groen; (3) meting vóór en na: `pnpm leespad` en `pnpm meting --trend`, uitslag in de
  PR; (4) terugval: één pad losser dan op 30cc352 ⇒ revert van de bouw-PR, de eigenaar beslist (ADR 0078 punt 9).

## Open vragen

- **OV-1** — Tests die de ruwe lijsten van de echte `gates.json` lezen of er oude sleutels in mengen (Raakt ook), breken
  onvermijdelijk: de sleutels verdwijnen en `paden` naast `gates` is ongeldig (AC-5). Opties: (a) alleen het lezen omzetten
  naar `afgeleid`; (b) de oude lijsten als gegenereerde kopie laten staan. Aanbeveling: (a); (b) brengt de dubbele bron
  terug. Geen verwachte uitkomst verandert, en AC-2 vergelijkt het gedrag per pad.
- **OV-2 ✅ besloten** — Strengste-wint in plaats van eerste-treffer (ADR 0078, Alternatieven).
