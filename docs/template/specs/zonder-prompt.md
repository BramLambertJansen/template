---
status: gebouwd
namespace: zonder-prompt
---

# Een claim "zonder prompt" klopt met `.claude/settings.json`

## Doel

`check-docs` faalt als het regelboek, een ADR of een operationeel document een commando buiten de sandbox
(`sandbox.excludedCommands`) "zonder prompt" noemt dat niet in `permissions.allow` staat, of dat in `ask` of `deny` staat
(leerpunt #873).

## Rollen en wie wat ziet

- **Hoofdsessie, architect, developer:** zien de melding in `pnpm ratchet` (en dus `gate:fast` en CI).
- **Reviewer:** hoeft zo'n claim niet meer met de hand tegen `allow` te leggen; wat Buiten scope staat, toetst hij nog zelf.
- **Eigenaar:** niets nieuws te doen.

## Kopieer de vorm van

- `scripts/kit/check-docs.mjs` — `docsViolations` voegt per deelcheck een lijst `{ key, message }` toe; `CODESPAN` en `HEK`
  voor code tussen backticks en codeblokken; `ADR_STATUS` voor de status van een ADR.
- `test/rails/check-docs-werkmapnegeer.test.ts` — een tijdelijke git-repo per fixture, gefilterd op de sleutel.

## Hergebruik en UX

Geen UI. Nieuw bestand `scripts/kit/zonder-prompt.mjs` (`check-docs.mjs` is al lang) met één export
`zonderPromptViolations(files, read)`, aangeroepen vanuit `docsViolations`.

Werking:

1. **Documenten:** getrackte `.md`-bestanden: `docs/framework.md`, `docs/ENVIRONMENT.md`, `docs/operations/**`,
   `docs/template/adr/*.md`, `docs/adr/*.md` (niet `docs/adr/archief/`), `AGENTS.md`, `CLAUDE.md`, `.claude/rules/**` en
   `.claude/agents/**`. Een ADR telt alleen met status `voorgesteld` of `geaccepteerd`. Specs en de changelog tellen niet:
   die leggen metingen en historie vast.
2. **Tekst:** codeblokken tussen hekken vallen weg; een alinea wordt één regel. Een zin loopt tot `;` of een zinseinde (`.`, `!`
   of `?` gevolgd door witruimte), buiten codespans.
3. **Claim:** elke treffer van "zonder prompt" als hele woorden (hoofdletterongevoelig, niet "zonder prompttekens"), buiten
   codespans. Geclaimd zijn de codespans in de aaneengesloten opsomming direct ervóór, alleen gescheiden door `,`, `en`, `of` en
   witruimte, die op een commando lijken (minstens twee woorden, het eerste begint met een kleine letter; `pr:verify` telt dus
   niet). Een zin met het hele woord `rolhek`, `hook` of `hooks` (een koppelteken hoort bij het woord: "lefthook-hooks" telt niet) slaat de check over: daar beslist een hook (OV-1).
4. **Toets:** een geclaimd commando geeft een melding als een regel `Bash(<patroon>)` uit `permissions.ask` of `permissions.deny`
   het dekt; anders alleen als een patroon uit `sandbox.excludedCommands` het dekt en geen regel uit `permissions.allow`. Binnen
   de sandbox draait een commando al zonder prompt (`autoAllowBashIfSandboxed`; staat die niet op `true`, dan telt elk commando
   als buiten de sandbox). Een patroon dekt zoals in Claude Code: `*` is elke tekst, een afsluitende ` *` dekt ook het kale
   commando. De claim (ook een `*` of `<nr>` erin) wordt letterlijk getoetst.

Meldingen letterlijk, sleutel `docs:zonder-prompt:<bestand>:<commando>`:

- `<bestand>:<regel>: \`<commando>\` heet zonder prompt, maar staat niet in permissions.allow van .claude/settings.json`
- `<bestand>:<regel>: \`<commando>\` heet zonder prompt, maar staat in permissions.<ask|deny> van .claude/settings.json`

Zonder getrackt `.claude/settings.json` geeft de check niets; onleesbare JSON geeft één melding met sleutel
`docs:zonder-prompt:settings`.

## Acceptatiecriteria

- **zonder-prompt/AC-1** — Gegeven `docs/framework.md` met "`gh api *` zonder prompt", `gh api *` in `excludedCommands` en niet in
  `allow`, wanneer `check-docs` draait, dan een melding met sleutel `docs:zonder-prompt:docs/framework.md:gh api *` en "staat niet
  in permissions.allow"; met `Bash(gh api *)` in `allow` geen melding. Toets: `test/rails/check-docs-zonder-prompt.test.ts`
- **zonder-prompt/AC-2** — Gegeven "`git commit`, `git push origin HEAD` en `pnpm pr:verify *` zonder prompt", alle drie in
  `excludedCommands` en gedekt door `allow`, wanneer `check-docs` draait, dan geen melding; met `Bash(pnpm pr:verify *)` ook in
  `ask` wel, met "staat in permissions.ask". Toets: `test/rails/check-docs-zonder-prompt.test.ts`
- **zonder-prompt/AC-3** — Gegeven "`git status --short` zonder prompt", niet in `excludedCommands` en niet in `allow`, wanneer
  `check-docs` draait, dan geen melding; met `autoAllowBashIfSandboxed: false` wel. Toets: `test/rails/check-docs-zonder-prompt.test.ts`
- **zonder-prompt/AC-4** — Gegeven een ADR met status `geaccepteerd` en een claim buiten `allow`, wanneer `check-docs` draait, dan
  een melding; met status `vervangen door 0001`, in een spec of in een codeblok geen. Toets: `test/rails/check-docs-zonder-prompt.test.ts`
- **zonder-prompt/AC-5** — Gegeven elk van deze zinnen met `gh api *` buiten `allow`, wanneer `check-docs` draait, dan geen melding:
  "`git commit *` en `gh api *` draaien buiten de sandbox, de eerste en `pr:verify` zonder prompt"; "`gh api *` volgens de regels;
  `git commit` zonder prompt"; "Het rolhek staat `gh api *` toe zonder prompt"; "`gh api *` zonder prompttekens"; "`gh api *` draait zonder prompt".
  Toets: `test/rails/check-docs-zonder-prompt.test.ts`
- **zonder-prompt/AC-6** — Gegeven een claim afgebroken over twee regels, wanneer `check-docs` draait, dan noemt de melding de
  regel van "zonder prompt"; onleesbare `.claude/settings.json` geeft sleutel `docs:zonder-prompt:settings`.
  Toets: `test/rails/check-docs-zonder-prompt.test.ts`
- **zonder-prompt/AC-7** — Gegeven de getrackte bestanden van de template zelf, wanneer `zonderPromptViolations` draait, dan geen
  melding. Toets: `test/rails/check-docs-zonder-prompt.test.ts`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Claim met wildcard tegen een smallere deny (`gh api *` tegen `gh api *merge*`) | Letterlijke toets: geen melding | — |
| "zonder prompt" in een codespan | Telt niet | — |

## Buiten scope

- Claims via een hook (`rolhek`) die zelf een prompt overslaat, zoals ADR 0069 punt 4 en ADR 0044 punt 5: de reviewer toetst ze.
- Een claim met een woord tussen de opsomming en "zonder prompt" ("`git push origin HEAD` slagen zonder prompt").
- Een claim in een kop met de commando's in de volgende zin (ADR 0044 punt 5), en andere bewoordingen ("houden hun prompt,
  behalve", "zonder vraag").

## Testplan

Unit-tests met tijdelijke git-repo's in `test/rails/check-docs-zonder-prompt.test.ts`; `pnpm ratchet` groen op de template.

## Open vragen

- **OV-1** — Moet een claim die het rolhek als bron noemt ook getoetst worden? Aanbeveling: nee; het rolhek heeft geen leesbare
  lijst van commando's zonder prompt.
- **OV-2** — Alleen commando's buiten de sandbox toetsen, of alles wat niet in `allow` staat? Aanbeveling: alleen buiten de
  sandbox (spec-review B2): binnen de sandbox draait alles al zonder prompt, en #873 gaat over `excludedCommands`.
