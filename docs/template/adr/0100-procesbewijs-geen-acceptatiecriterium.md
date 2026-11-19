# 0100 — Procesbewijs is geen acceptatiecriterium

Status: geaccepteerd

Een ADR omdat het acht AC's van gebouwde specs laat vervallen (R-WERK-07: een AC-id verdwijnt nooit, een vervallen AC
noemt het ADR); het wijzigt geen geaccepteerd ADR. Besluit van de eigenaar, 2026-11-19.

## Context

`check-docs` regel 6 eist voor elk AC van een gebouwde spec een testbestand dat `<namespace>/AC-n` noemt; sinds #824
telt alleen die vorm. Acht AC's beschrijven geen gedrag maar bewijs dat in de PR of na de merge geleverd wordt: een groene
CI-run, een CodeQL-uitslag, docs in de bouw-PR, een volgorde van bouwstappen, uitvoer in de thread. Zes staan daarom in
`.kit/baseline.json` (leerpunt #828), twee tellen als gedekt omdat de kopregel van een testbestand hun id noemt met de
uitleg dat ze bewijs zijn en geen test (botgesprekken-sluiten/AC-12 sinds #829, agent-samenvoegen/AC-7 sinds de bouw van die
spec). Dat laatste is schijndekking: het testbestand toetst ze niet.

Sinds #834 (leerpunt #793) zegt het spec-sjabloon dat bewijs dat alleen een CI-uitslag of een stap in de PR is, geen
criterium is maar in het Testplan hoort (mini-spec: de PR-beschrijving).

## Besluit

1. **Procesbewijs is geen acceptatiecriterium.** Een uitslag van CI of CodeQL, docs in de bouw-PR, een volgorde van
   bouwstappen of uitvoer in een PR of thread hoort in het Testplan van de spec of in de PR-beschrijving, niet als AC.
2. **Deze acht AC's vervallen** door dit ADR, met hun tekst achter `Was:`: codeql-bewaking/AC-5, create-server/AC-10,
   kooi/AC-8, kooi/AC-9, tests-naar-vermogen/AC-9, tests-naar-vermogen/AC-10, botgesprekken-sluiten/AC-12 en
   agent-samenvoegen/AC-7. Het bewijs is in hun bouw-PR geleverd; de `Was:`-tekst blijft het verslag.
3. **Geen schijndekking:** een testbestand noemt het id van een AC dat het niet toetst niet; de kopregels die dat voor
   botgesprekken-sluiten/AC-12 en agent-samenvoegen/AC-7 deden, verdwijnen.

## Alternatieven

- **In de baseline laten:** de schuld blijft onzichtbaar en zonder vervolg (#828).
- **Elke baseline-AC een reden en een issue laten eisen (de check uit #828):** houdt AC's in leven die niets te toetsen
  hebben.
- **Het id overal weghalen:** strijdig met R-WERK-07; de geschiedenis van de spec gaat verloren.

## Gevolgen

- Zes regels minder in `.kit/baseline.json`; de AC-dekking van de acht specs klopt zonder uitzondering.
- Nieuwe specs volgen het sjabloon uit #834; of een check dat afdwingt, beslist een eigen PR met spec.
- Leerpunt #828 houdt geen open AC's meer in de baseline over.
