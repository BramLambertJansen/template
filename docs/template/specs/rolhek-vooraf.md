---
status: goedgekeurd
namespace: rolhek-vooraf
---

# Rolhek vooraf: corpus, vangnetten per segment, zelfladende paden

## Doel

De levende toets vooraf van het rolhek op Bash-commando's in één spec, na het verwijderen van spec
rolhek-vooraf-krimp (vervallen) (ADR 0071, 0082, 0083, 0086, 0091 punt 2 en 3). Het gedrag bestaat al; deze spec verandert
het niet.

## Rollen en wie wat ziet

Het rolhek, voor de hoofdsessie en de subagents developer, tester, reviewer, architect, docs en een onbekende subagent (telt
als reviewer, R-ROL-02). Geen app-gebruikers.

## Kopieer de vorm van

- `rails/hooks/lib/zelfladend.mjs` — de vaste lijst en de weigering per rol
- `test/hooks/rolhek-padcorpus.ts` — het corpus van padbeslissingen

## Hergebruik en UX

Geen UI. De meldingen van `rails/hooks/lib/zelfladend.mjs` blijven letterlijk zoals nu, alleen de specverwijzing wordt
`(spec rolhek-vooraf AC-3)`.

## Acceptatiecriteria

- **rolhek-vooraf/AC-1** — Corpus. Elke padbeslissing van het rolhek over een Bash-commando staat als rij in
  `test/hooks/rolhek-padcorpus.ts` (commando, rol, beginstand, uitkomst `deny`, `ask`, melding of doorlaten); `decide`
  (PreToolUse) geeft voor elke rij de vastgelegde uitkomst. De velden `achteraf`, `reden` en `alsVeranderd` tellen niet (de
  toets achteraf is weg, ADR 0091). Bewijs nu: `test/hooks/rolhek-padcorpus-vooraf.test.ts:44`.
- **rolhek-vooraf/AC-2** — Vangnetten per segment (ADR 0083 punt 3; leerpunten #583, #587). `globForGh`, `SHELL_EXPANSION`,
  `GH_SUBCOMMAND` naast een geëxpandeerd argument en `hiddenCommandWord` in `rails/hooks/lib/rolhek.mjs` toetsen per segment
  van `parseCommands`, alleen woorden die de shell echt expandeert: (a) het gh-subcommando telt alleen in hetzelfde segment
  als het geëxpandeerde argument; na `cd $TMPDIR` is de werkmap onbekend, de hoofdsessie krijgt dan hooguit een `ask` met de
  melding van AC-3, geen `deny`; een subagent houdt de weigering `subagent: gh, de GitHub-API of git credential alleen als één
  direct gh-leescommando zonder shell-trucs`; (b) een woord tussen aanhalingstekens is geen glob, brace-expansie of
  POSIX-klasse, in een commando zonder `#`, `${`, `$'`, `$(`, `((`, backtick, `\` of newline; (c) een patroon zonder geldige
  tekenklasse (`[z-a]`, een `[` zonder sluitende `]`) is letterlijk en geeft geen interne fout; een `]` direct na `[`, `[!` of
  `[^` hoort bij de klasse; een negatie is hoofdlettergevoelig; (d) een woord dat begint met `$TMPDIR/`, `"$TMPDIR/` of
  `"$TMPDIR"/`, of dat precies `$TMPDIR`, `${TMPDIR}` of `"$TMPDIR"` is, is letterlijk als `TMPDIR` nergens anders in het
  commando staat (`TMPDIR_VOORAAN` in `rails/hooks/lib/shell.mjs`); (e) een `for`-lus waarvan elk segment een programma uit
  `EXPANSION_SAFE` of git met een lezend subcommando start, gaat door. Blijven weigeren: `$G pr merge`, `${x}h`,
  `$(echo gh)`, `g[h]`, `{g,x}h`, `[[:alpha:]]h`, `env -S`. Bewijs nu: `test/hooks/rolhek-gh-allowlist.test.ts:735`, `:1209`,
  `:1222`, `:1246`, `:1264`; `test/hooks/rolhek-zelfladend.test.ts:244`, `:330`.
- **rolhek-vooraf/AC-3** — Zelfladende paden (ADR 0071 punt 2, ADR 0082). `zelfladend` in `.claude/gates.json` is precies
  `.git/**`, `.claude/hooks/**`, `!.claude/hooks/.cache/**`, `.claude/settings.json`, `lefthook.yml`, `.pnpmfile.cjs`. Een
  redirectdoel of schrijfwoord (alle argumenten, behalve bij `cat`, `head`, `tail`, `ls`, `stat`, `wc`, `diff`, `grep`, `rg`,
  `jq`, `sed` zonder schrijfvorm, en bij een lezend git-subcommando alleen de waarden van `-o`/`--output`) dat letterlijk, als
  glob volgens bash zonder `dotglob` (ook POSIX-, equivalentie- en collatieklassen; een klasse met een benoemd deel of een
  escape valt dicht) of via git-pathspec-magie naar zo'n pad wijst: onder `.git/**` `deny` voor elke rol (R-ROL-03), anders
  `deny` voor een subagent en `ask` voor de hoofdsessie. Hetzelfde voor kopiëren (recursief of een risiconaam), verplaatsen,
  wissen, uitpakken of `find -delete`/`-exec` naar of op een map boven zelfladende paden (`.`, `.claude`, de root, `..`), voor
  `git rm`/`git mv` daarboven, `git sparse-checkout`, git met `--work-tree`/`--git-dir`, en een schrijvend commando na een `cd`
  naar een onbekende map. Git dat de werkmap schrijft (`checkout`, `switch`, `restore`, `reset`, `stash`, `apply`, `am`,
  `cherry-pick`, `merge`, `pull`, `rebase`, `revert`, `read-tree`, `checkout-index`): voor een subagent alleen met expliciete
  paden buiten de lijst of als branchwissel zonder paden, anders `deny`; voor de hoofdsessie `ask` bij een map erboven of een
  glob. `git rm --cached` en `git restore --staged` zonder `--worktree` gaan door. Elke melding noemt
  `(spec rolhek-vooraf AC-3)`. Bewijs nu: `test/hooks/rolhek-zelfladend.test.ts:41`, `:80`, `:213`, `:269`, `:359`, `:378`,
  `:390`, `:402`, `:423`, `:454`, `:526`; `test/hooks/shell-glob-klasse-bash.test.ts` (de describes rond `:315` en `:392`).
- **rolhek-vooraf/AC-4** — Aangehaalde heredoc (ADR 0086; leerpunt #619). `substitutions()` slaat de body over van een heredoc
  met aangehaalde delimiter (`<<'E'`, `<<"E"`, `<<\E`, ook `<<-`), op de bodybereiken die `tokenize` in
  `rails/hooks/lib/shell.mjs` teruggeeft (`{start, end, gesloten, aangehaald}`); zonder sluitregel telt de body als
  niet-letterlijk, en alleen een `<<` op commandoniveau opent een body (niet in `(( … ))` of `[[ … ]]`). Doorgelaten voor elke
  rol: `cat > f <<'EOF'` met `` `g*.md` `` of `$(rm -rf x)` in de body, `git commit -F - <<'EOF'` met Markdown-code. Blijft
  toetsen: onaangehaalde delimiter, `<<$x`, body zonder sluitregel, sluitregel met spatie of `\r`, `<<<`, de rest van de
  operatorregel, `<<'E'` binnen aanhalingstekens of commentaar, een commando ná de sluitregel; een body met `gh pr merge` blijft
  geweigerd. De differentiële test draait de vormen in echte bash. Bewijs nu: `test/hooks/rolhek-gh-allowlist.test.ts:1285`.
- **rolhek-vooraf/AC-5** — Geplant `.git/commondir` (ADR 0083 punt 1; leerpunt #553). De stub-lader (`.claude/hooks/laden.mjs`)
  controleert vóór de eerste git-aanroep: is `.git` een map en bestaat `.git/commondir` (ook als symlink of map), of geeft
  `lstat` een andere fout dan ENOENT, dan doet de hook geen git-aanroep, hernoemt hij het pad naar
  `.git/commondir.geplant-<tijd>` en meldt dat; PreToolUse, PostToolUse, Stop en SubagentStop geven `decision: block`,
  SessionStart en Notification melden alleen. Zonder `.git`-map, in een gekoppelde worktree of zonder `commondir` hernoemt hij
  niets. Bewijs nu: `test/hooks/laden-commondir.test.ts:163`.
- **rolhek-vooraf/AC-6** — Startvorm. `git fetch origin main && git switch --no-track -c <naam> origin/main` gaat voor elke rol
  door; `VERSE_MAIN_MELDING` in `rails/hooks/lib/verse-main.mjs` en `sessionStart` bij `Branch: main` noemen alleen die vorm,
  zonder `checkout -b`, `git branch` of `worktree add`; het rolhek laat die varianten wel toe. Bewijs nu:
  `test/hooks/rolhek-verse-main.test.ts:210`; de test "session-start op main" in `test/hooks/werkstraat.test.ts`.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `cd $TMPDIR && gh issue list` (hoofdsessie) | geen `deny`; een `ask` alleen met de melding van AC-3 (AC-2 a) | n.v.t. |
| `echo x > .gi[t]/config` | `deny` voor elke rol (AC-3) | n.v.t. |
| `rm -rf .claude` (hoofdsessie) | `ask` (AC-3) | n.v.t. |

## Raakt ook

Niets aan gedrag. De bouw hernoemt describes en testnamen naar deze AC-id's en zet de specverwijzingen in
`rails/hooks/lib/zelfladend.mjs`, `rails/hooks/lib/shell.mjs` en `rails/hooks/lib/rolhek.mjs` om (spec
vervallen-documenten-weg, PR 1). Geen migratie, route, permissie of resource: niet `check:migrations`, `check:secdef`,
`test:db`, `test/security/resources.ts`.

## Buiten scope

De leeslijst in schaduw of aan (S2, S3), `denyWrite` en de metingen uit spec rolhek-vooraf-krimp (vervallen): vervallen door
ADR 0082 (Herzien 2026-11-17) en ADR 0091 punt 3.

## Testplan

Geen nieuwe tests: de bestaande tests per AC dragen het nieuwe AC-id (R-TEST-02: alleen naam en commentaar wijzigen, de
verwachtingen niet).

## Open vragen

- **OV-1 ✅ besloten** (eigenaar 2026-11-19: de aanbeveling) — Volgen de AC-nummers de oude? Aanbeveling: nee, eigen nummering; de oude AC-3 blijft AC-3, zodat de meldingen en
  de test die `AC-3` in de melding eist (`test/hooks/rolhek-gh-allowlist.test.ts:756`) ongewijzigd blijven.
