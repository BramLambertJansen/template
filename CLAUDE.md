@AGENTS.md

Dit bestand bevat aanvullingen voor Claude Code. De platformneutrale werkstraat en projectregels staan in `AGENTS.md` en `docs/framework.md`; runtime-specifieke hooks, tools en agentconfiguratie gelden alleen in Claude Code.

## Werkstraat (verplicht)

1. **Spec** — bij migratie, nieuwe route of nieuwe permissie. Niet bouwen vóór `status: goedgekeurd`.
2. **Contract** — zod-schema's en routes die `501` teruggeven.
3. **Tester-subagent** — acceptatietests tegen het contract; ze compileren en falen op hun asserties.
4. **Bouwen** — tot alle tests groen zijn. Tests toevoegen mag, bestaande wijzigen niet. Lijkt een test van de
   tester fout: stop, leg het de eigenaar voor; na akkoord past de tester hem aan.
5. **Reviewer-subagent** — schone context, loopt `docs/dod.md` af, rapporteert alleen correctheid,
   duplicatie, spec-afwijking en ontbrekende testinhoud.
6. **Eigenaar** — reviewt en merget. Jij nooit.

Licht pad (geen migratie, route of permissie): plan → bouwen → review.

## Stoppen en vragen

- Een beslissing ontbreekt, de spec spreekt zichzelf tegen, of een regel staat de opdracht in de weg.
- Een check faalt en de fix zou een regel, check, hook of test afzwakken.
- Na twee mislukte correctiepogingen: stop, vat samen wat je probeerde, vraag om richting.

## Zuinig met context

- Onderzoek via een subagent die alleen een conclusie teruggeeft.
- Lees `db/schema.snapshot.sql` in plaats van alle migraties (zodra die bestaat).
- Externe diensten via hun CLI (`gh`); MCP alleen read-only. Geen `docker`.

Subagents, skills en hooks volgen in fase 1 (`docs/roadmap.md`). Tot de gespecialiseerde agents bestaan, gebruik je voor de tester- en reviewerrol ad-hoc subagents met dezelfde afgebakende opdracht. Als een rol niet onafhankelijk kan worden uitgevoerd, leg je die stap voor aan de eigenaar; je reviewt nooit je eigen werk.
