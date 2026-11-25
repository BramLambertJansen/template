---
soort: gewijzigd
---

- Renovate groepeert niet-majors nu in drie PR's per week in plaats van één (`renovate.json`): `runtime` (dependencies),
  `dev-tools` (devDependencies, `engines`, `packageManager` en de tools in `mise.toml`) en `ci-images` (GitHub Actions,
  Dockerfile, `compose.yaml`). Zo houdt een rode devtool de runtime-updates niet meer tegen. De Node uit `mise.toml` en
  het Node-image komen samen in een vierde groep `node`, omdat ze gelijk moeten zijn. lefthook 2.2.2 wordt
  overgeslagen, omdat hij de herkomst van 2.2.1 mist (`trustPolicy`); `test/scripts/renovate-config.test.ts` bewaakt
  dit.
- Node 26.13.0 (LTS) in `mise.toml`, de Dockerfile en `compose.yaml`. Het image van 26.13.1 was nog geen 7 dagen oud.

### Bij een update

- Na de update vraagt de toolchain-voorcontrole om Node 26.13.0: draai `scripts/bootstrap.sh`, in de cloud
  `bash scripts/cloud-setup.sh`.
