# Changelog

Volgt [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/). Een release-tag krijgt hier een sectie.

## [Unreleased]

- Skelet: plan, roadmap, mappenstructuur, AGENTS.md/CLAUDE.md, spec-sjabloon, DoD, basisconfiguratie.
- Provider-neutraal framework (`docs/framework.md`), ADR 0001–0005, padregels, lokale stack (Postgres 17 + pgTAP, Mailpit).
- Review 2026-10-09 doorgevoerd: rollen en baseline-migratie, sessiebeleid, CSRF, permissies en sandbox, toolchain.
- `docs/nieuwe-app.md` (setup-playbook) en ADR 0006: koppeling met merge-commits, app-ADR's vanaf 0100, tussentijdse ruleset;
  compose met `--env-file .env.local`; `bubblewrap`/`socat` als vereiste.
- Werkstraat platformneutraal en fasebewuste DoD: beveiligingscriteria gelden in elke fase, vereiste checks komen uit §10 en moeten slagen,
  rolvereisten (tester/reviewer) los van de runtime; CSRF-regel vastgelegd in ADR 0007 (voorgesteld) met testmatrix; `docs/roadmap.md` is nu een beschermd pad.
- Opruimen en core-grens: `docs/background/plan-v1.md` verwijderd (sprak het framework tegen, o.a. Supabase); laatste versie in
  commit `8422b8663489c1bbf63f39ebd6faa32a62098c85`. ADR 0008 (grens core/app, voorgesteld) met `src/core/`, nieuwe padregel `core.md`
  en aangepaste beschermde paden; ADR 0009 (tests buiten de sandbox, voorgesteld). Roadmap fase 1 als zes verticale stukken met
  "klaar als" per stuk; ADR-nummer voor het datapad niet meer vast. Framework §6: env-schema weigert `.env.example`-waarden buiten localhost.
- Review framework 2026-10-09 (`docs/reviews/2026-10-09-framework.md`) doorgevoerd: baseline gefixt (rechten `app_definer`) en schema
  `better_auth` (ADR 0010, voorgesteld); ADR 0009 herzien (alles in de runner); sandbox: `excludedCommands` met argumenten en in `ask`,
  `denyRead` op inloggegevens; testregel versoepeld; env-regel op `APP_ENV`; ADR 0007/0008 aangescherpt; roadmap: rails en test-infra in
  stuk 1, stuk 3 in 3a–3d, Better Auth uit fase 0.
- ADR 0006–0010 geaccepteerd door de eigenaar (2026-10-09); ADR 0001, 0003 en 0004 verwijzen naar wat ze deels vervangt.
- Vergelijking met ABAS (`docs/reviews/2026-10-09-abas-vergelijking.md`) en ADR 0011: railwerk uit ABAS overgenomen — rolhek met één
  padenlijst (`.claude/gates.json`), geteste hooks, groen vóór klaar, ratchet, gate-register, live feiten, vijf rollen, diff-guard met exacte
  goedkeuring, functiecatalogus, Betterleaks; settings weigeren zelfreview en `LEFTHOOK=0`; roadmap-items noemen het ABAS-bronbestand.
