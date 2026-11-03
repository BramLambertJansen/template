---
status: goedgekeurd
namespace: agent-merge-bytegrens
sjabloon: mini
---

# Bytegrens naast de regelgrens voor agent-merge

## Doel

Een agent-merge vraagt naast hoogstens `agentMerge.maxRegels` regels ook hoogstens `agentMerge.maxBytes` gewijzigde bytes,
zodat een PR met weinig maar zeer lange regels (een geminificeerd bestand, één regel van 50 kB) de omvanggrens niet omzeilt
([ADR 0069](../adr/0069-agent-merge-niet-kritiek.md) punt 3, herzien). Aanleiding: restpunt van bevinding P2 van de review
van 3 november 2026.

## Rollen en wie wat ziet

n.v.t. — tooling voor de hoofdsessie (`pnpm pr:merge`) en de diff-guard in CI; geen app-gebruikers.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

n.v.t. — geen routes.

## Kopieer de vorm van

- `scripts/kit/agent-merge.mjs` — `leesAgentMerge()`, `omvangRedenen()` en `teGroot()` voor de regelgrens; de bytegrens volgt
  dezelfde vorm
- `scripts/kit/pr-merge.mjs` — `omvangRedenen()` op het REST-antwoord van `pulls/<nr>/files`

## Acceptatiecriteria

- **agent-merge-bytegrens/AC-1** — `leesAgentMerge()` leest `maxBytes` als geheel getal ≥ 1; ontbreekt het of is het
  ongeldig (`0`, `-1`, `40000.5`, `"40000"`, `null`), dan is het resultaat `null` (geen agent-merge), net als bij `maxRegels`.
  `.claude/gates.json` krijgt `"maxBytes": 40000`. `check-docs` controleert de vorm op het ruwe blok, zoals bij `maxRegels`.
  Tabeltest met elk van die waarden.
- **agent-merge-bytegrens/AC-2** — Gewijzigde bytes zijn de UTF-8-bytes van elke toegevoegde en verwijderde regel, zonder het
  `+`/`-`-teken, zonder regeleinde en zonder kop- en contextregels. De diff-guard (`leesPr()`) telt ze met
  `git diff -U0 --no-ext-diff --no-textconv --find-renames <merge-base> <head>` op dezelfde merge-base; `agentMergeOordeel()`
  geeft `nee` als `bytes > maxBytes` of als `bytes` ontbreekt of geen geheel getal ≥ 0 is; `bytes === maxBytes` mag.
  Tabeltest: 40.000 en 40.001 bytes bij grens 40.000, één regel van 40.001 bytes (1 regel, toch `nee`), meerbyte-tekens
  (`é` telt 2), een zuivere hernoeming (0 bytes) en ontbrekende `bytes`.
- **agent-merge-bytegrens/AC-3** — `pr:merge` telt dezelfde bytes uit het veld `patch` per bestand van `pulls/<nr>/files`
  (alleen regels die met `+` of `-` beginnen, niet `+++`/`---`-koppen en niet `\ No newline at end of file`) en weigert boven
  `maxBytes`. Een bestand zonder `patch` blijft geweigerd zoals nu (AC-3 van agent-merge-zonder-codex). Unittest met
  nagebootste REST-antwoorden: 40.000 en 40.001 bytes, één lange regel, en een `patch` met contextregels die niet meetellen.
- **agent-merge-bytegrens/AC-4** — ADR 0069, `docs/operations/agent-doorloop.md` (mergen) en de skill `opleveren` noemen beide
  grenzen; het regelboek groeit netto niet.

## Hergebruik en UX

n.v.t. — geen UI. Letterlijke nieuwe meldingen:

- `PR te groot voor een agent-merge: <n> bytes gewijzigd, grens <maxBytes> (agentMerge.maxBytes)`
- `omvang van de PR niet leesbaar of agentMerge.maxBytes ontbreekt: geen agent-merge`

## Open vragen

- **OV-1** — Welke grens? Opties: 40.000 bytes, een grens per regel (bijv. 300 tekens), of beide. Aanbeveling: 40.000 bytes
  totaal, geen grens per regel. Gemeten over de laatste 80 merges naar `main` (alleen `src/`, `docs/`, `CHANGELOG.md`): de
  grootste PR onder 400 regels wijzigde 30,9 kB; gewone regels zijn gemiddeld 65 tot 290 bytes, maar legitieme docs- en
  tabelregels lopen tot 2,2 kB, dus een grens per regel zou gewoon werk weigeren. 40.000 is 400 regels van 100 bytes: een
  PR op de regelgrens met normale regels haalt de bytegrens ook.
