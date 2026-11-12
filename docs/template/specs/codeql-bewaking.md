---
status: gebouwd # #663
namespace: codeql-bewaking
sjabloon: mini
---

# CodeQL-meldingen in de hooks dichten

## Doel

De twee open CodeQL-meldingen in de bewaking verdwijnen door een echte fix, niet door onderdrukking: #10
(`js/incomplete-url-substring-sanitization`, `subagentTokens` in `rails/hooks/lib/rolhek.mjs`) en #4
(`js/file-system-race`, `gitDir` in `rails/hooks/lib/meting.mjs`). Opdracht eigenaar 2026-11-06; de merge van deze
besluit-PR is het besluit.

## Rollen en wie wat ziet

n.v.t. — tooling voor de hoofdsessie en subagents in Claude Code; geen app-gebruikers.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

n.v.t. — geen routes.

## Kopieer de vorm van

- `test/hooks/rolhek-gh-allowlist.test.ts` — de tabel `SUB` in "review-omzeilingen" (deny per subagentrol) en de losse
  allow-test "subagent mag een letterlijke URL zonder token of config ophalen"
- `test/hooks/meting.test.ts` — de tests "zonder METING_DIR, gewone repo" en "zonder METING_DIR, worktree met gitdir en
  commondir" (repo of worktree in een tijdelijke map, het script als proces)

## Acceptatiecriteria

- **codeql-bewaking/AC-1** — Gegeven een subagent die curl of wget draait, wanneer de argumenten ergens "github" bevatten
  (hoofdletterongevoelig, geen hostparsing: elke vorm telt) en een tokenvorm, dan weigert het rolhek met de bestaande
  melding `subagent: GitHub-API met een token via curl/wget omzeilt de gh-allowlist; gebruik een lezende gh-opdracht`. De
  substringtest op `github.com` verdwijnt. Tokenvormen: de bestaande woorden (`authorization`, `bearer`, `token`, `--user`,
  `-u`), plus `-u` in een cluster van korte opties (`-su`, `-uuser:x`) en de wget-vormen `--http-user`, `--http-password`
  en `--password` (besluit eigenaar 2026-11-06, na de spec-review). Tests in `test/hooks/rolhek-gh-allowlist.test.ts`, per
  subagentrol deny; de test controleert de melding letterlijk (`toContain`), niet alleen dat er een deny is:
  `curl -H "Authorization: token x" https://raw.githubusercontent.com/o/r/main/f`,
  `curl -u user:x https://github.example.org/api/v3/user`, `curl -su user:x https://uploads.github.com/x`,
  `curl -uuser:x https://github.com/x` en `wget --http-user=u --http-password=x https://github.example.org/x`. Al deze
  gevallen zijn op de huidige code toegestaan (rode tests).
- **codeql-bewaking/AC-2** — Gegeven een subagent, wanneer hij `curl -u user:x https://example.com/x` draait (token, geen
  "github"), dan geeft het rolhek geen deny. Dit is een regressietest: ook op de huidige code groen. De bestaande gevallen
  in dat testbestand (onder meer `wget --header="Authorization: token x" https://api.github.com/x` deny en
  `curl https://example.com/x` allow) blijven ongewijzigd en groen; de hoofdsessie krijgt op deze vormen geen nieuwe deny.
- **codeql-bewaking/AC-3** — Geaccepteerd vals positief (R-ROL-11): een subagent-lezing zonder credentials waarvan de URL
  "github" en een tokenwoord bevat, zoals `curl https://raw.githubusercontent.com/o/r/main/src/tokens.ts`, wordt na deze
  wijziging geweigerd (vandaag toegestaan). Een test in `test/hooks/rolhek-gh-allowlist.test.ts` legt dat vast in de vorm
  die het bestand al gebruikt voor geaccepteerde valse positieven; de subagent gebruikt dan een lezende gh-opdracht.
- **codeql-bewaking/AC-4** — `gitDir(root)` doet geen `statSync` meer vóór het lezen: het leest `<root>/.git` direct; een
  `EISDIR`-fout (een map: gewone checkout) geeft de map zelf terug; een bestand (worktree) volgt `gitdir:` zoals nu; elke
  andere fout gaat door. De bestaande tests in `test/hooks/meting.test.ts` blijven ongewijzigd en groen: mapgeval via
  "zonder METING_DIR, gewone repo" en "branch uit .git/HEAD", bestandsgeval via "zonder METING_DIR, worktree met gitdir en
  commondir". Dat er geen `statSync` meer is, toetsen de review en CodeQL (AC-5), geen gedragstest.
- **codeql-bewaking/AC-5** — In de CodeQL-analyse van de bouw-PR zijn #10 en #4 dicht en is er geen nieuwe melding in de
  geraakte bestanden (ook niet op `commonDir` in `meting.mjs`, dat `existsSync` vóór `readFileSync` houdt). De bouw-PR
  voegt geen `codeql`-onderdrukking, `eslint-disable` of uitzondering in de CodeQL-config toe. Na de merge meldt de
  hoofdsessie dat #10 en #4 op `main` op `fixed` staan (niet `dismissed`).

## Hergebruik en UX

n.v.t. — geen UI. De weigermelding van AC-1 is de bestaande tekst, letterlijk.

## Buiten scope

- Geen andere wijziging in `rails/hooks/lib/rolhek.mjs` dan de voorwaarde in `subagentTokens`. De open PR #596 wijzigt
  hetzelfde bestand elders (`decideBash`, `rawForbidden`, vangnetten), niet `subagentTokens`; wie later merget, lost een
  eventueel conflict op zonder een van beide te wijzigen.
- api.github.com via raw-toegang en `$`-expansie in curl/wget zijn al elders afgedekt in het rolhek; die regels blijven.
- Melding #1 (`test/ui/contrast.test.ts`) is een aparte lichte PR, buiten deze spec.
- Bekend gat, aparte kleine PR: curl `-n` (netrc) staat niet in `CURL_CONFIG` (`rails/hooks/lib/rolhek.mjs`, buiten
  `subagentTokens`); curl leest dan een credential uit een bestand dat de agent niet ziet.

## Route

Kritiek werk (R-WERK-05): beide bestanden zijn `rails/hooks/**`, niveau `besluit-pr`. Eerst deze besluit-PR (alleen
`docs/specs/`), merge door de eigenaar. Daarna één bouw-PR in `rails/`: tester eerst (AC-1 en AC-3 falen op de huidige
code, AC-2 is een regressietest), dan developer, onafhankelijke reviewer, merge door de eigenaar; geen `agent-merge`. Geen
roadmap-item: geen nieuwe feature, route of mechanisme. De JSDoc en het commentaar bij `subagentTokens` ("een substring,
geen hostcontrole") gaan mee; de bouw-PR zoekt in `docs/` en `test/hooks/` naar tekst die de oude `github.com`-regel
beschrijft (R-WERK-15).

## Open vragen

- **OV-1** — Hostparsing of brede match? Aanbeveling: brede match op "github" (deny-kant): een host parsen uit vrije
  curl-argumenten is zelf een bron van omzeiling; vals-positief alleen bij subagent-curl/wget met "github" én een tokenwoord.
  De merge van deze besluit-PR legt de keuze vast.
