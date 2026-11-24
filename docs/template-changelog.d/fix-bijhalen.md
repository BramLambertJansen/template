---
soort: opgelost
---

- `node scripts/kit/bijhalen.mjs main | volg <ref> | terug` haalt `main` in een PR-branch of zet de branch vooruit,
  ook als die stap paden wijzigt die de sandbox niet kan schrijven (`.claude/skills`, `.claude/agents` en meer). Het script
  schrijft alleen de schrijfbare bestanden, zet de merge in de index en noemt de beschermde paden, die de agent met Edit
  bijwerkt vóór `git commit -F`; bij een fout zet het alles terug. De skill `opleveren` stap 1, de receptenkaart en
  `docs/operations/agent-doorloop.md` gebruiken het in plaats van "meld de eigenaar" (leerpunt #789, spec
  `docs/template/specs/bijhalen.md`).
