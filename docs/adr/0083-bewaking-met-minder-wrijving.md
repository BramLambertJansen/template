# 0083 — Bewaking met minder wrijving: commondir uit de sandbox, nacontrole begrensd, vangnetten per segment

Status: geaccepteerd

Wijzigt [0082](0082-zelfladend-sandbox-en-leeslijst.md) punt 2 en 4 en [0066](0066-schrijfgrens-op-effect.md) punt 2.
Drempel: A3 (een grens van het besturingssysteem vervalt en een vangnet wordt smaller) en A4. Aanleiding: melding van de
eigenaar (5 november 2026) dat git, commit en push, de sandbox en de subagents "lopende band" falen, ook bij het opstarten van
een nieuwe app; leerpunten #553, #582, #583 en #587. Uitwerking: [spec rolhek-vooraf-krimp](../specs/rolhek-vooraf-krimp.md)
AC-3 en AC-10, [spec rolhek-effect](../specs/rolhek-effect.md) AC-10.

## Context

Drie lagen van de bewaking zijn elk apart verdedigbaar, maar geven samen meer valse meldingen dan echte. Gemeten op
5 november 2026, in één diagnosesessie van ongeveer twintig Bash-aanroepen in de hoofdcheckout en in een worktree:

- **`./.git/commondir` in `denyWrite` (0082 punt 2).** Het bestand bestaat in een hoofdcheckout niet; de sandbox maskeert het
  met `/dev/null`, en elk git-commando in Bash faalt, `gh` ook, en `feiten.mjs pad` kan de bewaking niet lezen. In een
  gekoppelde worktree werken `status`, `log` en `commit`, maar `git fetch` en `git worktree list` falen daar ook: ze lopen
  alle worktrees langs en lezen `.git/commondir` van de hoofdcheckout. De voorgeschreven startvorm
  (`git fetch origin main && git switch …`) faalt daardoor ook in een worktree; een verse branch kon alleen nog via de tool
  `EnterWorktree`, buiten de sandbox. De sandbox zelf viel één keer uit met `bwrap: Can't get type of source
  .git/commondir: No such file or directory`. En in een worktree schermt de sandbox niets af (`bewaking.mjs`: de map
  `.claude/worktrees` en de `settings.json` en `hooks` van de worktree zijn schrijfbaar). De worktree-route ruilt dus een
  kapotte git voor een onbewaakte sandbox. In de proef-app stond de regel al ongecommit uit de instellingen gehaald.
  Het risico dat de regel afdekte: het git dat Claude Code zelf buiten de sandbox draait, leest de config uit een geplant
  `.git/commondir` (0082 punt 4). Dat git zet bij elke aanroep `core.fsmonitor`, `core.hooksPath` en `hook.*.enabled` uit.
  Planten vraagt een schrijfactie in `.git`, die het rolhek vooraf voor elke rol weigert en de toets op effect achteraf ziet
  (`commondir` staat sinds spec rolhek-effect AC-1 in de vaste lijst).
- **De nacontrole van de toets op effect (0066 punt 2, spec rolhek-effect AC-4).** Een momentopname van een subagent blijft
  24 uur bewaard en wordt bij elke Bash-aanroep, elke Stop en elke `pr:verify` opnieuw met de huidige staat vergeleken. Alles
  wat daarna verandert, komt op naam van die subagent: branchrefs en commits van de hoofdsessie in een andere worktree (de
  vensters staan per worktree, de refs zijn gedeeld), het anker dat de stub-lader zelf schrijft, een merge door de eigenaar.
  Op 5 november stonden tien opnamen van elk 186 KB; elke Bash-aanroep droeg veertig regels valse overtredingen, de Stop-hook
  blokkeerde op werk van een vorige sessie, en `pnpm rolhek:overnemen --alles` liet de opnamen staan (leerpunt #582).
- **De vangnetten vooraf.** Vier van de twintig aanroepen weigerde het rolhek, allemaal leesopdrachten: `cd $TMPDIR` naast
  `gh issue list` in een ander segment, accolades met een komma tussen aanhalingstekens, een jq-filter met een teken dat
  `globForGh` tot een ongeldige expressie maakt, en een for-lus met `echo "$d"` (leerpunten #583 en #587). De omwegen kosten
  zelf weer hookruns en meldingen. Geen van de vijf weigeringen in die sessie was terecht.

## Besluit

1. **`./.git/commondir` gaat uit `denyWrite`.** De sandbox beschermt alleen een pad dat bestaat; een pad dat niet bestaat,
   wordt een masker dat git breekt. In de plaats komt: elke hook valt dicht (blokkade) zodra `.git` een map is en
   `.git/commondir` bestaat, vóór zijn eerste git-aanroep; de toets op effect houdt `commondir` in zijn vaste lijst en een
   wijziging daar is een weigering voor elke rol; het rolhek houdt `.git/**` vooraf dicht. Het restrisico wordt benoemd en
   aanvaard: tussen het planten en de volgende hook kan het git van Claude Code zelf de geplante config lezen; dat is
   gedrag van Claude Code, en het masker kocht die bescherming tegen een onbruikbare git en een onbewaakte worktree. De
   worktree blijft toegestaan, niet verplicht: de SessionStart-melding noemt `EnterWorktree` niet meer en houdt de huidige
   startvorm; de vorm met `--no-track` blijft geldig. De geparkeerde bouw van de worktree-meldingen vervalt.
2. **De nacontrole is begrensd tot wat de subagent zelf kan hebben gedaan.** Bij SubagentStop sluit de vergelijking het
   venster: de bewaarde opname wordt de staat van dat moment. Een latere nacontrole (Stop, `pr:verify`) telt alleen wat
   sindsdien veranderde en geen venster van een andere actor verklaart, waarbij de vensters van alle worktrees op dezelfde
   git-common-dir meetellen en de eigen schrijfacties van de hooks (anker, cache) een venster van de actor `hook` zijn. De
   opnamen gelden tot het einde van de sessie, en `pnpm rolhek:overnemen --alles` wist ze ook, zodat de eigenaar een echte
   herstart heeft.
3. **Een vangnet vooraf toetst per segment en alleen wat de shell echt expandeert.** Een variabel woord naast een
   gh-subcommando telt alleen binnen hetzelfde segment. Een glob, brace-expansie of POSIX-klasse telt niet tussen enkele
   aanhalingstekens, en een patroon dat geen geldige klasse is, is geen glob (bash neemt het letterlijk) en geeft geen interne
   fout. Een woord dat met `$TMPDIR/` begint, is letterlijk, zoals de leeslijst al doet. De lijst van aanvaarde valse
   positieven krimpt mee.
4. **Volgorde: drie bouw-PR's, elk één punt.** Eerst punt 1 (instellingen, de hookcontrole, de SessionStart-melding,
   `agent-doorloop.md`, de tests van spec rolhek-vooraf-krimp AC-3 zoals herzien), dan punt 2, dan punt 3. Elke PR noemt
   in zijn beschrijving het aantal valse meldingen vóór en na op dezelfde sessie of hetzelfde corpus.

## Alternatieven

- **`./.git/commondir` in `denyWrite` houden en de worktree verplichten (0082 punt 2).** Gemeten op 5 november: `fetch`
  en `worktree list` falen ook in de worktree, de sandbox schermt er niets af, en een verse branch kan alleen nog via een
  tool buiten de sandbox.
- **Een echt `.git/commondir` in de hoofdcheckout.** Vervallen (0082 punt 2): de sandbox maskeert en verwijdert het.
- **`GIT_COMMON_DIR` in elke hook (S0 uit 0082).** Beschermt de hooks, niet het git van Claude Code; de hookcontrole van
  punt 1 doet hetzelfde zonder omgeving en valt dicht in plaats van om te leiden.
- **De toets op effect uitzetten.** Dan ziet niets meer wat een subagent via een programma schrijft.
- **Alleen de bewaartermijn verkorten.** De ruis komt binnen dezelfde sessie terug, zolang de vergelijking tegen de huidige
  staat loopt.
- **De valse positieven vooraf aanvaarden (0063).** Vier weigeringen per beurt op leesopdrachten maken de voorgeschreven
  manier van lezen onbruikbaar, en elke omweg kost meer hookruns dan de weigering bespaart.

## Gevolgen

- Git en `gh` werken weer in de hoofdcheckout, ook bij het opstarten van een nieuwe app; `feiten.mjs pad` leest de bewaking.
- Het restrisico van punt 1 staat benoemd; de spec krijgt een test dat een geplant `.git/commondir` elke hook blokkeert.
- De spiegeltest op `denyWrite` (`test/rails/sandbox-settings.test.ts`) en de tests van spec rolhek-vooraf-krimp AC-3
  (`test/hooks/werkstraat.test.ts`, `test/hooks/rolhek-verse-main.test.ts`) veranderen: de reden staat in de bouw-PR, de
  merge van dit besluit is het akkoord. De geparkeerde testgevallen op `fix/worktree-meldingen-553` vervallen.
- De open lijst van de toets op effect bevat na punt 2 alleen nog wat een subagent zelf kan hebben geschreven; een
  Stop-hook die blokkeert op werk van een vorige sessie komt niet meer voor.
