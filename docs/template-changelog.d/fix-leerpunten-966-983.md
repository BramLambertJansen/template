---
soort: gewijzigd
---

- `pnpm ratchet` en `node scripts/kit/feiten.mjs specs` melden ongetrackte specs, ADR's en testbestanden die voor de
  AC-dekking zouden tellen (`ongetracktMelding` in `scripts/kit/ac-dekking.mjs`, ratchetmelding `ongetrackt`, leerpunt
  #966). De uitkomst verandert niet; een melding wordt nooit rood.
- De padregel `.claude/rules/web.md` geldt ook voor `test/ui/**` en zegt dat een templatetest geen app-inhoud eist die een
  app mag vervangen (copy, navigatie, voorbeeldthema's) (leerpunt #983).
