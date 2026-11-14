# 0071 — Rolhek vooraf alleen voor wat de toets op effect niet ziet

Status: geaccepteerd
Herzien: 2026-11-04 (#555): punt 2, zelfladende paden: wat code laadt in de sandbox (`denyWrite`), vooraf een leeslijst
in plaats van schrijfvormen ([0082](0082-zelfladend-sandbox-en-leeslijst.md))

Herzien: 2026-11-12 (#705): punt 3, 4 en 6: de toets vooraf wordt niet verder uitgekleed, want de toets op effect is weg (ADR 0091 punt 3)

Herzien: 2026-11-14: ingekort tot wat nog geldt na ADR 0091; de puntnummers zijn ongewijzigd, de oude tekst staat in git

Wijzigt [0066](0066-schrijfgrens-op-effect.md) punt 3 ("de toets vooraf blijft"), de buitenscope "de hoofdsessie als dader"
van spec rolhek-effect (OV-1) en in spec rolhek-lezen AC-2 en AC-5 het `--output`-verbod (voortaan op effect); vult
[0045](0045-railwerk.md) aan. Drempel: A3 (een check vooraf vervalt; de controle verschuift naar achteraf) en A4. Uitwerking:
[spec](../specs/rolhek-vooraf-krimp.md). De verschuiving naar achteraf is teruggedraaid (0091).

## Context

Toen dit besluit viel, toetste een hook na elk Bash-commando van een subagent wat er echt veranderde (de toets op effect,
0066), en leidde het rolhek daarnaast vooraf uit de shelltekst af welke paden een commando schrijft. Het plan was de toets
vooraf te krimpen tot wat de toets op effect niet kan zien of niet op tijd ziet. Het grootste deel van het rolhek (gh, git,
verborgen commandowoorden, de leeslijst van de reviewer) bewaakt acties buiten de werkmap en bleef hoe dan ook.

De toets op effect is daarna weggehaald (0091). Daarmee verviel de krimp zelf: de padtoets vooraf (`writeTargets` in
`rails/hooks/lib/shell.mjs` en de padregels in `rolhek.mjs`) is het enige wat een schrijfactie buiten de rol tegenhoudt vóór
de PR, en blijft. Van dit besluit gelden nog de vaste lijst (punt 1), de zelfladende paden (punt 2) en het corpus (punt 5).

## Besluit

1. **De vaste lijst vooraf.** Het rolhek toetst vooraf, naast de padtoets (zie punt 3):
   schrijfacties op GitHub (review, label, status, merge buiten `pnpm pr:merge`, `gh alias`), GitHub en tokens voor subagents,
   de leerpunt-regels, git-acties met gevolg buiten de werkmap of bij de volgende git-aanroep (push naar `main`, force-push,
   `--no-verify`, `LEFTHOOK=0`, `core.hooksPath`, `git config` behalve lezen, `git -c alias.*`, git-omgeving, `git init` met
   template, nieuwe branch alleen vanaf verse `origin/main`), een programma starten via een optie (`git grep -O`), de trucs die
   deze lijst omzeilen (niet-letterlijke commandowoorden, globs naar `gh`, `env -S`, substituties, omhulsels), en de vaste
   leeslijst van de reviewer (rolhek-lezen). Edit, Write en MCP blijven vooraf exact getoetst.
2. **Zelfladende paden zijn vooraf dicht zonder dat het rolhek de schrijfvorm hoeft te kennen** (gewijzigd door 0082).
   Een vaste lijst zelfladende paden, relatief aan de root van de repository: `.git/**` en wat Claude Code, git of pnpm laden
   vóór de volgende toets (`.claude/hooks/` behalve `.cache/`, `.claude/settings.json`, `lefthook.yml`, `.pnpmfile.cjs`). Een
   commando dat zo'n pad noemt (als woord, als redirectdoel, als optiewaarde zoals `--output=` of `-o`, of via een glob die er
   volgens de shell op kan passen), is `deny` voor elke rol bij `.git/**` (R-ROL-03), en bij de andere paden `deny` voor een
   subagent en `ask` voor de hoofdsessie. Alleen een leesprogramma uit een vaste lijst of een git-subcommando dat de werkmap
   niet schrijft, gaat door, beide zonder redirect en zonder schrijfoptie naar zo'n pad. Een git-subcommando dat de werkmap
   schrijft (`checkout`, `switch`, `restore`, `reset`, `stash`, `apply`, `am`, `cherry-pick`, `merge`, `pull`, `rebase`,
   `revert`, `read-tree`, `checkout-index`), is voor een subagent `deny`, tenzij het alleen expliciete paden buiten de lijst
   noemt: zo kan geen ref, blob of patch een stub vervangen. Voor de hoofdsessie is het `ask` als het een zelfladend pad noemt;
   anders gaat het door. De lijst groeit niet met nieuwe programma's.
3. *(vervallen, zie 0091 punt 3)* De padtoets vooraf blijft: `writeTargets` en de padregels zijn niet verwijderd.
4. *(vervallen, zie 0091 punt 1)* Er is geen toets op effect meer, ook niet voor de hoofdsessie.
5. **Het corpus blijft.** Elk testgeval dat een Bash-commando op een pad laat weigeren, vragen, melden of doorlaten, is een
   rij in één corpus (`test/hooks/rolhek-padcorpus-vooraf.test.ts`); het toetst nu de beslissing vooraf.
6. *(vervallen, zie 0091 punt 1 en 3)* De schaduwmodus en de meetreeks zijn met de toets op effect weg.

## Alternatieven

- **Zelfladende bestanden in `sandbox.filesystem.denyWrite`.** Sterker dan een tekstregel, maar git draait in de sandbox:
  elke `checkout`, `pull` of `merge origin/main` die zo'n bestand meeneemt, faalt halverwege. In `.git` schrijft git zelf
  (`fetch`, `push -u`, `lefthook install`). Daarom de tekstregel van punt 2; 0082 koos dit later toch voor een deel
  van de paden; inmiddels is `denyWrite` weer leeg (0083 punt 1, 0091 punt 4).
- **De padtoets vooraf weghalen en achteraf toetsen.** Het oorspronkelijke besluit; vervallen met de toets op effect (0091).

## Gevolgen

- Wat geen pad schrijft (een programma starten, `curl -K`, `gh` onder een andere naam) blijft een bekend gat (R-ROL-11).
- De valse positieven van de padtoets vooraf (R-ROL-11) blijven, omdat de toets blijft.
