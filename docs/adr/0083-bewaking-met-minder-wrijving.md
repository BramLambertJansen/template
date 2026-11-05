# 0083 — Bewaking met minder wrijving: commondir uit de sandbox, nacontrole begrensd, vangnetten per segment

Status: geaccepteerd

Wijzigt [0082](0082-zelfladend-sandbox-en-leeslijst.md) punt 2 en 4 en [0066](0066-schrijfgrens-op-effect.md) punt 2.
Drempel: A3 (een grens van het besturingssysteem vervalt en een vangnet wordt smaller) en A4. Aanleiding: melding van de
eigenaar (5 november 2026) dat git, commit en push, de sandbox en de subagents "lopende band" falen, ook bij het opstarten van
een nieuwe app; leerpunten #553, #582, #583 en #587. Uitwerking: [spec rolhek-vooraf-krimp](../specs/rolhek-vooraf-krimp.md)
AC-3 en AC-10, [spec rolhek-effect](../specs/rolhek-effect.md) AC-1 en AC-10.

## Context

Drie lagen van de bewaking zijn elk apart verdedigbaar, maar geven samen meer valse meldingen dan echte. Gemeten op
5 november 2026, in één diagnosesessie van ongeveer twintig Bash-aanroepen in de hoofdcheckout en in een worktree:

- **`./.git/commondir` in `denyWrite` (0082 punt 2).** Het bestand bestaat in een hoofdcheckout niet; de sandbox maskeert het
  met `/dev/null`, en elk git-commando in Bash faalt, `gh` ook, en `feiten.mjs pad` kan de bewaking niet lezen. In een
  gekoppelde worktree werken `status`, `log` en `commit`, maar `git fetch` en `git worktree list` falen daar ook: ze lopen
  alle worktrees langs en lezen `.git/commondir` van de hoofdcheckout. De voorgeschreven startvorm
  (`git fetch origin main && git switch …`) faalt daardoor ook in een worktree; een verse branch kon alleen nog via de tool
  `EnterWorktree`, buiten de sandbox. De sandbox zelf viel één keer uit met `bwrap: Can't get type of source
  .git/commondir: No such file or directory`. En in een worktree beschermt het masker niets: de `settings.json` en `hooks`
  van de worktree zijn daar alleen-lezen door Claude Code zelf, maar de gedeelde `.git` van de hoofdcheckout, met
  `config`, `hooks` en de plek van `commondir`, staat in de schrijflijst van de sandbox. De worktree-route ruilt dus een
  kapotte git voor een onbewaakte `.git`. In de proef-app stond de regel al ongecommit uit de instellingen gehaald.
  Het risico dat de regel afdekte: het git dat Claude Code zelf buiten de sandbox draait, leest de config uit een geplant
  `.git/commondir` (0082 punt 4; gemeten in `claude -p`, Claude Code 2.1.318, niet interactief). Die versie zette bij elke
  aanroep `core.fsmonitor`, `core.hooksPath` en `hook.*.enabled` uit; de rest van de config niet. Planten vraagt een
  schrijfactie in `.git`: een letterlijk pad weigert het rolhek vooraf voor elke rol, een samengestelde naam (`node -e`)
  ziet het niet; de toets op effect geeft een subagent achteraf een weigering (`commondir` staat in de vaste lijst van de
  code), de hoofdsessie niet (die slaat `.git/` over en draait in schaduw).
- **De nacontrole van de toets op effect (0066 punt 2, spec rolhek-effect AC-4).** Een momentopname van een subagent blijft
  24 uur bewaard en wordt bij elke Bash-aanroep, elke Stop en elke `pr:verify` opnieuw met de huidige staat vergeleken. Alles
  wat daarna verandert, komt op naam van die subagent: branchrefs en commits van de hoofdsessie in een andere worktree (de
  vensters staan per worktree, de refs zijn gedeeld), het anker dat de stub-lader zelf schrijft, een merge of fetch door de
  eigenaar in zijn eigen terminal (geen venster). Op 5 november stonden tien opnamen van elk 186 KB; elke Bash-aanroep
  droeg veertig regels valse overtredingen, de Stop-hook blokkeerde op werk van een vorige sessie, en
  `pnpm rolhek:overnemen --alles` liet de opnamen staan (leerpunt #582).
- **De vangnetten vooraf.** Vijf van de twintig aanroepen weigerde het rolhek. Eén terecht (een nieuwe branch zonder
  `fetch`), vier onterecht, allemaal leesopdrachten: `cd $TMPDIR` naast `gh issue list` in een ander segment, accolades
  met een komma tussen aanhalingstekens, een jq-filter met een teken dat `globForGh` tot een ongeldige expressie maakt, en
  een for-lus met `echo "$d"` (leerpunten #583 en #587). De omwegen kosten zelf weer hookruns en meldingen.

## Besluit

1. **`./.git/commondir` gaat uit `denyWrite`.** De sandbox beschermt alleen een pad dat bestaat; een pad dat niet bestaat,
   wordt een masker dat git breekt. In de plaats komt een controle in de stub-lader, vóór de eerste git-aanroep van elke
   hook: is `.git` een map en bestaat `.git/commondir` (een hoofdcheckout heeft dat bestand nooit), dan doet de hook geen
   git-aanroep, hernoemt hij het bestand naar een naam die git niet volgt en blokkeert hij waar het event dat kan. Het
   hernoemen is een bewuste uitzondering op "de hook zet niets terug": een geplant `commondir` is geen wijziging aan de
   repo maar een omleiding van git zelf, en wegzetten sluit het venster waarin het git van Claude Code de geplante config
   zou lezen. De toets op effect houdt `commondir` in zijn vaste lijst; het rolhek houdt `.git/**` vooraf dicht.
   Het restrisico, benoemd en aanvaard: (a) tussen het planten en de eerstvolgende hook kan het git van Claude Code zelf
   (bij start, hervatten of compacteren) de geplante config lezen; wat die versie daarvan onschadelijk maakt, is alleen
   gemeten in `claude -p` en kan per versie verschillen; (b) het rolhek vooraf ziet alleen een letterlijk pad; (c) de toets
   op effect weigert een subagent, de hoofdsessie niet; (d) in een worktree is `.git` een bestand, daar doet de controle
   niets en hangt de bescherming van het `commondir` van de worktree af van de alleen-lezen koppeling die Claude Code zelf
   maakt. Dat is minder dan het masker beloofde, en meer dan het masker gaf: in een worktree, waar het masker iedereen heen
   dwong, was de hele `.git` schrijfbaar.
   De worktree blijft toegestaan, niet verplicht. De startvorm blijft die van #586: `git fetch origin main && git switch
   --no-track -c <naam> origin/main`, want `.git/config` is in de hoofdcheckout alleen-lezen door Claude Code zelf en
   zonder `--no-track` breekt git af na het bijwerken van de bestanden, vóór HEAD verplaatst. De SessionStart-melding en de
   verse-main-melding noemen die vorm, in elke werkmap gelijk, zonder `EnterWorktree`. Van de geparkeerde bouw op
   `fix/worktree-meldingen-553` blijven de gevallen over `--no-track` bruikbaar; het onderscheid hoofdcheckout/worktree
   vervalt.
2. **De nacontrole is begrensd tot wat de subagent zelf kan hebben gedaan.** Bij SubagentStop sluit de vergelijking het
   venster: de bewaarde opname wordt de staat van dat moment. Een latere nacontrole (Stop, `pr:verify`) telt alleen wat
   sindsdien in de werkmap of de vaste lijst veranderde en geen venster van een andere actor verklaart, waarbij de vensters
   van alle worktrees op dezelfde git-common-dir meetellen en de schrijfacties van de hooks zelf (anker, cache) een venster
   van de actor `hook` zijn; een ref of HEAD die na SubagentStop verschuift, telt niet meer voor de subagent. Een opname
   vervalt aan het einde van de sessie die de subagent startte; 24 uur blijft de bovengrens. De Stop-hook blokkeert alleen
   op subagents van de eigen sessie; `pr:verify` toetst alle sessies. `pnpm rolhek:overnemen --alles` wist ook de opnamen
   en vensters, zodat de eigenaar een echte herstart heeft.
3. **Een vangnet vooraf toetst per segment en alleen wat de shell echt expandeert.** Een variabel woord naast een
   gh-subcommando telt alleen binnen hetzelfde segment. Een glob, brace-expansie of POSIX-klasse telt niet tussen enkele of
   dubbele aanhalingstekens (`$` en backtick tussen dubbele aanhalingstekens blijven tellen), en een patroon dat geen
   geldige klasse is, is geen glob (bash neemt het letterlijk) en geeft geen interne fout. Een woord dat met `$TMPDIR/`
   begint, is letterlijk, zoals de leeslijst al doet. De lijst van aanvaarde valse positieven krimpt mee.
4. **Volgorde: drie bouw-PR's, elk één punt.** Eerst punt 1 (instellingen, de controle in de stub-lader, de meldingen,
   `agent-doorloop.md`, de tests van spec rolhek-vooraf-krimp AC-3 zoals herzien), dan punt 2, dan punt 3. Elke PR noemt
   in zijn beschrijving het aantal valse meldingen vóór en na op dezelfde sessie of hetzelfde corpus; de eerste PR legt
   `git status` en `git fetch origin main` met exit 0 in Bash in de hoofdcheckout vast, met de versie van Claude Code.

## Alternatieven

- **`./.git/commondir` in `denyWrite` houden en de worktree verplichten (0082 punt 2).** Gemeten op 5 november: `fetch`
  en `worktree list` falen ook in de worktree, de gedeelde `.git` is daar schrijfbaar, en een verse branch kan alleen nog
  via een tool buiten de sandbox.
- **Een echt `.git/commondir` in de hoofdcheckout.** Vervallen (0082 punt 2): de sandbox maskeert en verwijdert het.
- **`GIT_COMMON_DIR` in elke hook (S0 uit 0082).** Beschermt de hooks, niet het git van Claude Code; de controle van
  punt 1 doet hetzelfde zonder omgeving, en neemt het bestand weg in plaats van eromheen te werken.
- **Alleen blokkeren, niet hernoemen.** Dan blijft het geplante bestand staan tot de eigenaar het weghaalt, en leest het
  git van Claude Code de config bij elke start, hervatting en compactie.
- **De toets op effect uitzetten.** Dan ziet niets meer wat een subagent via een programma schrijft.
- **Alleen de bewaartermijn verkorten.** De ruis komt binnen dezelfde sessie terug, zolang de vergelijking tegen de huidige
  staat loopt.
- **De valse positieven vooraf aanvaarden (0063).** Vier weigeringen per beurt op leesopdrachten maken de voorgeschreven
  manier van lezen onbruikbaar, en elke omweg kost meer hookruns dan de weigering bespaart.

## Gevolgen

- Git en `gh` werken weer in de hoofdcheckout, ook bij het opstarten van een nieuwe app; `feiten.mjs pad` leest de bewaking.
- Het restrisico van punt 1 staat benoemd; de spec krijgt een test dat een geplant `.git/commondir` door elke hook wordt
  weggezet, zonder git-aanroep, met een blokkade waar het event die kent.
- De spiegeltest op `denyWrite` (`test/rails/sandbox-settings.test.ts`), de test "session-start op main" in
  `test/hooks/werkstraat.test.ts` en de constante `STARTVORM` in `test/hooks/rolhek-verse-main.test.ts` veranderen: de reden
  staat in de bouw-PR, de merge van dit besluit is het akkoord.
- Na punt 2 bevat de open lijst alleen nog wat een subagent zelf kan hebben geschreven; een Stop-hook blokkeert niet meer
  op subagents van een vorige sessie, en `pr:verify` niet meer op werk van de hoofdsessie of de eigenaar.
- De schrijfbare gedeelde `.git` in een worktree is een eigen leerpunt, buiten dit besluit.
