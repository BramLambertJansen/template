---
status: goedgekeurd
namespace: bijhalen
---

# main bijhalen en fast-forwarden zonder beschermde paden te schrijven

## Doel

Een agent in de sandbox haalt `main` in zijn PR-branch, of zet zijn branch vooruit naar een nieuwere commit, ook als die
stap bestanden wijzigt die de sandbox niet kan schrijven. De werkmap mag daarbij nooit halverwege blijven hangen.

## Aanleiding

- Leerpunt #789 (18 november 2026, plus comments van 24 november 2026): `git merge origin/main` en `git merge --ff-only` breken
  in de sandbox af als `main` iets wijzigt onder `.claude/skills`, `.claude/agents`, `.claude/hooks` of
  `.claude/settings.json`. Git meldt `unable to unlink old '…': Read-only file system`, en daarna:
  - de werkmap staat half op de nieuwe versie;
  - HEAD staat nog op de oude commit;
  - er blijven ongetrackte bestanden achter.

  Het kwam drie keer voor (#772, #771 en #742; #930; #952). Elke keer kostte het eigenaarvragen of een handmatige omweg.
- `.claude/skills/opleveren/SKILL.md` stap 1 zegt nu: niet mergen maar de eigenaar melden. De PR loopt daardoor achter
  (bij #952 12 tot 23 commits).
- Gemeten op 24 november 2026 in een cloudsessie:
  - `git commit-tree -S` faalt in de sandbox (signeerdienst onbereikbaar);
  - `git merge --no-commit` gevolgd door `git commit -F <bestand>` gaf een ondertekende merge-commit;
  - `git commit` legt de index vast, niet de werkmap.

  Een merge die alleen in de index en `MERGE_HEAD` staat, kan dus met het toegestane `git commit -F` worden afgerond.
- Deel (a) en (c) van #789 zijn opgelost in spec cloud-werkmap-herstel; deze spec is deel (b).

## Rollen en wie wat ziet

Alleen de hoofdsessie en de eigenaar; geen gebruikersrollen. Het rolhek verandert niet: `node scripts/kit/<script>.mjs` is
een gewoon commando, en het script schrijft niet onder de beschermde paden.

## Kopieer de vorm van

- `scripts/kit/worktree-install.mjs`: pure kern apart van de feiten, `git()`-helper zonder `GIT_*` uit de omgeving, korte
  foutmelding zonder stacktrace.
- `test/scripts/cloud-werkmap-herstel.test.ts`: echte git-fixtures, ook met een lopende merge.

## Hergebruik en UX

Er is geen UI. Het script `scripts/kit/bijhalen.mjs` heeft twee standen:

- `node scripts/kit/bijhalen.mjs main` haalt `origin/main` in de huidige branch: alleen index, `MERGE_HEAD` en `MERGE_MSG`.
  Daarna rondt de agent af met `git commit -F <bestand>`.
- `node scripts/kit/bijhalen.mjs volg <ref>` zet de huidige branch met een fast-forward op `<ref>`, bijvoorbeeld
  `origin/<branch>` na "Update branch" of `origin/main` na een merge. Er komt geen commit bij.

Signaturen (definitief):

- `isSandboxBeschermd(pad)` geeft `boolean`. Beschermd zijn `.claude/skills/`, `.claude/agents/` en `.claude/hooks/` (prefix),
  en `.claude/settings.json` en `.claude/settings.local.json` (exact). Dit is dezelfde lijst als in de opleveren-skill.
- `verdeelPaden(paden)` geeft `{ schrijven: string[], beschermd: string[] }`, elk in de volgorde van de invoer.
- `bijhalenArgumenten(args)` geeft `{ stand: 'main' } | { stand: 'volg', ref: string }`. Ongeldige argumenten geven de
  gebruiksmelding.

Teksten letterlijk:

- Gebruik: `Gebruik: node scripts/kit/bijhalen.mjs main | volg <ref>`
- Werkmap of index niet schoon: `✗ bijhalen geweigerd: werkmap of index heeft wijzigingen; commit of herstel die eerst`
- Lopende merge: `✗ bijhalen geweigerd: er loopt al een merge (MERGE_HEAD); rond die eerst af met git commit -F <bestand>`
- Geen branch: `✗ bijhalen geweigerd: HEAD staat niet op een branch`
- Geen fast-forward: `✗ bijhalen geweigerd: <ref> is geen opvolger van HEAD; gebruik bijhalen.mjs main`
- Conflict: `✗ bijhalen: conflict in <n> bestand(en); er is niets veranderd:` met daarna één pad per regel.
- Klaar met `main`: `✓ merge staat in de index (MERGE_HEAD <sha>); rond af met git commit -F <bestand>`.
- Klaar met `volg`: `✓ <branch> staat op <sha>`.
- Beschermde bestanden: `Bijwerken met Edit (eigenaarakkoord), daarna moet git diff --quiet -- <paden> slagen:` met daarna
  één pad per regel. Zonder beschermde bestanden ontbreekt dit blok.

## Acceptatiecriteria

- **bijhalen/AC-1**: Gegeven `isSandboxBeschermd` en `verdeelPaden`. Paden onder de drie prefixen en de twee exacte namen
  zijn beschermd. `.claude/rules/x.md`, `.claude/settings.jsonc`, `.claude/skillsx/a` en `docs/a.md` zijn dat niet.
  `verdeelPaden` behoudt de volgorde. Toets: `test/scripts/bijhalen.test.ts` (nieuw)
- **bijhalen/AC-2**: Gegeven `bijhalenArgumenten`. `['main']` en `['volg', 'origin/x']` zijn geldig. Lege invoer, een
  onbekende stand, `volg` zonder ref, een ref die met `-` begint en een extra argument geven de gebruiksmelding.
  Toets: `test/scripts/bijhalen.test.ts` (nieuw)
- **bijhalen/AC-3**: Gegeven een git-fixture met een schone branch en een `origin/main` die zonder conflict `docs/a.md`
  wijzigt, `docs/b.md` verwijdert en `.claude/skills/s/SKILL.md` wijzigt. Wanneer `bijhalen.mjs main` draait:
  - is de exitcode 0 en staat HEAD op dezelfde commit;
  - is `MERGE_HEAD` gelijk aan `origin/main`;
  - is de index gelijk aan de boom van `git merge-tree --write-tree HEAD origin/main`;
  - hebben `docs/a.md` en `docs/b.md` in de werkmap de nieuwe toestand;
  - heeft `.claude/skills/s/SKILL.md` in de werkmap nog de oude inhoud en staat het in het blok met beschermde bestanden.

  Toets: `test/scripts/bijhalen.test.ts` (nieuw)
- **bijhalen/AC-4**: Gegeven de toestand na AC-3 in de fixture (zonder ondertekening). Wanneer `git commit -F <bestand>`
  draait, dan heeft de nieuwe commit twee ouders (de oude HEAD en `origin/main`) en als boom de index uit AC-3.
  Toets: `test/scripts/bijhalen.test.ts` (nieuw)
- **bijhalen/AC-5**: Gegeven een `origin/main` die een conflict met de branch geeft. Wanneer `bijhalen.mjs main` draait,
  dan is de exitcode 1 en noemt de conflictmelding het pad. HEAD, de index en de werkmap zijn byte voor byte gelijk aan
  daarvoor, en er is geen `MERGE_HEAD`. Toets: `test/scripts/bijhalen.test.ts` (nieuw)
- **bijhalen/AC-6**: Gegeven een vuile werkmap, een gestagede wijziging, een lopende merge of een losse HEAD. Wanneer
  `bijhalen.mjs main` of `volg` draait, dan is de exitcode 1 met de bijbehorende melding en is er niets veranderd. Een
  ongetrackt bestand telt niet als vuil. Toets: `test/scripts/bijhalen.test.ts` (nieuw)
- **bijhalen/AC-7**: Gegeven een ref die een opvolger is van HEAD en een beschermd en een gewoon bestand wijzigt. Wanneer
  `bijhalen.mjs volg <ref>` draait:
  - staat de branch op `<ref>` en is de index gelijk aan de boom van `<ref>`;
  - heeft het gewone bestand de nieuwe inhoud;
  - heeft het beschermde bestand de oude inhoud en staat het in het blok.

  Een ref die geen opvolger is, geeft de fast-forwardmelding en verandert niets. Toets: `test/scripts/bijhalen.test.ts` (nieuw)

## Randgevallen

| Situatie | Gedrag |
|---|---|
| `origin/main` is al bijgewerkt of een voorouder van HEAD | `main`: geen `MERGE_HEAD`, melding `niets bij te halen`, exitcode 0 |
| Beschermd bestand nieuw in de doelboom | in het blok; de agent maakt het met Write/Edit (eigenaarakkoord) |
| Beschermd bestand verwijderd in de doelboom | in het blok; de eigenaar verwijdert het (de sandbox kan het niet) |
| Gewoon bestand in een nieuwe map | de map wordt gemaakt (`git checkout-index`) |
| Pad met spaties of niet-ASCII | git met `-z` en NUL-scheiding |
| Commit-msg-hook | het bericht begint met `Merge ` (bestaande regel uit de receptenkaart) |

## Raakt ook

- `.claude/skills/opleveren/SKILL.md` stap 1. Toont de diff iets onder de beschermde paden, dan `bijhalen.mjs main` in
  plaats van de eigenaar melden. Beschermd pad: Edit in de hoofdsessie met akkoord van de eigenaar.
- `docs/operations/recepten.md`: de rijen "`main` bijhalen" en "Nieuw werk na een merge" noemen het script voor het geval
  met beschermde paden. `pnpm ratchet` toetst ze tegen het rolhek (`docs:recept-rolhek`).
- `docs/operations/agent-doorloop.md`, "Branchwissels in een sandbox": verwijst naar het script.
- Changelogfragment.
- Er wijzigen geen bestaande tests. Kritiek werk (werkstraat en git-stappen): de eigenaar keurt de PR goed.

## Buiten scope

- Een conflict oplossen. Het script stopt en verandert niets; oplossen blijft handwerk volgens de receptenkaart, of de
  eigenaar doet het.
- Beschermde bestanden schrijven. Dat blijft Edit in de hoofdsessie met akkoord van de eigenaar (sandboxgrens).
- Pushen, en wijzigingen aan het rolhek of de hooks.

## Testplan

Unit-tests op de pure functies en echte git-fixtures in een tijdelijke map voor AC-3 tot en met AC-7, zonder ondertekening
(`commit.gpgsign=false` in de fixture). In de fixture kan de test de beschermde paden wel schrijven, dus toetst de test dat
het script ze niet aanraakt. Na de bouw gebruikt de hoofdsessie het script één keer zelf in deze cloudsessie, als
`main` dan een beschermd pad raakt. Dat gaat als bewijs in de PR, of de PR meldt dat de situatie zich niet voordeed.

## Open vragen

- **OV-1 ✅ besloten**: het merge-script krijgt een eigen PR (eigenaar, 24 november 2026, spec cloud-werkmap-herstel OV-2).
- **OV-2**: naam en vorm, `node scripts/kit/bijhalen.mjs` zonder pnpm-script. Aanbeveling: zo laten. Een pnpm-script
  vraagt `package.json` (beheerd bestand), en het woord `merge` in een commando triggert het rolhek.
