---
soort: gewijzigd
---

- `pnpm check:snapshot`: de tweede bouw op volgorde van binnenkomst (`scripts/runner.sh gen-volgorde`) start alleen nog
  `gen-snapshot`, niet ook `gen-schema`; de check vergelijkt daarna alleen de SQL-dump. De eerste bouw controleert
  `db/schema.snapshot.sql` en `src/api/db/schema.ts` zoals voorheen (leerpunt #812).
