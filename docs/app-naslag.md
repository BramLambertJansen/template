# Naslag voor een app op de template

Naslag voor na de setup; het setup-playbook is [nieuwe-app.md](nieuwe-app.md) en verwijst per kop hierheen. Een
template-update binnenhalen staat nog in het playbook ("Een template-update binnenhalen").

## Naslag: dagelijks werken

Voer alleen de gewenste stap uit in een Ubuntu-terminal; dit zijn geen vervolgstappen van de setup.

1. Start stack, migraties, API en web als die nog niet draaien. Laat deze terminal open tot je wilt stoppen:

   ```bash
   cd ~/code/<slug> && pnpm dev
   ```

   `pnpm dev` stopt met `✗ poort <poort> (API_PORT|WEB_PORT) is bezet` als een andere `pnpm dev` die poort houdt
   (`scripts/dev.mjs`): stop die, of kies poorten met `node scripts/kit/nieuwe-app.mjs poorten`.

2. Controleer bij twijfel vanuit een tweede terminal. Verwacht: alles ✓. De uitslag staat ook in
   `.template/doctor-full.json` (`scripts/doctor.sh`).

   ```bash
   cd ~/code/<slug> && scripts/doctor.sh
   ```

3. Stop de containers wanneer je klaar bent:

   ```bash
   cd ~/code/<slug> && docker compose stop
   ```

Verwijder geen volumes tenzij je de database kwijt wilt.

## Eigen agentinstructies van de app

`AGENTS.md`, `CLAUDE.md` en `.claude/` zijn van de template; wat elke sessie over deze app moet weten, staat in `docs/app.md`
(spec [app-agentregels](template/specs/app-agentregels.md), R-DOC-11). `CLAUDE.md` importeert het bestand, dus Claude Code
laadt het bij elke sessiestart; een runtime die imports niet volgt, leest het zelf.

- Wat erin hoort: feiten van de app onder de vijf koppen van het skelet: wat de app is, provider en host, rollen, begrippen,
  eigen commando's en valkuilen (wat faalt, en waardoor).
- Wat er niet in hoort: een regel of een kopie van het regelboek. Een norm van de app staat in een app-ADR in `docs/adr/`;
  `docs/app.md` verwijst ernaar met het nummer.
- Bijhouden: in de PR die een van die feiten wijzigt. `node scripts/kit/feiten.mjs pad docs/app.md` toont schrijven vrij en
  besluit agent: hoofdsessie en developer schrijven het, en een PR die alleen zulke paden raakt, merget de hoofdsessie via `pnpm pr:merge`.
- Omvang: `pnpm leespad` meet het bestand als soort `app` tegen een streefwaarde in regels (`scripts/kit/leespad.mjs`,
  `SOORTEN`) en meldt "let op" als het erboven komt; een meting, geen rode check.
- Een app van vóór dit bestand heeft na de template-update de stub van de template ("Dit is de template zelf"). `app:init`
  draait daar niet meer: de hoofdsessie schrijft het skelet uit `appAgentregels()` in `scripts/kit/app-init.mjs` en vult het.
- `check-docs` meldt `docs:app-md:<…>` als `CLAUDE.md` het bestand importeert en het ontbreekt
  (`scripts/kit/check-docs.mjs`, `appMdViolations`).

## Een eigen beschermd pad

Een app beschermt eigen paden (bijvoorbeeld een betaalmodule) in `.claude/gates.app.json`, niet in `.claude/gates.json`: dat
bestand is van de template, en een eigen rij daarin geeft bij elke template-update een conflict (spec
[app-padtabel](template/specs/app-padtabel.md)). Het app-bestand vult de padtabel aan en kan alleen toevoegen of aanscherpen:

```json
{
  "$comment": "Eigen beschermde paden van de app (docs/app-naslag.md).",
  "paden": { "payments/**": { "schrijven": "voorReview", "besluit": "besluit-pr" } }
}
```

- Het hoogste niveau is `voorReview` met `besluit-pr`: de developer en de andere rollen schrijven er niet, de hoofdsessie
  vraagt eerst, en werk op het pad is kritiek (de eigenaar voegt de PR samen). Voor het samenvoegen beschermt in een app een
  rij met `besluit-pr` of met schrijven `voorReview`: `pnpm pr:merge` weigert dan en de eigenaar voegt samen; een rij met
  alleen `eigenaar` of `gate` doet dat niet (ADR 0093 punt 4, spec agent-samenvoegen AC-2). `altijdVragen` en besluit `agent` kunnen alleen
  in de template; een glob die al in `.claude/gates.json` staat, herhaal je niet, scherp aan met een eigen, specifiekere glob.
  `check-docs` meldt elke afwijking als `docs:gates-app:<…>` (`scripts/kit/check-docs.mjs`, `appViolations`).
- Het bestand zelf is altijdVragen en besluit-pr (de vloer): de hoofdsessie schrijft het na akkoord van de eigenaar, in een
  eigen PR. Het rolhek leest het pas als het op `main` staat (`rails/hooks/lib/rolhek-context.mjs`, `configuratie`).
- Genereer daarna `.github/CODEOWNERS` opnieuw en commit het mee (een leesbare lijst, geen grens; `check-docs` eist dat hij klopt); `node scripts/kit/feiten.mjs pad <pad>` toont het niveau,
  met een app-bron als `<glob> (app)`.

```bash
cd ~/code/<slug>
node scripts/kit/codeowners.mjs --schrijf
node scripts/kit/feiten.mjs pad payments/x.ts
```
