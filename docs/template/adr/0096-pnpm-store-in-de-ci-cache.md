# 0096 — De pnpm-store mag in CI uit een cache; uitslagen nooit

Status: geaccepteerd

Wijzigt [0076](0076-ci-in-delen.md) punt 1 (alleen: "geen cache") en de tekst van R-CI-08. Drempel: A4 (vorm van de jobs
achter de verplichte checks in `.github/workflows/ci.yml`). Besluit van de eigenaar, 2026-11-18 (reviewbevinding E-7).

## Context

Elke PR start elf jobs die `pnpm install --frozen-lockfile` draaien (drie delen van `gate:fast`, vier van `gate:slow`, drie
van `check:new-resource` en `image`). Elke job haalt alle pakketten opnieuw van het register. R-CI-08 zei "geen oude uitslag
of cache", en 0076 punt 1 herhaalde "geen cache". Het doel van die regel is dat een groene check op deze head-SHA
volledig opnieuw bewezen is: geen uitslag, build of `node_modules` van een eerdere run. Een store met gedownloade pakketten
bewijst niets: pnpm toetst elk pakket aan de integriteitshash in `pnpm-lock.yaml`, en de installatie, build en tests draaien
gewoon opnieuw.

## Besluit

1. **De pnpm-store mag uit de cache van GitHub** (`actions/cache`, op volledige SHA zoals elke action), met als sleutel het
   besturingssysteem en de hash van `pnpm-lock.yaml`. Alleen het pad van `pnpm store path` gaat in de cache.
2. **Niets anders.** `node_modules`, buildoutput, testuitslagen, de Playwright-browsers en de stack blijven per run vers.
   Een job slaat nooit een stap over omdat iets in de cache stond; de installatie blijft `--frozen-lockfile`.
3. **R-CI-08 wordt:** volledige CI op elke PR, geen oude uitslag of build hergebruiken; alleen gedownloade pakketten mogen uit
   een cache.

## Alternatieven

- **`node_modules` cachen:** sneller, maar dan draait de installatie (met de scripts van pakketten) niet meer in de run en
  bewijst de check minder. Afgewezen.
- **Alleen op `main` opslaan en op een PR alleen lezen** (`actions/cache/restore` en `save` apart): beschermt tegen een
  PR die de cache vult, maar GitHub schermt de cache van een PR al af van `main` en van andere PR's, en pnpm toetst elk pakket.
  Twee stappen per job extra voor geen winst.

## Gevolgen

- Minder downloadtijd per job en minder afhankelijkheid van de beschikbaarheid van het register; de winst lees je af in de
  duur van de stap `pnpm install` vóór en na deze wijziging.
- De store groeit met `restore-keys` over lockfile-wijzigingen heen; GitHub ruimt caches op na zeven dagen zonder gebruik en
  boven de limiet per repository. Wordt hij te groot, dan is `pnpm store prune` vóór het opslaan het vervolg.
- Aanvaard risico: een kapotte of vergiftigde cache. pnpm weigert een pakket met een andere hash; dan faalt de job, en een
  nieuwe lockfile-hash of het verwijderen van de cache in GitHub lost het op.
