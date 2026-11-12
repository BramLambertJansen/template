# 0085 — Dependencies in een worktree installeert de agent, binnen de sandbox

Status: geaccepteerd
Herzien: 2026-11-10 (#672): gewijzigd door [0088](0088-tests-naar-vermogen.md): het gevolg over de unit-tests die in de sandbox
falen (ze slaan over met een melding; CI blijft het bewijs)

Herziet de afweging in [0061](0061-claude-sandbox-werkstraat.md) (alternatief "Projectstore, cache en state opnieuw
inrichten"); de globale pnpm-opslag blijft onschrijfbaar. Drempel: A3 (een commando wordt automatisch toegestaan) en A4.
Aanleiding: gemeten wrijving (7 november 2026). Uitwerking: [spec claude-sandbox-werkstraat](../specs/claude-sandbox-werkstraat.md)
AC-10 tot en met AC-12.

## Context

Sessies via Remote Control draaien elk in een worktree onder `.claude/worktrees/`, zonder `node_modules`. In de sandbox
faalt `pnpm install` (globale store buiten de schrijfgrens: `ERR_SQLITE_ERROR`), weigert elk `pnpm <script>` op
`verifyDepsBeforeRun: error` en weigert `feiten.mjs` ("toolchain ontbreekt … draai bootstrap.sh"). Agents probeerden pnpm
steeds opnieuw en improviseerden; in vijf worktrees stonden drie noodoplossingen (echte map, symlink naar de hoofdcheckout,
niets). De proef in een worktree, binnen de sandbox: `pnpm install --frozen-lockfile` met store, cache en state onder `$TMPDIR`
slaagde in 12,7 s; daarna slaagden `typecheck`, `lint`, `format:check` en `feiten.mjs` met de verificatie aan. De bestanden
zijn kopieën (1 link), niets gedeeld met de globale store of de hoofdcheckout; ongeveer 0,5 GB store en 0,27 GB per worktree.

## Besluit

1. **In een gekoppelde worktree installeert de agent `node_modules` zelf**, uitsluitend frozen volgens de gecommitte
   lockfile, binnen de sandbox, met store, cache en state onder `os.tmpdir()`. Node, pnpm, mise en de git-hooks blijven bij
   de eigenaar (`scripts/bootstrap.sh`, R-TOOL-01); de hoofdcheckout ook.
2. **Eén script, met node:** `scripts/kit/worktree-install.mjs` weigert buiten een gekoppelde worktree en als `node_modules`
   een symlink is, en draait daarna `pnpm install --frozen-lockfile` met die drie mappen. Niet via een `pnpm`-script: dat
   faalt zonder dependencies op `verifyDepsBeforeRun`.
3. **Een letterlijke allow-regel** voor `node scripts/kit/worktree-install.mjs` in `.claude/settings.json`. `pnpm install *`
   en de andere installatievormen blijven op de vraaglijst.
4. **De gate is `feiten.mjs`**, de eerste stap van elke sessie: de melding van `scripts/kit/toolchain.mjs` noemt in een
   worktree dat commando in plaats van `bootstrap.sh`.

## Alternatieven

- **Globale store schrijfbaar:** de hardlinks delen bestanden met alle projecten (gemeten: 14 links op één `package.json`).
- **Installeren vanuit een SessionStart-hook buiten de sandbox:** botst met 0061; lifecycle-scripts en pnpm-configuratie komen
  uit een werkmap die de agent beschrijft; de hook draait ook bij hervatten en de timeout is al grotendeels benut.
- **Symlink naar de `node_modules` van de hoofdcheckout en de verificatie uit:** zet een check uit, deelt veranderlijke staat,
  en faalt met `EROFS` op tijdelijke mappen.
- **Letterlijk `pnpm install …` in de allow-lijst:** de vraagregel `pnpm install *` gaat voor, en `$TMPDIR` verschilt per
  gebruiker.
- **Niets doen:** `feiten.mjs` en de stop-hooks werken dan niet in een worktree.

## Gevolgen

- De Stop-hooks draaien buiten de sandbox `pnpm exec …` in de werkmap, dus code uit een door de agent beschrijfbare
  `node_modules`; dat geldt nu al in de hoofdcheckout en gaat met dit besluit ook in worktrees gelden.
- In de sandbox falen ongeveer 382 unit-tests door de sandbox zelf (geneste bubblewrap, tijdelijke mappen buiten de
  schrijfgrens); ze blijven ongewijzigd en CI is het bewijs.
- De store onder de tijdelijke map is wegwerpbaar; een worktree opruimen ruimt zijn `node_modules` mee op. De cloud
  (`scripts/cloud-setup.sh`) verandert niet. De bouw-PR werkt de docs bij die nu een kortere installatievorm noemen.
