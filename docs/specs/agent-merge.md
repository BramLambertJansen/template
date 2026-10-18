---
status: voorstel # voorstel | goedgekeurd | gebouwd | vervallen — alleen de eigenaar zet goedgekeurd; gebouwd: # #<PR>; gevalideerd: <sha> (pnpm docs:status)
namespace: agent-merge
---

# Agent-merge in de feature-lane (ADR 0029 stap 7)

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan staat het onder "Niet beslist".

## Doel

De hoofdsessie merget een feature-lane-PR zelf met exact `gh pr merge <nr> --squash`, alleen als de voorwaarden uit
[ADR 0029](../adr/0029-snellere-beslisroute.md) punt 14–16 aantoonbaar gelden, onder het account van de eigenaar.

### Uitgangspunt (opdracht van 2026-10-18; de eigenaar bevestigt het met de status `goedgekeurd`)

- Route 2: agent-merge nu bouwen, onder het account van de eigenaar. Geen GitHub App; ST-01 blijft open.
- De zwakte uit ADR 0029 punt 17 is geaccepteerd: de merge is geen identiteitsbewijs, het reviewerakkoord is een sessie-artefact,
  en de diff-guard staat voor de eigenaar als auteur op `overgang` (groen met waarschuwing, `scripts/kit/diff-guard.mjs:166`).
- De voorwaarden uit ADR 0029 punt 10 en 16 zijn vervuld op `origin/main` `ed8ae16`: AC→test-check en risico-overzicht (#167, #170,
  `docs/roadmap.md:451`), ADR 0029 `geaccepteerd`.

### Huidige stand (origin/main `ed8ae16`)

| Onderdeel | Stand | Bron |
|---|---|---|
| `scripts/check-github.mjs` | bestaat niet; framework §10 beschrijft hem al | `docs/framework.md:415-418`, `docs/nieuwe-app.md:366` |
| `.github/settings/main-protection.json` | bestaat niet; alleen `.github/settings/.gitkeep` | — |
| Ruleset als script | `scripts/github-ruleset.sh` met payload; test op checknamen | `test/scripts/github-ruleset.test.ts` |
| Sleutel `merge` in `.claude/gates.json` | bestaat niet; `loadConfig` kent hem niet | `rails/hooks/lib/rolhek.mjs:34` |
| Mergen | deny voor elke rol in `ghForbidden` en `Bash(gh pr merge*)` | `rails/hooks/lib/rolhek.mjs:659`, `.claude/settings.json:45-46` |
| Lane-herkenning | `laneVan` in `scripts/kit/lane.mjs`; alleen gebruikt door `check-document-status` | `scripts/kit/check-document-status.mjs:241` |
| Verplichte checks voor `pr:verify` | `requiredChecks` in `.claude/decisions.json`, met `document-status`, zonder `diff-guard` | `.claude/decisions.json` |
| Skill `opleveren` | "de hoofdsessie merget nooit" | `.claude/skills/opleveren/SKILL.md:27` |

Twee correcties op de opdracht, uit de feiten:

1. Het rolhek staat sinds ADR 0033 in `rails/hooks/lib/rolhek.mjs`; `.claude/hooks/rolhek.mjs` is een stub die de versie van `main`
   laadt. `.claude/hooks/lib/rolhek.mjs` bestaat niet. Deze spec gebruikt `rails/hooks/lib/rolhek.mjs`.
2. `.claude/gates.json`, `.claude/decisions.json` en `.github/**` (dus ook `.github/settings/main-protection.json`) staan in
   `altijdVragen`: de developer-subagent krijgt daar deny, de hoofdsessie een prompt (ADR 0033 punt 3). Die drie bestanden in PR A
   schrijft dus de hoofdsessie met eigenaarakkoord per bewerking, niet de developer. `scripts/**`, `rails/**`, `test/**` en `docs/**`
   zijn in de onderhoudsmodus een melding.

### Levering

| PR | Inhoud | Wie past toe | Label |
|---|---|---|---|
| **A** — bouwstenen, nog geen merge-recht | A1 `scripts/check-github.mjs`; A2 `.github/settings/main-protection.json`; A3 sleutel `merge: "eigenaar"` in `.claude/gates.json` met `check-docs`-regel; A4 lane-uitslag in `scripts/kit/diff-guard.mjs`; A5 `diff-guard` in `requiredChecks`; A6 `pnpm pr:verify <nr> --lane`; tests; docs | developer (A1, A4, A6, tests via tester, docs); hoofdsessie met prompt (A2, A3, A5) | `gate-wijziging` |
| **B** — het merge-recht | B1 rolhek; B2 `.claude/settings.json`; B3 skill `opleveren`; B4 `.github/workflows/guard.yml`; B5 framework §8/§10; B6 `AGENTS.md`; B7 `CLAUDE.md`; B8 verwijsregel ADR 0030 | de eigenaar, volgens de exacte teksten en tabeltests hieronder | `gate-wijziging` |
| **C** — aanzetten | `merge: "feature-lane"` in `.claude/gates.json`; de uitvoer van `node scripts/check-github.mjs <owner>/<repo>` in de PR-beschrijving | de eigenaar, na de merge van A en B | `gate-wijziging` |

PR A verandert niets aan wat de agent mag: de sleutel staat op `"eigenaar"` en het rolhek leest hem nog niet. PR B werkt pas na de merge
(de stub laadt het rolhek van `main`), en zolang C niet gemerged is blijft mergen deny.

## Rollen en wie wat ziet

| Rol | Na A + B + C |
|---|---|
| Eigenaar | Zet de modus (C), krijgt achteraf een PR-commentaar en de eindmelding, merget elke framework-lane-PR zelf. |
| Hoofdsessie | Mag alleen `gh pr merge <nr> --squash` op een feature-lane-PR, met de voorwaarden uit AC-17 t/m AC-27. |
| Developer, tester, reviewer, architect, docs, onbekende subagent | Mergen blijft deny, in elke modus. |
| GitHub | Harde grens: de ruleset eist de verplichte checks van GitHub Actions (ADR 0030 punt 6). |

## Datawijzigingen (met grants)

n.v.t. — geen migratie, tabel of rol.

## Routes en foutcodes

n.v.t. — geen API-route of permissie. Uitvoer gaat via exitcodes en meldingen van scripts en hooks (zie "Letterlijke meldingen").

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

## Hergebruik en UX

- Bestaande componenten: n.v.t. — geen UI. Hergebruik in code: `laneVan`, `isMiniSpec`, `migratieOvertreding` (`scripts/kit/lane.mjs`);
  `globMatch`, `ghForbidden`, `loadConfig` (`rails/hooks/lib/rolhek.mjs`); `checkRuns`, `pullRequest` (`scripts/kit/github-evidence.mjs`);
  `GITHUB_ACTIONS_APP_ID` (`rails/hooks/lib/built-evidence.mjs`); `onderhoudVan`-patroon voor de vormcheck in `check-docs`; de `gh`-stub
  uit `test/scripts/github-ruleset.test.ts`. Geen tweede lane-herkenning: de logica die nu in `check-document-status` de besluiten
  bepaalt (`eigenaarStatussen`, :200) verhuist als pure functie naar `scripts/kit/lane.mjs` en beide scripts gebruiken die.
- Staten per scherm: n.v.t. — geen scherm.
- Alle zichtbare tekst letterlijk: zie "Letterlijke meldingen" en de teksten bij B3–B7.
- Focusvolgorde en toetsenbord: n.v.t. — geen scherm.

### A1 — `scripts/check-github.mjs`

- Aanroep: `node scripts/check-github.mjs <owner>/<repo>`. Exit 0 = alles komt overeen; 1 = afwijking of onleesbaar; 2 = gebruik.
  Geen `pnpm`-script (dat raakt `package.json`, `jsonGates`).
- Alleen-lezend: elke aanroep is `gh api <endpoint>` zonder `-X`/`--method`, `-f`, `-F`, `--field`, `--raw-field` of `--input`.
- Leest `.github/settings/main-protection.json` naast het script (zoals `github-ruleset.sh` zijn payload).
- Endpoints: `repos/<repo>/rulesets` (zoek `name == "main"`), `repos/<repo>/rulesets/<id>`, `user` (login).
- Toetst, elk als aparte regel in de uitvoer:
  1. precies één ruleset `main`, `enforcement: "active"`, `target: "branch"`, `conditions.ref_name.include` bevat `~DEFAULT_BRANCH`;
  2. `bypass_actors` is aanwezig en leeg (ontbreekt het veld, bijvoorbeeld door te weinig rechten: onleesbaar → fout);
  3. de regeltypes `deletion`, `non_fast_forward`, `pull_request` en `required_status_checks` zijn aanwezig;
  4. `pull_request.parameters.required_review_thread_resolution` is `true`; `allowed_merge_methods` bevat `squash` en geen methode
     buiten de lijst in het bestand;
  5. elke check uit het bestand staat in `required_status_checks` met `integration_id` 15368 (GitHub Actions); een extra verplichte
     check op GitHub is goed (strenger), een ontbrekende of een met een andere `integration_id` is fout;
  6. de login van `gh api user` staat in `goedkeurders` van `.claude/gates.json`: géén fout maar de melding `overgang` (zie V-6).
- Elke `gh`-fout, timeout (10 s per aanroep), niet-JSON-antwoord of ontbrekend veld telt als fout, nooit als goed.

### A2 — `.github/settings/main-protection.json`

```json
{
  "$comment": "Ruleset main als code (framework §10, ADR 0030 punt 3). scripts/github-ruleset.sh zet hem, scripts/check-github.mjs controleert hem alleen-lezend; test/scripts/main-protection.test.ts houdt beide gelijk.",
  "ruleset": { "<precies de payload van scripts/github-ruleset.sh <repo> zonder --zonder-codeql>": "" }
}
```

`ruleset` is letterlijk het object dat `scripts/github-ruleset.sh` zonder `--zonder-codeql` naar GitHub stuurt (naam, target,
enforcement, `bypass_actors: []`, conditions, de vier regels, de acht checks met `integration_id` 15368). `github-ruleset.sh` blijft
ongewijzigd; een nieuwe test vergelijkt de stub-payload met het bestand (AC-6).

### A3 — sleutel `merge` in `.claude/gates.json`

- Toevoegen: `"merge": "eigenaar"`, en in `$comment` de zin: "`merge` (ADR 0029 punt 14): `\"eigenaar\"` of `\"feature-lane\"`;
  ontbreekt of onleesbaar → `\"eigenaar\"`; het rolhek leest hem uit het anker, nooit uit de werkmap."
- `check-docs` (nieuwe sleutel `docs:gates:merge`, in `scripts/kit/check-docs.mjs` naast `onderhoudViolations`): ontbreekt → goed;
  `"eigenaar"` → goed; `"feature-lane"` → goed als `scripts/check-github.mjs` én `.github/settings/main-protection.json` in git staan,
  anders fout; `"agent-na-akkoord"` → fout; elke andere waarde of elk ander type → fout.

### A4 — lane-uitslag in `scripts/kit/diff-guard.mjs`

- `beoordeel` levert naast `uitslag` en `risico` een veld `lane: { lane: 'feature' | 'framework' | null, reden: string }`, berekend met
  `laneVan` en de verhuisde besluitfunctie, op de head-versies die de guard al als git-object leest (spec-tekst voor `isMiniSpec`,
  nieuwe migraties voor `migratieOvertreding`). Geen PR-code uitvoeren of importeren.
- `feature` alleen als ook `migratieOvertreding` voor elke nieuwe migratie `null` geeft (zelfde inhoud als `verifyFeatureInhoud`).
- De lane verandert `uitslag` niet: een framework-PR blijft groen of `overgang` zoals nu.
- Uitvoer: een regel in de samenvatting en een annotatie (zie "Letterlijke meldingen"). Geen wijziging in `guard.yml` nodig: de
  stap draait al `node scripts/kit/diff-guard.mjs` met alle benodigde omgevingsvariabelen.

### A5 — `requiredChecks`

`"diff-guard"` erbij in `requiredChecks` van `.claude/decisions.json` (ADR 0029 punt 16). De ruleset op GitHub blijft ongewijzigd
(`NIET_VERPLICHT` in `test/scripts/github-ruleset.test.ts` blijft gelden, ADR 0017).

### A6 — `pnpm pr:verify <nr> --lane`

Nieuwe vlag naast `--watch` (beide samen mag). Na een groene uitslag zoekt `pr:verify` de check-run `diff-guard` op de head-SHA met
`app_id` 15368 en leest diens annotaties (alleen GET). Groen alleen bij precies één annotatie met titel `lane` en tekst `feature`;
anders exit 1 met de reden. Zonder `--lane` verandert er niets.

### B1 — `rails/hooks/lib/rolhek.mjs` (eigenaar)

- `loadConfig` leest `merge`; ontbreekt, onleesbaar of een andere waarde dan `"feature-lane"` → `"eigenaar"`. Altijd uit het anker
  (zoals `onderhoud`), nooit uit de werkmap.
- `ghForbidden` krijgt een tweede argument `{ role, merge, lane }`. Mergen is toegestaan als alles geldt, anders blijft de huidige
  deny-reden staan:
  1. `role` is de hoofdsessie;
  2. `merge === "feature-lane"`;
  3. `args` is exact `['pr', 'merge', <nr>, '--squash']`, met `<nr>` volgens `/^[1-9]\d*$/` (zie V-1);
  4. `lane.lane === 'feature'`, berekend met `laneVan` op `git diff --name-status -z --find-renames <anker-main>...HEAD`, met de
     spec- en migratieteksten uit `HEAD`;
  5. `git status --porcelain` is leeg (met `werkmapNegeer`) en `HEAD` is gelijk aan `@{upstream}` (lokale refs, geen netwerk);
  6. (V-4) geen gate-pad in de diff buiten de mini-spec zelf.
- Elke uitzondering bij het berekenen van 2–6 → deny met de reden (in code dicht, ook al is de hook als geheel fail-open).
- `gh api …/merge`, GraphQL-merge, `--admin`, `--auto` en elke andere vorm blijven deny voor elke rol.

Tabeltests in een nieuw bestand `test/hooks/rolhek-merge.test.ts`; bestaande tests blijven ongewijzigd (`test/hooks/rolhek.test.ts:220`
en `:310-312`, `test/hooks/rolhek-onderhoud.test.ts:270` draaien zonder `merge` en blijven deny). Elk geval met de anker-fixture uit
`test/hooks/vertrouwde-basis-anker.test.ts`:

| # | Rol | `merge` op anker | Diff t.o.v. anker-main | Commando | Verwacht |
|---|---|---|---|---|---|
| 1 | hoofdsessie | `feature-lane` | mini-spec `goedgekeurd` + `src/web/features/x.tsx` + nieuwe test | `gh pr merge 12 --squash` | allow |
| 2 | hoofdsessie | `eigenaar` | als 1 | `gh pr merge 12 --squash` | deny |
| 3 | hoofdsessie | ontbreekt | als 1 | `gh pr merge 12 --squash` | deny |
| 4 | hoofdsessie | `eigenaar` op anker, `feature-lane` in werkmap | als 1 | `gh pr merge 12 --squash` | deny |
| 5 | hoofdsessie | `agent-na-akkoord` | als 1 | `gh pr merge 12 --squash` | deny |
| 6 | hoofdsessie | `feature-lane` | als 1 | `gh pr merge 12 --squash --admin` | deny |
| 7 | hoofdsessie | `feature-lane` | als 1 | `gh pr merge 12 --auto --squash` | deny |
| 8 | hoofdsessie | `feature-lane` | als 1 | `gh pr merge 12 --merge` / `--rebase` / `-s` | deny |
| 9 | hoofdsessie | `feature-lane` | als 1 | `gh pr merge 12 --squash --delete-branch` | deny |
| 10 | hoofdsessie | `feature-lane` | als 1 | `gh pr merge 12 --squash -R o/r` / `gh pr merge --squash` / `gh pr merge abc --squash` | deny |
| 11 | developer, tester, reviewer, architect, docs, onbekend | `feature-lane` | als 1 | `gh pr merge 12 --squash` | deny |
| 12 | hoofdsessie | `feature-lane` | alleen een ADR naar `geaccepteerd` (framework-lane) | `gh pr merge 12 --squash` | deny |
| 13 | hoofdsessie | `feature-lane` | geen document met eigenaarstatus, alleen `src/web/x.tsx` | `gh pr merge 12 --squash` | deny (zie V-5) |
| 14 | hoofdsessie | `feature-lane` | mini-spec + elk van: `.claude/x`, `scripts/x.mjs`, `rails/x`, `.github/x`, `package.json`, `src/core/x.ts`, gewijzigde `test/x.test.ts`, gewijzigde `db/migrations/x.sql`, `docs/adr/0099-x.md`, rename `src/core/x.ts` → `src/web/x.ts` | `gh pr merge 12 --squash` | deny (elk een eigen rij) |
| 15 | hoofdsessie | `feature-lane` | volledige spec (`_template.md`) + code | `gh pr merge 12 --squash` | deny |
| 16 | hoofdsessie | `feature-lane` | mini-spec + nieuwe migratie met `create function` | `gh pr merge 12 --squash` | deny |
| 17 | hoofdsessie | `feature-lane` | als 1, werkmap met getrackte wijziging | `gh pr merge 12 --squash` | deny |
| 18 | hoofdsessie | `feature-lane` | als 1, `HEAD` ≠ `@{upstream}` of geen upstream | `gh pr merge 12 --squash` | deny |
| 19 | hoofdsessie | anker onleesbaar | als 1 | `gh pr merge 12 --squash` | deny |
| 20 | hoofdsessie | `feature-lane` | als 1 | `gh api -X PUT repos/o/r/pulls/12/merge` / GraphQL `mergePullRequest` | deny |
| 21 | hoofdsessie | `feature-lane` | als 1 | `gh pr merge 12 --squash && git push origin main` | deny (het tweede segment) |
| 22 | hoofdsessie | `feature-lane` | als 1 | `command gh pr merge 12 --squash` / `env X=1 gh pr merge 12 --squash` | deny |
| 23 | hoofdsessie | `feature-lane` | mini-spec + `deploy/x` of `src/api/kit.ts` | `gh pr merge 12 --squash` | deny (V-4) |

### B2 — `.claude/settings.json` (eigenaar)

- `deny`: `"Bash(gh pr merge*)"` eruit; erbij `"Bash(gh pr merge*--admin*)"`, `"Bash(gh pr merge*--auto*)"`. `"Bash(gh api *merge*)"`
  blijft.
- `allow`: zie V-3 (`"Bash(gh pr merge * --squash)"` voor geen prompt, of `ask` als vangnet).
- Nieuwe gevallen in een nieuw bestand `test/rails/sandbox-settings-merge.test.ts`: `deny` bevat beide nieuwe regels en
  `Bash(gh api *merge*)`; `deny` bevat geen `Bash(gh pr merge*)` meer; de V-3-regel staat er precies één keer.

### B3 — skill `opleveren` (eigenaar)

De sectie "Mergen" wordt letterlijk:

```markdown
## Mergen

Lees de modus: `git show origin/main:.claude/gates.json` → `merge`. Bij `"eigenaar"` (of zonder sleutel) reviewt en merget de eigenaar;
de hoofdsessie merget nooit. Bij `"feature-lane"` merget de hoofdsessie zelf (ADR 0029 punt 14), alleen als alles geldt:

1. De reviewer gaf akkoord op de huidige head: na de laatste review is `git diff <reviewer-sha>..HEAD` leeg of door de reviewer opnieuw
   bekeken, en er staat geen blokkerende bevinding open.
2. `pnpm pr:verify <nr> --lane` is groen op de huidige head.
3. De werkmap is schoon en `HEAD` is gepusht.

Dan exact `gh pr merge <nr> --squash`, niets anders. Weigert het rolhek, stop dan en meld de reden; probeer geen andere vorm.
Na de merge: `gh pr comment <nr> --body "<melding>"` met de melding hieronder, en dezelfde tekst in de eindmelding. Een framework-lane-PR
merget altijd de eigenaar.

Melding: `Gemerged door de agent (feature-lane, ADR 0029 punt 14) op <head-sha>. Reviewer-akkoord op <reviewer-sha>; pr:verify --lane groen. Nieuwe permissies en routes: zie het risico-overzicht van de diff-guard.`
```

`test/rails/opleveren-skill.test.ts` blijft geldig (de tekst noemt "de eigenaar merget"); nieuwe gevallen in
`test/rails/opleveren-merge.test.ts`: de skill noemt `pr:verify <nr> --lane`, `gh pr merge <nr> --squash`, `gh pr comment`, en niet
`--admin`, `--auto` of `--delete-branch` als toegestane vorm.

### B4 — `.github/workflows/guard.yml` (eigenaar pusht)

Alleen de kopcommentaarregel 4: "Nog geen verplichte check (ADR 0017, OV-1): dat wordt hij bij de overstap op de GitHub App." wordt
"In de ruleset nog geen verplichte check (ADR 0017, OV-1); wel in `requiredChecks` voor `pnpm pr:verify` (ADR 0029 punt 16)." Geen
functionele wijziging: de lane-uitslag komt uit het script (A4).

### B5 — `docs/framework.md` (eigenaar)

- §8 stap 6, de zin "Inhoudelijke goedkeuring en merge blijven van de eigenaar;" wordt "Inhoudelijke goedkeuring blijft van de eigenaar;
  de merge ook, behalve een feature-lane-PR bij `merge: \"feature-lane\"` op `main` (ADR 0029 punt 14, skill `opleveren`);".
- §8 stap 7 wordt: "**Eigenaar** reviewt en merget; een feature-lane-PR merget de hoofdsessie volgens stap 6, met achteraf een
  melding aan de eigenaar."
- §8, tabel PreToolUse rolhek (Bash): bij "mergen (…)" toevoegen: "behalve exact `gh pr merge <nr> --squash` door de hoofdsessie bij
  `merge: \"feature-lane\"` op het anker en een feature-lane van `HEAD` (ADR 0029 punt 14)".
- §10 eerste bullet: "De eigenaar merget." wordt "De eigenaar merget; een feature-lane-PR mag de agent mergen (ADR 0029 punt 14)."
- §10 bullet "Instellingen als code": "faalt als de agent onder het account van de eigenaar werkt" wordt "meldt `overgang` als de
  agent onder het account van de eigenaar werkt (ADR 0029 punt 17, geaccepteerd)" (V-6).

### B6 — `AGENTS.md` (eigenaar)

Regel 74: "Push nooit naar `main`, gebruik nooit `--no-verify`, merge nooit." wordt "Push nooit naar `main`, gebruik nooit `--no-verify`;
merge alleen een feature-lane-PR via de skill `opleveren` (ADR 0029 punt 14)."

### B7 — `CLAUDE.md` (eigenaar)

Regel 9: "→ eigenaar merget (jij nooit)." wordt "→ eigenaar merget (jij alleen een feature-lane-PR, skill `opleveren`)."

### B8 — ADR 0030 (eigenaar, correctieprocedure `docs/operations/agent-doorloop.md`)

Onder de kop een regel: "Gewijzigd door [0029](0029-snellere-beslisroute.md) (punt 14–16: agent-merge in de feature-lane)."

### C — aanzetten (eigenaar)

`.claude/gates.json`: `"merge": "feature-lane"`. In de PR-beschrijving de volledige uitvoer van
`node scripts/check-github.mjs BramLambertJansen/template` met exit 0. `check-docs` faalt als A1/A2 ontbreken (AC-9).

### Letterlijke meldingen

| Waar | Tekst |
|---|---|
| check-github, gebruik | `Gebruik: node scripts/check-github.mjs <owner>/<repo>` |
| check-github, per regel | `✓ <onderwerp>` of `✗ <onderwerp>: verwacht <verwacht>, gevonden <gevonden>` |
| check-github, onleesbaar | `✗ <onderwerp>: onleesbaar (<endpoint>); een onleesbare instelling telt als fout` |
| check-github, account | `! overgang: gh is ingelogd als <login>, een goedkeurder; de merge is geen identiteitsbewijs (ADR 0029 punt 17)` |
| check-github, slot goed | `check-github: ruleset main op <repo> komt overeen met .github/settings/main-protection.json` |
| check-github, slot fout | `check-github: <n> afwijking(en); zet de ruleset met scripts/github-ruleset.sh <repo> en draai opnieuw` |
| check-docs, `agent-na-akkoord` | `.claude/gates.json: merge "agent-na-akkoord" is geparkeerd (ADR 0030 PR 2, ADR 0029 punt 14); gebruik "eigenaar" of "feature-lane"` |
| check-docs, `feature-lane` zonder A1/A2 | `.claude/gates.json: merge "feature-lane" vraagt scripts/check-github.mjs en .github/settings/main-protection.json (ADR 0030 punt 3)` |
| check-docs, andere waarde | `.claude/gates.json: merge is "eigenaar" of "feature-lane" (ADR 0029 punt 14)` |
| diff-guard, samenvatting | `**Lane:** feature — <reden>` of `**Lane:** geen — <reden>` (ook bij `framework`: `**Lane:** framework — <reden>`) |
| diff-guard, annotatie | `::notice title=lane::feature` / `::notice title=lane::framework` / `::notice title=lane::geen: <reden>` |
| pr:verify `--lane`, fout | `lane: geen feature-lane volgens diff-guard op <sha7> (<gevonden>)` / `lane: geen diff-guard van GitHub Actions op <sha7>` |
| rolhek, deny | `mergen: <reden>; alleen exact gh pr merge <nr> --squash door de hoofdsessie, bij merge "feature-lane" op main en een feature-lane (ADR 0029 punt 14)` met `<reden>` uit: `modus is "eigenaar"`, `geen exacte vorm`, `alleen de hoofdsessie`, `lane: <reden van laneVan>`, `werkmap niet schoon`, `HEAD is niet gepusht`, `anker onleesbaar`, `gate-pad <pad>` |

## Acceptatiecriteria

PR A:

- **agent-merge/AC-1** — Gegeven een `gh`-stub met een ruleset die overeenkomt met het bestand, wanneer `check-github` draait, dan is
  de exitcode 0 en de laatste regel de slottekst "komt overeen".
- **agent-merge/AC-2** — Gegeven een stub waarin één van de toetsen 1–5 (A1) afwijkt (per toets een geval: `enforcement: "evaluate"`,
  een bypass-actor, ontbrekende regel `non_fast_forward`, `required_review_thread_resolution: false`, een ontbrekende check, een check
  met `integration_id` ≠ 15368), dan exit 1 met een `✗`-regel voor precies die toets.
- **agent-merge/AC-3** — Gegeven een stub die faalt, een timeout geeft, geen JSON teruggeeft, geen ruleset `main` heeft, twee heeft, of
  `bypass_actors` weglaat, dan exit 1 met "onleesbaar" of een `✗`-regel; nooit exit 0.
- **agent-merge/AC-4** — Bij elke run (alle gevallen uit AC-1 t/m AC-3) bevat het aanroeplog van de stub alleen `gh api <endpoint>`
  zonder `-X`, `--method`, `-f`, `-F`, `--field`, `--raw-field` of `--input`.
- **agent-merge/AC-5** — Gegeven `gh api user` met een login uit `goedkeurders`, dan staat de `overgang`-regel in de uitvoer en
  hangt de exitcode alleen af van toetsen 1–5. Zonder argument of met een ongeldige repo: exit 2, geen `gh`-aanroep.
- **agent-merge/AC-6** — De payload van `scripts/github-ruleset.sh eigenaar/app` (stub) is `toStrictEqual` aan `ruleset` in
  `.github/settings/main-protection.json`, en de checks daarin zijn gelijk aan die uit `.github/workflows/` min `NIET_VERPLICHT`.
- **agent-merge/AC-7** — `check-docs` geeft geen `docs:gates:merge`-overtreding bij een ontbrekende sleutel en bij `"eigenaar"`.
- **agent-merge/AC-8** — `check-docs` geeft de letterlijke melding bij `"agent-na-akkoord"`, en de "andere waarde"-melding bij `"x"`,
  `true`, `null`, `[]` en `{}`.
- **agent-merge/AC-9** — `check-docs` faalt op `"feature-lane"` als `scripts/check-github.mjs` of `.github/settings/main-protection.json`
  niet in git staat, en slaagt als beide er zijn.
- **agent-merge/AC-10** — `.claude/gates.json` op de branch van PR A heeft `"merge": "eigenaar"`, en `check-docs` is groen.
- **agent-merge/AC-11** — Gegeven een PR met mini-spec naar `goedgekeurd` + `src/web/**` + `src/api/routes/**` + een nieuwe test, dan
  meldt `diff-guard` `lane: feature` (samenvatting en annotatie) en blijft `uitslag` gelijk aan die zonder lane-veld.
- **agent-merge/AC-12** — Voor elk negatief geval uit ADR 0029 punt 7 (1)–(8) en (10) meldt `diff-guard` `lane: geen: <reden>` of
  `lane: framework`; nooit `feature`. Een nieuwe migratie met meer dan een nieuwe tabel geeft `geen`.
- **agent-merge/AC-13** — `diff-guard` en `check-document-status` geven op dezelfde fixtures dezelfde lane (één bron, gedeelde functie
  in `scripts/kit/lane.mjs`).
- **agent-merge/AC-14** — `.claude/decisions.json` bevat `diff-guard` in `requiredChecks`; `pnpm pr:verify` meldt `diff-guard: ontbreekt`
  zolang die check-run niet bestaat.
- **agent-merge/AC-15** — `pr:verify <nr> --lane` met een groene `diff-guard` van `app_id` 15368 op de head en annotatie `feature`:
  exit 0. Met annotatie `framework`, `geen: …`, geen annotatie, twee annotaties, een andere `app_id` of een andere SHA: exit 1 met de
  letterlijke melding. Zonder `--lane` is de uitvoer gelijk aan nu.
- **agent-merge/AC-16** — `docs/nieuwe-app.md` (:366, :468) en `docs/operations/agent-doorloop.md` noemen `check-github` als bestaand en
  de PR-volgorde A → B → C; `check-docs` is groen.

PR B (de eigenaar past toe; tests eerst):

- **agent-merge/AC-17** — Tabelgeval 1 uit B1 geeft allow.
- **agent-merge/AC-18** — Tabelgevallen 2–5 en 19 geven deny met reden `modus is "eigenaar"` of `anker onleesbaar`.
- **agent-merge/AC-19** — Tabelgevallen 6–10 en 22 geven deny met reden `geen exacte vorm`.
- **agent-merge/AC-20** — Tabelgeval 11 geeft deny voor elke subagentrol en voor een onbekende rol.
- **agent-merge/AC-21** — Tabelgevallen 12–16 geven deny met reden `lane: …`.
- **agent-merge/AC-22** — Tabelgevallen 17 en 18 geven deny met `werkmap niet schoon` of `HEAD is niet gepusht`.
- **agent-merge/AC-23** — Tabelgevallen 20 en 21 geven deny (ongewijzigd gedrag van `apiMerges` en `pushesMain`).
- **agent-merge/AC-24** — Een uitzondering in de laneberekening (git-fout, onleesbare spec) geeft deny, geen allow.
- **agent-merge/AC-25** — `.claude/settings.json` voldoet aan de gevallen uit B2.
- **agent-merge/AC-26** — De skill `opleveren` bevat de sectie uit B3 letterlijk; `test/rails/opleveren-skill.test.ts` blijft groen.
- **agent-merge/AC-27** — `docs/framework.md`, `AGENTS.md`, `CLAUDE.md` en ADR 0030 bevatten de teksten uit B5–B8; `check-docs` en
  `test/rails/opleveren-skill.test.ts` blijven groen.

PR C:

- **agent-merge/AC-28** — `check-docs` is groen met `"merge": "feature-lane"`, en de PR-beschrijving bevat uitvoer van `check-github`
  met exit 0 (handmatig, door de eigenaar; geen geautomatiseerde test).

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Ruleset op GitHub strenger dan het bestand (extra check, `strict` aan) | goed | n.v.t. |
| Ruleset later versoepeld, na C | niet automatisch gezien (restrisico ADR 0030); GitHub blijft de grens bij elke merge | n.v.t. |
| `gh` zonder login of zonder rechten om `bypass_actors` te lezen | onleesbaar → exit 1 | n.v.t. |
| Private repo zonder CodeQL (`--zonder-codeql`) | `check-github` faalt op de twee CodeQL-checks; zie V-7 | n.v.t. |
| De eigenaar zet de status van de mini-spec in de webeditor na de review | nieuwe head; reviewer bekijkt `git diff <reviewer-sha>..HEAD` (alleen de statusregel), lokaal `git pull --ff-only` vóór de merge | n.v.t. |
| `main` schuift door tussen `pr:verify` en de merge | GitHub eist de checks op de head; de lane is t.o.v. de merge-base berekend, niet opnieuw | n.v.t. |
| Rolhek-timeout (hook fail-open) | zie V-3 | n.v.t. |
| `merge` staat op `"feature-lane"` in een app uit de template | geldt daar ook, maar alleen als die app zelf C heeft gedaan (eigen `main`) | n.v.t. |
| PR met mini-spec waarvan de status al op `main` stond (bouw-PR na een besluit-PR) | geen in-PR-status → lane `null` → geen agent-merge; zie V-5 | n.v.t. |

## Raakt ook

- `scripts/kit/check-document-status.mjs` (besluitfunctie verhuist naar `scripts/kit/lane.mjs`, gedrag gelijk; AC-13).
- `scripts/kit/pr-verify.mjs`, `scripts/kit/github-evidence.mjs` (annotaties lezen, A6).
- `docs/nieuwe-app.md`, `docs/operations/agent-doorloop.md`, `docs/roadmap.md` (item "ADR 0029 stap 7: agent-merge", vinkje na C met
  PR-nummers), `CHANGELOG.md`.
- `docs/framework.md:415-418` beschrijft `check-github` al; B5 stemt die tekst af op route 2.
- ADR 0006 :35 noemt voor `check-github` ook "merge-commits toegestaan, rebase niet": zie V-8.

## Buiten scope

- GitHub App, tokens of credentials (ST-01, ADR 0029 "Niet beslist").
- Agent-merge in de framework-lane en de waarde `"agent-na-akkoord"` (ADR 0030 PR 2 blijft geparkeerd).
- `diff-guard` of `document-status` als verplichte check in de ruleset op GitHub.
- `gh pr merge --auto`, `--admin`, `--delete-branch`, `gh api …/merge`, `gh pr review`.
- Wijzigen van `scripts/github-ruleset.sh` (de JSON wordt nog niet de bron van het script; zie V-8).
- Periodiek opnieuw draaien van `check-github` (restrisico ruleset, ADR 0030).

## Testplan

| AC | Test (nieuw bestand, door de tester) |
|---|---|
| AC-1 t/m AC-5 | `test/scripts/check-github.test.ts` (gh-stub zoals `test/scripts/github-ruleset.test.ts`) |
| AC-6 | `test/scripts/main-protection.test.ts` |
| AC-7 t/m AC-10 | `test/rails/check-docs-merge.test.ts` |
| AC-11 t/m AC-13 | `test/rails/diff-guard-lane.test.ts` (fixtures in `test/rails/fixtures/`) |
| AC-14, AC-15 | `test/scripts/pr-verify-lane.test.ts` |
| AC-16 | `check-docs` (paden) plus review |
| AC-17 t/m AC-24 | `test/hooks/rolhek-merge.test.ts` |
| AC-25 | `test/rails/sandbox-settings-merge.test.ts` |
| AC-26 | `test/rails/opleveren-merge.test.ts` |
| AC-27 | `test/rails/opleveren-merge.test.ts` (framework-, AGENTS- en CLAUDE-teksten) |
| AC-28 | handmatig door de eigenaar in PR C |

Bestaande tests worden niet gewijzigd. De tests voor PR B staan in PR B (ze falen tegen het rolhek van PR A); zie V-2.

## Niet beslist

- **V-1 Exacte vorm.** ADR 0029 punt 14 zegt exact `gh pr merge <nr> --squash`. Het rolhek werkt offline en kan `<nr>` niet aan de
  branch koppelen: het toetst de lane van de lokale `HEAD`, niet van PR `<nr>`. Voorstel: de vorm
  `gh pr merge <nr> --squash --match-head-commit <sha>` met `<sha>` = lokale `HEAD`; dan weigert GitHub een PR met een andere head.
  Dat wijzigt de vorm uit punt 14 (A4, ADR-wijziging nodig). Keuze: ADR-vorm houden (met dit gat) of de uitgebreide vorm?
- **V-2 Plaats van het rolhek.** Het rolhek staat in `rails/hooks/lib/rolhek.mjs` (`rails/**`, in de onderhoudsmodus een melding,
  niet in `altijdVragen`). Blijft B1 in PR B door de eigenaar (zoals de opdracht), of mag de developer het in PR B bouwen met
  eigenaarreview?
- **V-3 Vangnet bij een falende hook.** Met `allow` op `Bash(gh pr merge * --squash)` is er geen prompt; een rolhek-timeout laat de
  merge dan zonder lanecheck door (de ruleset eist nog steeds de checks). Met `ask` is er een vangnet, maar dan een prompt per merge,
  wat punt 15 juist wegneemt. Welke?
- **V-4 Andere gate-paden.** In de overgang is de diff-guard groen voor een PR van de eigenaar, ook met een gate-pad. ADR 0029 punt 17
  zegt dat zo'n PR "de diff-guard alleen met een eigenaarreview" haalt; dat klopt onder route 2 niet. De lane laat `deploy/**`,
  `renovate.json`, `src/api/{kit,server,env}.ts`, `docs/roadmap.md`, `docs/nieuwe-app.md` en `.gitattributes` toe. Voorstel: agent-merge
  alleen als geen gate-pad buiten de mini-spec zelf geraakt is (tabelgeval 23). Akkoord, of mag (een deel van) die paden wel?
- **V-5 Feature-PR zonder in-PR-status.** `laneVan` eist precies één document dat in de PR een eigenaarstatus krijgt. Een feature-PR
  zonder nieuwe route, permissie of tabel (geen spec nodig) of een bouw-PR na een eerder gemergde spec is dan geen feature-lane en
  dus niet door de agent te mergen. Zo laten, of een tweede herkenning ("geen document, alle paden binnen punt 6")? Dat laatste
  verruimt rechten (A3) en vraagt een ADR-wijziging.
- **V-6 Account-toets in `check-github`.** Framework §10 zegt dat `check-github` faalt als de agent onder het account van de eigenaar
  werkt. Onder route 2 faalt hij dan altijd. Voorstel: een `overgang`-melding (A1 toets 6, B5). Bevestigen?
- **V-7 Repo zonder CodeQL.** Een `--zonder-codeql`-variant voor `check-github` (zoals het script), of alleen de template-repo met
  CodeQL?
- **V-8 Overige instellingen.** Ook controleren: repo-instellingen (rebase uit, merge-commit aan, ADR 0006 :35), "Allow GitHub Actions
  to create and approve pull requests" uit en "Require actions to be pinned" aan (framework §10), `allow_auto_merge` uit? En wordt
  `main-protection.json` later de bron van `github-ruleset.sh`?
- **V-9 Lane-uitslag uit `document-status` in plaats van `diff-guard`.** `check-document-status` berekent de lane al en staat al in
  `requiredChecks`. De annotatie daar zetten maakt A5 overbodig en voorkomt een tweede aanroep van dezelfde functie. De opdracht en
  ADR 0029 punt 14(3) noemen de diff-guard; deze spec volgt dat. Wijzigen?
- **V-10 Melding achteraf.** Is `gh pr comment` (nu niet geweigerd door rolhek of `.claude/settings.json`) de gewenste vorm, en is de
  tekst uit B3 goed?
