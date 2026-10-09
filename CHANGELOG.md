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
