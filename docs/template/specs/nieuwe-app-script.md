---
status: goedgekeurd # architect; de merge door de eigenaar is het besluit (ADR 0046); OV-1 t/m OV-7 besloten 2026-11-18, OV-8 en OV-9 2026-11-26
namespace: nieuwe-app-script
---

# Nieuwe app: deterministische setupstappen als script

## Doel

`scripts/kit/nieuwe-app.mjs` voert de deterministische stappen van `docs/nieuwe-app.md` uit (preflight, koppeling met de
template, poorten en `.env.local`, databasebewijs; in bouwstap 2 de repo-instellingen), meldt per stap ok of fout met
herstel en schrijft een resultaatbestand dat de agent leest; het playbook houdt begeleiding, overdrachten en de fouttabel.

**Aanleiding.** Reviewbevinding F6: het playbook is 1133 regels (78 KB, ~33k tokens) met ongeveer tien eigenaarstaken en veel
uitvoerbare proza. Leerpunt #571: poorten en `.env.local` gaan met de hand, `API_PORT`/`WEB_PORT` ontbreken in
`.env.example`. Leerpunt #561: de agent ziet van bootstrap en doctor alleen "klaar", niet de uitslag.

**Route en besluit.** Volledig en risicowerk (R-WERK-04): de `-s ours`-koppeling is na de push moeilijk te herstellen, en
bouwstap 2 schrijft beveiligingsinstellingen met de `gh`-login van de eigenaar (vertrouwensgrens). Aparte tester vóór de
developer. Twee bouwstappen (OV-1):

- **Bouwstap 1** — geen kritiek werk: elk pad in "Raakt ook, bouwstap 1" heeft geen `besluit-pr` en geen `altijdVragen`
  (`scripts/**` en `.env.example` `voorReview`, `docs/nieuwe-app.md` `gate`, `test/**` `gate`; `feiten.mjs pad`).
  `scripts/kit/pr-merge.mjs` (`besluit-pr`, `.claude/gates.json`) raakt bouwstap 1 niet.
- **Bouwstap 2** (`repo-instellingen`) — kritiek werk (R-WERK-05, bij twijfel kritiek: beveiligingsinstellingen van de
  repo). Eigen PR na bouwstap 1, met spec-review van de wijzigingen in deze spec, aparte tester, en de goedkeuring van de
  eigenaar op de PR als besluit (R-REPO-02); in de template geen besluit-PR (R-WERK-05). `--controleer` toetst de vorm
  van ADR 0093 punt 2 met een eigen alleen-lezende module (OV-8); `scripts/kit/pr-merge.mjs` levert niets meer aan (sinds
  ADR 0093 geen `grensRedenen` of `REDEN_`-constanten).

Geen ADR: geen dependency (alleen `node:`-modules), geen contract tussen zones, en de agent krijgt geen recht dat hij nu
niet heeft (OV-2); `--controleer` leest alleen. `#561` blijft open na de bouw: punt 3 (testsessie) en de restanten vallen buiten deze spec; de PR van
bouwstap 1 meldt op de issue welke punten af zijn.

## Rollen en wie wat ziet

| Wie | Doet | Doet niet |
|---|---|---|
| Setup-agent | draait `preflight`, `koppel`, `poorten`, `db-bewijs`, na bouwstap 2 ook `repo-instellingen`; leest de resultaatbestanden | docker via het script (de leesopdrachten voor restanten blijven in het playbook), toolchain installeren, bootstrap, push naar `main`, ruleset zetten, `.env.local` overschrijven |
| Eigenaar | root-setup, `scripts/bootstrap.sh`, `pnpm dev`, eerste push, `scripts/github-ruleset.sh`, restanten opruimen | — |
| Doctor en bootstrap | schrijven hun uitslag naar een resultaatbestand (#561) | iets herstellen |

Het resultaatbestand is bewijs van wat het script zag, geen grens: de agent kan het overschrijven. Het telt naast de
eigen controle uit het playbook, niet in plaats daarvan.

## Werking (bindend)

1. **Aanroep.** `node scripts/kit/nieuwe-app.mjs <deelcommando> [opties] [--dry-run]`. Statische imports alleen `node:`,
   zodat het bestand ook los werkt (OV-3); alleen `repo-instellingen --controleer` laadt een repomodule (werking 7,
   bouwstap 2).
   Node-versie (R-WERK-25, OV-3): vóór de clone draait de agent het script alleen met de vastgezette versie uit `mise.toml`
   van `template.repository`@`main`: `~/.local/bin/mise exec node@<versie uit mise.toml> -- node ~/setup/nieuwe-app.mjs …`,
   nooit `mise exec node --` zonder versie; na de clone (4.3) alleen het exemplaar in de repo, zoals het hernoemscript:
   `~/.local/bin/mise exec node -- node scripts/kit/nieuwe-app.mjs …`, en niet meer dat in `~/setup`. De uitzondering in de
   harde regel "Jij installeert geen toolchain" van `docs/nieuwe-app.md` noemt `scripts/kit/nieuwe-app.mjs` naast het
   hernoemscript van 5.2, met dezelfde grens: alleen Node, alleen de vastgezette versie.
   **Windows-modus** (playbook "Omgeving herkennen"): de agent roept dezelfde regel aan via
   `wsl.exe -d <distro> -- bash -lc "cd ~/setup && <regel>"` (na de clone `cd ~/code/<slug>`), nooit vanuit de
   Windows-werkmap (dan is de werkmap `/mnt/c/…` en faalt `pad`), en leest een resultaatbestand met
   `wsl.exe -d <distro> -- bash -lc "cat <pad>"`, niet via `\\wsl$`.
   Exitcode 0 als elke stap ok of overgeslagen is, 1 bij een fout, 2 bij verkeerd gebruik. Nooit `docker`, `pnpm`, `npm`,
   `sudo`, `git push` of een shell met invoer erin (`execFileSync` met argumentlijst).
2. **Uitvoer per stap**, zoals `scripts/doctor.sh`: `✓ <melding>`, `· <melding> (overgeslagen)` of
   `✗ <melding>` met op de volgende regel `  → <herstel>`. Met `--dry-run`: `(dry-run) ` vóór elke regel van een schrijvende
   stap; er wordt niets geschreven behalve het resultaatbestand (met `"dryRun": true`).
3. **Resultaatbestand** (OV-4): `.template/nieuwe-app-<deelcommando>.json`, relatief aan de git-root van de werkmap
   (`git rev-parse --show-toplevel`), `.template/` in `.gitignore`. Buiten een git-repo (preflight in `~/setup`) schrijft
   het script naar `~/setup/.template/nieuwe-app-<deelcommando>.json` en is `head` null. Bij de start verwijdert het script
   zijn eigen resultaatbestand, zodat een afgebroken run geen oud bestand laat staan. Bij exitcode 2 schrijft het geen
   bestand: met een bekend deelcommando is het eigen bestand dan verwijderd, bij een onbekend of ontbrekend deelcommando
   raakt het geen bestand. Vorm:
   `{ "schema": 1, "commando", "tijd" (ISO), "head" (sha of null), "dryRun", "uitslag": "ok"|"fout", "stappen": [{ "id",
   "status": "ok"|"fout"|"overgeslagen", "melding", "herstel" (string of null) }], "gegevens": {…} }`. `head` is
   `git rev-parse HEAD` op het moment van schrijven, dus na de stap (bij `koppel` de nieuwe merge-commit). Geen geheimen, geen
   inhoud van `.env.local`. Doctor en bootstrap schrijven in dezelfde vorm (werking 9). **Versheid:** de agent telt een
   resultaatbestand alleen als `head` gelijk is aan zijn eigen `git rev-parse HEAD` direct na de stap (of null buiten een
   repo) en `tijd` ligt na het moment waarop hij de stap of overdracht gaf (genoteerd in `SETUP-PROGRESS.md`); anders telt
   het als ontbrekend.
4. **`preflight [--slug <slug>] [--zichtbaarheid public|private]`**, alleen lezend. Stappen: `os` (Ubuntu 24.04 of 26.04
   uit `/etc/os-release`; macOS of een andere versie is fout, OV-7), `pad` (werkmap niet onder `/mnt/<letter>`), `systemd`
   (alleen WSL: PID 1 is `systemd`), `tools` (`git gh jq bwrap socat psql` en `~/.local/bin/mise`), `inotify` (≥ 524288),
   `gh-login` (ingelogd met scope `workflow`), `template` (`is_template` waar voor `template.repository`; buiten een repo de repo uit de
   raw-URL in `START-NIEUWE-APP.md` naast het script of in `~/setup`, zonder letterlijke repo in het script zodat een fork
   alleen die twee plekken aanpast; onbekend is een fout), `plan` (alleen bij `private`: `gh api user --jq .plan.name`; `null` is
   fout "onbekend"), `slug` (geldig zoals `app-init.mjs`, `~/code/<slug>` en `<login>/<slug>` bestaan niet; bestaan ze en is
   de `origin` van `~/code/<slug>` gelijk aan `<login>/<slug>`, dan overgeslagen met `hervatting: controleer
   SETUP-PROGRESS.md`), `poorten` (de vijf standaardpoorten vrij volgens de vrij-regel van werking 6; bezet is overgeslagen
   met de melding dat `poorten` verschuift).
5. **`koppel`** (playbook 5.1). Template-URL: `https://github.com/<template.repository>.git` uit `.claude/gates.json`
   (een fork past die aan). Weigert bij een vuile werkmap. `overgeslagen` als `HEAD` of `HEAD~1` (na de hernoem-commit van
   5.2) een merge is waarvan de tweede ouder in `template/main` zit (`git merge-base --is-ancestor`). Anders weigert het
   als `HEAD` niet de enige, ouderloze commit is. Een bestaande remote `template` met de juiste URL en push-URL `DISABLED`
   is ok (hervatting); een andere URL is fout. Dan: remote `template` met push-URL `DISABLED`, `git fetch template`, tree van
   `HEAD` gelijk aan die van `template/main` (anders fout, geen merge). Met `--dry-run` maakt het geen remote en haalt het op
   met `git fetch <url> main` (alleen `FETCH_HEAD` en objecten wijzigen) voor de treevergelijking. Daarna
   `git merge --allow-unrelated-histories -s ours template/main -m "chore: link to template (<korte sha>)"` en controle: twee
   ouders, `git diff HEAD~1 --stat` leeg. `gegevens`: volledige template-sha en beide tree-ID's.
6. **`poorten [--env]`** (playbook 7.1). Bestaat `.env.local`, dan kiest `poorten` niets (met en zonder `--env`) en schrijft
   het niets: het leest alleen de poortsleutels (zoals `port()` in `scripts/doctor.sh`) en neemt de vijf poorten over in
   `gegevens`. Alleen een ontbrekende `API_PORT` of `WEB_PORT` krijgt de standaardwaarde. Is het bestand niet leesbaar,
   leeg, of ontbreekt `PG_PORT`, `MAIL_UI_PORT` of `SMTP_PORT`, dan is stap `env-bestaand` fout, zonder terugval op de
   standaardpoorten en zonder `gegevens` (de sandbox van Claude Code maskeert `.env.*`; een gemaskeerd bestand kan als leeg
   terugkomen). Anders is `env-bestaand` ok als de poortsleutels en de URL-poorten (de sleutels hieronder) onderling kloppen,
   en fout met alleen de sleutelnamen als dat niet zo is. Zonder `.env.local` kiest het de eerste `k` in 0..9 waarvoor alle
   vijf poorten `basis + 10·k` vrij zijn (basis 54322, 54324, 54325, 8787, 5173); vrij is: `listen` lukt op `127.0.0.1` en
   `0.0.0.0`, en als de machine IPv6 heeft ook op `::1` en `::` (Vite bindt op `localhost`, vaak `::1`). `gegevens`:
   `{ pg, mailUi, smtp, api, web, origin }`. Met `--env` en zonder `.env.local`: kopie van `.env.example` waarin alleen
   `PG_PORT`, `MAIL_UI_PORT`, `SMTP_PORT`, `API_PORT`, `WEB_PORT`, de poort in `DATABASE_URL`, `AUTH_DATABASE_URL`,
   `MIGRATOR_DATABASE_URL`, `SMTP_URL` en de hele waarde van `APP_ORIGIN` en `AUTH_BASE_URL` (`http://localhost:<web>`)
   wijzigen.
7. **`repo-instellingen --repo <owner>/<slug> [--beschrijving <tekst>] [--controleer]`** (bouwstap 2; playbook
   6.1-controle en 6.2). Weigert als `--repo` niet de `origin` van de werkmap is. Alleen in de schrijvende modus weigert het
   ook als `main` op GitHub nog niet de vorm heeft hernoem-commit (één ouder) boven koppel-merge (twee ouders);
   `--controleer` kijkt niet naar die vorm. Schrijft precies wat `MERGE_METHODEN`, `WORKFLOW_RECHTEN` en `ACTIONS`
   hieronder toetsen, zoals playbook 6.2: `gh repo edit <repo> --enable-merge-commit --enable-squash-merge
   --enable-rebase-merge=false --delete-branch-on-merge --enable-auto-merge=false` (met `--description <tekst>` als
   `--beschrijving` is gegeven), `default_workflow_permissions` `read` met `can_approve_pull_request_reviews` onwaar, en
   `enabled` waar, `allowed_actions` `all`, `sha_pinning_required` waar. De ruleset zelf zet de eigenaar.
   **`--controleer`** (OV-8, OV-9) schrijft niets op GitHub en laadt met een dynamische `import()`, alleen in dit pad,
   `scripts/kit/ruleset-controle.mjs` (nieuw). Die module:
   - exporteert `controleerRuleset(gh, { repo, requiredChecks })` en `controleerInstellingen(gh, { repo })`; beide geven
     een lijst `{ code, details }` terug (leeg = gelijk), met `code` uit de vaste lijst hieronder en `details` een lijst
     namen per code (hieronder), nooit een waarde. Ze gooien niet bij een `gh`-fout. Per code één kleine functie
     (R-CODE-02).
   - `gh` is geïnjecteerd met de vorm van de bestaande `voer()` (`scripts/kit/nieuwe-app.mjs:91-99`):
     `(args) => { ok, stdout, stderr }`. De module roept het alleen aan met `api <endpoint>`, nooit met `-X`, `--method`,
     `--input`, `-f`, `-F` of `--field`. Statische imports alleen `node:`; geen eigen teksten (`nieuwe-app.mjs` en later
     `check-github` maken die).
   - Rulesetcodes, tegen de payload van `scripts/github-ruleset.sh:67` (ADR 0093 punt 2; de Pro-melding op regel 97), uit
     `repos/<repo>/rulesets` (alleen items met `source_type` `Repository`; org-rulesets tellen hier niet; een item zonder `source_type` geeft `RULESET_ONLEESBAAR`) en
     `repos/<repo>/rulesets/<id>`:
     - `RULESETS_NIET_BESCHIKBAAR`: de lijst faalt en "Upgrade to GitHub Pro" staat in stdout of stderr. Details: leeg.
     - `GEEN_RULESET`: geen ruleset met naam `main`. Details: leeg.
     - `RULESET_NIET_ACTIEF`: `enforcement` niet `active`, `target` niet `branch`, of `conditions.ref_name` niet precies
       include `~DEFAULT_BRANCH` en exclude leeg. Details: de afwijkende veldnamen.
     - `BYPASS`: `bypass_actors` niet leeg of `current_user_can_bypass` niet `never`. Details: die veldnamen.
     - `REGELS`: een regel `deletion`, `non_fast_forward` of `pull_request` ontbreekt, een regeltype naast de vier, of in
       `pull_request` wijkt af: `required_approving_review_count` 0, `dismiss_stale_reviews_on_push` waar,
       `require_code_owner_review` en `require_last_push_approval` onwaar, `required_review_thread_resolution` waar,
       `allowed_merge_methods` precies merge en squash. Details: regeltype, of `pull_request.<parameter>`.
     - `CHECKS`: de regel `required_status_checks` ontbreekt, de namen zijn als verzameling niet precies `requiredChecks`,
       een `integration_id` is niet 15368, of `strict_required_status_checks_policy` is waar. Details: de ontbrekende en
       extra checknamen, de checknaam met een ander `integration_id`, of `required_status_checks` /
       `strict_required_status_checks_policy`.
     - `RULESET_ONLEESBAAR`: een andere `gh`-fout, geen JSON, of een ontbrekend veld (voorrangsregel). Details: het
       endpoint (pad) of de veldnaam.
   - Instellingscodes, tegen playbook 6.2 (`docs/nieuwe-app.md:627-632`), uit `repos/<repo>`,
     `repos/<repo>/actions/permissions/workflow` en `repos/<repo>/actions/permissions`; details zijn de afwijkende
     veldnamen:
     - `MERGE_METHODEN`: `allow_merge_commit` en `allow_squash_merge` waar, `allow_rebase_merge` en `allow_auto_merge`
       onwaar, `delete_branch_on_merge` waar.
     - `WORKFLOW_RECHTEN`: `default_workflow_permissions` `read`, `can_approve_pull_request_reviews` onwaar.
     - `ACTIONS`: `enabled` waar, `allowed_actions` `all`, `sha_pinning_required` waar.
     - `SHA_PINNING_ONBEKEND`: `sha_pinning_required` ontbreekt. Details: leeg.
     - `INSTELLINGEN_ONLEESBAAR`: een `gh`-fout, geen JSON, of een ontbrekend veld (voorrangsregel). Details: het
       endpoint (pad) of de veldnaam.
   - **Voorrangsregel bij ontbrekende velden:** ontbreekt een hele regel (type), dan `REGELS` of `CHECKS`; ontbreekt een
     veld binnen een aanwezige regel, of een top-level veld (ook `bypass_actors`, `current_user_can_bypass`), dan
     `RULESET_ONLEESBAAR`; ontbreekt `sha_pinning_required`, dan alleen `SHA_PINNING_ONBEKEND`; ontbreekt een ander
     instellingsveld, dan `INSTELLINGEN_ONLEESBAAR`. Een endpoint dat faalt of geen JSON geeft, levert alleen zijn
     `…_ONLEESBAAR` (of `RULESETS_NIET_BESCHIKBAAR`, `GEEN_RULESET`) en geen andere code uit dat antwoord. Velden van
     GitHub die hier niet genoemd zijn (zoals `required_reviewers`, `do_not_enforce_on_create`), negeert de module.
   `nieuwe-app.mjs` leest `requiredChecks` uit `.claude/decisions.json` en geeft de module als `gh` de bestaande `voer()`
   met `gh` als commando (één adapter). Beide functies draaien altijd. Per bevinding een stap `fout` met als `id` de code
   in kleine letters met `-` voor `_`, en de tekst uit Hergebruik en UX met `<details>` kommagescheiden; een functie
   zonder bevindingen geeft haar eigen stap ok (`ruleset` of `instellingen`). Exitcode 0 alleen zonder bevindingen; de
   beschrijving en de vorm van `main` toetst `--controleer` niet.
8. **`db-bewijs [--pg <poort>]`** (playbook 8). PG-poort uit `--pg`, anders uit `.template/nieuwe-app-poorten.json`, anders
   fout; leest nooit `.env.local`. Gebruikers en wachtwoorden uit `MIGRATOR_DATABASE_URL` en `DATABASE_URL` van
   `.env.example` (lokale demowaarden). De zes beweringen uit de tabel van playbook 8, elk een stap met `id`
   `migraties`, `schemas`, `geen-superuser`, `api-zonder-rol`, `rol-zonder-gebruiker`, `rolwissel-lokaal`.
9. **Doctor, bootstrap en dev (#561, #571).**
   - `scripts/doctor.sh` (volledig en `--machine`) controleert ook de samenhang van de poorten in `.env.local` (dezelfde
     sleutels als stap 6; alleen poorten, nooit waarden tonen). Het verwijdert bij de start `.template/doctor-<full|machine>.json`
     en schrijft dat bestand aan het eind, ook bij een vroege afbreking (trap op `EXIT`; `uitslag` `fout` bij een exitcode
     ≠ 0). `--quick` schrijft en verwijdert niets.
   - `scripts/bootstrap.sh` verwijdert bij de start `.template/bootstrap.json` en `.template/doctor-machine.json`, en
     schrijft `.template/bootstrap.json` met per stap (`mise-trust`, `mise-install`, `pnpm-install`, `lefthook`,
     `doctor-machine`) de status, ook bij een fout (trap op `EXIT`): de falende stap `fout`, de stappen erna
     `overgeslagen`. Het schrijft met `printf` in shell, zonder Node of `jq` (bij een falende `mise install` is er geen Node).
   - `scripts/dev.mjs` controleert vóór `docker compose` dat `API_PORT` en `WEB_PORT` vrij zijn (vrij-regel van werking
     6, geïmporteerd uit `nieuwe-app.mjs`). Het leest alleen die twee sleutels uit `.env.local` (ontbreekt dat bestand: uit
     `.env.example`), met 8787 en 5173 als terugval. Ontbreekt `.env.local`, dan kopieert het `.env.example` alleen als ook
     `PG_PORT`, `MAIL_UI_PORT` en `SMTP_PORT` uit de standaardpoorten vrij zijn; anders exit 1 met een verwijzing naar
     `poorten --env`.
10. **Playbook** (OV-5). `docs/nieuwe-app.md` noemt in 5.1, 7.1 en 8 (na bouwstap 2 ook 6.2) het deelcommando en het
    resultaatbestand in plaats van de commandoblokken. De naslagsecties "Naslag: dagelijks werken", "Eigen agentinstructies
    van de app" en "Een eigen beschermd pad" gaan met dezelfde koppen naar `docs/app-naslag.md`; in het playbook blijft per
    kop één verwijsregel, zodat bestaande verwijzingen (`docs/template-changelog.md`, de fouttabel bij de template-update)
    blijven kloppen. "Een template-update binnenhalen" blijft in bouwstap 1 ongewijzigd in het playbook: de parallelle spec
    template-release herschrijft die sectie, en `scripts/check-snapshot.sh` en `docs/template/specs/template-update.md`
    verwijzen ernaar. `pnpm leespad` krijgt een soort `playbook` (pad `docs/nieuwe-app.md`, bytes, streefwaarde 35 KB): een
    meting, nooit rood (ADR 0065 punt 2).

## Kopieer de vorm van

Geen accountbeheerpad uit `docs/gouden-pad.md` past (dit is een setupscript, geen feature). De vorm komt van:

- `scripts/kit/app-init.mjs` — `parseArgs`, eigen foutklasse, eerst plannen dan schrijven, `--dry-run`, `import.meta.main`
- `scripts/doctor.sh` — `ok`/`fail` met herstelregel en de telling aan het eind
- `scripts/github-ruleset.sh` — `requiredChecks` lezen uit `.claude/decisions.json`, `gh api` met payload via stdin
- `test/scripts/github-ruleset.test.ts` — `gh` als stub op `PATH`
- `test/scripts/app-init.test.ts` — fixture-repo in `mkdtempSync`, opruimen in `afterEach`

## Hergebruik en UX

- Bestaande componenten: n.v.t. — geen UI. Hergebruikt: de slugregel uit `scripts/kit/app-init.mjs` (gekopieerd, niet
  geïmporteerd, vanwege OV-3; een test houdt ze gelijk), `requiredChecks` uit `.claude/decisions.json`, en in bouwstap 2
  de payload van `scripts/github-ruleset.sh` als verwachte ruleset (via de test van AC-19, geen tweede lijst in proza).
- Alle zichtbare tekst letterlijk (`<…>` ingevuld):
  - gebruik: `Gebruik: node scripts/kit/nieuwe-app.mjs <preflight|koppel|poorten|repo-instellingen|db-bewijs> [opties] [--dry-run]`
  - slot: `nieuwe-app <deelcommando>: ok (<n> stappen) → .template/nieuwe-app-<deelcommando>.json` of
    `✗ nieuwe-app <deelcommando>: <n> fout(en) → .template/nieuwe-app-<deelcommando>.json`
  - `✗ besturingssysteem niet ondersteund: <naam versie>` / `→ deze setup ondersteunt Ubuntu 24.04 en 26.04 (START-NIEUWE-APP.md)`
  - `✗ tree van HEAD wijkt af van template/main; niet gekoppeld` / `→ stop en leg de eigenaar een herstelkeuze voor (docs/nieuwe-app.md, 5.1)`
  - `✗ werkmap niet schoon` / `→ commit of herstel eerst; koppel draait alleen op een verse kopie`
  - `· al gekoppeld aan template/main (overgeslagen)`
  - `✗ geen vrije poortenset tussen +0 en +90` / `→ stop een oude stack van deze slug of vraag de eigenaar (docs/nieuwe-app.md, Fout → oorzaak)`
  - `✓ .env.local bestaat; poorten overgenomen (pg <pg>, web <web>)`
  - `✗ .env.local bestaat met poorten die niet kloppen: <sleutels>` / `→ niet overschreven; vraag de eigenaar om de poortaanpassing`
  - `✗ .env.local niet leesbaar of zonder <sleutels>` / `→ draai poorten buiten de sandbox, of geef db-bewijs --pg <poort> uit de overdracht van de eigenaar`
  - `· hervatting: controleer SETUP-PROGRESS.md (overgeslagen)`
  - `✗ remote template wijst naar <url>, verwacht <url>` / `→ stop en leg het de eigenaar voor (docs/nieuwe-app.md, 5.1)`
  - `✗ PG-poort onbekend` / `→ eerst poorten, of geef --pg <poort>`
  - bouwstap 2:
    - `✗ --repo <repo> is niet de origin van deze werkmap` / `→ draai vanuit ~/code/<slug>`
    - `✗ main op GitHub heeft nog niet de hernoem-commit boven de koppel-merge` / `→ eerst de push door de eigenaar (docs/nieuwe-app.md, 6.1)`
    - `✗ sha_pinning_required onbekend` / `→ Settings → Actions → General → Require actions to be pinned to a full-length commit SHA`
    - `--controleer` zonder bevindingen: `✓ ruleset main gelijk aan scripts/github-ruleset.sh` en `✓ repo-instellingen gelijk aan docs/nieuwe-app.md 6.2`
    - `RULESETS_NIET_BESCHIKBAAR`: `✗ GitHub geeft geen rulesets op <repo>: een private repo vraagt GitHub Pro of Team` / `→ de eigenaar kiest Pro, een organisatie met Team, of public; daarna draait hij scripts/github-ruleset.sh <repo> (docs/nieuwe-app.md, 6.2)`
    - `GEEN_RULESET`: `✗ geen ruleset main op <repo>` / `→ de eigenaar draait scripts/github-ruleset.sh <repo> (docs/nieuwe-app.md, 6.2)`
    - `RULESET_NIET_ACTIEF`: `✗ ruleset main is niet actief op de standaardbranch: <details>` / `→ de eigenaar draait scripts/github-ruleset.sh <repo> opnieuw (docs/nieuwe-app.md, 6.2)`
    - `BYPASS`: `✗ ruleset main heeft een bypass: <details>` / `→ de eigenaar draait scripts/github-ruleset.sh <repo> opnieuw (docs/nieuwe-app.md, 6.2)`
    - `REGELS`: `✗ regels van ruleset main wijken af: <details>` / `→ de eigenaar draait scripts/github-ruleset.sh <repo> opnieuw (docs/nieuwe-app.md, 6.2)`
    - `CHECKS`: `✗ verplichte checks op main wijken af van requiredChecks: <details>` / `→ de eigenaar draait scripts/github-ruleset.sh <repo> opnieuw (docs/nieuwe-app.md, 6.2)`
    - `RULESET_ONLEESBAAR`: `✗ ruleset main niet te lezen: <details>` / `→ controleer gh auth status en draai opnieuw; blijft het, vraag de eigenaar`
    - `MERGE_METHODEN`: `✗ merge-instellingen wijken af: <details>` / `→ node scripts/kit/nieuwe-app.mjs repo-instellingen --repo <repo>`
    - `WORKFLOW_RECHTEN`: `✗ workflow-rechten wijken af: <details>` / `→ node scripts/kit/nieuwe-app.mjs repo-instellingen --repo <repo>`
    - `ACTIONS`: `✗ Actions-instellingen wijken af: <details>` / `→ node scripts/kit/nieuwe-app.mjs repo-instellingen --repo <repo>`
    - `SHA_PINNING_ONBEKEND`: de regel `✗ sha_pinning_required onbekend` hierboven, met hetzelfde herstel
    - `INSTELLINGEN_ONLEESBAAR`: `✗ repo-instellingen niet te lezen: <details>` / `→ controleer gh auth status en draai opnieuw; blijft het, vraag de eigenaar`
  - doctor: `✗ .env.local: poort in <sleutel> past niet bij <poortsleutel>` / `→ node scripts/kit/nieuwe-app.mjs poorten; .env.local alleen met akkoord van de eigenaar aanpassen`
  - dev: `✗ poort <poort> (<API_PORT|WEB_PORT>) is bezet` / `→ stop de andere pnpm dev, of kies poorten met node scripts/kit/nieuwe-app.mjs poorten`

## Acceptatiecriteria

Bouwstap 1: AC-1 t/m AC-8 en AC-11 t/m AC-18. Bouwstap 2: AC-9, AC-10, AC-19, de `repo-instellingen`-delen van AC-1
en AC-5 en de 6.2-zin van AC-15.

- **nieuwe-app-script/AC-1** — Gegeven een `PATH` met nep-`docker`, `pnpm`, `npm`, `sudo` die een markeerbestand schrijven, wanneer elk deelcommando (ook met `--dry-run`) op een fixture draait, dan bestaat het markeerbestand daarna niet; en de statische imports van `nieuwe-app.mjs` hebben alleen prefix `node:`, zonder dynamische `import()` in bouwstap 1 en na bouwstap 2 met als enige die van `./ruleset-controle.mjs` in het pad van `repo-instellingen --controleer`. Toets: `test/scripts/nieuwe-app.test.ts`
- **nieuwe-app-script/AC-2** — Gegeven elk deelcommando in een fixture-repo (ook vanuit een submap), dan staat na afloop `<git-root>/.template/nieuwe-app-<deelcommando>.json` met `schema` 1, `head` gelijk aan `git rev-parse HEAD` na de run (bij `koppel` de merge-commit), `uitslag` gelijk aan de exitcode (0 ↔ `ok`), per stap `id`, `status`, `melding`, `herstel`; bij een fout is `herstel` niet null; `git check-ignore .template/x` slaagt in de template. Gegeven `preflight` in een map buiten een git-repo (met `HOME` naar een tijdelijke map), dan staat het bestand in `$HOME/setup/.template/` met `head` null en niet in de werkmap. Gegeven een oud resultaatbestand van `poorten` en `poorten --onbekend`, dan is de exitcode 2 en bestaat het bestand niet meer; gegeven een onbekend deelcommando, dan exitcode 2, de gebruiksregel en geen nieuw bestand onder `.template/`.
- **nieuwe-app-script/AC-3** — Gegeven een verse fixture (één ouderloze commit, tree gelijk aan een nep-`template/main`), wanneer `koppel` draait, dan heeft `HEAD` twee ouders, is `git diff HEAD~1 --stat` leeg, is de push-URL van `template` `DISABLED` en is de commit `chore: link to template (<korte sha>)`; een tweede run eindigt met 0 en `· al gekoppeld aan template/main (overgeslagen)`, ook na een extra hernoem-commit boven de merge. Gegeven een fixture met al een remote `template` met de juiste URL en push-URL `DISABLED` maar zonder merge, dan koppelt `koppel` met exitcode 0; met een andere URL exitcode 1 en `HEAD` ongewijzigd.
- **nieuwe-app-script/AC-4** — Gegeven een fixture waarvan de tree afwijkt van `template/main`, of met een vuile werkmap, of met twee eigen commits, wanneer `koppel` draait, dan is de exitcode 1, staat de bijbehorende `✗`-tekst in de uitvoer en is `git rev-parse HEAD` ongewijzigd.
- **nieuwe-app-script/AC-5** — Gegeven `--dry-run` bij `koppel`, `poorten --env` en (bouwstap 2) `repo-instellingen`, dan zijn `HEAD`, de remotes (`git remote -v`), de refs onder `refs/remotes/`, `.env.local` en de `gh`-aanroepen met `-X PUT`, `POST` of `repo edit` (stub-log) gelijk aan vóór de run; alleen `FETCH_HEAD` mag wijzigen. Toets: `test/scripts/nieuwe-app-koppel.test.ts`, `test/scripts/nieuwe-app-poorten.test.ts`, `test/scripts/nieuwe-app-repo-instellingen.test.ts` (nieuw)
- **nieuwe-app-script/AC-6** — Gegeven een bezette poort 54324 (eigen listener in de test, of een geïnjecteerde vrij-functie), wanneer `poorten` zonder `.env.local` kiest, dan zijn alle vijf poorten `basis + 10` en is `origin` `http://localhost:5183`; zijn alle tien sets bezet, dan exitcode 1 met `✗ geen vrije poortenset tussen +0 en +90`. Gegeven een machine met IPv6 en een listener alleen op `[::1]:5173`, dan kiest `poorten` niet +0.
- **nieuwe-app-script/AC-7** — Gegeven `.env.example` van de template en gekozen poorten +10, wanneer `poorten --env` zonder `.env.local` draait, dan verschilt `.env.local` van `.env.example` alleen in de regels van de sleutels uit werking stap 6, en behouden de URL's protocol, host, gebruiker, wachtwoord en pad.
- **nieuwe-app-script/AC-8** — Gegeven een bestaande `.env.local` met poorten +10 en bezette standaardpoorten (de eigen stack draait), wanneer `poorten --env` of `poorten` draait, dan is `gegevens.pg` 54332 (en `.template/nieuwe-app-poorten.json` zegt dat ook), is de exitcode 0 en is `.env.local` byte-gelijk. Gegeven een `.env.local` waarin de poort in `DATABASE_URL` niet gelijk is aan `PG_PORT`, dan exitcode 1 met `✗ .env.local bestaat met poorten die niet kloppen: DATABASE_URL`, is het bestand byte-gelijk en bevat de uitvoer geen waarde uit het bestand behalve sleutelnamen en poortnummers.
- **nieuwe-app-script/AC-9** — (bouwstap 2) Gegeven een `gh`-stub, wanneer `repo-instellingen --repo a/b` draait met een andere `origin`, of met `main` zonder de vorm hernoem-commit boven koppel-merge, dan exitcode 1 met de bijbehorende tekst en geen schrijvende `gh`-aanroep (`-X`, `--method`, `--input`, `-f`, `-F`, `repo edit`) in het stub-log; met `--controleer` en dezelfde `main` niet de vormfout. Gegeven een juiste `origin` en `main`-vorm, zonder `--dry-run` en met `--beschrijving x`, dan staat in het stub-log precies één `repo edit a/b` met `--enable-merge-commit`, `--enable-squash-merge`, `--enable-rebase-merge=false`, `--delete-branch-on-merge`, `--enable-auto-merge=false` en `--description x`, en de twee `-X PUT`-aanroepen op `actions/permissions/workflow` en `actions/permissions` met de velden uit werking 7. Toets: `test/scripts/nieuwe-app-repo-instellingen.test.ts`
- **nieuwe-app-script/AC-10** — (bouwstap 2) Gegeven een `gh`-stub op `PATH` die per bevindingcode uit werking 7 één afwijking geeft (een rulesetlijst die faalt met "Upgrade to GitHub Pro", geen ruleset `main`, `enforcement` `disabled`, een niet-lege `bypass_actors`, `current_user_can_bypass` `always`, `require_code_owner_review` waar, een checklijst met een naam meer of minder dan `requiredChecks`, een onleesbare rules-API, `allow_rebase_merge` waar, `default_workflow_permissions` `write`, `allowed_actions` `selected`, geen `sha_pinning_required`, een falende `actions/permissions`), wanneer `repo-instellingen --repo a/b --controleer` draait, dan exitcode 1, de `✗`- en `→`-regel van die code uit Hergebruik en UX, een stap `fout` met die code als `id` (kleine letters, `-`) in `.template/nieuwe-app-repo-instellingen.json`, geen tekst met "de eigenaar merget" of `--bypass-beheerder`, en geen schrijvende `gh`-aanroep in het stub-log; met een ruleset gelijk aan de payload van `scripts/github-ruleset.sh` (met `current_user_can_bypass` `never`) en instellingen gelijk aan playbook 6.2 exitcode 0 met de stappen `ruleset` en `instellingen` ok, ook als `main` meer commits heeft dan hernoem-commit en koppel-merge. En `git diff origin/main -- scripts/kit/pr-merge.mjs` is leeg in de PR van bouwstap 2 (bewijs in de PR). Toets: `test/scripts/nieuwe-app-repo-instellingen.test.ts`
- **nieuwe-app-script/AC-11** — Gegeven een `psql`-stub die per bewering de verwachte uitvoer uit playbook 8 geeft, wanneer `db-bewijs --pg 54332` draait, dan zijn de zes stappen ok en gebruikt elke aanroep poort 54332; geeft de stub bij `geen-superuser` `t`, dan is die stap fout en de exitcode 1. Zonder `--pg` en zonder poortenbestand: `✗ PG-poort onbekend`, en `.env.local` is niet geopend (bestand met modus 000 in de fixture).
- **nieuwe-app-script/AC-12** — Gegeven fixtures voor `/etc/os-release`, `/proc/1/comm`, de inotify-grens, werkmap, `PATH` en `gh` (via omgevingsvariabelen alleen voor tests, zoals `DOCTOR_OS_RELEASE`), wanneer `preflight` draait, dan is `os` fout bij Ubuntu 22.04 en bij macOS (`✗ besturingssysteem niet ondersteund: …`), `pad` fout onder `/mnt/c`, `systemd` fout in WSL zonder `systemd` als PID 1, `tools` fout zonder `psql` op `PATH` (met `psql` in de melding), `inotify` fout bij 8192, `gh-login` fout zonder scope `workflow`, `template` fout bij `is_template` onwaar, `plan` fout bij `null` met `--zichtbaarheid private`, en `poorten` overgeslagen (exitcode blijft 0) bij een bezette 5173; `slug` is fout als `~/code/<slug>` bestaat met een andere `origin` en overgeslagen met `· hervatting: controleer SETUP-PROGRESS.md (overgeslagen)` als die `origin` `<login>/<slug>` is; met een geldige fixture exitcode 0.
- **nieuwe-app-script/AC-13** — Gegeven `scripts/doctor.sh` met een `.env.local` waarin de poort in `DATABASE_URL` niet gelijk is aan `PG_PORT`, dan eindigt de doctor met exit 1 en `✗ .env.local: poort in DATABASE_URL past niet bij PG_PORT`, en staat in `.template/doctor-full.json` (of `-machine`) `uitslag` `fout`; `--quick` schrijft geen bestand en laat een bestaand bestand staan. Gegeven een oud `.template/doctor-full.json` met `uitslag` `ok` en een doctor die vóór de telling afbreekt (in de test een stub op `PATH` die een commando buiten een `ok`/`fail`-controle laat falen), dan is de exitcode ≠ 0 en zegt het bestand daarna `fout` met een nieuwe `tijd`.
- **nieuwe-app-script/AC-14** — Gegeven een bezette `WEB_PORT` (ook een listener alleen op `[::1]` als de machine IPv6 heeft), wanneer `scripts/dev.mjs` start, dan stopt hij met exit 1 en `✗ poort <poort> (WEB_PORT) is bezet` vóór een `docker compose`-aanroep (nep-`docker` op `PATH` logt alleen `info`). Gegeven `WEB_PORT=5183` in `.env.local` en een bezette 5173, dan stopt hij niet op de poortcontrole.
- **nieuwe-app-script/AC-15** — Gegeven `docs/nieuwe-app.md` na bouwstap 1, dan noemen 5.1, 7.1 en 8 (en 6.2 na bouwstap 2) het deelcommando en het resultaatbestand in plaats van de commandoblokken; staan de versheidsregel uit werking 3, de Node-regel uit werking 1 (ook in de uitzondering van "Jij installeert geen toolchain"), de Windows-aanroep met `wsl.exe -d <distro> -- bash -lc "cd ~/… && …nieuwe-app.mjs…"`, begeleiding, overdrachten en de fouttabel erin; noemt de harde regel over `.env.local` `node scripts/kit/nieuwe-app.mjs poorten --env` en niet meer `cp` of "`.env.example` noemt ze niet"; staat "Een template-update binnenhalen" er nog als kop; en staan de drie koppen uit werking 10 in `docs/app-naslag.md` met per kop een verwijsregel in het playbook. Na bouwstap 2 noemt 6.2 `repo-instellingen --controleer` als controle van ruleset en instellingen, en staat de zin "Of de ruleset blijft staan, controleert niets" er niet meer. `pnpm leespad` toont de soort `playbook` met streefwaarde 35 KB; de gemeten omvang staat als bewijs in de PR en geen test eist die grens (ADR 0065 punt 2). Toets: `test/docs/nieuwe-app-script-docs.test.ts`, `test/rails/leesbudget-playbook.test.ts`
- **nieuwe-app-script/AC-16** — Gegeven `.env.example`, dan staan `API_PORT=8787` en `WEB_PORT=5173` erin (OV-6), noemt de kopregel `node scripts/kit/nieuwe-app.mjs poorten --env` als bron van `.env.local` en van een andere poortset (niet meer "pnpm dev schrijft .env.local"), en houdt `test/scripts/app-start-docs.test.ts` de vijf poorten en de sleutels van werking stap 6 gelijk met het script.
- **nieuwe-app-script/AC-17** — Gegeven een oud `.template/doctor-machine.json` met `uitslag` `ok` en een nep-`mise` op `PATH` die bij `install` met 1 eindigt, wanneer `scripts/bootstrap.sh` draait, dan is de exitcode ≠ 0, bestaat `.template/doctor-machine.json` daarna niet en zegt `.template/bootstrap.json` `uitslag` `fout`, `mise-trust` `ok`, `mise-install` `fout` met herstel niet null, en `pnpm-install`, `lefthook`, `doctor-machine` `overgeslagen`.
- **nieuwe-app-script/AC-18** — Gegeven een `.env.local` die leeg is, die `SMTP_PORT` mist, of die niet leesbaar is (modus 000), wanneer `poorten` of `poorten --env` draait, dan exitcode 1 met `✗ .env.local niet leesbaar of zonder …`, heeft het resultaatbestand geen `gegevens.pg`, is `.env.local` byte-gelijk (of onaangeroerd), en zegt een daarna gedraaid `db-bewijs` zonder `--pg` `✗ PG-poort onbekend`.
- **nieuwe-app-script/AC-19** — (bouwstap 2) Gegeven de payload die `scripts/github-ruleset.sh` met een `gh`-stub schrijft (zoals `test/scripts/github-ruleset.test.ts`), aangevuld met `id` en `current_user_can_bypass` `never` als antwoord van de stub op `repos/<repo>/rulesets/<id>`, wanneer `controleerRuleset` draait met `requiredChecks` uit `.claude/decisions.json`, dan is de lijst leeg; en voor elke rulesetcode uit werking 7 geeft één afwijking precies die code, één keer, met de `details` uit werking 7 (leeg bij `RULESETS_NIET_BESCHIKBAAR` en `GEEN_RULESET`, het endpoint of de veldnaam bij `RULESET_ONLEESBAAR`, anders de afwijkende naam), en volgt een ontbrekend veld de voorrangsregel. Een extra ruleset met naam `main` en `source_type` `Organization` en een extra veld `required_reviewers` of `do_not_enforce_on_create` veranderen de uitkomst niet. Gegeven instellingen gelijk aan playbook 6.2, dan geeft `controleerInstellingen` een lege lijst, per instellingscode één afwijking precies die code, en een ontbrekend `sha_pinning_required` alleen `SHA_PINNING_ONBEKEND`. Geen `details` bevat een waarde uit een antwoord. Elke `gh`-aanroep van beide functies begint met `api` en bevat geen `-X`, `--method`, `--input`, `-f`, `-F` of `--field`; een `gh` die faalt of geen JSON geeft, levert de `…_ONLEESBAAR`-code zonder exceptie; de module heeft alleen statische imports met prefix `node:`. Toets: `test/scripts/ruleset-controle.test.ts`

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Hervatting na 7.3 terwijl de eigen stack draait | `.env.local` bestaat: `poorten` neemt de poorten daaruit over en kiest niets (werking 6, AC-8) | n.v.t. |
| `.env.local` gemaskeerd, leeg of onleesbaar (sandbox van een app-sessie) | fout, geen terugval op standaardpoorten; `db-bewijs` alleen met `--pg` (werking 6, AC-18) | n.v.t. |
| `scripts/bootstrap.sh` of doctor breekt halverwege af | het oude resultaatbestand is bij de start verwijderd; `.template/bootstrap.json` noemt de falende stap (AC-13, AC-17) | n.v.t. |
| Resultaatbestand van een eerdere run of commit | telt niet: `head` of `tijd` past niet (versheid, werking 3) | n.v.t. |
| Verkeerd gebruik (exitcode 2) | geen resultaatbestand; het eigen oude bestand is weg (werking 3, AC-2) | n.v.t. |
| Agent in de Windows-modus (PowerShell of Git Bash) | aanroep en lezen via `wsl.exe … bash -lc "cd ~/… && …"` (werking 1, AC-15) | n.v.t. |
| Oude stack van dezelfde slug bezet de poorten (nog geen `.env.local`) | `poorten` verschuift; de restantencontrole (docker) blijft in het playbook bij de eigenaar of de setup-agent zoals nu | n.v.t. |
| Een andere app heeft dezelfde poorten maar draait niet | niet te zien; `pnpm dev` en doctor melden het pas bij de start (AC-14) | n.v.t. |
| GitHub maakt de repo nog aan (lege clone) | buiten het script; playbook 4.3 blijft (OV-1) | n.v.t. |
| `gh` zonder netwerk | stap fout met de `gh`-melding als herstelcontext; niets geschreven. Bij `--controleer`: `RULESET_ONLEESBAAR` en `INSTELLINGEN_ONLEESBAAR` met het endpoint, zonder `gh`-melding (werking 7) | n.v.t. |
| Ruleset gezet met `scripts/github-ruleset.sh --zonder-codeql` | fout `CHECKS` (de codeql-checks ontbreken); verwacht tot de appconfiguratie besloten is | n.v.t. |
| Alleen een org-ruleset op `main` (geen ruleset van de repo) | `GEEN_RULESET`: `--controleer` telt alleen `source_type` `Repository` (werking 7) | n.v.t. |
| `--controleer` op een ruleset met een bypass (oude `--bypass-beheerder` of met de hand gezet) | altijd fout `BYPASS`; herstel: de eigenaar draait `scripts/github-ruleset.sh <repo>` opnieuw (ADR 0093 punt 2) | n.v.t. |
| `--controleer` op een private repo zonder Pro/Team, of zonder ruleset `main` | fout `RULESETS_NIET_BESCHIKBAAR` of `GEEN_RULESET`, exitcode 1; de eigenaar kiest Pro, Team of public (OV-9) | n.v.t. |
| Ruleset of instellingen niet te lezen (rechten, netwerk, ander antwoord) | fout `…_ONLEESBAAR`, nooit ok (werking 7) | n.v.t. |
| Testsessie (playbook 9.2) nog open | buiten het script: alleen waarneembaar door de eigenaar | n.v.t. |

## Raakt ook

- **Bouwstap 1, nieuw:** `scripts/kit/nieuwe-app.mjs`, `docs/app-naslag.md`, `test/scripts/nieuwe-app.test.ts`,
  `test/scripts/bootstrap.test.ts`, `test/scripts/dev.test.ts`.
- **Bouwstap 1, gewijzigd:** `scripts/doctor.sh` (+ `test/scripts/doctor.test.ts`), `scripts/bootstrap.sh`, `scripts/dev.mjs`,
  `.env.example` (OV-6, ook de kopregel), `.gitignore`, `docs/nieuwe-app.md` (werking 10; ook de harde regels "Jij installeert
  geen toolchain" en "`.env.local` alleen maken met `cp` uit `.env.example`"), `START-NIEUWE-APP.md` (stap 6 haalt het
  script op, OV-3), `scripts/kit/leespad.mjs` (soort `playbook`) met `test/rails/leesbudget.test.ts`,
  `docs/template-changelog.md` (`[Unreleased]`: verhuisde naslag, `API_PORT`/`WEB_PORT` in `.env.example`),
  en de bestaande tests `test/docs/start-nieuwe-app.test.ts`, `test/scripts/app-start-docs.test.ts` en
  `test/scripts/github-ruleset.test.ts` als de checklijst in het playbook verhuist (wijziging met reden in de PR, R-TEST-02).
- **Niet in bouwstap 1:** de sectie "Een template-update binnenhalen" en de verwijzingen ernaar (`scripts/check-snapshot.sh`,
  `docs/template/specs/template-update.md`, `docs/template-changelog.md`) blijven ongewijzigd (werking 10);
  `scripts/kit/pr-merge.mjs` (`besluit-pr`).
- **Bouwstap 2** (`repo-instellingen`, kritiek werk): `scripts/kit/nieuwe-app.mjs`, `scripts/kit/ruleset-controle.mjs`
  (nieuw), `test/scripts/nieuwe-app.test.ts` (AC-1, gewijzigd met reden), `test/scripts/nieuwe-app-repo-instellingen.test.ts`
  (nieuw), `test/scripts/ruleset-controle.test.ts` (nieuw), `test/scripts/helpers/gh-stub.ts` (nieuw) met
  `test/scripts/github-ruleset.test.ts` (gewijzigd met reden: gedeelde helper), `docs/nieuwe-app.md` 6.2 (ook de zin "Of de ruleset blijft
  staan, controleert niets …") met `test/docs/nieuwe-app-script-docs.test.ts`, en een fragment in
  `docs/template-changelog.d/` (soort `toegevoegd`). Niet: `scripts/kit/pr-merge.mjs`, `scripts/github-ruleset.sh`.
  `scripts/check-github.mjs` (nieuw) uit roadmap ST-01 bestaat nog niet; wordt het gebouwd, dan importeert het
  `scripts/kit/ruleset-controle.mjs` (nieuw) met eigen teksten en deelt het de controle met `--controleer`, dat blijft.
  Het kan later de verwachting (bijvoorbeeld org-rulesets) als parameter meegeven; in deze bouwstap niet.
- R-WERK-25 blijft ongewijzigd (OV-2, OV-3): de uitzondering voor Node met vastgezette versie bestaat al voor het
  hernoemscript en krijgt een tweede script.
- Beschermde paden: `scripts/**` en `.env.example` (`voorReview`, eigenaarakkoord), `docs/nieuwe-app.md` en `test/**` (`gate`).
- Niet geraakt: `check:migrations`, `check:secdef`, `test:db`/policies, `test/security/resources.ts`, permissietests — geen
  migratie, functie, tabel, route of permissie.

## Buiten scope

- Docker in het script, de restantencontrole en het opruimen ervan (blijft bij eigenaar en playbook).
- Toolchain, de stappen van `scripts/bootstrap.sh` zelf (alleen zijn resultaatbestand is in scope), de eerste push, `scripts/github-ruleset.sh` zetten, de GitHub App.
- Controle dat de testsessie van 9.2 is afgesloten (#561 punt 3), browser-, login- en MFA-controle.
- Het herschrijven van "Een template-update binnenhalen" (parallelle spec template-release).
- macOS (OV-7), een `pnpm`-script in `package.json` (in de setup bestaat pnpm nog niet).

## Testplan

- `test/scripts/nieuwe-app.test.ts` (unit, fixture-repo's in `mkdtempSync`, stubs voor `gh`, `psql`, `docker`, `pnpm`,
  `npm`, `sudo` op `PATH`) en de deelbestanden per deelcommando: AC-1 t/m AC-8, AC-11, AC-12 en AC-18; de poortkeuze als
  geëxporteerde functie met een geïnjecteerde vrij-functie, plus één test met een echte listener.
- Bouwstap 2: `test/scripts/nieuwe-app-repo-instellingen.test.ts` (nieuw) (fixture-repo met `origin`, `gh`-stub op `PATH` die
  per endpoint een JSON-fixture geeft en elke aanroep logt): AC-5 (deel `repo-instellingen`), AC-9, AC-10.
  `test/scripts/ruleset-controle.test.ts` (nieuw) (unit, geïnjecteerde `gh`): AC-19; de verwachte ruleset is de payload die
  `scripts/github-ruleset.sh` in de test schrijft, geen kopie, zodat een wijziging van dat script zonder gelijke
  wijziging van de module rood wordt. De `gh`-stub en het vastleggen van die payload (nu niet geëxporteerd in
  `test/scripts/github-ruleset.test.ts:50-79`) verhuizen naar één gedeelde helper `test/scripts/helpers/gh-stub.ts`
  (nieuw), die `github-ruleset.test.ts`, `ruleset-controle.test.ts` en `nieuwe-app-repo-instellingen.test.ts` importeren;
  geen tweede kopie (wijziging van `github-ruleset.test.ts` met reden in de PR, R-TEST-02). Vóór de tests zet de developer `scripts/kit/ruleset-controle.mjs` (nieuw) neer als
  stub met de definitieve exports en een lege lijst als uitkomst, zodat een test op een assertie faalt.
- `test/scripts/doctor.test.ts`: AC-13. `test/scripts/dev.test.ts` met nep-`docker`: AC-14.
  `test/scripts/bootstrap.test.ts` met nep-`mise`, `pnpm` en doctor op `PATH` in een fixture-kopie: AC-17.
- De IPv6-gevallen van AC-6 en AC-14 met een geïnjecteerde bind-functie die `[::1]:5173` als bezet meldt, zodat ze ook op
  een machine zonder IPv6 kunnen falen; `dev.mjs` importeert de vrij-functie uit `nieuwe-app.mjs`, zodat er één vrij-regel is.
- AC-15 en AC-16: een docs-test die playbook, `docs/app-naslag.md`, `.env.example` en het script leest, zonder omvangsgrens;
  `test/rails/leesbudget.test.ts` toetst dat de soort `playbook` bestaat. De omvang zelf: uitvoer van `pnpm leespad` in de PR.
- Negatief bewijs in de PR: AC-4, AC-18 en (bouwstap 2) AC-9 met de rode uitvoer.

## Open vragen

Alle besloten door de eigenaar (vraagprompt): OV-1 t/m OV-7 op 2026-11-18, zoals aanbevolen; OV-8 en OV-9 op 2026-11-26.

- **OV-1** ✅ besloten 2026-11-18 — Bouwstap 1: `preflight`, `koppel`, `poorten`, `db-bewijs` en de resultaatbestanden van
  doctor en bootstrap; `repo-instellingen` (AC-9, AC-10, 6.2 in AC-15) in bouwstap 2, kritiek werk. De spec blijft
  `goedgekeurd` na de PR van bouwstap 1 en krijgt `gebouwd` pas na bouwstap 2. `kloon` (4.3) pas als een ronde laat zien
  dat 4.3 vaak faalt.
- **OV-2** ✅ besloten 2026-11-18 — De agent draait alleen de deelcommando's; bootstrap, stack, push en ruleset blijven bij de
  eigenaar. Geen ADR, geen wijziging van R-WERK-25.
- **OV-3** ✅ besloten 2026-11-18 — `START-NIEUWE-APP.md` stap 6 haalt het script op naar `~/setup`; vóór de clone draait de
  agent het met `mise exec node@<versie uit mise.toml van template/main> --`; de uitzondering in "Jij installeert geen
  toolchain" noemt het naast het hernoemscript (alleen Node, alleen de vastgezette versie); na 4.3 alleen het exemplaar in
  de repo. Een ruimere uitzondering vraagt eerst een ADR.
- **OV-4** ✅ besloten 2026-11-18 — `.template/` aan de git-root, in `.gitignore`; buiten een repo `~/setup/.template/`
  (werking 3).
- **OV-5** ✅ besloten 2026-11-18 — Omvangsdoel ≤ 35 KB voor het playbook, als meting in `pnpm leespad` (soort `playbook`),
  geen rode check; de naslag naar een eigen document (werking 10; "Een template-update binnenhalen" blijft in bouwstap 1).
- **OV-6** ✅ besloten 2026-11-18 — `API_PORT=8787` en `WEB_PORT=5173` in `.env.example`, met een aangepaste kopregel.
- **OV-7** ✅ besloten 2026-11-18 — macOS buiten scope; `preflight` meldt het als niet ondersteund.
- **OV-8** ✅ besloten 2026-11-26 — `--controleer` gebruikt een nieuwe, herbruikbare alleen-lezende module
  `scripts/kit/ruleset-controle.mjs` (nieuw), het begin van `scripts/check-github.mjs` (nieuw) uit ST-01; `repo-instellingen` laadt die met
  een dynamische `import()` alleen in dat pad (OV-3). De module geeft codes, de scripts maken de teksten (werking 7).
- **OV-9** ✅ besloten 2026-11-26 — Geen ruleset `main` (bijvoorbeeld een private repo zonder Pro/Team) is een fout,
  exitcode 1; herstel: de eigenaar kiest Pro, een organisatie met Team, of public (playbook 6.2).
