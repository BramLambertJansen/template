# 0090 — Lichtere werkstraat: architect op verzoek, tester bij risicowerk, geen besluit-PR in de template

Status: geaccepteerd

Wijzigt [0046](0046-werkstraat-en-beslisroute.md) (architect, model per spec, besluit-PR),
[0057](0057-risicogestuurde-werkstraat.md) en [0058](0058-beperkte-fixroute-en-volledige-featurestraat.md) (rollen in de
volledige route) en [0062](0062-spec-en-bouw-in-een-pr.md) (kritiek werk eerst in een besluit-PR). Besluiten van de eigenaar,
2026-11-11.

## Context

De volledige route kost vijf overdrachten (architect, spec-review, tester, developer, reviewer) en kritiek werk twee PR's. In
de template gaan 46 % van de commits over papier. De check die de besluit-PR afdwong is weg (ADR 0089 punt 5); de review van
een code-eigenaar op GitHub bewaakt het besluit. De regel "model per spec" bestaat alleen op papier: het sjabloon heeft geen
veld en de agentbestanden leggen het model vast.

## Besluit

1. **Architect.** In een app schrijft de architect elke spec. In de template schrijft de hoofdsessie de spec; de architect
   komt op verzoek van de eigenaar of de hoofdsessie; bij risicowerk stelt de hoofdsessie hem voor aan de eigenaar.
2. **Spec-review blijft overal:** een verse reviewer toetst elke spec vóór het bouwen. Dat is de onafhankelijke toets op het
   ontwerp.
3. **Tester bij risicowerk en bij een lichte gedragsfix**, in template en app. Risicowerk is: auth en autorisatie (ook een nieuwe of
   verruimde permissie, A3), RLS en gegevensisolatie, geld, gelijktijdigheid, migratie op bestaande rijen, provider of dependency
   (A2), een vertrouwensgrens of externe koppeling, security, moeilijk herstel, een pad van R-WERK-05 met code; bij twijfel
   risicowerk. Elders schrijft
   de developer de tests eerst, in nieuwe testbestanden, en toetst de reviewer ze per acceptatiecriterium. Een lichte fix
   die gedrag wijzigt houdt de tester (R-WERK-03): daar verandert meestal een bestaande test, en die wijzigt de developer niet.
4. **Besluit-PR.** In de template vervalt hij: spec, code en tests staan in één PR, de spec in een eerdere commit; het besluit
   is de goedkeuring van de eigenaar op die PR. In een app blijft de besluit-PR voor kritiek werk een werkafspraak. Een
   geaccepteerd ADR herschrijven of verwijderen mag in de template in elke PR (was: alleen in een besluit-PR).
5. **Model per spec vervalt.** Het model staat in het agentbestand.

## Alternatieven

- **De architect overal schrappen:** afgewezen; in een app is een ontwerper met schone context de moeite waard, en bij
  risicowerk ook in de template.
- **De spec-review schrappen:** afgewezen; het is de enige onafhankelijke toets vóór de bouw.
- **De tester overal houden:** afgewezen; buiten risicowerk kost de overdracht meer dan hij vangt, en de reviewer toetst de
  tests per acceptatiecriterium.

## Gevolgen

- Een gewone feature in de template kost drie subagents (spec-review, developer, reviewer) in plaats van vijf; risicowerk vier
  of vijf.
- Aanvaard risico: tests van de bouwer kunnen zijn eigen aanpak spiegelen. De reviewer toetst ze per acceptatiecriterium; bij
  risicowerk blijft de aparte tester.
- R-WERK-04, R-WERK-05, R-WERK-07 en R-WERK-19 volgen dit ADR; `AGENTS.md`, `CLAUDE.md`, de agentbestanden, de skill `spec`
  en `docs/dod.md` ook.
