---
soort: documentatie
---

- `docs/nieuwe-app.md` (4.1, de `gh`-login, en stap 8 van de updateprocedure) schrijft het pushen van een
  workflowwijziging niet meer toe aan een ontbrekend agentrecht (leerpunt #816): de agent pusht onder de `gh`-login van
  de eigenaar (ADR 0093); de eigenaar voegt zo'n PR samen omdat `.github/**` beschermd is.
