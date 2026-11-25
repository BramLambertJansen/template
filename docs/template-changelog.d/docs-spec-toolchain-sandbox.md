---
soort: gewijzigd
---

- Eén installatiepad voor pnpm (spec `pnpm-sandbox-installatie`): `scripts/kit/pnpm-installeer.mjs` is de enige plek die
  `pnpm install` start; `worktree-install.mjs` (modus `werkmap`), `cloud-setup.sh` en `bootstrap.sh` (modus `setup`) roepen
  hem aan. De module zet `XDG_RUNTIME_DIR` zelf (ADR 0110) en meldt een mislukte installatie als netwerkfout alleen bij een
  netwerkcode in de uitvoer; een vergrendelfout heet niet meer "waarschijnlijk geen netwerk". `inKooi` heeft een optie
  `streng` (CLI `--streng`): `/tmp`, `/run`, de thuismap en `XDG_RUNTIME_DIR` zijn dan alleen-lezen en `TMPDIR` is
  `<werkmap>/tmp`. Een nieuwe pnpm die buiten de werkmap schrijft, maakt zo `gate:fast` rood.

### Bij een update

- Roept een eigen script van de app `pnpm install` aan, laat het dan `node scripts/kit/pnpm-installeer.mjs --modus setup`
  aanroepen (met `--cloud` in een cloudcontainer); de test van AC-5 in `test/scripts/pnpm-installeer.test.ts` staat alleen
  die module toe in `scripts/`.
