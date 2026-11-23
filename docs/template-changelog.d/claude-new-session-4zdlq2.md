---
soort: toegevoegd
---

- Het rolhek weigert voor elke rol een netwerk- of signeergevoelig commando dat een patroon uit `sandbox.excludedCommands`
  raakt maar er niet in zijn geheel op past (`git commit -F m 2>&1 | tail`, `git push -u origin <branch>`, `pnpm run test:db`),
  met de juiste vorm in de reden. De MCP-schrijftools `push_files`, `create_or_update_file` en `delete_file` geven een vraag
  (hoofdsessie) of een weigering (subagent); `gh api` dat `main` verwijdert of verzet, is voor elke rol verboden. Een
  cloudsessie toont de route bij de start in één regel (spec `cloud-netwerkvorm`, `rails/hooks/lib/rolhek.mjs`).

### Bij een update

- Het rolhek leest `sandbox.excludedCommands` uit `.claude/settings.json` in het anker. Ontbreekt dat bestand daar, dan
  raakt de regel niets; is het geen geldige JSON, dan weigert het rolhek elk toolgebruik. Push voortaan met `git push origin HEAD` (niet `git push -u`)
  en verwijder een remote branch met `gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/<branch>`.
