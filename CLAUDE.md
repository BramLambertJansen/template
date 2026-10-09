@AGENTS.md

## Werkstraat

1. Spec (bij migratie, nieuwe route of permissie) — wacht op status `goedgekeurd`.
2. Contract: zod-schema's en routes die `501` teruggeven.
3. Tester-subagent schrijft acceptatietests tegen het contract (compileren, falen terecht).
4. Hoofdsessie bouwt tot de tests groen zijn.
5. Reviewer-subagent keurt in schone context tegen `docs/dod.md`.
6. Eigenaar reviewt en merget.

Subagents, skills en hooks bestaan nog niet (fase 1, zie `docs/roadmap.md`).

## Zuinig met context

- Onderzoek via een subagent die alleen een conclusie teruggeeft.
- Lees `supabase/schema.snapshot.sql` in plaats van alle migraties (zodra die bestaat).
- Na twee mislukte correcties: stop en vraag om een betere opdracht.
- Externe diensten via hun CLI (`gh`, `supabase`), niet via MCP.
