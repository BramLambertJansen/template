---
status: voorstel
namespace: rolhek-dicht
sjabloon: mini
---

# Rolhek valt dicht bij storing

## Doel

Een rolhek dat niet start, crasht of zijn timeout haalt, laat de tool-aanroep niet meer door: `onFailure: "block"` op de
PreToolUse-entry van het rolhek ([ADR 0045](../adr/0045-railwerk.md) punt 3, herzien). Aanleiding: bevinding P9 van de
review van 3 november 2026.

## Rollen en wie wat ziet

n.v.t. — tooling voor de hoofdsessie en subagents in Claude Code; geen app-gebruikers.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

n.v.t. — geen routes.

## Kopieer de vorm van

- `test/hooks/werkstraat-script.test.ts` — `.claude/settings.json` lezen en een hook-entry vastpinnen
- `scripts/kit/toolchain.mjs` — voorcontrole met een melding die de oplossing noemt

## Acceptatiecriteria

- **rolhek-dicht/AC-1** — Gegeven `.claude/settings.json`, dan heeft precies de PreToolUse-hook die
  `.claude/hooks/rolhek.mjs` start `"onFailure": "block"`. Geen andere hook heeft het: de meethook, de melding en de
  statusregel blijven fail-open (R-ROL-09), de toets op effect houdt zijn eigen catch-all (spec rolhek-effect AC-7), en
  werkstraat valt al dicht via exit 2 in de lader.
- **rolhek-dicht/AC-2** — De timeout van het rolhek blijft 10 seconden. De bouw-PR meet de duur van het rolhek over de
  bestaande fixtures van `test/hooks/rolhek-script.test.ts` (mediaan en maximum) en zet beide in de PR-beschrijving; is het
  maximum hoger dan 2 seconden, dan stopt de bouw en komt er eerst een nieuwe besluit-PR (timeout of rolhek sneller).
- **rolhek-dicht/AC-3** — `scripts/doctor.sh` eist Claude Code 2.1.295 of nieuwer (de versie waarin `onFailure` kwam). Bij
  een oudere versie: `✗ Claude Code <versie> is te oud: het rolhek valt pas vanaf 2.1.295 dicht bij storing → werk Claude
  Code bij`. Zonder `claude` op het pad (CI) slaat de doctor de controle over met een regel die dat zegt. Een tabeltest dekt
  ouder, gelijk, nieuwer, onleesbaar en afwezig.
- **rolhek-dicht/AC-4** — `docs/ENVIRONMENT.md` noemt de minimale versie en waarom; R-ROL-09 in `docs/framework.md` zegt
  dat het rolhek ook bij timeout en crash dichtvalt (`onFailure: block`) en dat alleen de meethook, melding en statusregel
  fail-open blijven. Het regelboek groeit netto niet.
- **rolhek-dicht/AC-5** — `docs/operations/agent-doorloop.md` beschrijft wat de sessie doet als het rolhek door storing
  blokkeert: melden met de foutregel, de eigenaar vragen, de hook nooit uitzetten of omzeilen (R-PRINC-09).

## Hergebruik en UX

n.v.t. — geen UI. Melding van de doctor letterlijk zoals in AC-3.

## Open vragen

- **OV-1** — Ook `onFailure: "block"` op werkstraat (SubagentStop, Stop)? Opties: ja, nee. Aanbeveling: nee; de lader geeft
  bij een fout al exit 2, en een haperende Stop-hook die blokkeert houdt een sessie vast zonder dat er iets te beschermen is.
