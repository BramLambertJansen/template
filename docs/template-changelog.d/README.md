# Changelogfragmenten

Een template-PR met een wijziging die een gebruiker of app merkt, voegt hier een fragment toe in plaats van een regel in
`docs/template-changelog.md` (spec `template-release`, ADR 0093). Zo botsen twee open PR's niet op hetzelfde bestand.
`pnpm template:release <x.y.z>` voegt de fragmenten samen tot een release en verwijdert ze. Dit bestand is geen fragment.

## Naam

De branchnaam in kleine letters, met elk teken buiten `a-z`, `0-9` en `-` vervangen door `-`, plus `.md`:

| Branch | Fragment |
|---|---|
| `docs/spec-template-release` | `docs-spec-template-release.md` |
| `chore/template-release-0.3.0` | `chore-template-release-0-3-0.md` |
| `dependabot/npm_and_yarn/vite-7.1.2` | `dependabot-npm-and-yarn-vite-7-1-2.md` |

Een fragment heeft één soort. Heeft een PR items van meer dan één soort, dan voegt ze per soort een fragment toe met het
achtervoegsel `-2`, `-3` (`docs-spec-template-release-2.md`).

## Vorm

```markdown
---
soort: toegevoegd
---

- <wat verandert, met spec en pad>

### Bij een update

- <wat een app moet doen, zelfstandig leesbaar>
```

- `soort` is één van `toegevoegd`, `gewijzigd`, `opgelost`, `verwijderd`, `documentatie`; het bepaalt de subkop in de release.
- Daarna minstens één lijstitem (`- …`); een vervolgregel van een item springt in.
- De enige toegestane kop is `### Bij een update`, hoogstens één keer en met minstens één lijstitem eronder. Laat de kop weg
  als een app niets hoeft te doen. Een notitie staat in de release los van het item erboven: schrijf haar zo dat ze zonder dat
  item te begrijpen is. Met een notitie wordt de volgende release een minor, anders een patch.

`check-docs` toetst de vorm (`docs:changelog-fragment:<bestand>`, via `pnpm ratchet`). In de template waarschuwt
`pnpm check:docs-drift` als een PR iets buiten `docs/` en `test/` wijzigt zonder fragment; dat blokkeert niet, de reviewer
beoordeelt of een app de wijziging merkt.
