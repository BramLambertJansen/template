---
status: goedgekeurd # voorstel | goedgekeurd | gebouwd | vervallen — architect of hoofdsessie zet de status in het voorstel, de merge door de eigenaar is het besluit (ADR 0046); gebouwd: # #<PR>, de eigen PR met de implementatie (ADR 0062) of daarna de gemergde bouw-PR (pnpm docs:status, ADR 0080)
namespace: agent-token
---

# Token voor de GitHub App van de agent

## Doel

Een blijvend script in de repo, `scripts/kit/agent-token.mjs`, maakt een installatietoken van hoogstens een uur voor de GitHub
App van de agent, zodat PR's als de App niet meer wachten op een script buiten de repo dat bij een herstart verdwijnt
(leerpunt #754). Dit herziet ADR 0089 punt 2 en templateregime/AC-1 (eigenaarbesluit 2026-11-17): er komt wél een tokenscript
in de repo, zonder ververs-proces, timer of credential-helper; de eigenaar maakt het token met de hand aan.

## Rollen en wie wat ziet

- **Eigenaar:** draait het script buiten de sandbox, nooit uit een werkmap van de agent, maar uit de versie op `main` van
  GitHub, in de repo (voor `origin`) of met `--repo <o>/<r>`:
  `gh api -H 'Accept: application/vnd.github.raw' 'repos/<o>/<r>/contents/scripts/kit/agent-token.mjs?ref=main' | node --input-type=module - <app-id>`.
  `gh api` met een expliciet pad leest geen `.git/config` van de werkmap, dus een agent die die config wijzigt, kan geen andere
  code laten draaien. Daarom importeert het script alleen `node:`-modules en werkt het via stdin (AC-8). Zo kan code die de
  agent in zijn werkmap schrijft de sleutel niet lezen.
- **Sleutel:** standaard `~/.ssh/template-agent.pem`. `~/.ssh` staat in `denyRead` van de sandbox en in `permissions.deny`
  (`.claude/settings.json`); dat geldt alleen in Claude Code (R-WERK-23): een sleutel elders kan de agent lezen.
- **Agent:** leest alleen het tokenbestand (standaard `/tmp/claude-<uid>/agent-token`, modus 600) en geeft het per commando mee
  als `GH_TOKEN`. Het script drukt het token en de JWT nooit af, ook niet in een foutmelding.
- **Token:** geldt alleen voor die ene repository, met de rechten van de App (ADR 0089 punt 2).

## Kopieer de vorm van

- `scripts/kit/app-init.mjs` — kit-script met geëxporteerde functies en een dunne ingang (`import.meta.main`), exit 2 bij
  verkeerd gebruik en 1 bij een fout. Afwijking: dit script importeert geen eigen modules (zie Rollen).

## Hergebruik en UX

Geen UI. Uitvoer in het Nederlands, zoals de andere kit-scripts. Gebruik:
`node scripts/kit/agent-token.mjs <app-id> [--repo <owner>/<repo>] [--sleutel <pad>] [--uit <pad>]`.

## Acceptatiecriteria

- **agent-token/AC-1** — Gegeven een App-ID, een RSA-sleutel en een meegegeven tijd `nu`, dan heeft de JWT de kop
  `{"alg":"RS256","typ":"JWT"}`, is `iss` het App-ID als string, `iat` = `nu − 60` en `exp` = `nu + 540` in hele seconden, en
  verifieert de handtekening met de publieke sleutel.
- **agent-token/AC-2** — Een App-ID dat niet alleen uit cijfers bestaat, een onbekende optie, of een `--repo` die niet aan
  `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$` voldoet, geeft exit 2 met een gebruiksregel, zonder de sleutel te lezen of een verzoek te doen.
- **agent-token/AC-3** — Zonder `--repo` leest het script `remote.origin.url` uit de repo in de huidige map en herkent
  `https://github.com/<o>/<r>[.git]`, `git@github.com:<o>/<r>[.git]` en `ssh://git@github.com/<o>/<r>[.git]`, net als
  `repositoryName` in `rails/hooks/lib/authority-context.mjs`; een test vergelijkt beide op dezelfde tabel van URL's. Een
  ontbrekende `origin`, een lokaal pad of een andere host geeft exit 1 met een melding die `--repo` noemt, zonder verzoek. In een
  app is `origin` de app-repo; voor een leerpunt naar de template geeft de eigenaar `--repo` mee.
- **agent-token/AC-4** — Bij succes vraagt het script de installatie van de App op die repository op en daarna een token met body
  `{"repositories":["<r>"]}` (alleen de naam, zonder eigenaar; de test controleert de body). Ontbreekt de map van het
  uitvoerpad, dan exit 1 met een melding die het pad en `--uit` noemt, zonder verzoek. Het schrijft het token eerst naar een nieuw, exclusief aangemaakt tijdelijk bestand met modus 600
  in dezelfde map en hernoemt dat naar het uitvoerpad. Is het uitvoerpad een symlink, dan vervangt de hernoeming de link zelf en
  blijft het doel onaangeroerd; staat er al een bestand met een andere modus, dan heeft het daarna modus 600. Het script drukt
  alleen het pad, de vervaltijd en de rechten af; het token staat niet in stdout of stderr.
- **agent-token/AC-5** — Antwoordt GitHub met een fout (bijv. 401, 404), faalt het netwerk, is het antwoord geen JSON of ontbreekt
  `token` of `expires_at`, dan stopt het script met exit 1 en een melding met methode, pad en status, bij een netwerkfout "geen
  verbinding" (zonder antwoordtekst, JWT of stacktrace); er wordt geen uitvoerbestand geschreven of overschreven, en een
  tijdelijk bestand dat al bestond, wordt verwijderd.
- **agent-token/AC-6** — Ontbreekt het sleutelbestand of is het onleesbaar, of heeft het rechten voor groep of anderen
  (modus & 077 ≠ 0), dan stopt het script met exit 1 en een melding die het pad noemt (`--sleutel`, of `chmod 600`), zonder verzoek.
- **agent-token/AC-7** — Het script heeft geen andere imports dan `node:`-modules; een test leest de bron.
- **agent-token/AC-8** — Via stdin (`node --input-type=module - <args>`, bron als invoer) gedraagt de ingang zich als via het
  bestandspad: een ongeldig App-ID geeft exit 2 met de gebruiksregel, en de argumenten na `-` zijn de argumenten van het script.
  Het script gebruikt geen `import.meta.dirname`, `import.meta.filename` of een pad uit `import.meta.url`.

## Randgevallen

- Klok: `iat` ligt 60 s terug voor klokverschil met GitHub; `exp` blijft onder de grens van 10 minuten.
- Twee keer kort na elkaar draaien: het tweede token vervangt het eerste atomair; een lezer ziet nooit een half bestand.

## Raakt ook

`docs/template/adr/0089-templateregime.md` punt 2 (met `Herzien:`-regel), `docs/template/specs/templateregime.md` AC-1,
`docs/nieuwe-app.md` 6.2 (pad van de sleutel, het commando, geen credential-helper, gebouwd), `docs/roadmap.md` ST-01,
`docs/template-changelog.md`. Niet: `.claude/settings.json` (`~/.ssh` staat al in `denyRead`).

## Buiten scope

Een credential-helper voor `git push`, automatisch verversen, het ophalen van de sleutel uit een kluis, en het aanmaken of
installeren van de App zelf.

## Testplan

Unittests in `test/scripts/agent-token.test.ts` zonder netwerk: de logica zit in `maakToken({ appId, repo, sleutel, uit }, { fetch, nu })`
zodat de tests een nep-`fetch` en een vaste tijd meegeven; AC-1 met een sleutelpaar uit `generateKeyPairSync`; AC-3 met een pure functie
`repoUitRemote(url)` op dezelfde URL-tabel als `repositoryName`, plus een tijdelijke git-repo zonder `origin`; AC-4 in een
tijdelijke map (symlink naar een doelbestand, bestaand bestand met modus 644, ontbrekende map); AC-2 en AC-6 via de ingang met
`spawnSync`; AC-7 leest de bron; AC-8 met `spawnSync(process.execPath, ['--input-type=module', '-', 'abc'], { input: bron })`. Geen dependency: alleen `node:crypto`, `node:fs`, `node:path`, `node:os`, `node:util` (`parseArgs`),
`node:child_process` (git) en de globale `fetch`.

## Open vragen

- **OV-1 ✅ besloten** — Geen git-credential-helper in deze stap: pushen gaat met `gh` en `GH_TOKEN`.
- **OV-2 ✅ besloten** — Standaardsleutel in `~/.ssh` in plaats van `~/.config/template-agent/` (6.2): `~/.ssh` staat al in
  `denyRead` van de sandbox.
- **OV-3 ✅ besloten** — Tokenscript in de repo, met herziening van ADR 0089 punt 2 (eigenaarbesluit 2026-11-17, na de
  spec-review die de botsing aanwees).
