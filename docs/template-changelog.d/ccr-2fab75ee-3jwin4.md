---
soort: gewijzigd
---

- pnpm 12 (12.21.0) in plaats van 11.28.2: `packageManager` in `package.json`, de Dockerfile en `pnpm-lock.yaml`, die
  nu ook een document met de eigen pnpm-versie bevat (`packageManagerDependencies`). `mise.toml` leest de versie nog
  steeds uit `packageManager`. `scripts/kit/worktree-install.mjs` zet ook `XDG_RUNTIME_DIR` onder de eigen tijdelijke
  map, omdat pnpm 12 zijn store-vergrendeling anders hard in `/tmp` legt en de Claude Code-sandbox daar niet mag
  schrijven (pnpm#16390).

### Bij een update

- Na de update vraagt de toolchain-voorcontrole om pnpm 12: draai `scripts/bootstrap.sh`, in de cloud
  `bash scripts/cloud-setup.sh`. Draai je zelf `pnpm install` binnen een sandbox die `/tmp` niet laat schrijven, zet dan
  `XDG_RUNTIME_DIR` op een bestaande, schrijfbare map, of gebruik `node scripts/kit/worktree-install.mjs`.
