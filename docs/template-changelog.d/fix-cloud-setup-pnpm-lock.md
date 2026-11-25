---
soort: opgelost
---

- `scripts/cloud-setup.sh` zet vóór `pnpm install` een eigen `XDG_RUNTIME_DIR` (`mktemp -d`). Met pnpm 12 faalde het
  script binnen de sandbox van een cloudsessie met `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`, omdat pnpm zijn
  store-vergrendeling anders in `/tmp` legt (ADR 0110).
