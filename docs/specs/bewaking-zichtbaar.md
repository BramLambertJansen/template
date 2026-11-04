---
status: goedgekeurd
namespace: bewaking-zichtbaar
---

# Bewaking zichtbaar als ze niet draait

## Doel

`node scripts/kit/feiten.mjs`, waarmee elke rol begint (R-WERK-01), meldt in een Claude Code-sessie als de projecthooks uit
`.claude/settings.json` niet draaien of de Bash-sandbox niet afschermt. Dan houden rolhek, toets op effect, meting en
werkstraat-hooks niets tegen, terwijl regelboek en PR-teksten daarop leunen. Aanleiding: leerpunt #462 (in twee cloudsessies
van 3 november 2026 ontbraken hooks en sandbox, en niets meldde dat; het replay-incident kon daardoor buiten de werkmap
schrijven). Het lost niet op dat de hooks ontbreken, het maakt zichtbaar dat ze ontbreken (R-WERK-23: claim nooit een
instelling die je niet kunt lezen).

## Rollen en wie wat ziet

n.v.t. — een melding op stderr van `feiten.mjs` voor elke sessie in Claude Code; geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `scripts/kit/toolchain.mjs` — pure beslisfunctie plus een `…In(root)`-variant die de feiten verzamelt, zonder dependencies
- `test/scripts/toolchain.test.ts` — tabeltests op de pure functie en een echte tijdelijke map

## Hergebruik en UX

n.v.t. — geen UI. De melding is één regel die begint met `⚠ bewaking niet actief in deze sessie:`.

## Acceptatiecriteria

- **bewaking-zichtbaar/AC-1** — `scripts/kit/bewaking.mjs` exporteert een pure `bewakingMelding({ inClaudeCode, recenteMeting,
  buitenWerkmapSchrijfbaar, map, ouder })`. Zonder `inClaudeCode` geeft hij `null` (CI, een terminal, een git-hook). Anders
  geeft hij `null` als `recenteMeting` waar is en `buitenWerkmapSchrijfbaar` onwaar, en in elk ander geval één regel die
  begint met `⚠ bewaking niet actief in deze sessie:`, per gevonden probleem een deel noemt (`projecthooks uit
  .claude/settings.json draaien niet (geen meting in <map> van de laatste 120 s)` en/of `de Bash-sandbox schermt niet af
  (<ouder> is schrijfbaar)`) en eindigt met de gevolgen: rolhek, toets op effect en werkstraat-hooks houden niets tegen, claim
  ze niet (R-WERK-23), destructieve of overgenomen commando's alleen in de kooi (R-TOOL-03), zie `docs/ENVIRONMENT.md`.
- **bewaking-zichtbaar/AC-2** — `bewakingMeldingIn(root, env, nu)` verzamelt de feiten: `inClaudeCode` is `env.CLAUDECODE ===
  '1'`; `map` is `opslagmap(root, env)` uit `rails/hooks/lib/meting.mjs` (dezelfde map waar de meethook bij elke tool-aanroep
  in schrijft, ook vóór de Bash-aanroep die `feiten.mjs` start); `recenteMeting` is waar als die map een `*.jsonl` bevat met
  een wijzigingstijd van hooguit 120 s vóór `nu`; `ouder` is de map boven `root` en `buitenWerkmapSchrijfbaar` is waar als
  `access(ouder, W_OK)` slaagt.
- **bewaking-zichtbaar/AC-3** — Ontbrekende of onleesbare invoer valt dicht, dus mét melding: geen opslagmap (`opslagmap` geeft
  `null`), een map die niet bestaat, een lege map, een map die niet te lezen is, een `*.jsonl` waarvan `stat` faalt, of alleen
  oudere bestanden: `recenteMeting` is onwaar. Een `access` die faalt telt als niet schrijfbaar. Elke tak heeft een eigen test
  (leerpunt #504).
- **bewaking-zichtbaar/AC-4** — `scripts/kit/feiten.mjs` schrijft de melding, als die er is, op stderr direct na de
  toolchaincontrole en vóór elke sectie, ook bij `hoofdstuk` en `--json`. Stdout en exitcode veranderen niet: de melding
  blokkeert geen werk, `--json` blijft geldige JSON. Een fout in `bewaking.mjs` zelf laat `feiten.mjs` niet falen; dan meldt
  hij `⚠ bewaking niet te controleren: <fout>` op stderr.
- **bewaking-zichtbaar/AC-5** — `docs/ENVIRONMENT.md` noemt bij de cloudalinea over #462 en in de tabel "Eerst controleren in een
  sessie" dat `feiten.mjs` deze melding geeft en wat de sessie dan doet; `CHANGELOG.md` noemt de check.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Cloudsessie zonder projecthooks en sandbox (#462, deze sessie op 4 november 2026) | melding met beide delen | n.v.t. |
| Lokale sessie met hooks en sandbox | geen melding | n.v.t. |
| Lokale sessie met hooks, sandbox uitgezet | melding met alleen het sandboxdeel | n.v.t. |
| `feiten.mjs` in een terminal, CI of git-hook (`CLAUDECODE` niet `1`) | geen melding | n.v.t. |
| `METING_DIR` gezet | die map telt (zelfde als de meethook) | n.v.t. |
| Meethook faalt stil (fail-open) terwijl rolhek wel draait | melding over hooks: liever een valse waarschuwing dan een valse geruststelling | n.v.t. |
| Sessie gestart in de map boven de repository | sandboxdeel klopt: die map is dan schrijfbaar | n.v.t. |

## Raakt ook

`scripts/kit/feiten.mjs` (aanroep), `rails/hooks/lib/meting.mjs` (alleen gelezen: `opslagmap`), `docs/ENVIRONMENT.md`,
`CHANGELOG.md`. Geen hook, gate of `.claude/`-bestand verandert.

## Buiten scope

De hooks in een cloudsessie wél laten draaien: dat hangt af van hoe de cloudomgeving Claude Code start, niet van de repository.
`feiten.mjs` laten falen bij de melding: dan zou een cloudsessie niets meer kunnen, ook niet veilig lezen. Dezelfde controle in
`scripts/doctor.sh` of de SessionStart-hook (die draait juist niet als de hooks ontbreken).

## Testplan

Tabeltests in `test/scripts/bewaking.test.ts` voor `bewakingMelding` (AC-1, elke combinatie) en voor `bewakingMeldingIn` met een
echte tijdelijke map en `METING_DIR` (AC-2, AC-3: elke tak met ontbrekende invoer apart, ook een `*.jsonl` die een kapotte
symlink is), en een test die `feiten.mjs` als kindproces draait met `CLAUDECODE=1` en een lege `METING_DIR`: melding op
stderr, `--json` geldig, exitcode 0 (AC-4). Een docstest op `docs/ENVIRONMENT.md` (AC-5). Elke negatieve test faalt op de
huidige code (R-PRINC-04).

## Open vragen

Geen.
