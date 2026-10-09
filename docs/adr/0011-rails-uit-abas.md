# 0011 — Rails overnemen uit ABAS

Status: geaccepteerd (2026-10-09) — voorgesteld door de agent na de vergelijking in
[reviews/2026-10-09-abas-vergelijking.md](../reviews/2026-10-09-abas-vergelijking.md), op verzoek van de eigenaar ("verwerk de sterke punten").

## Context

ABAS (`BramLambertJansen/ABAS`, referentie-commit `8299617`) is een app die door agents is gebouwd, met draaiende en geteste rails:
een rolhek-hook met 66 geteste payloads, een SubagentStop die pas groen loslaat, een ratchet op schuld, een gate-register, een diff-guard
met exacte goedkeuringsregels en een catalogustest op databasefuncties. Elke rail is daar na een echte fout of een adversariële review ontstaan,
vaak met een test die eerst op de oude code faalde. De template had dezelfde doelen, maar losser beschreven en zonder bewezen vorm.
Het ontwerp van de template (API-laag, `withUser()`, sandbox, core/app-grens) blijft leidend; dit gaat over het railwerk.

## Besluit

De template neemt deze mechanismen over, met ABAS als bron om te porten (inclusief tests):

1. **Eén rolhek** (`.claude/hooks/rolhek.mjs` + `.claude/gates.json`) vervangt guard-files, tester-paden en readonly-bash.
   `.claude/gates.json` is de enige lijst van gate-paden, testpaden, `jsonGates` (`package.json` → `scripts`), goedkeurders en schrijfrecht per rol.
   CODEOWNERS en `ask` worden ermee vergeleken door `check-docs`; de diff-guard in CI leest dezelfde lijst.
2. **Hooks zijn gates**: elke hook heeft een tabeltest met echte stdin-payloads en de verwachte exitcode, inclusief bekende omzeilingen.
3. **Groen vóór klaar**: SubagentStop voor developer en tester blokkeert tot `gate:fast` groen is, ook bij een schone werkmap.
4. **Geen zelfreview**: lokaal geblokkeerd en in CI zonder effect: `gh pr review`, het label `gate-wijziging`, statussen en check-runs via `gh api`.
5. **Ratchet**: `.kit/baseline.json` plus ESLint bulk-suppressions; een nieuwe overtreding faalt, een opgeloste die nog in de baseline staat ook.
   De baseline laten groeien is een gate-wijziging.
6. **Gate-register** `scripts/kit/gates.mjs` (wat elk script bewaakt, snel of traag) is de enige gate-tabel; `check-docs` eist dat het gelijk is aan `gate:fast`/`gate:slow`.
7. **Live feiten**: `scripts/kit/feiten.mjs` (gates, routes, permissies, foutcodes, componenten, ADR-statussen, volgende vrije migratie- en ADR-nummer)
   wordt via `!`-injectie in skills en agentprompts geladen; elke rol begint met "eerst de feiten".
8. **Vijf rollen**: architect (spec en ADR), developer, tester, reviewer, docs (na merge: docs gelijk aan wat gebouwd is, regels die een gate nu afdwingt uit CLAUDE.md).
9. **Diff-guard met exacte semantiek**: een PR die een gate-pad raakt of een bestaande test wijzigt, vraagt het label `gate-wijziging` én een APPROVED-review van een
   goedkeurder die niet de auteur is, als laatste beslissende review op exact de head-SHA. Paden NUL-gesplitst; `package.json` alleen op `scripts`.
10. **Functiecatalogus in pgTAP**: elke functie in `public` en `app` is ingedeeld (client, intern); grants passen bij de klasse; elke client-functie
    controleert de actor; elke `security definer` heeft `search_path = ''`.
11. **Fixtures met omzeilingen** en **eerst reproduceren**: een rail-fix begint met een test die op de oude code faalt.
12. **Inrichting en supply chain**: `check-github` eist dat verplichte checks van GitHub Actions komen (`app_id`), `enforce_admins` en
    conversation resolution; scanner-uitzonderingen hebben een reden en een einddatum; secret scanning met Betterleaks (opvolger van gitleaks), image op digest.
13. **Release dubbel bewaakt**: `check-release-ci` vóór en na de build; `check-deployment-schema` faalt dicht en weigert een preview tegen de productiedatabase.
14. **Patronen**: idempotente mutaties (request-UUID, bonnetabel met payload-hash, advisory lock, tombstone; client legt intentie vast vóór het netwerk)
    en clientfouten (allowlist-velden, geen PII, 5 min dedupe, build-SHA).

Niet overgenomen: wat ABAS zelf als zwak noteert (regex-checks op SQL, `.from()` vanuit de client, geen sandbox, losse env-toegang) en de
volledige `check:fast` bij elke stop zonder grens (de template draait `gate:fast`, die klein moet blijven).

## Alternatieven

- Rails zelf opnieuw ontwerpen volgens de bestaande tekst: meer werk en zonder het bewijs dat ABAS al heeft.
- ABAS-kit als los pakket (`stack-rails`) afwachten: ABAS-roadmap fase 4 is niet gestart; porten nu kost minder dan wachten.

## Gevolgen

- Framework §1, §4, §7, §8, §9, §10, §12, AGENTS.md, CLAUDE.md, padregels, settings en roadmap zijn bijgewerkt.
- Porten gebeurt in roadmap fase 1 (stuk 1, 4, 5 en 6), elk met de ABAS-tests als startpunt, aangepast aan pnpm, Hono en gewone Postgres.
