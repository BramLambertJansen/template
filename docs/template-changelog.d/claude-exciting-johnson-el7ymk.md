---
soort: gewijzigd
---

- Skill `opleveren`, opruimstap 6: in een cloudsessie (`CLAUDE_CODE_REMOTE=true`) geen `gh api -X DELETE` op de remote
  branch meer, want de GitHub-proxy weigert die met 403. De repo-instelling `delete_branch_on_merge` ruimt de branch op;
  `git ls-remote --heads origin <branch>` controleert en een achtergebleven branch staat in de eindmelding. Een app die in de
  cloud werkt, zet die instelling dus aan (spec cloud-netwerkvorm OV-9, `docs/operations/recepten.md`, `docs/ENVIRONMENT.md`).
