# 0109 — Leerpunt sluiten als opgelost, met verwijzing naar bewijs op main

Status: voorgesteld

Wijzigt [0101](0101-leerpunt-bijwerken-en-sluiten.md) punt 2, 4 en 5 en [0078](0078-leerlus-met-bewijs.md) punt 3 en 5; vult
R-WERK-13, R-ROL-12 en R-SEC-09 aan. Drempel: A3 (een verruiming van het rolhek en van de MCP-uitzondering) en A4 (een
geaccepteerd ADR wijzigt). Aanleiding: keuze van de eigenaar, 2026-11-24, variant "met verwijzing". Concreet: #830 was
opgelost door ADR 0100 en #834, maar bleef open, want de hoofdsessie mag alleen als duplicaat sluiten; het precedent staat
als comment op #830. Uitwerking: spec [leerlus-bewijs](../specs/leerlus-bewijs.md) AC-16 tot en met AC-20.

## Context

ADR 0101 punt 2 laat de hoofdsessie een leerpunt alleen als duplicaat sluiten; een opgelost leerpunt sluit via een PR met
`Closes #<nr>` en `## Leerpunt` (0078 punt 1). Dat dekt niet het geval dat de oplossing al op `main` staat zonder dat
sluitwoord: een ADR, of een PR die het leerpunt niet noemde of het maar deels als doel had. Die leerpunten blijven open tot de
eigenaar ze ziet, en de voorsortering telt ze als werk. Het alternatief "completed na merge met `opgelost door #<pr>`" viel in
0101 af omdat het dubbel was met `Closes #<nr>`; het hier bedoelde geval heeft juist geen PR die het issue sluit.

## Besluit

1. **Sluiten als opgelost.** De hoofdsessie mag een leerpunt sluiten met de reden *completed*, alleen nadat ze een comment
   plaatste die begint met `opgelost: ` en het bewijs noemt dat al op `main` staat: een gemergde PR (`#<nr>`), een commit-SHA
   op `main`, of een geaccepteerd ADR op `main` (`ADR <nnnn>`). Zonder zo'n verwijzing sluit ze niet, maar laat ze een comment
   achter (0101 punt 6, `deels`).
2. **Volgorde.** Doelcheck (`gh issue view <nr> --repo <repo> --json labels,state,url`, label `leerpunt`, 0101 punt 4),
   daarna de comment `opgelost: <verwijzing>`, daarna sluiten.
3. **Kanalen.** Lokaal laat het rolhek naast de drie vormen uit 0101 punt 5 ook `gh issue close <nr> --reason completed`
   door, met dezelfde eisen aan repo, nummer en opties. In de cloud mag de MCP-issuetool de staat `closed` met
   `state_reason` `completed` zetten op een leerpunt; het rolhek blijft daar per schrijfactie vragen.
4. **Ongewijzigd.** Sluiten als *not planned* of achterhaald en heropenen blijven bij de eigenaar. De route via de PR
   (`Closes #<nr>`, `## Leerpunt`, job `leerpunt-bewijs`) en sluiten als duplicaat blijven zoals ze zijn.

## Waarom dit veilig is

De comment noemt bewijs dat iedereen kan nagaan: een PR-nummer, een SHA of een ADR-bestand op `main`. De sluiting is een
gevolg van werk dat al gemerged en beoordeeld is, niet een nieuw oordeel. Voor PR's blijft de job `leerpunt-bewijs` zijn
werk doen: een PR die een leerpunt sluit, heeft nog steeds een test nodig die op de basis faalt.

## Alternatieven

- **Alles bij de eigenaar laten (0101).** Afgewezen door de eigenaar: opgeloste leerpunten blijven liggen, zoals #830.
- **Sluiten zonder verwijzing.** Afgewezen: dan is niet na te gaan waarom het dicht is.
- **Ook not planned en heropenen.** Afgewezen: dat is triage (0078 punt 5).

## Gevolgen

- Rolhek (`rails/hooks/lib/rolhek.mjs`) en tabeltest: de vorm `--reason completed` naast `--duplicate-of`.
- De skill `opleveren` stap 8, `docs/framework.md` R-WERK-13, R-ROL-12 en R-SEC-09 en `AGENTS.md` noemen de nieuwe vorm.
- `scripts/kit/leerpunt-check.mjs` erkent een geldige `opgelost:`-comment als bewijs, anders zou hij `leerpunt-zonder-bewijs`
  zetten bij elke sluiting volgens dit besluit (eigenaar, 2026-11-24).
- `AGENTS.md`: in de MCP-uitzondering wordt "sluiten als duplicaat" "sluiten" (eigenaar, 2026-11-24).
- Restrisico: zo'n sluiting heeft geen test die rood is op de basis; de les kan dus minder vast zitten dan bij de PR-route.
- Restrisico: het rolhek is offline en ziet de inhoud van de comment niet, en niet of de verwijzing klopt of op `main`
  staat; dat is een afspraak, met de issue-check en heropenen door de eigenaar als rem.
