---
soort: gewijzigd
---

- De reviewer leest PR- en CI-gegevens met `gh api` (GET) op een vaste lijst endpoints van de eigen repository, het endpoint
  tussen aanhalingstekens, met alleen `--paginate` en `--jq <filter>`, ook in de cloud (spec rolhek-lezen/AC-21,
  `rails/hooks/lib/rolhek.mjs`, `docs/operations/recepten.md`).
- De hint van het rolhek bij een verwijderpush noemt het endpoint tussen aanhalingstekens:
  `gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/<branch>"` (spec cloud-netwerkvorm/AC-3).
