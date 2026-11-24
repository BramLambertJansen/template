---
soort: opgelost
---

- Het rolhek leest `#` zoals bash (spec `rolhek-vangnet-herstel`, `rails/hooks/lib/shell.mjs`): een commentaar begint ook
  direct na een operator (`cat;#<<EOF`), en `#` binnen `${…}`, `$[…]`, backticks en `(( … ))` is geen commentaar meer.
  Zo verdween een commando als `rm -rf .claude/hooks` niet meer uit het zicht van het rolhek (leerpunten #603, #617).
  Waar de nieuwe en de oude lezing kunnen verschillen, neemt `parseCommands` de vereniging van beide, zodat de lezer nooit
  minder ziet dan voorheen.
  Een differentiële test tegen echte bash in de kooi bewaakt dit (`test/hooks/shell-woorden-bash.test.ts`).
- Een zoekopdracht van de reviewer (`gh pr list --search`, `gh issue list --search`, `gh api "search/issues?q=…"`) weigert
  een losse `OR`, `AND` of `NOT` en `repo:`, `org:` of `user:`, via één gedeelde toets `zoekScopeFout` (leerpunt #947).
- Een subagent die een bestaande test wil verwijderen, skippen of inkorten, krijgt in de weigering de route: de
  hoofdsessie doet het als een gemergede spec het akkoord noemt (leerpunt #688, `.claude/agents/tester.md`).
