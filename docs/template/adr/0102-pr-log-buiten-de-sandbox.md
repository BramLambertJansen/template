# 0102 — De hoofdsessie leest de log van een rode CI-job met een eigen script, buiten de sandbox

Status: geaccepteerd

Wijzigt [0061](0061-claude-sandbox-werkstraat.md) punt 5 (één commando erbij buiten de sandbox) en
[0069](0069-agent-merge-niet-kritiek.md) punt 4 (de ankertoets geldt ook voor dit script, zonder de modus). Drempel: A3 (een
nieuw commando buiten de sandbox) en A4. Uitwerking: [spec](../specs/ci-log.md). Besluit van de eigenaar, 2026-11-21:
ankertoets, net als `pr:merge` en `pr:resolve`.

## Context

Bij een rode CI-run haalt de agent de log van de rode job op. `gh run view --log-failed` werkt binnen de sandbox niet
(leerpunt #679) en `gh pr …` gaat in de cloud via GraphQL, dat de proxy weigert. Sinds spec `agent-recepten` staat de route in
de receptenkaart: drie losse `gh api`-aanroepen (runs van de commit, rode jobs, log). Een log is tientallen kilobytes groot
(gemeten: 54 KB voor één job); de agent leest het opgeslagen bestand en zoekt zelf naar `##[error]`. Dat kost elke CI-ronde
meerdere beurten en veel context. `gh` bereikt de token-proxy alleen buiten de sandbox (`sandbox.excludedCommands`); `gh api *`
mag daar al (R-TOOL-02), dus de extra blootstelling is één script dat alleen leest.

## Besluit

1. **Eén eigen script.** `pnpm pr:log <nummer>` leest bij GitHub de kop van de PR, de runs op die commit, de rode jobs en
   hun log, en toont per rode job alleen de regels rond elke `##[error]`, begrensd. Het schrijft niets: geen commentaar,
   geen status, geen bestand. Elke aanroep is `gh api <endpoint>` zonder schrijvende optie, met `node_modules/.bin` uit het
   PATH (zoals het mergescript).
2. **Buiten de sandbox, onder een ankertoets.** `pnpm pr:log *` komt in `sandbox.excludedCommands` en in `permissions.ask`, zoals
   `pr:merge` en `pr:resolve`.
   Het rolhek geeft alleen precies `pnpm pr:log <nummer>` zonder prompt vrij, alleen voor de hoofdsessie, vanuit de repo-root, met
   scripts, rails en hostbestanden gelijk aan het anker en geen `gh`, `git` of `node` in `node_modules/.bin` (de toets van
   0069 punt 4, zonder de modus: lezen hangt niet af van wie samenvoegt). Elke andere vorm die het script herkenbaar start,
   weigert het voor elke rol.
3. **Subagents niet.** Een subagent krijgt een weigering; de hoofdsessie levert de uitslag aan, zoals bij `pr:verify`.

## Alternatieven

- **Alleen de recepten uit de kaart:** werkt, maar kost per CI-ronde drie aanroepen en een log van tientallen kilobytes in
  de context.
- **Zonder ankertoets, zoals `pr:verify`:** kleiner, maar dan draait een script dat op de eigen branch is gewijzigd buiten de
  sandbox; de eigenaar koos de ankertoets.
- **De modus `niet-kritiek` ook eisen:** koppelt een leesactie aan de keuze wie samenvoegt; in een app met modus `eigenaar`
  zou de agent zijn eigen CI-log niet meer kunnen lezen.
- **De reviewer het script laten draaien (#898):** een subagent die code buiten de sandbox start, is een nieuwe grens; dat
  vraagt een eigen besluit.

## Gevolgen

- Een rode CI-run kost de hoofdsessie één aanroep en een begrensde uitvoer in plaats van drie aanroepen en een volledige log.
- Aanvaard risico: het script leest via `gh` in een eigen proces buiten het zicht van het rolhek, net als het merge- en het
  sluitscript. De grens is de ankertoets: een script dat op de eigen branch is gewijzigd, krijgt geen recht.
- Aanvaard risico: via een interpreter of een eigen script kan elke rol `gh` aanroepen zonder ankertoets; het rolhek ziet dat
  niet (R-ROL-10).
- Venster: tot een sessie een anker heeft met deze wijziging, kent het rolhek `pnpm pr:log` niet, terwijl de
  `settings.json` uit de werkmap het al buiten de sandbox zet. De regel in `ask` geeft dan een prompt: die is de grens tot
  het anker de wijziging heeft. In de bouw-PR draait de agent het script één keer, na die prompt (besluit van de eigenaar,
  2026-11-21; aanvaard risico: die keer draait de branchcode buiten de sandbox zonder ankertoets). Dat geldt voor elk nieuw commando buiten de sandbox: de regel in het
  rolhek komt pas met het anker.
- R-TOOL-02 noemt het commando; R-DOC-09 is van toepassing: de nieuwe uitzondering krijgt een tabeltest.
