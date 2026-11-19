# 0083 — Bewaking met minder wrijving: commondir uit de sandbox, nacontrole begrensd, vangnetten per segment

Status: geaccepteerd

Herzien: 2026-11-06 (#608): punt 2, gewijzigd door [0084](0084-sandbox-afscherming-geen-effect.md): een nacontrole telt een plaatshouder van de sandbox niet, en `pr:verify` slaat een bevestigd afgeschermd pad over.

Herzien: 2026-11-09 (#634): punt 3, gewijzigd door [0086](0086-aangehaalde-heredoc-is-geen-substitutie.md): de tekst van een aangehaalde heredoc is geen substitutie voor het vangnet.

Herzien: 2026-11-12 (#705): punt 2: de effecttoets is weg (ADR 0091 punt 1)

Herzien: 2026-11-14 (#714): ingekort tot wat nog geldt na ADR 0091; de puntnummers zijn ongewijzigd, de oude tekst staat in git
Herzien: 2026-11-19: verwijzingen naar verwijderde documenten wijzen naar de opvolger of zijn weg (spec vervallen-documenten-weg)

Wijzigt [0082](0082-zelfladend-sandbox-en-leeslijst.md) punt 2 en 4.
Drempel: A3 (een grens van het besturingssysteem vervalt en een vangnet wordt smaller) en A4. Aanleiding: melding van de
eigenaar (5 november 2026) dat git, commit en push, de sandbox en de subagents "lopende band" falen, ook bij het opstarten van
een nieuwe app; leerpunten #553, #582, #583 en #587. Uitwerking:
[spec rolhek-vooraf](../specs/rolhek-vooraf.md) rolhek-vooraf/AC-2 en rolhek-vooraf/AC-3.

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
  ziet het niet.
- **De nacontrole van de toets op effect.** Alles wat na een subagent veranderde, kwam op zijn naam: werk van
  de hoofdsessie in een andere worktree, het anker van de stub-lader, een merge van de eigenaar in zijn eigen terminal. Die
  toets is sindsdien helemaal weggehaald (0091).
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
   zou lezen. Het rolhek houdt `.git/**` vooraf dicht.
   Het restrisico, benoemd en aanvaard: (a) tussen het planten en de eerstvolgende hook kan het git van Claude Code zelf
   (bij start, hervatten of compacteren) de geplante config lezen; wat die versie daarvan onschadelijk maakt, is alleen
   gemeten in `claude -p` en kan per versie verschillen; (b) het rolhek vooraf ziet alleen een letterlijk pad, en sinds 0091 toetst niets achteraf;
   (c) in een worktree is `.git` een bestand, daar doet de controle
   niets en hangt de bescherming van het `commondir` van de worktree af van de alleen-lezen koppeling die Claude Code zelf
   maakt. Dat is minder dan het masker beloofde, en meer dan het masker gaf: in een worktree, waar het masker iedereen heen
   dwong, was de hele `.git` schrijfbaar.
   De worktree blijft toegestaan, niet verplicht. De startvorm blijft die van #586: `git fetch origin main && git switch
   --no-track -c <naam> origin/main`, want `.git/config` is in de hoofdcheckout alleen-lezen door Claude Code zelf en
   zonder `--no-track` breekt git af na het bijwerken van de bestanden, vóór HEAD verplaatst. De SessionStart-melding en de
   verse-main-melding noemen die vorm, in elke werkmap gelijk, zonder `EnterWorktree`. Van de geparkeerde bouw op
   `fix/worktree-meldingen-553` blijven de gevallen over `--no-track` bruikbaar; het onderscheid hoofdcheckout/worktree
   vervalt.
2. *(vervallen, zie 0091 punt 1)* De effecttoets en zijn nacontrole bestaan niet meer.
3. **Een vangnet vooraf toetst per segment en alleen wat de shell echt expandeert.** Een variabel woord naast een
   gh-subcommando telt alleen binnen hetzelfde segment. Een glob, brace-expansie of POSIX-klasse telt niet tussen enkele of
   dubbele aanhalingstekens (`$` en backtick tussen dubbele aanhalingstekens blijven tellen), en een patroon dat geen
   geldige klasse is, is geen glob (bash neemt het letterlijk) en geeft geen interne fout. Een woord dat met `$TMPDIR/`
   begint, is letterlijk, zoals de leeslijst al doet. De lijst van aanvaarde valse positieven krimpt mee.
4. *(vervallen: de drie bouw-PR's zijn gemerged, de effecttoets uit punt 2 is daarna weggehaald, zie 0091)*

## Alternatieven

- **`./.git/commondir` in `denyWrite` houden en de worktree verplichten (0082 punt 2).** Gemeten op 5 november: `fetch`
  en `worktree list` falen ook in de worktree, de gedeelde `.git` is daar schrijfbaar, en een verse branch kan alleen nog
  via een tool buiten de sandbox.
- **Een echt `.git/commondir` in de hoofdcheckout.** Vervallen (0082 punt 2): de sandbox maskeert en verwijdert het.
- **`GIT_COMMON_DIR` in elke hook (S0 uit 0082).** Beschermt de hooks, niet het git van Claude Code; de controle van
  punt 1 doet hetzelfde zonder omgeving, en neemt het bestand weg in plaats van eromheen te werken.
- **Alleen blokkeren, niet hernoemen.** Dan blijft het geplante bestand staan tot de eigenaar het weghaalt, en leest het
  git van Claude Code de config bij elke start, hervatting en compactie.
- **De toets op effect uitzetten.** Toen verworpen; later alsnog gekozen, omdat de valse meldingen bleven (0091).
- **De valse positieven vooraf aanvaarden (0063).** Vier weigeringen per beurt op leesopdrachten maken de voorgeschreven
  manier van lezen onbruikbaar, en elke omweg kost meer hookruns dan de weigering bespaart.

## Gevolgen

- Git en `gh` werken weer in de hoofdcheckout, ook bij het opstarten van een nieuwe app; `feiten.mjs pad` leest de bewaking.
- Het restrisico van punt 1 staat benoemd; de spec krijgt een test dat een geplant `.git/commondir` door elke hook wordt
  weggezet, zonder git-aanroep, met een blokkade waar het event die kent.
- De schrijfbare gedeelde `.git` in een worktree is een eigen leerpunt, buiten dit besluit.
