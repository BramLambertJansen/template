---
status: goedgekeurd # voorstel | goedgekeurd | gebouwd | vervallen — de merge door de eigenaar is het besluit (ADR 0046)
namespace: document-status-lokaal
model: sonnet
---

# Document-status lokaal bij git push

## Doel

`git push` draait dezelfde `scripts/kit/check-document-status.mjs` als de verplichte CI-check `document-status`, zodat een
spec die niet in een commit vóór de eerste code of test staat (ADR 0062 punt 3) al vóór de push blijkt, zolang de commits
nog lokaal te herschikken zijn. Aanleiding: leerpunt #520 (PR's #506 en #517 gingen op 4 november 2026 rood op die volgorde;
#506 moest als #507 opnieuw).

## Rollen en wie wat ziet

n.v.t. — een pre-push-job in `lefthook.yml` voor elke sessie en de eigenaar; geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `scripts/kit/main-achterstand.mjs` — pre-push-script met een geïnjecteerde `git`-functie, harde timeout en geen prompt
- `test/scripts/main-achterstand.test.ts` — tabeltests op de pure functies plus een echte tijdelijke git-repo

## Hergebruik en UX

n.v.t. — geen UI. Elke melding begint met `pre-push: document-status` en zegt of het een blokkade of een waarschuwing is.

## Acceptatiecriteria

- **document-status-lokaal/AC-1** — `lefthook.yml` heeft in `pre-push` een job `document-status` die
  `scripts/kit/document-status-lokaal.mjs` draait. Ontbreekt dat script in de werkmap (een oude checkout), dan slaagt de job
  zonder iets te draaien.
- **document-status-lokaal/AC-2** — Het script draait `scripts/kit/check-document-status.mjs` uit de werkmap als kindproces met
  `BASE_SHA` = `origin/main`, `HEAD_SHA` = `HEAD` (beide volledige SHA's), `HEAD_REF` = de huidige branch, `REPO` = de
  `owner/naam` uit `remote.origin.url` en `PR_NUMBER` volgens AC-3. Het verandert niets aan de check zelf; CI blijft de grens.
- **document-status-lokaal/AC-3** — `PR_NUMBER` is het nummer van de open PR voor deze branch volgens
  `gh api repos/<REPO>/pulls?head=<owner>:<branch>&state=open` (REST, `GH_PROMPT_DISABLED=1`, timeout 10 s). Precies één
  PR: dat nummer. Geen `gh`, geen netwerk, geen of meer dan één PR, of een uitslag die geen geheel getal ≥ 1 is: onbekend.
- **document-status-lokaal/AC-4** — Met een bekend PR-nummer blokkeert elke afkeuring van de check de push (exitcode 1), met
  de melding van de check. Met een onbekend PR-nummer blokkeert alleen een afkeuring op de volgorde (de melding bevat
  `(volgorde, ADR 0062 punt 3)`); elke andere afkeuring is een waarschuwing met exitcode 0, omdat checks op het PR-nummer
  (`gebouwd # #<PR>`, herzieningsregel) vóór de PR nog niet kunnen slagen.
- **document-status-lokaal/AC-5** — Bij een volgordeblokkade noemt de melding de herstelroute: nog niet gepusht, dan de
  commits opnieuw maken met de spec eerst (`git reset --soft $(git merge-base origin/main HEAD)`, de spec apart committen,
  dan de rest); al gepusht, dan een nieuwe branch vanaf `origin/main` (geen rebase of force-push, R-WERK-12).
- **document-status-lokaal/AC-6** — Ontbrekende invoer valt open met een melding en exitcode 0, zonder de check te draaien:
  geen `origin/main`, geen huidige branch (detached HEAD), geen herkenbare `owner/naam` in `remote.origin.url`, of HEAD
  gelijk aan `origin/main` of erin opgenomen (niets te pushen). Elke tak heeft een eigen test (leerpunt #504).
- **document-status-lokaal/AC-7** — Een kindproces dat niet start of eindigt zonder exitcode (signaal, timeout van 60 s) is
  een waarschuwing met exitcode 0: de lokale spiegel valt open, CI blijft dicht.
- **document-status-lokaal/AC-8** — Stap 8 van `.claude/skills/spec/SKILL.md` en de pre-push-alinea in
  `docs/operations/agent-doorloop.md` noemen dat `git push` de volgorde al toetst.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Spec en code in één commit, nog geen PR (zoals de eerste push van #517) | blokkade met herstelroute (AC-4, AC-5) | n.v.t. |
| Bestaande spec krijgt nieuwe inhoud in de laatste commit na de code, met PR (zoals #506) | blokkade (AC-4) | n.v.t. |
| Spec in een eerdere commit, daarna code | groen | n.v.t. |
| `gebouwd # #N` in de spec, nog geen PR | waarschuwing, geen blokkade (AC-4) | n.v.t. |
| Alleen `docs/` gewijzigd (besluit-PR) | groen; de volgorde geldt alleen met code | n.v.t. |
| Geen netwerk of `gh` niet ingelogd | PR onbekend (AC-3), alleen de volgorde blokkeert | n.v.t. |
| Verouderde `origin/main` | de check vergelijkt met die basis; `main-achterstand` waarschuwt al apart | n.v.t. |

## Raakt ook

`lefthook.yml` (job), `.claude/skills/spec/SKILL.md` stap 8, `docs/operations/agent-doorloop.md` (pre-push-alinea),
`CHANGELOG.md`. `scripts/kit/check-document-status.mjs` blijft ongewijzigd (kritiek pad, ADR 0062 punt 2).

## Buiten scope

De volgorde al bij `git commit` toetsen: een commit kent zijn opvolgers niet, en een spec mag later in een commit met code
nog wijzigen. De check in CI losser of strenger maken. Een fetch van `origin/main` in deze job (`main-achterstand` haalt hem al
op).

## Testplan

Tabeltests in `test/scripts/document-status-lokaal.test.ts` voor de pure beslisfuncties (AC-3, AC-4, AC-5, AC-6, AC-7, elke tak
met ontbrekende invoer apart), een test met een echte tijdelijke git-repo met `origin/main` die een gemengde spec-en-codecommit
blokkeert en een spec-eerst-volgorde doorlaat (AC-2), en een configtest op `lefthook.yml` (AC-1) en de docs (AC-8). Elke
negatieve test faalt op de huidige code (R-PRINC-04).

## Open vragen

- **OV-1 ✅ besloten** — Blokkeren in plaats van waarschuwen: de check is een spiegel van een verplichte CI-check, dus een
  blokkade is geen nieuwe eis, en een waarschuwing in de push-uitvoer bleek vandaag niet genoeg (de regel stond al in de
  skill). Zonder PR-nummer blokkeert alleen de volgorde, zodat er geen valse blokkade is die alleen `--no-verify` zou omzeilen
  (verboden).
