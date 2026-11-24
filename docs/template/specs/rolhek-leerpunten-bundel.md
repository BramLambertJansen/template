---
status: goedgekeurd
namespace: rolhek-leerpunten
---

# Rolhek: leerpunten in één bundel (#962, #955, #736, #958, #960; #688 zonder bouw)

## Open vragen

- **OV-1 ✅ besloten** — #688: geen verruiming, want R-ROL-10 (ADR 0099) laat het vangnet niet verder uitkleden. De
  route van rolhek-herstel/AC-3 blijft, en #688 sluit met een verwijzing daarnaar (eigenaar, 24 november 2026).
- **OV-2 ✅ besloten** — Vervalt met OV-1: er komt geen ankerformaat.
- **OV-3 ✅ besloten** — #736: niet verruimen. De groene rijen worden regressie (AC-5), de weigering krijgt een
  aanwijzing en `--head` komt in R-ROL-11 (eigenaar, 24 november 2026).
- **OV-4 ✅ besloten** — #958: geen regel in het rolhek (R-ROL-10, ADR 0099). Wel een instructie in de agentbestanden met
  een structuurtest (AC-12) (eigenaar, 24 november 2026).
- **OV-5 ✅ besloten** — #960: cherry-pick, apply en merge blijven dicht voor een subagent. De weigering wijst de route
  `git checkout <sha> -- <paden>` aan (AC-9) (eigenaar, 24 november 2026).
- **OV-6 ✅ besloten** — #962: de `MISE_`-prefixvorm blijft geweigerd, want de prefix is niet te controleren. Wel komt
  er een driftmelding (AC-6, AC-7) en werkt de eigenaar de hoofdcheckout bij (eigenaar, 24 november 2026).
- **OV-7 ✅ besloten** — AC-1 is rood met `draai git fetch origin` als `origin/main` onleesbaar is, en slaat niet
  over, want overslaan is vals groen (eigenaar, 24 november 2026).

## Doel

Vijf leerpunten over het rolhek, in twee bouw-PR's. Eerst een aanscherping: een nieuwe lezer ziet op elke ingang
minstens wat de lezer van `main` zag (#955), en de groene #736-rijen liggen vast. Daarna meldingen die een route wijzen
in plaats van dood te lopen (#962, #960, #958). #688 krijgt geen bouw. Hij sluit met een verwijzing naar
rolhek-herstel/AC-3: de hoofdsessie doet de wijziging aan de test en krijgt daarbij de vraag aan de eigenaar.

Gemeten op `8e7cab9b` met `decide` uit `rails/hooks/lib/rolhek.mjs`. De hoofdsessie heeft geen `agent_type`. De vaste
ctx is die uit `test/hooks/rolhek-pr-merge.test.ts`, plus `netwerkvormen: ['git commit *', 'git push origin HEAD']`:

| Commando | Rol | Uitslag |
|---|---|---|
| `git add test/scripts/pr-merge.test.ts`, `git add scripts/kit/pr-merge.mjs` | hoofdsessie | door |
| `git grep -n "pr:merge" -- docs/template/specs/templateregime.md`, `git branch --list 'chore/*'` | hoofdsessie | door |
| `gh pr create --title "fix(merge): x" --body-file f.md` | hoofdsessie | door |
| `gh pr create --head chore/iets-uit-merge --title "fix(merge): x" --body-file f.md` | hoofdsessie | geweigerd (WS-04) |
| `printf 'x' > msg.txt && git add a.ts && git commit -F msg.txt` | hoofdsessie | geweigerd (Netwerkvorm) |
| `MISE_STATE_DIR=/tmp/x MISE_TRUSTED_CONFIG_PATHS=/repo git commit -F msg.txt` | hoofdsessie | geweigerd (Netwerkvorm) |
| `git commit -F msg.txt`, `git push origin HEAD` | hoofdsessie | door |
| `bash /tmp/s/run.sh`, `sh run.sh` | tester, developer | door |
| `git cherry-pick abc1234`, `git apply p.patch`, `git merge feat/y` | developer | geweigerd (rolhek-vooraf/AC-3) |
| `git format-patch -1 abc1234` | developer | door |
| `git checkout abc1234 -- src/a.ts test/a.test.ts`, `git restore --source abc1234 -- src/a.ts` | developer | door |
| De vier #955-rijen uit AC-4 (`cwd` `/repo` of `/repo/a/b`) | hoofdsessie, developer | vraag, weigering |

Oorzaak van #962: `decideNetwerkvorm` leest de patronen uit het anker (de `.claude/settings.json` van `main`,
spec cloud-netwerkvorm). De sandbox van Claude Code gebruikt de settings van de projectmap waarin de sessie startte.
Is die projectmap een hoofdcheckout met een `.claude/settings.json` van vóór #871, dan eist het rolhek een vorm die de
sandbox niet uitzondert. Of de worktree de nieuwe settings heeft, maakt daarbij niet uit.

Bron voor de lokale settings (AC-6, AC-7): `CLAUDE_PROJECT_DIR`. De lokale lijst is de vereniging van
`sandbox.excludedCommands` uit `.claude/settings.json` en `.claude/settings.local.json` in die map. Reden: Claude Code
laadt de sandboxinstellingen uit precies die map. De ouder van `git rev-parse --git-common-dir` (de hoofd-worktree)
wijst verkeerd zodra een sessie in een worktree zelf start. Zonder `CLAUDE_PROJECT_DIR` draait er geen Claude
Code-sessie: dan komt er geen tekst en geen melding (R-WERK-23).

## Rollen en wie wat ziet

- Hoofdsessie (gebruiker): de meldingen uit AC-6 tot AC-8. De vraag bij een bestaande test blijft (R-ROL-01).
- Developer-subagent (gebruiker): de teksten uit AC-9 en AC-10. Cherry-pick, apply en merge blijven geweigerd.
- Tester-, reviewer-, architect- en docs-subagent: niets verandert, ook niet de teksten uit AC-9. Een tester die een
  bestaand testgeval weghaalt, houdt de weigering met de route van rolhek-herstel/AC-3 (#688).
- Deze spec-PR is de besluit-PR voor `rails/hooks/**` (`.claude/gates.json`, `besluit-pr`). De bouw van PR 1 begint
  pas na de merge.
- Bouwen, met de padniveaus zoals de hoofdsessie ze controleerde:
  - `rails/hooks/**` en `.claude/agents/developer.md` en `tester.md`: `voorReview`, met een eigenaarbesluit. Het
    rolhek weigert de developer hier (R-ROL-02). De hoofdsessie schrijft met akkoord van de eigenaar.
  - `docs/ENVIRONMENT.md`: vrij.
  - `test/hooks/**`: gate. De tester schrijft de tests vóór de bouw.
- Eigenaar: merget de besluit-PR en beide bouw-PR's, geeft het akkoord voor de beschermde paden, en werkt de
  `.claude/settings.json` van zijn hoofdcheckout bij (zie Raakt ook).

## Kopieer de vorm van

- `test/hooks/shell-glob-klasse-bash.test.ts`: alleen de versievergelijking. Een onleesbare main-ref van de remote
  maakt de differentiële test rood en slaat hem niet over (OV-7).
- `test/hooks/rolhek-pr-merge.test.ts`: `verdict()` rond `decide` met een vaste context per rol
- `test/hooks/rolhek-padcorpus-vooraf.test.ts`: `voorafCtx(rij)` voor de ctx van een padcorpusrij
- `test/hooks/rolhek-testakkoord-melding.test.ts`: een Edit-payload op een bestaande test met `bestaand` in de context

## Hergebruik en UX

- Bestaande componenten: geen UI.
  - Uit `rails/hooks/lib/shell.mjs`: `parseCommands` en `heredocsBeide`.
  - Uit `rails/hooks/lib/rolhek.mjs`: `decide`. `existingTest`, `decideNetwerkvorm`, `netwerkReden` en `substitutions`
    zijn intern; de tests lopen via `decide`.
  - Twee nieuwe exports in `rails/hooks/lib/shell.mjs`: `vergelijkUitslagen` en `vergelijkWoorden` (AC-3).
  - De ctx-bouwers `voorafCtx` (uit `test/hooks/rolhek-padcorpus-vooraf.test.ts`) en die van de aanvalscorpustest gaan
    naar een gedeeld hulpbestand onder `test/hooks/`, als dat nodig is.
- Alle zichtbare tekst letterlijk. Elk stuk komt achter de bestaande weigering of melding, met een puntkomma en spatie
  ervoor:
  - #736, achter de WS-04-weigering, alleen als `merge` in de waarde van `--head` van `gh pr create` staat:
    `het woord merge in een branchnaam telt hier mee (R-ROL-11): kies een branchnaam zonder dat woord (spec rolhek-leerpunten/AC-5)`
  - #962, achter de weigering van een netwerkvorm, als een patroon uit de geraakte groep van het anker niet in de lokale
    lijst staat: `je lokale .claude/settings.json en settings.local.json missen in sandbox.excludedCommands:
    <patronen>, dus ook deze vorm draait in de sandbox; de eigenaar werkt de hoofdcheckout bij naar main
    (docs/ENVIRONMENT.md, "Grens van de sandbox") (spec rolhek-leerpunten/AC-6)`
  - #962, in de uitvoer van `sessionStart`: `De lokale .claude/settings.json wijkt af van main in
    sandbox.excludedCommands (ontbreekt: <patronen>); commit en push in de vorm die het rolhek eist draaien dan in de
    sandbox. Eigenaar: werk de hoofdcheckout bij naar main (spec rolhek-leerpunten/AC-7).`
  - #962, achter de weigering van een netwerkvorm in een commando met meer dan één segment: `niets van dit commando is
    uitgevoerd, ook de andere delen niet: draai elk deel als eigen aanroep (spec rolhek-leerpunten/AC-8)`
  - #960, alleen voor de developer, achter elke weigering van `git cherry-pick`, `git apply`, `git format-patch` of
    `git merge`, ongeacht de reden: `overnemen uit een commit kan met git checkout <sha> -- <paden> (expliciete paden),
    anders doet de hoofdsessie het (spec rolhek-leerpunten/AC-9)`
  - #960, achter `is een bestaande test` als `bestaand` `'zonder-origin'` geeft: `(origin/main en het anker onleesbaar,
    daarom telt elk testbestand als bestaand: draai git fetch origin) (spec rolhek-leerpunten/AC-10)`

## Acceptatiecriteria

Elk criterium scheidt **nieuw gedrag** en **regressie**:

- Nieuw gedrag is rood op `main` op een `expect`, niet op een import of een throw. Een nieuwe export laad je als
  namespace met `await import(…)`, en elke test die hem gebruikt begint met `expect(typeof ns.<export>).toBe('function')`.
- Regressie is op `main` al groen (gemeten). Daarvoor geldt geen rood-eis; de PR noemt die rijen als regressie.

PR 1, aanscherpen (#955, #736):

- **rolhek-leerpunten/AC-1** — Bewaking, het rood-bewijs loopt via AC-3. Een differentiële test kopieert
  `rails/hooks/lib/*.mjs` van `origin/main` (`git show`) naar een tijdelijke map onder `os.tmpdir()` en laadt daar de
  oude `decide`.
  - Rijen:
    - het veld `commando` van `BASISSEN` en `TOEGESTAAN` uit `test/hooks/rolhek-aanvalscorpus.ts`;
    - het veld `tekst` van `COMMENTAAR_RIJEN` uit `test/hooks/shell-commentaar-rijen.ts`;
    - het veld `commando` van `PADCORPUS` uit `test/hooks/rolhek-padcorpus.ts`;
    - de vier #955-rijen uit AC-4, elk één keer en met hun `cwd` uit AC-4 (`/repo/a/b` voor de rij met
      `cd .. && cd ..`).
    `VORMEN` doet niet mee, want de omhulsels vervangen die. `AANVAARD` doet ook niet mee: een rij daarin is een
    basis uit `BASISSEN` in een vorm uit `VORMEN`.
  - Omhulsels, zeven per rij: `X`, `X # c`, `true && X`, `(X)`, `echo $(X)`, `cat <<E⏎$(X)⏎E` en `: <<'E'⏎E⏎X`.
  - Rollen: architect, developer, tester, reviewer en docs (`SUBAGENT_ROLES`), de hoofdsessie (geen `agent_type`) en
    een onbekende rol (`agent_type` `onbekend`).
  - Context: beide lezers krijgen per rij dezelfde ctx.
    - Een `BASISSEN`-rij met `ctx` krijgt die ctx, op dezelfde manier opgebouwd als in
      `test/hooks/rolhek-aanvalscorpus.test.ts`.
    - Een `PADCORPUS`-rij krijgt de ctx uit `voorafCtx(rij)`. `na` en `tmp` vallen weg.
    - Elke andere rij krijgt de vaste ctx uit de meettabel, met `netwerkvormen`.
  - Afbeelding van een uitslag: weigering (`deny`) > vraag (`ask`) > melding (`context`) > door (`allow` of geen uitslag).
  Per rij, omhulsel en rol vergelijkt `vergelijkUitslagen` (AC-3) de oude en de nieuwe uitslag. Elke bevinding maakt de
  test rood en noemt de rij, het omhulsel en de rol. Is `origin/main` onleesbaar, dan faalt een `expect` met de
  boodschap `draai git fetch origin`, geen throw (OV-7).
  De ingang `substitutions` (intern in `rolhek.mjs`) dekt AC-1 via `decide`. De omhulsels `echo $(X)` en
  `cat <<E⏎$(X)⏎E` zetten X alleen binnen een substitutie, dus een gemist segment blijkt als een zwakkere uitslag. Een
  export ervan zou op `main` ontbreken, en dan valt er op die ingang niets te vergelijken. Toets:
  `test/hooks/shell-lezer-differentieel.test.ts` (nieuw)
- **rolhek-leerpunten/AC-2** — Bewaking, het rood-bewijs loopt via AC-3. Dezelfde rijen en omhulsels gaan door twee
  lezingen: `parseCommands(s)` en `parseCommands(s, true)`, elk ook op elke body uit `heredocsBeide(s)`. Per lezing
  telt de test hoe vaak elk eerste woord voorkomt, en `vergelijkWoorden` (AC-3) vergelijkt oud met nieuw. Twee keer `cd`
  blijft dus twee keer `cd`, en twee lezingen die samenvallen geven geen vals rood. Het maximum over de lezingen vangt
  geen verlies op één ingang, zolang een andere lezing het woord nog ziet. Dat dekt AC-1 via de omhulsels. Toets:
  `test/hooks/shell-lezer-differentieel.test.ts` (nieuw)
- **rolhek-leerpunten/AC-3** — Nieuw gedrag, het rood-bewijs voor #955. `rails/hooks/lib/shell.mjs` exporteert twee
  vergelijkers:
  - `vergelijkUitslagen(oud, nieuw)`. `oud` en `nieuw` zijn `Map<string, 'deny' | 'ask' | 'context' | 'allow'>`, met als
    sleutel rij, omhulsel en rol, gescheiden door `␟`. De aanroeper zet "geen uitslag" als `allow` in de Map. Het
    resultaat is een lijst
    `{ sleutel, oud, nieuw }` voor elke sleutel waar `nieuw` lager staat dan `oud` in de afbeelding van AC-1. Een
    sleutel die in `nieuw` ontbreekt, is ook een bevinding, met `nieuw: undefined`.
  - `vergelijkWoorden(oud, nieuw)`. `oud` en `nieuw` zijn `Map<string, string[][]>`: per sleutel de lezingen, elk als
    een lijst eerste woorden. Het resultaat is een lijst `{ sleutel, woord, oud, nieuw }` voor elk woord waar het
    maximum aantal over de nieuwe lezingen kleiner is dan dat over de oude lezingen. Een sleutel die in `nieuw`
    ontbreekt, geeft per woord een bevinding met `nieuw: undefined`.
  Gevallen:
  1. Een decide-wrapper die voor één rol `deny` omzet in `ask` geeft voor `vergelijkUitslagen` een bevinding met de
     rij, het omhulsel en die rol in de sleutel.
  2. Een lezer die een tweede gelijk segment weglaat, geeft voor `vergelijkWoorden` een bevinding.
  3. Een lezer die niets na `#` ziet, geeft voor `vergelijkWoorden` een bevinding.
  4. Een sleutel die in `nieuw` ontbreekt, geeft bij elke vergelijker een bevinding met `nieuw: undefined`.
  5. De huidige `decide` en lezer als `oud` en als `nieuw` geven bij beide vergelijkers geen bevinding.
  Elke test begint met `expect(typeof ns.vergelijkUitslagen).toBe('function')` of
  `expect(typeof ns.vergelijkWoorden).toBe('function')`, dus op `main` is hij rood op een assertie. Toets:
  `test/hooks/shell-lezer-vergelijker.test.ts` (nieuw)
- **rolhek-leerpunten/AC-4** — Alleen regressie (groen op `main`, gemeten). De rijen
  `((true) ); #<<E⏎rm -rf .claude/hooks⏎E` en `echo ${x:-"}"}; rm -rf .claude/hooks` staan al in rolhek-herstel/AC-4.
  Twee rijen komen erbij, in een eigen `describe` in `test/hooks/shell-commentaar.test.ts`, met een `verdict` die `cwd`
  aanneemt:
  - `echo ${x:-"}"" <<'E'⏎$(rm -rf .claude/hooks)⏎E⏎"}`: `decide` geeft de hoofdsessie een vraag en een subagent een
    weigering;
  - `cd .. && cd .. && printf x > lefthook.yml # c` met `cwd` `/repo/a/b`: dezelfde uitslag als zonder `# c`.
  Ze komen niet in `test/hooks/shell-commentaar-rijen.ts`, want `test/hooks/shell-woorden-bash.test.ts` pint daar de
  lengte. Toets: `test/hooks/shell-commentaar.test.ts`
- **rolhek-leerpunten/AC-5** — Ctx: de vaste ctx uit de meettabel, met `netwerkvormen`.
  - Nieuw gedrag: `gh pr create --head chore/iets-uit-merge --title "fix: x" --body-file f.md` blijft voor de
    hoofdsessie geweigerd, nu met de #736-tekst.
  - Regressie, voor de hoofdsessie:
    - `git add test/scripts/pr-merge.test.ts`, `git add scripts/kit/pr-merge.mjs`,
      `git grep -n "pr:merge" -- docs/template/specs/templateregime.md` en `git branch --list 'chore/*'` gaan door;
    - `gh pr create --title "fix(merge): x" --body-file f.md` gaat door;
    - `gh pr merge 1`, `gh api -X PUT repos/o/r/pulls/1/merge` en `git merge main` blijven geweigerd, zonder de
      #736-tekst.
  Toets: `test/hooks/rolhek-merge-woord.test.ts` (nieuw)

PR 2, meldingen zonder verruiming (#962, #960, #958):

- **rolhek-leerpunten/AC-6** — `rails/hooks/lib/rolhek-context.mjs` vult `ctx.lokaleNetwerkvormen` met de lokale lijst
  uit Doel. Die lijst is de vereniging van beide bestanden. Een ontbrekend of onleesbaar bestand draagt niets bij, en
  een patroon ontbreekt alleen als het in geen van beide staat.
  - Nieuw gedrag: bij een geweigerde netwerkvorm vergelijkt het rolhek de geraakte groep patronen uit het anker met de
    lokale lijst. Ontbreekt er een, dan eindigt de weigering met de #962-tekst, die de ontbrekende patronen noemt.
  - Ticketrij: het anker heeft `git commit *`, en de settings in `CLAUDE_PROJECT_DIR` missen het. Dan geeft
    `printf 'x' > msg.txt && git commit -F msg.txt` de #962-tekst met `git commit *`.
  - Regressie:
    - `settings.json` heeft het patroon en `settings.local.json` ontbreekt: geen tekst;
    - alle patronen van de groep staan in de lokale lijst: geen tekst;
    - zonder `CLAUDE_PROJECT_DIR` is `ctx.lokaleNetwerkvormen` `undefined` en komt er geen tekst. Met
      `CLAUDE_PROJECT_DIR` is het altijd een array, eventueel leeg;
    - de uitslag blijft in alle gevallen een weigering.
  Toets: `test/hooks/rolhek-netwerkvorm-context.test.ts`
- **rolhek-leerpunten/AC-7**
  - Nieuw gedrag: `sessionStart(deps)` in `rails/hooks/lib/werkstraat.mjs` krijgt een nieuwe dep
    `deps.netwerkvormen = { anker, lokaal }`. `anker` is de lijst uit het anker, `lokaal` de lokale lijst uit AC-6 of
    `undefined` zonder `CLAUDE_PROJECT_DIR`. Ontbreekt lokaal een patroon, dan bevat de uitvoer de sessiestarttekst
    met de ontbrekende patronen. Op `main` faalt de test op `toContain`.
  - Ticketrij: de sessie start met `cwd` in een worktree, terwijl de settings in `CLAUDE_PROJECT_DIR` een patroon van
    het anker missen. De melding verschijnt.
  - Regressie: bij een volledige lokale lijst, of zonder `CLAUDE_PROJECT_DIR`, komt er geen melding.
  Toets: `test/hooks/werkstraat-netwerkvorm-drift.test.ts` (nieuw)
- **rolhek-leerpunten/AC-8**
  - Nieuw gedrag: wordt een netwerkvorm geweigerd in een commando met meer dan één segment (zoals
    `printf 'x' > msg.txt && git add a.ts && git commit -F msg.txt`), dan bevat de weigering "niets van dit commando
    is uitgevoerd".
  - Regressie: een los `MISE_STATE_DIR=… git commit -F msg.txt` blijft geweigerd, zonder die tekst.
  Toets: `test/hooks/rolhek-netwerkvorm.test.ts`
- **rolhek-leerpunten/AC-9**
  - Nieuw gedrag: elke weigering van `git cherry-pick`, `git apply`, `git format-patch` of `git merge` voor de
    developer eindigt met de #960-overnametekst, ongeacht de reden. Dat geldt ook voor de eigen weigering van merge
    (`git merge doet de hoofdsessie`). Gemeten rijen: `git cherry-pick abc1234`, `git apply p.patch` en `git merge feat/y`.
  - Regressie:
    - tester, reviewer en de hoofdsessie krijgen bij dezelfde commando's de tekst niet;
    - `git checkout abc1234 -- src/a.ts test/a.test.ts` gaat door, met `bestaand` `false` voor `test/a.test.ts`;
    - tegenrij: `git checkout abc1234 -- test/bestaand.test.ts` met `bestaand` `true` blijft geweigerd, met "is een
      bestaande test";
    - `git checkout abc1234 -- .claude/settings.json` en `git checkout abc1234 -- lefthook.yml` (zelfladend) blijven
      geweigerd;
    - `git format-patch -1 abc1234` gaat door.
  Toets: `test/hooks/rolhek-developer.test.ts`
- **rolhek-leerpunten/AC-10**
  - Nieuw gedrag: geeft `bestaand` `'zonder-origin'`, dan blijft de weigering van een Edit door de developer op
    `test/x/nieuw.test.ts`, met de #960-fetchtekst erachter.
  - Regressie:
    - met `bestaand` `false` (het bestand staat op schijf, is ongetrackt en staat niet op de tip van het anker of van
      `origin/main`) komt er geen "is een bestaande test";
    - met `bestaand` `true` blijft de weigering, zonder de fetchtekst.
  Toets: `test/hooks/rolhek-nieuwe-test.test.ts`
- **rolhek-leerpunten/AC-11** — Nieuw gedrag. `.claude/agents/developer.md` zegt dat tests en implementatie samen in één
  commit gaan: eerst tests schrijven is een volgorde van werken, geen volgorde van commits. Het bestand noemt daarbij
  `rolhek-leerpunten/AC-11`. Toets: `test/hooks/agent-teksten.test.ts`
- **rolhek-leerpunten/AC-12** — Nieuw gedrag. `.claude/agents/tester.md` en `.claude/agents/developer.md` noemen allebei
  `R-TOOL-03` en `inKooi`, in de regel die zegt dat een corpusrij alleen via een testbestand in de repo en `inKooi`
  draait, nooit via een eigen script buiten de repo. Dit is een structuurtoets op het R-id en de functienaam, niet op de
  zin (R-TEST-02). Toets: `test/hooks/agent-teksten.test.ts`

## Randgevallen

| Situatie | Gedrag |
|---|---|
| `origin/main` gelijk aan de werkmap | AC-1 en AC-2 zijn triviaal groen. AC-3 bewijst dat elke vergelijker kan falen: de strengheid via een zwakkere decide-wrapper, de woordtelling via een zwakkere lezer |
| Een latere verruiming die de eigenaar besloten heeft, maakt een rij in AC-1 minder streng | Geen uitzonderingslijst. De PR van die verruiming wijzigt de differentiële test met reden (R-TEST-02). Een rij stil laten vallen of overslaan mag niet; een ontbrekende sleutel is een bevinding (AC-3) |
| De sessie start zelf in een worktree | `CLAUDE_PROJECT_DIR` is die worktree en heeft de nieuwe settings: geen tekst, geen melding |
| Beide lokale settingsbestanden onleesbaar | De lokale lijst is leeg, dus elk patroon van de groep ontbreekt (AC-6). De weigering blijft |
| `git push -u origin HEAD` | Blijft geweigerd (Netwerkvorm, gemeten). Er komt geen nieuwe vorm bij |
| Een tester haalt een bestaand testgeval weg, met akkoord in een gemergede spec (#688) | Zoals nu: een weigering met de route van rolhek-herstel/AC-3. De hoofdsessie doet de wijziging en krijgt de vraag |
| `bash <script>` door een subagent | Gaat door zoals nu (R-ROL-10, aanvaard risico). Alleen de review van de diff en de instructie uit AC-12 dekken het |

## Raakt ook

- `rails/hooks/lib/rolhek.mjs`, `rails/hooks/lib/shell.mjs`, `rails/hooks/lib/rolhek-context.mjs` en
  `rails/hooks/lib/werkstraat.mjs`: kritiek werk (R-WERK-05). Deze spec-PR is de besluit-PR. De hoofdsessie bouwt
  daarna met akkoord van de eigenaar, en de eigenaar merget elke PR. Een hookwijziging werkt pas na de merge en in de
  volgende sessie (R-ROL-09).
- `.claude/agents/developer.md` en `.claude/agents/tester.md` (AC-11, AC-12): `voorReview`. De hoofdsessie schrijft met
  akkoord van de eigenaar.
- `docs/framework.md`: R-ROL-11 krijgt `gh pr create --head <branch met merge>` als valse positief (PR 1).
- `docs/ENVIRONMENT.md`, "Grens van de sandbox": de drift uit AC-6 en AC-7, met `CLAUDE_PROJECT_DIR` als bron (PR 2,
  R-WERK-15).
- Bestaande tests blijven ongewijzigd groen: `test/hooks/rolhek-aanvalscorpus.test.ts`,
  `test/hooks/rolhek-padcorpus-vooraf.test.ts` (alleen `voorafCtx` verhuist eventueel naar een gedeeld hulpbestand),
  `test/hooks/rolhek-testakkoord-melding.test.ts` (rolhek-herstel/AC-3, de route voor #688),
  `test/hooks/shell-woorden-bash.test.ts` en de bestaande gevallen in `test/hooks/shell-commentaar.test.ts`. Een
  gewijzigd geval noemt de PR met reden (R-TEST-02).
- Risicowerk (vertrouwensgrens, bewaking): de tester schrijft de tests vóór de bouw (R-WERK-04) en een aparte reviewer
  toetst na de bouw.
- Stappen voor de eigenaar zelf (de sandbox kan `.claude/settings.json`, `.claude/hooks/` en `.claude/skills/` niet
  schrijven):
  1. de besluit-PR mergen, akkoord geven voor de bouw op beschermde paden, en de bouw-PR's mergen;
  2. na PR 2 de `.claude/settings.json` van de hoofdcheckout bijwerken naar `main` (de directe oplossing van #962);
  3. `mise.toml` vertrouwen in elke nieuwe worktree (`docs/operations/agent-doorloop.md`, "Nieuw werk beginnen").

  De bouw raakt geen bestand onder `.claude/hooks/` of `.claude/skills/`. Moet dat toch, dan stopt de bouw en vraagt hij
  de eigenaar.
- Leerpunt-bewijs per PR (`## Leerpunt`, R-WERK-13, `scripts/kit/leerpunt-bewijs.mjs`). Elk bewijsbestand is rood op de
  merge-base op een assertie, en groen op de head.
  - `scripts/kit/leerpunt-bewijs.mjs` kopieert alleen het bewijsbestand zelf naar de basis. Een bewijsbestand
    importeert dus alleen modules die op de merge-base al bestaan. Het gedeelde hulpbestand voor de ctx-bouwers mag
    alleen `shell-lezer-differentieel.test.ts` importeren.
  - Een bewijstest roept een bestaande export aan met de signatuur die op `main` al bestaat, zoals `sessionStart(deps)`
    en `decide(payload, ctx)`. Dan faalt hij op de basis op een `expect`, niet op een throw.
  - PR 1:
    - #955: alleen `test/hooks/shell-lezer-vergelijker.test.ts` (AC-3). `shell-lezer-differentieel.test.ts` is geen
      bewijsbestand: op de basis zou die een TypeError geven, en die telt als laadfout.
    - #736: `test/hooks/rolhek-merge-woord.test.ts`, rood via de nieuwe tekst uit AC-5.
  - PR 2:
    - #962: `test/hooks/werkstraat-netwerkvorm-drift.test.ts` (AC-7);
    - #960: `test/hooks/rolhek-developer.test.ts` (AC-9);
    - #958: `test/hooks/agent-teksten.test.ts` (AC-12).
  - #688: de hoofdsessie sluit hem als opgelost (`gh issue close --reason completed`). Eerst plaatst ze een comment
    `opgelost:` dat verwijst naar `test/hooks/rolhek-testakkoord-melding.test.ts` (rolhek-herstel/AC-3) en naar het
    eigenaarbesluit OV-1.

## Buiten scope

- Een volledige bash-parser of het vervangen van `shell.mjs`.
- Een regel in het rolhek per programma (`bash`, `sh`, `node` met een script); zie OV-4 en R-ROL-10.
- Cherry-pick, apply of merge toelaten voor een subagent (OV-5).
- Commits uit de sandbox zonder de eigenaarstap uit Raakt ook (OV-6).
- Een testakkoord uit een gemergede spec automatisch erkennen (#688, OV-1): geen ankerformaat en geen ADR.
- Sandboxinstellingen op gebruikersniveau (`~/.claude/settings.json`) lezen: dat bestand valt buiten de repo.

## Testplan

Na de merge van deze besluit-PR volgen twee bouw-PR's, PR 1 vóór PR 2. De differentiële test uit PR 1 bewaakt de
wijzigingen aan het rolhek in PR 2, ook op het netwerkvormpad, want de vaste ctx bevat `netwerkvormen`.

- PR 1 (aanscherpen): AC-1 tot AC-5. Lokaal `pnpm test:unit`, `pnpm lint`, `pnpm typecheck` en `pnpm ratchet`. In CI:
  `gate:fast`.
- PR 2 (meldingen): AC-6 tot AC-12, met dezelfde checks. In de PR staat de stap voor de eigenaar uit Raakt ook.
- Nieuw gedrag: de tester draait de nieuwe assertie eerst tegen `main` en noemt in de PR de falende `expect`. Een
  importfout of throw telt niet als rood.
- Regressie: de PR noemt de regressierijen per AC, zonder rood-eis.
- Corpusrijen draaien alleen in het proces via `decide`, of via `inKooi` (R-TOOL-03). Nooit met `bash <bestand>`.
