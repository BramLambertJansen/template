---
soort: opgelost
---

- De kooi (`scripts/kit/kooi.mjs`) koppelt `~/.local/share/mise-terugval` alleen-lezen terug, net als
  `~/.local/share/mise`. In een cloudsessie wijst `mise link` daarheen (`scripts/cloud-setup.sh`); zonder deze bind faalden
  de kooitests van `test/scripts/pnpm-installeer.test.ts` in de pre-push, zodat een agent daar niet kon pushen.

### Bij een update

- Niets te doen.
