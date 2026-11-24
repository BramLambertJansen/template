---
soort: opgelost
---

- In een cloudsessie herstelt `node scripts/kit/worktree-install.mjs` nu ook een achterlopende `node_modules` in de
  hoofdcheckout, met `--config.confirm-modules-purge=false`; lokaal blijft de hoofdcheckout bij de eigenaar (leerpunt #944,
  ADR 0085 herzien). `pnpm pr:verify <nr> --zonder-werkmap` toetst in de cloud CI op de PR-head zonder lokale werkmap, voor
  als die niet mee kan na "Update branch". De receptenkaart noemt hoe de vaste cloudbranch na een merge bijwerkt (deels
  leerpunt #789). Spec: `docs/template/specs/cloud-werkmap-herstel.md`.
