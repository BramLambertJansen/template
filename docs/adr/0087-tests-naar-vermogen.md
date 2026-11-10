# 0087 — Tests naar vermogen: overslaan waar de kooi niet kan starten, nooit in CI

Status: geaccepteerd

Wijzigt [0072](0072-destructief-alleen-in-de-kooi.md) punt 2 (de laatste zin: een test die de kooi nodig heeft, slaat zichzelf
nooit over); herziet het gevolg in [0085](0085-worktree-installatie-in-de-sandbox.md) over de ongeveer 382 unit-tests die in de
sandbox falen. Drempel: A3 (een check afzwakken: tests slaan lokaal over) en A4. Uitwerking:
[spec](../specs/tests-naar-vermogen.md). Aanleiding: leerpunt #607 (met #637).

## Context

In de Bash-sandbox van Claude Code is `pnpm test:unit` altijd rood: 382 tests in 10 bestanden. Bijna alle starten een commando
via de kooi (`inKooi`), en bubblewrap mag binnen de sandbox geen namespace maken (`No permissions to create a new namespace`);
een paar schrijven in `/tmp`, `/var/tmp` of de thuismap (`EROFS`). De pre-push-hook draait `pnpm gate:fast` en weigert dus elke
push van een agent; `--no-verify` is verboden (R-REPO-05). Het rood vangt niets: in CI zijn dezelfde tests groen. Een hook die
altijd rood is, leert agents en de eigenaar om rood te negeren.

## Besluit

1. **Overslaan alleen op een proef van het vermogen.** Een test die de kooi of schrijfrechten in systeemmappen nodig heeft, slaat
   over als dat vermogen hier ontbreekt, met één melding per vermogen ("draait in CI"). De voorwaarde is een proef (start de
   kooi hier, is deze map schrijfbaar), nooit een omgevingsnaam en nooit een variabele waarmee een aanroeper overslaan kan
   afdwingen. Een kooi die start maar niet afschermt, telt als aanwezig: die tests falen, overal.
2. **Eén plek.** De proef draait één keer per testrun in een globale setup onder `test/setup/`; tests lezen de uitslag via
   één helper daar. Een testbestand noemt de voorwaarde zichtbaar met `ctx.skip(…)`, zodat de testteller van het rolhek hem
   als skip telt; het verbod op skippen van bestaande tests (R-ROL-03) blijft ongewijzigd. Het aanbrengen in de tien
   bestaande bestanden doet de hoofdsessie met dit besluit als eigenaarakkoord (R-TEST-02); geen assertie verandert.
3. **In CI is elke overgeslagen test rood.** Een reporter onder `test/setup/` telt na elke vitest-run de overgeslagen tests;
   in GitHub Actions maakt één overgeslagen test de run rood, met naam. Ontbreekt een vermogen in CI, dan faalt de run al in
   de setup (dicht vallen). Geen handmatige lijst.
4. **Zichtbaar bij groen.** `gate:fast` toont ook bij een groene gate de waarschuwingsregels (`⚠ `), zodat een agent in de
   uitvoer van de pre-push-hook ziet dat tests niet draaiden.

## Alternatieven

- **Omgevingsnaam (`ben ik in de Claude-sandbox`)**: breekt bij elke nieuwe runtime en is een schakelaar, geen bewijs.
- **Een variabele zoals `SKIP_KOOI=1`**: elke aanroeper kan dan tests uitzetten, ook in CI.
- **Skip verborgen in een helper zonder `ctx.skip` in het testbestand**: de testteller ziet het niet; dat verzwakt R-ROL-03.
- **Pre-push zonder `test:unit`**: verliest ook de tests die in de sandbox wel werken.
- **Tests naar de runner verhuizen**: trager en zwaarder, en lost de kooi in de sandbox niet op.

## Gevolgen

- Een agent kan lokaal groen zien terwijl kooitests niet draaiden (rolhek-, effect- en kooitests). Hij ziet de
  `⚠ overgeslagen`-regel; CI draait ze verplicht en `pnpm pr:verify` tot groen blijft het bewijs (R-WERK-12).
- Wie een bestaande voorwaarde inhoudelijk uitzet (`ctx.skip(true, …)`), ontloopt de teller (gelijk aantal skips) maar niet
  CI. Wie de reporter weglaat met een eigen `--reporter`, doet dat alleen lokaal; CI gebruikt de vaste aanroep.
- Een nieuwe kooitest zonder voorwaarde is in de sandbox rood en valt zo op; met voorwaarde in een bestaand bestand vraagt hij
  eigenaarakkoord via de teller.
