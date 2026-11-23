---
status: goedgekeurd
namespace: sandbox-plaatshouders
---

# Plaatshouders van de sandbox blokkeren `pnpm pr:verify` niet

## Doel

Een lege plaatshouder die de sandbox neerzet, blokkeert de
werkmapcontrole van `pnpm pr:verify` niet (ADR 0084 punt 2, ADR 0091 punt 2). Het gedrag bestaat al; deze spec verandert het
niet.

## Rollen en wie wat ziet

De hoofdsessie draait `pnpm pr:verify`; geen app-gebruikers.

## Kopieer de vorm van

- `rails/hooks/lib/sandbox-plaatshouders.mjs` — `SANDBOX_LEEG` en `isNulApparaat`
- `scripts/kit/pr-verify.mjs` — `verifyWorktree`

## Hergebruik en UX

Geen UI. De foutmelding van `verifyWorktree` blijft zoals nu en noemt een plaatshouder niet.

## Acceptatiecriteria

- **sandbox-plaatshouders/AC-1** — `SANDBOX_LEEG` in `rails/hooks/lib/sandbox-plaatshouders.mjs` is precies deze 19 paden,
  volledig vanaf de wortel: `.bash_profile`, `.bashrc`, `.profile`, `.zshrc`, `.zprofile`, `.gitconfig`, `.gitmodules`,
  `.ripgreprc`, `.mcp.json`, `.idea`, `.claude/commands`, `.claude/launch.json` (voorbeeld), `.claude/loop.md` (voorbeeld), `.claude/output-styles`,
  `.claude/routines`, `.claude/scheduled_tasks.json` (voorbeeld), `.claude/workflows`, `.env`, `.env.local`. Een pad erbij vraagt
  eigenaarakkoord (ADR 0084 punt 2). Bewijs nu: `test/hooks/sandbox-plaatshouders.test.ts:134`.
- **sandbox-plaatshouders/AC-2** — `isNulApparaat` is waar voor precies een tekenapparaat met major 1 en minor 3; een ander
  apparaat, major of minor, of rdev 1,3 zonder tekenapparaat is onwaar. Bewijs nu:
  `test/hooks/sandbox-plaatshouders.test.ts:140`.
- **sandbox-plaatshouders/AC-3** — `pnpm pr:verify` neemt geen set afgeschermde paden aan van buiten: een extra CLI-vlag
  (`--afgeschermd=.env`) geeft exit 1 met `Gebruik: pnpm pr:verify`. Bewijs nu: `test/hooks/sandbox-plaatshouders.test.ts:164`.
- **sandbox-plaatshouders/AC-4** — `verifyWorktree` blokkeert niet op een ongetrackte statusregel voor een pad uit
  `SANDBOX_LEEG` dat niet in HEAD en niet in de index staat en een leeg gewoon bestand zonder uitvoerbit (de lege blob, sha1 of
  sha256) of een tekenapparaat 1,3 is. Het blokkeert wel bij inhoud, een uitvoerbit, een symlink, een gestaged of getrackt pad
  en elk pad buiten de lijst; naast een echte wijziging noemt de fout alleen die wijziging. `werkmapNegeer` blijft gelijk.
  Bewijs nu: `test/hooks/sandbox-plaatshouders.test.ts:183`.
- **sandbox-plaatshouders/AC-5** — `.env` en `.env.local` (leerpunt #642): in een repository die ze niet negeert, blokkeert een
  leeg ongetrackt exemplaar niet en een exemplaar met inhoud wel; met de `.gitignore`-regels van de template ziet
  `verifyWorktree` ze nooit. Bewijs nu: `test/hooks/sandbox-plaatshouders.test.ts:314`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Leeg `.bashrc` naast een nieuw `src/x.ts` (voorbeeld) | fout noemt alleen `src/x.ts` (voorbeeld) (AC-4) | n.v.t. |
| Leeg `.gitmodules` dat getrackt is | blokkeert (AC-4) | n.v.t. |

## Raakt ook

Niets aan gedrag. De bouw hernoemt de describes in `test/hooks/sandbox-plaatshouders.test.ts` naar deze AC-id's en past het
kopcommentaar (r.19) aan (spec vervallen-documenten-weg). Geen migratie, route, permissie of resource: niet
`check:migrations`, `check:secdef`, `test:db`, `test/security/resources.ts`.

## Buiten scope

De effecttoets en de afschermingsherkenning via mountinfo: weg door ADR 0091.

## Testplan

Geen nieuwe tests: de bestaande describes dragen het nieuwe AC-id (R-TEST-02: alleen naam en commentaar wijzigen).

## Open vragen

- **OV-1 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Eigen spec of AC's in spec rolhek-vooraf? Aanbeveling: eigen spec; het is de werkmapcontrole van `pr:verify`,
  een ander mechanisme dan de toets vooraf (één levende spec per mechanisme, R-WERK-07).
