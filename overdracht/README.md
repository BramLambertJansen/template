# Overdracht ADR-consolidatie (2026-10-22)

Deze branch (`wip/overdracht-adr`) bevat alleen overdrachtsbestanden; niet mergen. Op een andere machine:
`git fetch origin wip/overdracht-adr fix/a4-codex-review` en lees `overdracht/` met `git show origin/wip/overdracht-adr:overdracht/README.md`.
Het geheugen van de vorige sessie staat in `overdracht/geheugen-adr-consolidatie.md` (lokaal geheugen reist niet mee); het
contract in `overdracht/contract-a4.md`, de nummermapping oud→nieuw in `overdracht/verwijs-brief.md`. Paden onder `/tmp` en
`/home/bmj` hieronder gelden voor de oude laptop; worktrees en `node_modules` maak je opnieuw.

Ga verder met de ADR-consolidatie. Begin met `node scripts/kit/feiten.mjs` en lees `overdracht/geheugen-adr-consolidatie.md`. Werk in schone worktrees in $TMPDIR (niet in de hoofdcheckout); `git worktree add --no-track` (de sandbox kan .git/config niet locken; ook `git checkout -b` faalt half — gebruik `git branch` + `git symbolic-ref HEAD`). `pnpm` start niet in de sandbox: roep scripts direct aan met node en binaries uit /home/bmj/template/node_modules/.bin (tijdelijke `node_modules`-symlink in de worktree; de tester mag die niet zelf leggen, de hoofdsessie wel; daarna weghalen). Draai `tsc -b` (niet alleen `tsc -p .`): CI `check:new-resource` gebruikt `tsc -b`.

## Stand (2026-10-22, middag)
- Gemerged: #258, #259, #260 (verwijs-PR's), #262? (roadmap-item rolhek-gat via interpreters — controleer), #264 (A4: herschrijven/verwijderen in een besluit-PR; gemerged op 2a13847, dus zónder de Codex-fixes).
- Op main ook nieuw (andere sessie/eigenaar): ADR 0053 (afgesloten ADR's verhuizen byte-gelijk naar `docs/adr/archief/`), 0054 (gebouwd in de bouw-PR), 0055 (testregisters per resource), #267. **Lees 0053 eerst**: het besluit verhuizen naar archief/ in plaats van verwijderen, en staat renames naar `archief/` toe — dat botst mogelijk met de guard-regel uit #264/G3 (rename van een ADR met eigenaarstatus geweigerd) en met stap 3 hieronder. Leg de verhouding verwijderen ↔ archiveren aan de eigenaar voor voordat je verder bouwt.

## Open: branch `fix/a4-codex-review` (gepusht, head 10732ef, nog GEEN PR)
Vier commits bovenop origin/main 054cc4d (cherry-picks): tests + fixes voor de Codex-review van #264 (alle P2):
- B5: kopnummer mag bij herschrijven niet wijzigen (`isHerschrijving`).
- G5: een nieuwe herzieningsregel moet `(#<PR_NUMBER>)` op de vaste plek dragen; zonder geldig PR_NUMBER faalt een herschrijving dicht.
- G6: een toegevoegd ADR mag geen nummer krijgen dat in de geschiedenis van de basis verwijderd is (`verifyNummerVrij`, git log --no-renames --diff-filter=D; faalt dicht als de log onleesbaar is).
- G7: na het verdwijnen van een ADR-pad (D of bron van R, ook voorgesteld) moet elke overgebleven `vervangen door NNNN` nog naar een bestaand ADR wijzen (`verifyVervangersBestaan`).
Contract: overdracht/contract-a4.md (aanvulling onderaan). Lokaal op 10732ef: tsc -b 0, eslint, prettier, vitest unit 3229/3229.
Reviewer heeft 2a13847..7676a89 gereviewd (één blokkerende G7-bevinding, opgelost in 050768b→10732ef). **Nog te doen:** reviewer op `7676a89..050768b` (oude sha's; op de nieuwe branch 9db025e..10732ef), controleer of G6/G7 botsen met ADR 0053 (archief-verhuizing = rename uit docs/adr/ naar docs/adr/archief/: G7 ziet de bron van een R als verdwenen ADR — klopt dat met 0053?), dan PR openen (titel bijv. "fix(rails): address Codex review on A4 guard"), in de PR-tekst: Codex-bevindingen, gewijzigde bestaande tests (follow-up-kit `draaiChecker(..., extra)`, slaagt/faalt-helpers met optionele env; G1-tests krijgen PR_NUMBER=262), beschermde paden (rails/**, scripts/**), CI tot groen (`node scripts/kit/pr-verify.mjs <nr> --watch` vanuit de worktree).
Op de remote staat ook nog `feat/adr-herschrijven` (head 050768b), per ongeluk opnieuw aangemaakt na de merge van #264: niet gebruiken; de eigenaar kan hem verwijderen.

## Daarna (oorspronkelijk plan, eerst afstemmen met 0053)
1. Besluit-PR: ADR 0046 punt 2 herschrijven volgens het eigenaarbesluit (herzieningsregel `Herzien: JJJJ-MM-DD (#NNN): wat` met het eigen PR-nummer).
2. De 13 ADR's zelfstandig maken (bekende gaten: 0045 punt 19 mist rechtenlijst/sleutelpad/tokenscript GitHub App uit 0017 OV-5 — en docs/nieuwe-app.md:361 "(was 0017 OV-5)" achter "punt 19"; 0042 verwijst naar 0012 voor bewijs/meting; 0050 mist bouwvolgorde 0020; 0047 mist afwegingen per OV uit 0016; 0051 mist delen van 0021 Gevolgen/Tests; 0046 verwijst zonder link naar "het ADR dat 0009/0031/0032/0033 vervangt" (0044/0045); 0029 punt 7 (1)–(8) alleen in 0029). Eigenaarakkoord: ADR 0052 (accountstatus) gaat op in 0043, spec accountstatus-en-laatste-login.md mee omzetten. Reviewer per oud ADR laten bevestigen dat niets ontbreekt.
3. Oude ADR's 0001–0038 en 0039-lokale weg (of naar archief/ volgens 0053); `docs:adr:0039:dubbel` uit `.kit/baseline.json`; historische links om; `test/rails/mandate-follow-up-docs.test.ts:42/84` leest docs/adr/0027-…; spec agent-merge.md achterhaald (AC-18, B8, AC-33) — aparte herziening voorleggen. Let op (reviewer): de besluit-PR mag alleen docs/adr/, docs/specs/ en het record raken, dus links vanuit andere docs eerst in een aparte PR omzetten.

## Opruimen voor de eigenaar (buiten de sandbox)
```sh
cd /home/bmj/template && git restore .claude   # 10 bestanden bleven oud na een mislukte checkout
git worktree prune
```
