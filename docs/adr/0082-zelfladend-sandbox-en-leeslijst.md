# 0082 — Zelfladende paden: afscherming door de sandbox, vooraf een leeslijst

Status: geaccepteerd
Herzien: 2026-11-05 (#566): punt 2, `./.git/commondir` blijft in `denyWrite`; S0 vervalt na meting M0 deel 2.
Herzien: 2026-11-05 (#553): punt 2, een echt `.git/commondir` helpt niet; een agentsessie werkt in een worktree.

Wijzigt [0071](0071-rolhek-vooraf-vaste-lijst.md) punt 2 en [0061](0061-claude-sandbox-werkstraat.md) punt 3. Drempel: A3
(een grens verschuift van tekst naar het besturingssysteem). Aanleiding: leerpunt #500 (PR #494, drie reviewrondes met
telkens nieuwe omwegen). Uitwerking, metingen en volgorde: [spec rolhek-vooraf-krimp](../specs/rolhek-vooraf-krimp.md) AC-3
en AC-9.

## Context

0071 punt 2 is al een leeslijst, maar alleen voor woorden die letterlijk een zelfladend pad noemen. Voor wat een pad niet
letterlijk noemt (een map erboven, het impliciete doel van een uitpakker, een doeloptie), somt de code programma's en vormen
op: kopiëren, uitpakken en wissen in `rails/hooks/lib/zelfladend.mjs`. Elke reviewronde vond er een die ontbrak. Onzichtbaar
blijven `rm -rf "$PWD"`, `chmod -R 000 .claude` en `node -e` met een samengesteld pad. Bij `.claude/hooks/**` draait een
vervangen hook al vóór de toets op effect.

Wat er is, gemeten op 4 november 2026 in de hoofdcheckout, via `/proc/self/mountinfo` vanuit Bash:

- De repo zet in `sandbox.filesystem.denyWrite` `./.git/rolhek-effect` en `./.git/commondir`. Spec rolhek-effect AC-6
  noemt alleen het eerste.
- Claude Code zelf koppelt daarnaast alleen-lezen: `.claude/settings.json`, `.claude/settings.local.json`, `.claude/hooks`
  (met `.cache`), `.claude/skills`, `.claude/agents`, `.git/hooks`, `.git/config` en per worktree `config.worktree` en
  `commondir`. `.mcp.json` maskeert het. Dat komt niet uit de repo en niet uit managed settings (die bestaan op deze machine
  niet). Het is ingebouwd en hangt af van de versie.
- Schrijfbaar zijn `lefthook.yml`, `node_modules` (de git-hookstub valt terug op de lefthook daarin), `.git/refs`,
  `packed-refs`, `HEAD`, `index`, `info` en `objects`. `.pnpmfile.cjs` en `.mcp.json` bestaan niet. `settings.local.json`
  bestaat lokaal maar wordt niet gevolgd.
- Een pad in `denyWrite` dat niet bestaat, maskeert de sandbox met `/dev/null` op een `nodev`-mount, en lezen geeft dan
  `EACCES`. Zo faalt in de hoofdcheckout elk git-commando in Bash op `.git/commondir` (leerpunt #553).
- De afscherming geldt voor de hele sessie en voor elke rol (een subagent krijgt dezelfde mounts), maar alleen voor Bash.
  Hooks draaien buiten de sandbox, net als de `sandbox.excludedCommands`.
- Git werkt er niet omheen: `git switch` en `git merge --ff-only` breken af op een afgeschermd `settings.json` (review
  2026-10-12 punt 9).

0071 wees `denyWrite` op zelfladende bestanden af, omdat git dan halverwege faalt en zelf in `.git` schrijft. Dit besluit
draait dat deels om. Voor `settings.json` en de stubs geldt het falen van git al, door Claude Code zelf. Nieuw is alleen
`lefthook.yml`. Heel `.git` blijft buiten `denyWrite`.

## Besluit

1. **Het besturingssysteem schermt de genoemde paden af.** `denyWrite` noemt expliciet `./.claude/hooks`,
   `./.claude/settings.json`, `./lefthook.yml`, `./.git/hooks` en `./.git/config`, naast `./.git/rolhek-effect`. Voor die
   paden hangt de grens dan niet meer af van wat Claude Code zelf afschermt. Buiten `.git` komt in `denyWrite` alleen een
   pad dat git volgt. In een gekoppelde worktree is `.git` een bestand: of de `.git`-paden daar werken, bepaalt een meting.
   Tot die meting geldt de grens alleen in de hoofdcheckout.
2. **`./.git/commondir` blijft in `denyWrite`** (besluit eigenaar, 4 en 5 november 2026; gemeten 5 november 2026). De
   eigenaar besliste dat het pas uit `denyWrite` gaat, met `GIT_COMMON_DIR` en een weigering in elke hook die git aanroept
   (S0), als een proef in de kooi aantoont dat het git van Claude Code zelf het bestand niet volgt. De proef (M0 deel 2,
   Claude Code 2.1.318, git 2.53.0) toonde het omgekeerde: dat git leest de config uit een nieuw `.git/commondir`,
   zonder dat een hook ertussen zit. Een weigering in een hook houdt dat dus niet tegen (afgeleid; de hooks van de
   template zelf zijn niet beproefd). S0 vervalt daarmee. Git in Bash blijft in de hoofdcheckout kapot en werkt alleen in een
   worktree (leerpunt #553). Meting en beperkingen: spec rolhek-vooraf-krimp, M0.
   Een echt `.git/commondir` met inhoud `.` helpt ook niet (gemeten 5 november 2026, Claude Code 2.1.318, git 2.53.0, in
   een verse sessie in de hoofdcheckout). Het eerste Bash-commando zag een gewoon bestand en git werkte. Het tweede
   weigerde schrijven (`EACCES`) en hernoemen en verwijderen (`EBUSY`). Daarna stond het `/dev/null`-masker er weer, en
   in een terminal buiten de sandbox was het bestand weg. Wat het verwijdert, is niet vastgesteld; de repo doet het niet.
   Een agentsessie in Claude Code werkt daarom in een worktree. De SessionStart-melding noemt in elke hoofdcheckout
   (`.git` is een map) `EnterWorktree` en daarna `git fetch origin main && git switch --no-track -c <naam> origin/main`.
   De verse-main-melding van het rolhek noemt die vorm met `--no-track`. Uitwerking: spec rolhek-vooraf-krimp AC-3.
3. **Vooraf een leeslijst, ook voor wat geen pad letterlijk noemt.** Een woord kan naar een zelfladend pad wijzen:
   letterlijk, als glob, als map erboven, of als niet-herleidbare expansie. Een commando met zo'n woord gaat alleen door
   bij een programma van een vaste leeslijst, of bij git volgens de bestaande git-regels. Elk ander programma valt dicht.
   Het impliciete doel van uitpakkers en van `find` zonder startpad blijft een regel. Het nieuwe draait eerst als schaduw
   (0071 punt 6).
4. **De grens wordt benoemd, niet gedicht.** Wat buiten de grens valt:
   - een programma dat zelf een pad samenstelt; geen tekstregel ziet dat, ook niet bij git zelf (`git update-ref`,
     `git push . HEAD:refs/remotes/origin/main`);
   - refs, `HEAD` en `index`; die laden geen code. Ze worden gezien door de toets op effect, de stub-lader (die leest zijn
     anker) en de remote;
   - `node_modules`;
   - `settings.local.json` en `.mcp.json`, die Claude Code laadt maar git niet volgt. Ze komen in `zelfladend` en krijgen
     dus de regel vooraf, maar niet in `denyWrite`;
   - een `.git` die een agent zelf plant (`x/.git` met `core.fsmonitor`, dan `cd x`). De statusregel draait daar buiten
     de sandbox `git status`, omdat de hookroot bewust de cwd volgt (voor worktrees). Dat is een bestaand restrisico. Het
     gaat dicht als elke hook git start met de veilige opties van de toets op effect (`-c core.fsmonitor=false` en
     dergelijke); dat is een eigen leerpunt;
   - het git dat Claude Code zelf buiten de sandbox draait, zonder hook ertussen (de `gitStatus`-context bij start,
     hervatten of compacteren). Gemeten (M0 deel 2, alleen in `claude -p`, niet interactief): het leest de config uit een nieuw `.git/commondir`. Het zet op
     elke aanroep `core.fsmonitor=`, `core.hooksPath=/dev/null` en `hook.*.enabled=false`, zodat een geplante
     `core.fsmonitor` niets uitvoert. Dat is gedrag van die versie, niet iets wat de repo afdwingt. Daarom blijft
     `./.git/commondir` in `denyWrite` (punt 2);
   - wat een excludedCommand buiten de sandbox doet, ook git. Die commando's beschermt alleen het rolhek vooraf.
     Schrijft er een een zelfladend pad, dan draait de vervangen stub de toets zelf. Er staat dan geen toets meer
     tussen, alleen de vraag aan de eigenaar vooraf (`permissions.ask`, of bij
     `pnpm rolhek:overnemen` het rolhek).

## Alternatieven

- **De opsomming blijven dichten.** Elke ronde een nieuwe vorm, en `node -e` gaat nooit dicht.
- **Heel `.git`, of `node_modules`, in `denyWrite`.** Dan falen `commit`, `fetch` en `pnpm install`.
- **`./.git/commondir` uit `denyWrite` halen, de hooks weigeren laten (S0).** Vervallen: het git van Claude Code
  volgt het bestand zonder dat een hook ertussen zit (M0 deel 2). Git in Bash blijft daardoor kapot in de hoofdcheckout.
- **Een echt `.git/commondir` met inhoud `.` in de hoofdcheckout, gezet door bootstrap.** Vervallen: het bestand
  verdwijnt tussen twee Bash-commando's en het masker komt terug (punt 2, gemeten 5 november 2026).
- **Alleen de sandbox, geen regel vooraf.** Dan blijft voor `.git/refs` alleen een toets achteraf, en die ziet ze niet.
- **Bash van subagents helemaal beperken tot de leeslijst.** Dan kunnen developer en tester geen tests meer draaien.
- **Een sandbox per rol.** Die kent Claude Code niet.

## Gevolgen

- Een Bash-schrijfactie op een afgeschermd pad faalt voor elke rol, ook als het rolhek faalt. De hoofdsessie wijzigt die
  paden via Edit, op `ask`.
- `git merge origin/main`, `pull` en `checkout` falen in de sandbox als ze `lefthook.yml` meenemen, zoals nu al bij
  `settings.json` en de stubs. Dat beperkt 0061 punt 3, spec claude-sandbox-werkstraat AC-6 en de conflictroute van
  R-WERK-12. Het herstel legt de spec vast.
- De grens van punt 1 geldt pas na de metingen van de spec, ook die tegen het hernoemen van een bovenliggende map
  (R-WERK-23).
