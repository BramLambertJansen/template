# 0088 — Tests naar vermogen: overslaan waar de kooi niet kan starten, nooit in CI

Status: geaccepteerd

Wijzigt [0072](0072-destructief-alleen-in-de-kooi.md) punt 2 (de laatste zin: een test die de kooi nodig heeft, slaat zichzelf
nooit over) en het gevolg daar dat `gate:fast` op een machine zonder bubblewrap rood is; herziet het gevolg in
[0085](0085-worktree-installatie-in-de-sandbox.md) over de ongeveer 382 unit-tests die in de sandbox falen. Drempel: A3 (een
check afzwakken: tests slaan lokaal over) en A4. Uitwerking: [spec](../specs/tests-naar-vermogen.md). Aanleiding: leerpunt #607
(met #637).

## Context

In de Bash-sandbox van Claude Code is `pnpm test:unit` altijd rood: 382 tests in 10 bestanden. Bijna alle starten een commando
via de kooi (`inKooi`), en bubblewrap mag binnen de sandbox geen namespace maken (`No permissions to create a new namespace`);
een paar starten een kindproces zonder `TMPDIR`, dat dan in `/tmp` schrijft (`EROFS`), of leggen kanaries in `/var/tmp` en de
thuismap voor een test die de kooi toch al nodig heeft. De pre-push-hook draait `pnpm gate:fast` en weigert dus elke push van een
agent; `--no-verify` is verboden (R-REPO-05). Het rood vangt niets: in CI zijn dezelfde tests groen. Een hook die altijd rood
is, leert agents en de eigenaar om rood te negeren.

## Besluit

1. **Overslaan alleen op een proef van het vermogen.** Er is één vermogen: `kooi` (kan bubblewrap hier een kooi starten). Een
   test die de kooi nodig heeft, slaat over als de proef dat vermogen niet vindt, met één melding ("draait in CI"). Geen
   variabele, omgevingsnaam of optie schakelt overslaan rechtstreeks; de proef meet de omgeving. Een kooi die start maar niet
   afschermt, telt als aanwezig: die tests falen, overal. Een test die alleen faalt omdat hij een kindproces zonder `TMPDIR`
   start, krijgt `TMPDIR` mee in plaats van een voorwaarde.
2. **Eén plek.** De proef draait één keer per testrun in een globale setup onder `test/setup/`; tests lezen de uitslag via
   één helper daar. Een testbestand noemt de voorwaarde zichtbaar als skip die de testteller van het rolhek telt; het verbod
   op skippen van bestaande tests (R-ROL-03) blijft ongewijzigd. Het aanbrengen in de bestaande bestanden doet de hoofdsessie
   met dit besluit als eigenaarakkoord (R-TEST-02); geen assertie verandert.
3. **In CI is elke overgeslagen test rood.** Na elke vitest-run in CI (`GITHUB_ACTIONS` of `CI` gezet) maakt één overgeslagen
   test de run rood, met naam; ontbreekt het vermogen in CI, dan faalt de run al in de setup (dicht vallen). Geen handmatige
   lijst.
4. **Zichtbaar bij groen.** `gate:fast` toont ook bij een groene gate de waarschuwingsregels (die met `⚠` beginnen), zodat een agent in de
   uitvoer van de pre-push-hook ziet dat tests niet draaiden.

## Alternatieven

- **Omgevingsnaam (`ben ik in de Claude-sandbox`)**: breekt bij elke nieuwe runtime en is een schakelaar, geen bewijs.
- **Een variabele zoals `SKIP_KOOI=1`**: elke aanroeper kan dan tests uitzetten, ook in CI.
- **Skip verborgen in een helper, onzichtbaar voor de testteller**: dat verzwakt R-ROL-03.
- **Een tweede vermogen voor schrijfbare systeemmappen**: overbodig; de enige tests die het nog nodig hadden, hebben de kooi al
  nodig.
- **Pre-push zonder `test:unit`**: verliest ook de tests die in de sandbox wel werken.

## Gevolgen

- Lokaal groen is geen bewijs, alleen CI. Een agent kan lokaal groen zien terwijl rolhek-, effect- en kooitests niet draaiden;
  hij ziet de `⚠ overgeslagen`-regel, en `pnpm pr:verify` tot groen blijft het bewijs (R-WERK-12).
- Restrisico, aanvaard: lokaal kan een aanroeper de proef laten falen (bijvoorbeeld `PATH` zonder `bwrap`); dan slaan de
  kooitests over. Een machine zonder bubblewrap is lokaal dus niet meer rood, maar meldt het. CI vangt beide.
- Wie een bestaande voorwaarde inhoudelijk uitzet, ontloopt de teller (gelijk aantal skips) maar niet CI. Wie lokaal een eigen
  reporter kiest, ziet de melding niet; CI gebruikt de vaste aanroep.
- Een nieuwe kooitest zonder voorwaarde is in de sandbox rood en valt zo op; met voorwaarde in een bestaand bestand vraagt hij
  eigenaarakkoord via de teller.
