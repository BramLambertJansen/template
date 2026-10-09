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
