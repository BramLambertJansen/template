# Vergelijking template ↔ ABAS — 2026-10-09

ABAS (`BramLambertJansen/ABAS`, commit `8299617`, 609 commits, ~450 door agents) is een Next.js/Supabase-app die met agents is gebouwd.
Drie inventarisaties met schone context en alleen lezend (agent-opzet, afdwinging/CI, architectuur/security). De hoofdsessie heeft de
claims daarna zelf in de bron en via de GitHub-API nagelopen (tabel onderaan).

## Oordeel

- **Vandaag is ABAS sterker en werkt een agent er beter in**: de rails draaien en zijn getest (1.079 tests in `check:fast`, 42 pgTAP-bestanden,
  66 geteste hook-payloads), en zijn na echte fouten en een adversariële review gedicht, met een reproductietest per gat.
- **Het ontwerp van de template is sterker**: geen databasetoegang vanuit de browser, één ingang `withUser()`, getypt env-schema, sandbox,
  core/app-grens, CSRF-matrix, strikte `search_path`. ABAS draagt de schuld van een losser ontwerp (`.from()` vanuit client-hooks in 34 bestanden,
  810 onderdrukte lintmeldingen, `search_path = public` in 0040/0041/0043, `process.env.X!`, `main` onbeschermd).
- **Doel**: template-ontwerp met ABAS-railwerk. Overgenomen in ADR 0011; elk roadmap-item noemt het ABAS-bestand om te porten.

## Waar ABAS sterker is — verwerkt

| # | Punt | Waar nu in de template |
|---|---|---|
| 1 | Hooks zijn gates met een tabeltest van echte payloads | Framework §1 en §8; roadmap stuk 5 |
| 2 | Eén rolhek en één padenlijst voor hook, CI, CODEOWNERS, `ask`; `package.json` alleen op `scripts` | ADR 0011, §8, §10 (`.claude/gates.json`) |
| 3 | Groen vóór klaar (SubagentStop) | §8 (developer; tester lint/typecheck, want zijn tests zijn eerst rood) |
| 4 | Zelfreview blokkeren; `disableBypassPermissionsMode` | `.claude/settings.json`, AGENTS.md, §8 |
| 5 | Vijf rollen met "eerst de feiten"; docs-rol na merge | §8, CLAUDE.md, roadmap stuk 5 |
| 6 | Live feiten via `feiten.mjs` en `!`-injectie | §7, §9, AGENTS.md, roadmap stuk 1 en 5 |
| 7 | Budget als signaal voor een ontbrekende gate; "Besloten, nog niet gebouwd" per padregel | §9, CLAUDE.md, alle padregels |
| 8 | Ratchet in beide richtingen + ESLint bulk-suppressions | §4, roadmap stuk 1 |
| 9 | Gate-register en `check-docs` op identifiers | §4, §10, roadmap stuk 1 en 4 |
| 10 | Fixtures met bekende omzeilingen | §1, roadmap stuk 1 |
| 11 | Diff-guard met exacte goedkeuringsregels | §10, roadmap stuk 4 |
| 12 | Functiecatalogus in pgTAP | §6, roadmap stuk 3a |
| 13 | `check:catalogus` en contrasttest vanaf het eerste component | §7, roadmap stuk 3c |
| 14 | Release dubbel bewaakt; geen preview tegen productie | §10 Release, roadmap fase 3 |
| 15 | `check-github` op `app_id`, `enforce_admins`, conversation resolution; rails-checklist | §10, roadmap stuk 6 |
| 16 | Scanner-uitzonderingen met einddatum; Betterleaks op digest | §6, roadmap stuk 1 en 4 |
| 17 | Runbooks met acceptatietabel | Roadmap fase 3 |
| 18 | Idempotente mutaties | §12 (uitbreiding) |
| 19 | Clientfouten met allowlist, dedupe, build-SHA | §6, roadmap fase 2 |
| 20 | Eerst reproduceren | §1 |

Bewust niet overgenomen: regex-checks op SQL (de template gebruikt de catalogus), databasetoegang vanuit de client, werken zonder sandbox,
`check:fast` volledig bij elke stop zonder grens.

## Gecontroleerde aannames

| Claim uit de inventarisatie | Uitkomst |
|---|---|
| Rolhek-test met ~60 payloads | Klopt: 66 rijen |
| Groen vóór klaar, ook op schone werkmap | Klopt (`groen-voor-klaar.mjs`) |
| Goedkeuring alleen op head-SHA, niet van auteur | Klopt (`goedkeuring.mjs`) |
| Diff-guard via `pull_request_target`, NUL-gesplitst | Klopt |
| Release-check twee keer, preview tegen productie geweigerd | Klopt |
| `controleer-inrichting` op `app_id` 15368 | Klopt |
| Idempotente geldverzoeken (advisory lock, payload-hash) | Klopt (migratie 0043, `moneyRequest.ts`) |
| "`check:migrations` slaagt stil zonder `origin/main`" | Overdreven: slaat over mét melding; CI haalt `origin/main` altijd op |
| "`search_path = public` ook in 0044" | Onjuist voor 0044; wel in 0040, 0041, 0043 |
| "Actions draait sinds 10-06 niet" | Verouderd: CI en Beveiliging zijn op 2026-10-09 groen gedraaid |
| `main` onbeschermd | Klopt (API: "Branch not protected"); repo is publiek. De diff-guard is daar dus nog advies |
