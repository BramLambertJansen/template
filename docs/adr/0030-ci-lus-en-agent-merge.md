# 0030 — CI-lus tot groen en optionele agent-merge na akkoord

Status: voorgesteld

Vervangt het alternatief "Auto-merge na groen: verworpen (E-2)" uit [0025](0025-werkstraat-tot-de-merge.md) en wijzigt 0025 punt 6
(mergen dicht voor de hoofdsessie) voor één exacte vorm. Besluiten van de eigenaar: 2026-10-12 (E-2 herzien) en 2026-10-14 (punten 1–6 hieronder).

## Context

ADR 0025 gaf de hoofdsessie stap 6 "Opleveren" (framework §8), met een CI-lus maar zonder stopregel; de skill `opleveren` (plan WS-04b,
`docs/reviews/2026-10-12-werkstraat.md` WS-04 punt 1) bestaat nog niet. CLAUDE.md "Stoppen en vragen" zegt "na twee mislukte
correctiepogingen: stop", wat een CI-lus na twee rode rondes afbreekt. Mergen is voor elke rol dicht: `ghForbidden` in
`.claude/hooks/lib/rolhek.mjs` (`gh pr merge` ook `--auto`, `gh api …/merge`, GraphQL-merge) en deny-regels `Bash(gh pr merge*)` en
`Bash(gh api *merge*)` in `.claude/settings.json`. De eigenaar wil per PR kunnen kiezen om de agent te laten mergen, zonder dat de
agent zichzelf dat akkoord kan geven.

## Besluit

1. **CI-lus tot groen** (binnen 0025 stap 6, skill `opleveren`). Na de PR: `gh pr checks <nr> --watch`. Rood →
   `gh run view <run-id> --log-failed`, fixen, committen, pushen, opnieuw, tot alles groen is. Geen vast aantal rondes.
   Stoppen en de eigenaar vragen bij: (a) de fix zou een regel, check, hook of test afzwakken; (b) dezelfde fout drie keer achter
   elkaar; (c) een oorzaak buiten de code (runner, GitHub-storing); (d) een gate-pad of beschermd pad moet wijzigen.
   Na de review gemaakte fixes bekijkt de reviewer opnieuw met `git diff <reviewer-sha>..HEAD`. De lus leeft alleen binnen de
   sessie: geen timer, token of credentialwerk (0025 W-3 blijft uitgesteld). CLAUDE.md krijgt een uitzondering op "na twee
   mislukte correctiepogingen" voor deze lus; stopgrond (b) vervangt dan plan WS-04 punt 9 ("3 fix-rondes of 2 identieke fouten").
2. **Merge-modus als instelling.** Nieuwe sleutel in `.claude/gates.json`: `merge: "eigenaar" | "agent-na-akkoord"`; ontbreekt hij,
   dan geldt `"eigenaar"`. `.claude/**` is een gate-pad, dus alleen de eigenaar zet hem. `check-docs` faalt op een andere waarde.
3. **Akkoord per PR, in de sessie (O-1a).** Bij `"agent-na-akkoord"` gaat het rolhek alleen voor de hoofdsessie van `deny` naar `ask`
   voor exact `gh pr merge <nr> --squash`: de permissieprompt is het akkoord, de agent kan hem niet zelf beantwoorden. Elke andere vorm
   blijft deny voor elke rol: andere of extra vlaggen (`--auto`, `--admin`, `--merge`, `--rebase`, `--delete-branch`), `gh api …/merge`,
   GraphQL-merge, force-push. Subagents blijven deny. Bij `"eigenaar"` verandert er niets.
4. **Voorwaarden vóór de merge** (skill `opleveren`): de instelling staat aan; de eigenaar gaf in de sessie akkoord voor dit PR-nummer;
   de reviewer zag de huidige head; alle checks zijn groen; de PR raakt geen gate-pad.
5. **De harde grens is GitHub.** De ruleset op `main` eist groene checks; een PR met `gate-wijziging` eist via de diff-guard een
   eigenaarreview op de head-SHA, die de agent niet kan zetten (`gh pr review` en labels blijven verboden); spec `goedgekeurd` en
   ADR `geaccepteerd` blijven van de eigenaar (0027 punt 1).
6. **Uitvoering in twee PR's**, beide gate-wijzigingen die de eigenaar leest en merget; geen spec (geen migratie, route of permissie).
   PR 1, CI-lus: skill `opleveren`, framework §8 stap 6, CLAUDE.md-uitzondering. PR 2, merge-modus: eerst tabeltests in
   `test/hooks/`, dan het rolhek, de sleutel in `.claude/gates.json` met `check-docs`, framework §8 stap 6/7 en §10 "De eigenaar
   merget", AGENTS.md "merge nooit", CLAUDE.md werkstraat.

## Alternatieven

- **Auto-merge na groen (`--auto`)**: blijft verworpen; GitHub mergt dan zonder moment waarop de eigenaar deze head ziet.
- **Akkoord via label of PR-comment**: verworpen; de agent pusht onder het account van de eigenaar en kan die zelf zetten.
- **Vast maximum aan CI-rondes**: verworpen; de stopgronden in punt 1 zijn inhoudelijk, niet tellend.
- **Merge-modus per sessie in plaats van in `gates.json`**: verworpen; de instelling moet als gate-pad bij de eigenaar blijven.

## Gevolgen

- **Restrisico identiteit.** Tot de GitHub App bestaat, pusht en mergt de agent onder het account van de eigenaar (ADR 0017,
  overgang): een label, comment of merge in GitHub is niet te onderscheiden van de eigenaar. Ook de diff-guard geeft dan
  `overgang` (groen met waarschuwing) als auteur en goedkeurder dezelfde zijn (`scripts/kit/diff-guard.mjs`, `beoordeel`); de
  eigenaarreview uit punt 5 dwingt GitHub in die fase dus niet af. "PR raakt geen gate-pad" rust dan op de skill en het rolhek.
- **Restrisico hook.** Het rolhek is fail-open (framework §8: exit 1 of timeout laat door). De permissieregels in `.claude/settings.json`
  moeten in PR 2 mee: een deny-regel daar gaat vóór de `ask` van de hook. Voorstel: `Bash(gh pr merge*)` van `deny` naar `ask`, de
  overige merge-vormen in `deny`, zodat een falende hook nog steeds op een prompt uitkomt.
- **`--admin`** omzeilt de ruleset voor een beheerder; het account van de eigenaar is dat. Het rolhek staat alleen de exacte vorm uit
  punt 3 toe en behandelt `--admin` expliciet als deny, met een tabeltest.
- ADR 0027 "Vertrouwensgrens" ("main berust op de afspraak dat alleen de eigenaar merget") geldt bij `"agent-na-akkoord"` als: alleen
  de eigenaar geeft per PR akkoord. 0025 en 0027 krijgen een verwijsregel; hun besluiten blijven verder staan.

## Niet beslist

- `gh pr checks --watch` (punt 1) of `pnpm pr:verify <nr> --watch` (ADR 0027 punt 6, controleert SHA, branch en dat de check van
  GitHub Actions komt): welke de lus gebruikt, en of `pr:verify` een voorwaarde uit punt 4 is.
- Leest het rolhek `merge` uit de werkmap of uit `origin/main`, zoals `autoRunner` (ADR 0027 punt 6)?
- Welke voorwaarden uit punt 4 het rolhek technisch toetst (bijv. "raakt geen gate-pad" via de diff met `origin/main`) en welke alleen
  de skill: in de overgangsfase is het rolhek de enige technische toets op gate-paden.
- De ruleset is niet als code aanwezig (`.github/settings/` bevat alleen `.gitkeep`) en `scripts/check-github.mjs` bestaat niet; de
  agent kan niet bewijzen dat "groene checks verplicht" actief is. Moet `"agent-na-akkoord"` dat bewijs eisen?
