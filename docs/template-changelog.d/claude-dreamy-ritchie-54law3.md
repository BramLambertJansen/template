---
soort: gewijzigd
---

- Rolhek, vervolg op de review van de cloud-netwerkvorm (spec `cloud-netwerkvorm`, AC-14 t/m AC-17): de main-regel voor
  `gh api` decodeert elke procent-escape en weigert ook `…/branches/main/rename`; de MCP-bestandsschrijftools
  (`push_files`, `create_or_update_file`, `delete_file`) vallen onder de lefthook-regel onder elke servernaam; `git push`
  naar `main` geeft één melding; een corpustoets (`test/rails/docs-codeblok-rolhek.test.ts`) toetst de codeblokken in
  `docs/**` en `.claude/skills/**` tegen het rolhek, met `<!-- terminal: eigenaar -->` boven een blok voor de eigenaar.

### Bij een update

- Staat in de docs van de app een codeblok met commando's voor de terminal van de eigenaar die het rolhek weigert, zet dan
  de regel `<!-- terminal: eigenaar -->` direct boven dat blok; anders faalt `test/rails/docs-codeblok-rolhek.test.ts`.
