---
status: goedgekeurd
namespace: bijhalen
---

# main bijhalen en fast-forwarden zonder beschermde paden te schrijven

## Doel

Een agent in de sandbox kan `main` in zijn PR-branch halen, of zijn branch vooruitzetten naar een nieuwere commit, ook als
die stap bestanden wijzigt die de sandbox niet kan schrijven. De werkmap, de index en de refs komen daarbij nooit in een
halve toestand.

## Aanleiding

- **Leerpunt #789** (18 november 2026, plus comments van 24 november 2026). `git merge origin/main` en `git merge --ff-only`
  breken in de sandbox af als `main` iets wijzigt onder `.claude/skills`, `.claude/agents`, `.claude/hooks` of
  `.claude/settings.json`. Git meldt `unable to unlink old '…': Read-only file system`. De werkmap staat daarna half op de
  nieuwe versie, HEAD op de oude, en er blijven ongetrackte bestanden achter. Dat gebeurde drie keer (#772, #771 en #742;
  #930; #952), telkens met eigenaarvragen of een handmatige omweg.
- **Huidige afspraak.** `.claude/skills/opleveren/SKILL.md` stap 1 zegt nu: niet mergen, maar de eigenaar melden. De PR loopt
  dan achter; bij #952 was dat 12 tot 23 commits.
- **Gemeten op 24 november 2026 in een cloudsessie:**
  1. `git commit-tree -S` faalt in de sandbox, omdat de signeerdienst onbereikbaar is.
  2. `git merge --no-commit` gevolgd door `git commit -F <bestand>` gaf een ondertekende merge-commit.
  3. De pre-commit-hook (lefthook 2.1.16) zet niet-gestagede wijzigingen weg met `git checkout --force -- <pad>`. Bij een
     beschermd bestand waarvan de index afwijkt van de werkmap faalt dat met `Read-only file system`, en daarmee de hele
     hook. De meting: alleen de index van `.claude/skills/spec/SKILL.md` gewijzigd, daarna `pnpm exec lefthook run pre-commit`,
     daarna de index hersteld.

  Uit 2 volgt: een merge die alleen in de index en `MERGE_HEAD` staat, kan worden afgerond met het toegestane
  `git commit -F`. Uit 3 volgt: dat lukt alleen als de beschermde bestanden in de werkmap eerst met Edit gelijk zijn gemaakt
  aan de index.
- **Delen van #789.** Deel (a) en (c) zijn opgelost in spec cloud-werkmap-herstel. Deze spec is deel (b).

## Rollen en wie wat ziet

Alleen de hoofdsessie en de eigenaar; er zijn geen gebruikersrollen. Het rolhek verandert niet.

## Kopieer de vorm van

- `scripts/kit/worktree-install.mjs`: een pure kern apart van de feiten, een `git()`-helper zonder `GIT_*` uit de omgeving,
  en een korte foutmelding zonder stacktrace.
- `test/scripts/cloud-werkmap-herstel.test.ts`: echte git-fixtures, ook met een lopende merge.

## Hergebruik en UX

Er is geen UI. Het script `scripts/kit/bijhalen.mjs` heeft drie standen. De agent doet zelf eerst `git fetch`; het script
haalt niets op.

- **`main`** haalt `origin/main` binnen. Daarna werkt de agent de genoemde beschermde bestanden bij met Edit, controleert hij
  `git diff --quiet -- <paden>` en rondt hij af met `git commit -F <bestand>`.
- **`volg <ref>`** zet de huidige branch met een fast-forward op `<ref>`, bijvoorbeeld `origin/<branch>` na "Update branch"
  of `origin/main` na een merge. Daarna werkt de agent de beschermde bestanden bij met Edit.
- **`terug`** breekt een lopende merge af die `main` begon. Het zet alleen de paden terug die verschillen tussen HEAD en de
  index, en weigert als een schrijfbaar pad in de werkmap afwijkt van de index (eigen werk van de agent na `main`). Daarna
  zet de agent de genoemde beschermde bestanden met Edit terug.

**Volgorde (`main` en `volg`).** Een stap begint pas als de vorige gelukt is.

1. Alle controles vooraf.
2. De schrijfbare bestanden in de werkmap. Faalt dat, dan zet het script alles terug wat het al schreef.
3. De index (`git read-tree <boom>`).
4. Bij `main` `MERGE_HEAD` en `MERGE_MSG`. Bij `volg` `git update-ref refs/heads/<branch> <ref> <oude HEAD>`.

Faalt stap 3 of 4, dan zet het script de werkmap en de index terug naar de toestand van vóór stap 2.

**Wat beschermd is.** Een pad is beschermd als het onder de vaste lijst valt (vangnet), of als het vooraf niet schrijfbaar
blijkt. Dat toetst `schrijfbaar(root, pad)`: `fs.accessSync(…, W_OK)` op het pad zelf, of anders op de diepste bestaande
voorouder. Op een alleen-lezen bestandssysteem geeft dat `EROFS`, ook als root. Voor elk beschermd pad met nieuwe inhoud
schrijft het script die inhoud naar `<os.tmpdir()>/bijhalen/<sha>/<pad>`, met `<sha>` de doelcommit (bij `terug` HEAD).
Die submap maakt het script eerst leeg, zodat geen inhoud van een eerdere run of andere werkmap blijft staan. De agent
neemt de inhoud over met Read en Edit.

**Modus en symlinks.** Een stap draagt ook de bestandsmodus. Bij `100755` zet het script de uitvoerbit en bij `100644`
haalt het hem weg, ook als alleen de modus verandert. Een symlink (`120000`) of submodule (`160000`) op een gewijzigd
schrijfbaar pad weigert het script vooraf; dat is zeldzaam en blijft handwerk.

**Signaturen** (definitief):

- `isSandboxBeschermd(pad)` geeft `boolean`. Een prefix onder `.claude/skills/`, `.claude/agents/` of `.claude/hooks/`, of
  exact `.claude/settings.json` of `.claude/settings.local.json`. Dat is dezelfde lijst als in de opleveren-skill. Lokaal is
  `.claude/agents/` wel schrijfbaar (`docs/ENVIRONMENT.md`), maar valt hij voor de eenvoud toch onder de lijst.
- `verdeelPaden(paden, schrijfbaar)` geeft `{ schrijven, beschermd }`. `schrijfbaar` is een functie van pad naar boolean.
  Beschermd is wat `isSandboxBeschermd` of `!schrijfbaar` zegt. De volgorde van de invoer blijft behouden.
- `bijhalenArgumenten(args)` geeft `{ stand: 'main' } | { stand: 'volg', ref } | { stand: 'terug' }`.
- `pasWerkmapToe(stappen, io)`: `stappen` is een lijst van `{ pad, inhoud: Buffer | null, uitvoerbaar: boolean }`, waarbij
  `null` verwijderen betekent. `io` heeft `lees` (geeft `{ inhoud, uitvoerbaar } | null`), `schrijf(pad, inhoud, uitvoerbaar)`
  en `verwijder(pad)`. Bij succes geeft de functie de herstelstappen terug (nieuwste eerst), waarmee het script de werkmap
  terugzet als stap 3 of 4 faalt. Faalt een stap, dan zet de functie de eerdere stappen terug en gooit
  ze de oorspronkelijke fout door.

**Teksten** (letterlijk):

- Gebruik: `Gebruik: node scripts/kit/bijhalen.mjs main | volg <ref> | terug`
- `✗ bijhalen geweigerd: werkmap of index heeft wijzigingen; commit of herstel die eerst`
- `✗ bijhalen geweigerd: er loopt al een merge (MERGE_HEAD); rond die af met git commit -F <bestand> of breek af met bijhalen.mjs terug`
- `✗ bijhalen geweigerd: HEAD staat niet op een branch`
- `✗ bijhalen geweigerd: <ref> is geen commit`
- `✗ bijhalen geweigerd: <ref> is geen opvolger van HEAD; gebruik bijhalen.mjs main`
- `✗ bijhalen geweigerd: HEAD loopt alleen achter op origin/main; gebruik bijhalen.mjs volg origin/main`
- `✗ bijhalen geweigerd: ongetrackte bestanden zouden overschreven worden:`, daarna één pad per regel.
- `✗ bijhalen geweigerd: er loopt geen merge; niets terug te zetten`
- `✗ bijhalen geweigerd: deze bestanden zijn na bijhalen gewijzigd; commit, herstel of bewaar ze eerst:`, daarna één pad
  per regel (stand `terug`).
- `✗ bijhalen geweigerd: symlink of submodule op een gewijzigd pad:`, daarna één pad per regel.
- `✗ bijhalen: conflict in <n> bestand(en); er is niets veranderd:`, daarna één pad per regel.
- `✗ bijhalen: git merge-tree faalt: <reden>; er is niets veranderd`
- `✗ bijhalen: schrijven faalt (<pad>: <reden>); alles is teruggezet`
- `✗ bijhalen: <reden>; alles is teruggezet` (een fout bij de index of een ref, stap 3 of 4)
- `✓ niets bij te halen`
- `✓ merge staat in de index (MERGE_HEAD <sha>); werk de beschermde bestanden bij en rond af met git commit -F <bestand>`
- `✓ <branch> staat op <sha>`
- `✓ merge afgebroken; index en schrijfbare bestanden staan weer op HEAD`
- Na de drie succesmeldingen, alleen als er beschermde paden zijn:
  `Beschermd, bijwerken met Edit (eigenaarakkoord); daarna moet git diff --quiet -- <paden> slagen en mag geen verwijderd
  pad nog bestaan:`. Daarna per regel `<pad> ← <tmp-pad>` (nieuwe inhoud) of `<pad> verwijderen (eigenaar)`.

## Acceptatiecriteria

- **bijhalen/AC-1**: Gegeven `isSandboxBeschermd` en `verdeelPaden`:
  - Paden onder de drie prefixen en de twee exacte namen zijn beschermd. `.claude/rules/x.md`, `.claude/settings.jsonc`,
    `.claude/skillsx/a` en `docs/a.md` zijn dat niet.
  - `verdeelPaden` zet een pad waarvoor `schrijfbaar` `false` geeft bij `beschermd`, ook buiten de lijst.
  - `verdeelPaden` behoudt de volgorde van de invoer. Toets: `test/scripts/bijhalen.test.ts`
- **bijhalen/AC-2**: Gegeven `bijhalenArgumenten`:
  - `['main']`, `['terug']` en `['volg', 'origin/x']` zijn geldig.
  - Lege invoer, een onbekende stand, `volg` zonder ref, een ref die met `-` begint en een extra argument geven de
    gebruiksmelding. Toets: `test/scripts/bijhalen.test.ts`
- **bijhalen/AC-3**: Gegeven `pasWerkmapToe` met een `io` waarvan `schrijf` bij de tweede stap faalt. Dan staan na afloop
  alle paden weer op hun oude inhoud of afwezigheid, en komt de fout door. Zonder fout staan alle stappen toegepast.
  Toets: `test/scripts/bijhalen.test.ts`
- **bijhalen/AC-4**: Gegeven een git-fixture met een schone branch. `origin/main` wijzigt zonder conflict `docs/a.md`,
  verwijdert `docs/b.md`, voegt `docs/nieuw/c.md` toe en wijzigt `.claude/skills/s/SKILL.md`. Wanneer `bijhalen.mjs main`
  draait, dan:
  - is de exitcode 0 en staat HEAD op dezelfde commit;
  - is `MERGE_HEAD` gelijk aan `origin/main`;
  - is de index gelijk aan de boom van `git merge-tree --write-tree HEAD origin/main`;
  - hebben `docs/a.md`, `docs/b.md` en `docs/nieuw/c.md` in de werkmap de nieuwe toestand;
  - heeft `.claude/skills/s/SKILL.md` in de werkmap nog de oude inhoud;
  - noemt het blok precies dat ene pad, en heeft het tmp-bestand de nieuwe inhoud. Toets: `test/scripts/bijhalen.test.ts`
- **bijhalen/AC-5**: Gegeven de toestand na AC-4 waarin de test het beschermde bestand gelijk heeft gemaakt aan het
  tmp-bestand (in de fixture zonder ondertekening). Wanneer `git commit -F <bestand>` draait, dan heeft de nieuwe commit
  twee ouders, de oude HEAD en `origin/main`, en als boom de index uit AC-4. Daarna is `git status --porcelain` zonder
  getrackte wijzigingen. Toets: `test/scripts/bijhalen.test.ts`
- **bijhalen/AC-6**: Gegeven een `origin/main` die een conflict met de branch geeft. Wanneer `bijhalen.mjs main` draait,
  dan:
  - is de exitcode 1 en noemt de conflictmelding het pad;
  - zijn HEAD, de index en de werkmap byte voor byte gelijk aan daarvoor;
  - is er geen `MERGE_HEAD`;
  - bij een fout van `merge-tree` (bijvoorbeeld een andere historie zonder gemeenschappelijke voorouder) volgt de
    foutmelding en niet de conflictmelding. Toets: `test/scripts/bijhalen.test.ts`
- **bijhalen/AC-7**: Gegeven een vuile werkmap, een gestagede wijziging, een lopende merge, een losse HEAD of een `<ref>` die
  geen commit is. Wanneer `main` of `volg` draait, dan is de exitcode 1 met de bijbehorende melding en is er niets
  veranderd. Een ongetrackt bestand op een pad dat het doel niet raakt, telt niet als vuil.
  Toets: `test/scripts/bijhalen.test.ts`
- **bijhalen/AC-8**: Gegeven een ongetrackt bestand op een pad dat het doel toevoegt. Wanneer `main` of `volg` draait, dan
  is de exitcode 1 met de melding over ongetrackte bestanden. Daarna zijn dat bestand, de index en HEAD byte voor byte
  gelijk aan daarvoor. Toets: `test/scripts/bijhalen.test.ts`
- **bijhalen/AC-9**: Gegeven een `<ref>` die een opvolger is van HEAD. De ref wijzigt een beschermd en een gewoon bestand,
  verwijdert een gewoon bestand en voegt een bestand toe in een nieuwe map. Wanneer `bijhalen.mjs volg <ref>` draait, dan:
  - staat de branch op `<ref>` en is de index gelijk aan de boom van `<ref>`;
  - hebben de gewone paden de nieuwe toestand;
  - heeft het beschermde bestand de oude inhoud en staat het in het blok;
  - een `<ref>` gelijk aan HEAD geeft `✓ niets bij te halen` en verandert niets;
  - een ref die geen opvolger is, geeft de fast-forwardmelding en verandert niets. Toets: `test/scripts/bijhalen.test.ts`
- **bijhalen/AC-10**: Gegeven een HEAD die een voorouder is van `origin/main`. Dan weigert `main` met de verwijzing naar
  `volg origin/main` en verandert het niets. Is `origin/main` een voorouder van HEAD, dan geeft `main` `✓ niets bij te halen`
  met exitcode 0 en zonder `MERGE_HEAD`. Toets: `test/scripts/bijhalen.test.ts`
- **bijhalen/AC-11**: Gegeven de toestand na AC-4, waarin het beschermde bestand al met de hand naar de nieuwe inhoud is
  gezet. Wanneer `bijhalen.mjs terug` draait, dan:
  - is de exitcode 0;
  - is de index gelijk aan HEAD en hebben de gewone paden de toestand van HEAD;
  - bestaan `MERGE_HEAD` en `MERGE_MSG` niet meer en staat HEAD op dezelfde commit;
  - noemt het blok het beschermde bestand met de HEAD-inhoud als tmp-bestand;
  - zonder lopende merge weigert `terug` en verandert het niets;
  - is na `main` een schrijfbaar pad in de werkmap gewijzigd (afwijkend van de index), dan weigert `terug` met de melding
    die dat pad noemt, en zijn dat bestand, de index en `MERGE_HEAD` ongewijzigd. Toets: `test/scripts/bijhalen.test.ts`
- **bijhalen/AC-12**: Gegeven een doel dat bij een gewoon bestand alleen de modus verandert (`100644` naar `100755`). Dan
  heeft dat bestand na `main` of `volg` de uitvoerbit en wijkt de werkmap niet af van de index. Een symlink op een
  gewijzigd schrijfbaar pad geeft de symlinkmelding en verandert niets. De tmp-submap van een eerdere run met een andere
  doelcommit raakt het script niet; die van dezelfde doelcommit maakt het eerst leeg.
  Toets: `test/scripts/bijhalen.test.ts`

## Randgevallen

| Situatie | Gedrag |
|---|---|
| Beschermd bestand nieuw in het doel | in het blok met tmp-pad; de agent maakt het met Write of Edit (eigenaarakkoord) |
| Beschermd bestand verwijderd in het doel | in het blok als `verwijderen (eigenaar)`; het blijft ongetrackt in de werkmap tot de eigenaar het weghaalt. Het blokkeert de commit niet, maar `git diff --quiet` ziet het niet: tot het weg is geldt het verbod op `-A` en `.` (een latere `git add -A` zou de verwijdering terugdraaien), en `pr:verify` weigert erop |
| Pad met spaties of niet-ASCII | git met `-z` en scheiding op NUL |
| Commit-msg-hook | het bericht begint met `Merge ` (bestaande regel uit de receptenkaart) |
| Pre-commit-hook met een verouderd beschermd bestand | faalt (gemeten). Daarom eerst Edit en `git diff --quiet -- <paden>`, en pas daarna `git commit -F` |
| `git commit -a`, `git add -u`, `-A` of `.` vóór de Edit | zou een verouderd beschermd bestand vastleggen. De recepten en de skill verbieden dit tot `git diff --quiet -- <paden>` slaagt; een volgende `bijhalen` weigert ook (AC-7) |
| `git merge --abort` | niet gebruiken, want het schrijft beschermde paden; gebruik `bijhalen.mjs terug` |
| git ouder dan 2.38 (geen `merge-tree --write-tree`) | foutmelding van AC-6; de toolchain heeft 2.43 |

## Raakt ook

- `.claude/skills/opleveren/SKILL.md` stap 1. Toont de diff iets onder de beschermde paden, dan gebruikt de agent
  `bijhalen.mjs main`, werkt hij de beschermde paden bij met Edit en rondt hij af met `git commit -F`, in plaats van de
  eigenaar te melden. Geen `-a`/`-u`/`-A`/`.` tot `git diff --quiet -- <paden>` slaagt en geen verwijderd beschermd pad
  meer bestaat. Dit is een beschermd pad: Edit in de
  hoofdsessie met akkoord van de eigenaar.
- `docs/operations/recepten.md`: de rijen "`main` bijhalen" en "Nieuw werk na een merge" noemen het script en de stappen
  voor het geval met beschermde paden. `pnpm ratchet` toetst ze tegen het rolhek (`docs:recept-rolhek`).
- `docs/operations/agent-doorloop.md`, "Branchwissels in een sandbox": verwijst naar het script.
- Changelogfragment.
- Er wijzigen geen bestaande tests.
- Kritiek werk (werkstraat en git-stappen): de eigenaar keurt de PR goed.

## Buiten scope

- Een conflict oplossen. Het script stopt en verandert niets.
- Beschermde bestanden schrijven of verwijderen. Dat blijft Edit in de hoofdsessie met akkoord van de eigenaar.
- Pushen, ophalen, en wijzigingen aan het rolhek of de hooks.

## Testplan

- Unit-tests op de pure functies, met een geïnjecteerde `schrijfbaar` en `io`.
- Echte git-fixtures in een tijdelijke map voor AC-4 tot en met AC-11, zonder ondertekening (`commit.gpgsign=false` in de
  fixture).
- In de fixture zijn de beschermde paden wel schrijfbaar. De tests toetsen dus dat het script ze niet aanraakt.
- Na de bouw gebruikt de hoofdsessie het script één keer zelf in deze cloudsessie als `main` dan een beschermd pad raakt.
  Lukt dat, dan gaat het als bewijs in de PR. Zo niet, dan meldt de PR expliciet dat de stappen Edit, `git diff --quiet` en
  `git commit -F` met de echte lefthook niet doorlopen zijn; alleen de hookmeting onder Aanleiding staat dan vast.

## Open vragen

- **OV-1 ✅ besloten**: het merge-script krijgt een eigen PR (eigenaar, 24 november 2026; spec cloud-werkmap-herstel OV-2).
- **OV-2**: naam en vorm, `node scripts/kit/bijhalen.mjs` zonder pnpm-script. Aanbeveling: zo laten. Een pnpm-script vraagt
  `package.json`, een beheerd bestand. Het woord `merge` in een commando triggert het rolhek.
- **OV-3 ✅ besloten**: beschermd is wat vooraf niet schrijfbaar blijkt, met de vaste lijst als vangnet en terugzetten bij
  een schrijffout (eigenaar, 24 november 2026).
- **OV-4 ✅ besloten**: afbreken via een eigen stand `terug`, niet via `git merge --abort` (eigenaar, 24 november 2026).
