---
status: goedgekeurd
namespace: rolhek-optie
sjabloon: mini
---

# Rolhek leest optievormen van sed

## Doel

`inPlaceFiles` in `rails/hooks/lib/shell.mjs` herkent `sed --in-place=<suffix>`, afkortingen van `--in-place` en de vormen
`--expression=<script>` en `--file=<bestand>`, zodat het rolhek de schrijfdoelen ziet ([#395](https://github.com/BramLambertJansen/template/issues/395),
reproductie van 2 november 2026: `sed --in-place=.bak 's/before/after/' .claude/gates.json` kreeg geen ask of deny).
Het rolhek blijft een vangnet, geen grens (R-ROL-10).

## Rollen en wie wat ziet

n.v.t. — tooling voor de hoofdsessie en subagents in Claude Code; geen app-gebruikers.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

n.v.t. — geen routes.

## Kopieer de vorm van

- `test/hooks/rolhek-railgaten.test.ts` — `bash(...)` met `verdict()` op de echte `.claude/gates.json`

## Acceptatiecriteria

- **rolhek-optie/AC-1** — Gegeven `sed --in-place=.bak 's/a/b/' <gate-pad>`, dan geeft het rolhek voor een developer deny en voor de
  hoofdsessie ask, zoals bij `sed -i`.
- **rolhek-optie/AC-2** — Elke afkorting van `--in-place` die GNU sed accepteert (`--i`, `--in`, `--in-p`, …, met of zonder `=<suffix>`)
  geeft hetzelfde oordeel als AC-1. Een andere lange optie die met `--i` begint telt niet als in-place.
- **rolhek-optie/AC-3** — Bij `--expression=<script>` of `--file=<bestand>` (sed) telt het eerste operand niet als script: alle
  operands zijn doelbestanden, zoals bij `-e`/`-f`.
- **rolhek-optie/AC-4** — Elke test uit AC-1 tot en met AC-3 faalt op de code van vóór de fix en slaagt erna; de bestaande
  `test/hooks` blijven groen.
- **rolhek-optie/AC-5** — Niet in dit werk: de gawk-afkortingen (`--sour=`, `--fi=`, `--incl=`) en de gh-positieregels (#399)
  blijven open; #395 blijft open tot die gedekt zijn.

## Hergebruik en UX

n.v.t. — geen UI.

## Open vragen

- **OV-1 ✅ besloten** — Eén gedeelde helper voor optie-afkortingen in dit werk? Nee: alleen sed; de helper hoort bij het gawk-werk
  (roadmap "Bekende gaten in het rolhek"), want programma's verschillen in wat ze afkorten.
