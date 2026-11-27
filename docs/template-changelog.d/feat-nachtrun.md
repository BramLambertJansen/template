---
soort: toegevoegd
---

- Nachtrun: een opdracht afmaken zonder de eigenaar (spec `nachtrun`, ADR 0115). De skill `nachtrun` stelt de vragen vooraf
  en werkt daarna door met voorlopige (`⏳ voorlopig`) en geparkeerde (`⏸ geparkeerd`) open vragen in de spec;
  `node scripts/kit/feiten.mjs besluiten` toont ze. Het rolhek geeft allow op de PR-tool
  (`mcp__<server>__create_pull_request`) voor de eigen werkbranch van de hoofdsessie. Tijdelijke bestanden van agents staan in `.tmp/` van de werkmap.

### Bij een update

- Neem `.gitignore` en `eslint.config.js` (de regel `.tmp/`) over. De doorlaat van het rolhek werkt na de merge op `main`
  van de app.
