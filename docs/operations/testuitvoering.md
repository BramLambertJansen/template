# Begrensde testparallelisatie

`vitest.config.ts:18` begrenst het aantal workers voor de hele run op het kleinste van vier en de beschikbare
CPU-paralleliteit. Unitbestanden draaien parallel (`vitest.config.ts:31`); Vitest behoudt zijn bestaande isolatie.
De databasegroep `int` houdt `fileParallelism: false` (`vitest.config.ts:50`): die tests delen een database.
Selectie, asserties, retries en timeouts zijn niet aangepast.

De eerdere seriële unitgroep verwees in zijn commentaar naar database-isolatie, terwijl integratietests al in
het aparte `int`-project staan en uit `unit` worden uitgesloten. Unitfixtures maken eigen tijdelijke mappen;
de lintfixtures werken in het geheugen en de bundeltest schrijft geen bundel naar de projectmap.

## In CI: de suite in delen

In CI draaien `gate:fast`, `check:new-resource` en `ui:check` in delen naast elkaar (ADR 0076, spec `ci-in-delen`).
`pnpm gate:fast --deel checks` draait alles behalve `test:unit`; `--deel test-1` en `test-2` draaien elk de helft van
`test:unit` via `vitest --shard` (`scripts/kit/gate-fast.mjs`, `deel()`). `pnpm check:new-resource --deel <naam>` doet
hetzelfde in een eigen kopie. `UI_DEEL=1/2` of `2/2` geeft `ui:check` de helft van de e2e-suite (`playwright.config.ts`,
`shard`). Zonder deelkeuze draait alles, zoals lokaal en in de pre-push-hook. `test/rails/ci-in-delen.test.ts` bewijst dat de
delen samen precies het geheel dekken, zonder overlap. Een rood deel speel je lokaal na met dezelfde `--deel` of `UI_DEEL`.

## Tijdelijke mappen per run

Elke Vitest-run krijgt één eigen hoofdmap `vitest-run-*` onder de tmpdir van de aanroeper (`vitest.config.ts:20`,
`test/setup/tmp-root.ts`). De globalSetup zet `TMPDIR` daarop vóór de workers starten, dus `mkdtempSync(path.join(tmpdir(), …))`
in een test of kindproces landt daaronder. Na de run verwijdert de teardown alleen die hoofdmap, ook als tests falen of een test
zijn eigen map niet opruimt; de rest van `/tmp` blijft onaangeroerd (leerpunt #396). Ruim in een test toch zelf op wanneer
de map binnen de run groot wordt of vaak terugkomt: de hoofdmap groeit tot het einde van de run (in watch-modus tot het
afsluiten). Wordt Vitest hard gestopt (SIGKILL), dan blijft die ene `vitest-run-*`-map staan. Op native Windows leest
`os.tmpdir()` `TEMP`/`TMP` in plaats van `TMPDIR`; daar werkt dit niet, maar dat platform valt buiten het ondersteunde pad (WSL2 wel).

## Tests naar vermogen: de kooi

Een test die de kooi (`scripts/kit/kooi.mjs`, ADR 0072) start, slaat over waar de kooi niet kan starten, en nergens anders
(ADR 0088, spec `tests-naar-vermogen`). De globale setup van de projecten `unit` en `web` (`vitest.config.ts:38`, `:47`) draait
de proef één keer per run (`test/setup/vermogen.ts:24`); `vermogen('kooi')` geeft `{ ontbreekt, melding }`
(`test/setup/vermogen.ts:44`). Geen variabele schakelt overslaan: de proef meet de omgeving. Een kooi die start maar niet
afschermt, is geen reden om over te slaan: die test faalt. Een project zonder deze setup laat `vermogen()` gooien.

- **Melding lokaal:** precies één regel na de run, `⚠ overgeslagen: <n> tests, want de kooi kan hier niet starten (<reden>);
  ze draaien in CI, waar overslaan rood is (ADR 0088)` (`test/setup/skip-reporter.ts:44`). `gate:fast` toont regels die met
  `⚠ ` beginnen ook onder een groene gate (`scripts/kit/gate-fast.mjs:76`).
- **Rood in CI** (`GITHUB_ACTIONS` of `CI` met een niet-lege waarde anders dan `false` of `0`, `test/setup/vermogen.ts:17`):
  kan de kooi niet starten, dan faalt de setup en draait geen test (`test/setup/vermogen.ts:29`); elke overgeslagen of
  todo-test in `unit` en `web` geeft `✗ overgeslagen in CI: <bestand> > <naam>; in CI slaat geen test over (ADR 0088)` en een
  exitcode die niet 0 is (`test/setup/skip-reporter.ts:36`). Het project `int` telt niet mee.
- **Nieuwe kooitest:** zet de voorwaarde zichtbaar in het testbestand zelf, met waarden alleen uit `vermogen('kooi')`:
  `ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding)` in de test of een `beforeEach`
  (`test/scripts/runner-trusted-base.test.ts:176`), `test.skipIf(…)` bij `test.each` (`test/rails/ci-scan.test.ts:52`), of
  dezelfde skip-regel in de lokale hulpfunctie die de kooi start (`test/hooks/rolhek-effect.test.ts:36`).

Lokaal groen met de `⚠`-regel is dus geen bewijs voor de kooi-, rolhek- en effecttests; dat is alleen CI (`pnpm pr:verify`).
Meting in de Claude Code-sandbox: `docs/operations/sandbox-bewijs.md` (Beperkingen).

## Lokale meting (21 oktober 2026)

De gewone volledige `pnpm gate:fast` is vóór en na de configuratiewijziging uitgevoerd in dezelfde werkmap op
main `542e300`, met dezelfde documentatie en toolchain. De machine heeft 16 beschikbare CPU's en 8 GB geheugen.

| Uitvoering                       | Totale duur | Vitest-duur | Uitslag                   |
| -------------------------------- | ----------: | ----------: | ------------------------- |
| Bestaande configuratie           |   229,769 s |    151,77 s | 3.269 geslaagd            |
| Bestaand, herhaling (warme tools) |   288,651 s |    205,58 s | 3.259 geslaagd, 10 fouten |
| Begrensd, unit parallel          |   163,048 s |     77,86 s | 3.269 geslaagd            |

De groene vergelijking bespaart 66,721 seconden (29,0%) voor de hele gate. De rode nulmeting had bestaande
UI-time-outs en telt niet mee als snelheidswinst. Dit zijn losse metingen op één machine, geen garantie voor
andere hardware of bewijs dat alle sporadische time-outs verholpen zijn. Alle 210 testbestanden blijven actief.

Een eerdere diagnostische proef met dezelfde 3.300 tests op bron `80a3e3b` was groen met twee én vier workers
(Vitest 101,99 respectievelijk 60,47 seconden); beide hadden exact dezelfde testnamen en nul overgeslagen tests.
De volledige gate hierboven gebruikt de gewone opdracht, zonder extra Vitest-opties of runneroverride.
Database-, browser- en snapshotbewijs komt uit de bestaande CI; de PR vermeldt de werkelijk gecontroleerde SHA.
