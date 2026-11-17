# 0082 — Zelfladende paden: afscherming door de sandbox, vooraf een leeslijst

Status: geaccepteerd
Herzien: 2026-11-05 (#566): punt 2, `./.git/commondir` blijft in `denyWrite`; S0 vervalt na meting M0 deel 2.
Herzien: 2026-11-05 (#584): punt 2, een echt `.git/commondir` helpt niet; een agentsessie werkt in een worktree.
Herzien: 2026-11-05 (#588): punt 2 en 4, gewijzigd door [0083](0083-bewaking-met-minder-wrijving.md): `./.git/commondir` gaat uit `denyWrite`, elke hook valt dicht bij een geplant bestand; de worktree is een keuze.
Herzien: 2026-11-16 (#745): ingekort tot wat nog geldt; de puntnummers zijn ongewijzigd, de oude tekst staat in git

Wijzigt [0071](0071-rolhek-vooraf-vaste-lijst.md) punt 2 en [0061](0061-claude-sandbox-werkstraat.md) punt 3. Drempel: A3
(een grens verschuift van tekst naar het besturingssysteem). Aanleiding: leerpunt #500 (PR #494, drie reviewrondes met
telkens nieuwe omwegen). Uitwerking, metingen en volgorde: [spec rolhek-vooraf-krimp](../specs/rolhek-vooraf-krimp.md) AC-3
en AC-9.

## Context

0071 punt 2 is al een leeslijst, maar alleen voor woorden die letterlijk een zelfladend pad noemen. Voor wat een pad niet
letterlijk noemt (een map erboven, het impliciete doel van een uitpakker, een doeloptie), somt de code programma's en vormen
op: kopiëren, uitpakken en wissen in `rails/hooks/lib/zelfladend.mjs`. Elke reviewronde vond er een die ontbrak. Onzichtbaar
blijven `rm -rf "$PWD"`, `chmod -R 000 .claude` en `node -e` met een samengesteld pad.

Wat er is, gemeten op 4 november 2026 in de hoofdcheckout, via `/proc/self/mountinfo` vanuit Bash:

- Claude Code zelf koppelt alleen-lezen: `.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks`
  (met `.cache`), `.claude/skills`, `.claude/agents`, `.git/hooks`, `.git/config` en per worktree `config.worktree` en
  `commondir`. `.mcp.json` maskeert het. Dat is ingebouwd en hangt af van de versie.
- Schrijfbaar zijn `lefthook.yml`, `node_modules` (de git-hookstub valt terug op de lefthook daarin), `.git/refs`,
  `packed-refs`, `HEAD`, `index`, `info` en `objects`.
- De afscherming geldt voor de hele sessie en voor elke rol (een subagent krijgt dezelfde mounts), maar alleen voor Bash.
  Hooks draaien buiten de sandbox, net als de `sandbox.excludedCommands`.
- Git werkt er niet omheen: `git switch` en `git merge --ff-only` breken af op een afgeschermd `settings.json` (review
  2026-10-12 punt 9).

0071 wees `denyWrite` op zelfladende bestanden af, omdat git dan halverwege faalt en zelf in `.git` schrijft. Dit besluit
draait dat deels om. Voor `settings.json` en de stubs geldt het falen van git al, door Claude Code zelf. Nieuw is alleen
`lefthook.yml`. Heel `.git` blijft buiten `denyWrite`.

## Besluit

1. *(vervallen: de lijst in `denyWrite` is nooit gebouwd; de uitvoering hing aan spec rolhek-vooraf-krimp, die met 0091
   punt 3 verviel. Wat blijft is de toets vooraf van punt 3 en wat Claude Code zelf afschermt, zie Context.)*
2. *(vervallen, zie 0083)*
3. **Vooraf een leeslijst, ook voor wat geen pad letterlijk noemt.** Een woord kan naar een zelfladend pad wijzen:
   letterlijk, als glob, als map erboven, of als niet-herleidbare expansie. Een commando met zo'n woord gaat alleen door
   bij een programma van een vaste leeslijst, of bij git volgens de bestaande git-regels. Elk ander programma valt dicht.
   Het impliciete doel van uitpakkers en van `find` zonder startpad blijft een regel. Voor een niet-herleidbare expansie
   (`rm -rf "$PWD"`) is dat niet gebouwd; die stap vervalt met 0091 punt 3.
4. **De grens wordt benoemd, niet gedicht.** Wat buiten de grens valt:
   - een programma dat zelf een pad samenstelt; geen tekstregel ziet dat, ook niet bij git zelf (`git update-ref`,
     `git push . HEAD:refs/remotes/origin/main`);
   - refs, `HEAD` en `index`; die laden geen code. Ze worden gezien door de stub-lader (die leest zijn anker) en de remote;
   - `node_modules`;
   - `settings.local.json` en `.mcp.json`, die Claude Code laadt maar git niet volgt. Ze komen in `zelfladend` en krijgen
     dus de regel vooraf, maar niet in `denyWrite`;
   - een `.git` die een agent zelf plant (`x/.git` met `core.fsmonitor`, dan `cd x`). De statusregel draait daar buiten
     de sandbox `git status`, omdat de hookroot bewust de cwd volgt (voor worktrees). Dat is een bestaand restrisico. Het
     gaat dicht als elke hook git start met veilige opties (`-c core.fsmonitor=false` en dergelijke); dat is een eigen
     leerpunt;
   - het git dat Claude Code zelf buiten de sandbox draait, zonder hook ertussen (de `gitStatus`-context bij start,
     hervatten of compacteren). Gemeten (M0 deel 2, alleen in `claude -p`): het leest de config uit een nieuw
     `.git/commondir` en zet op elke aanroep `core.fsmonitor=`, `core.hooksPath=/dev/null` en `hook.*.enabled=false`. Dat
     is gedrag van die versie, niet iets wat de repo afdwingt; zie 0083 punt 1;
   - wat een excludedCommand buiten de sandbox doet, ook git. Die commando's beschermt alleen het rolhek vooraf.
     Schrijft er een een zelfladend pad, dan draait de vervangen stub de toets zelf. Er staat dan geen toets meer
     tussen, alleen de vraag aan de eigenaar vooraf (`permissions.ask`).

## Alternatieven

- **De opsomming blijven dichten.** Elke ronde een nieuwe vorm, en `node -e` gaat nooit dicht.
- **Heel `.git`, of `node_modules`, in `denyWrite`.** Dan falen `commit`, `fetch` en `pnpm install`.
- **`./.git/commondir` beschermen met S0 of een echt bestand.** Vervallen na meting; zie 0083.
- **Alleen de sandbox, geen regel vooraf.** Dan blijft voor `.git/refs` alleen een toets achteraf, en die ziet ze niet.
- **Bash van subagents helemaal beperken tot de leeslijst.** Dan kunnen developer en tester geen tests meer draaien.
- **Een sandbox per rol.** Die kent Claude Code niet.

## Gevolgen

- `git merge origin/main`, `pull` en `checkout` falen in de sandbox als ze `.claude/settings.json` of de stubs meenemen:
  Claude Code schermt die af (zie Context). Dat beperkt 0061 punt 3, spec claude-sandbox-werkstraat AC-6 en de conflictroute
  van R-WERK-12.
