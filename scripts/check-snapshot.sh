#!/usr/bin/env bash
# pnpm check:snapshot (gate:slow, framework §6): de gegenereerde bestanden zijn gelijk aan wat de migraties opleveren.
# Draait dezelfde generatie als `pnpm db:generate` in de runner, maar schrijft niets in de repo: alleen vergelijken.
# Verschil = een migratie zonder bijgewerkte snapshot, of een handmatige wijziging in een gegenereerd bestand.
# Met een toegevoegde migratie die ouder is dan een bestaande volgt een tweede bouw op volgorde van binnenkomst (onderaan).
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf .runner-output/gen
scripts/runner.sh gen "$@"
# Niet vergeleken: de \restrict-sleutel (willekeurig per dump) en de twee commentaarregels met de versie van Postgres en
# pg_dump. Een patchrelease van het image (17.11 → 17.12) verandert het schema niet en mag CI niet rood maken.
ONSTABIEL='^\\(un)?restrict |^-- Dumped (from database|by pg_dump) version '
grep -v -E "$ONSTABIEL" .runner-output/gen/schema.snapshot.sql > .runner-output/gen/schema.snapshot.stabiel.sql
grep -v -E "$ONSTABIEL" db/schema.snapshot.sql > .runner-output/gen/schema.snapshot.repo.sql

fail=0
diff -u .runner-output/gen/schema.snapshot.repo.sql .runner-output/gen/schema.snapshot.stabiel.sql || fail=1
diff -u src/api/db/schema.ts .runner-output/gen/schema.ts || fail=1
if [[ "$fail" -ne 0 ]]; then
  echo "✗ check:snapshot: gegenereerde bestanden wijken af van de migraties → draai pnpm db:generate en commit het resultaat." >&2
  exit 1
fi

# Tweede bouw (spec template-update, AC-7): is een toegevoegde migratie niet later dan de nieuwste bestaande, dan draait ze in
# productie na die nieuwere en op een verse database ervoor. Het hulpscript noemt dan alle toegevoegde migraties; alleen dan
# bouwt de runner het schema nog eens op volgorde van binnenkomst (gen-volgorde zet ze in zijn tijdelijke invoermap, nooit in
# de werkmap, in hun versievolgorde achter de bestaande) en
# moet die dump gelijk zijn aan de eerste. Beide doelen schrijven naar .runner-output/gen: de eerste dump gaat eerst opzij.
hernoemingen="$(node scripts/kit/migratie-volgorde.mjs)"
if [[ -n "$hernoemingen" ]]; then
  namen=""
  while read -r van _; do namen="${namen:+$namen, }$van"; done <<<"$hernoemingen"
  herstel="leg het bedoelde eindresultaat vast in een nieuwe migratie (docs/nieuwe-app.md, \"Een template-update binnenhalen\")"
  rm -rf .runner-output/volgorde
  mkdir -p .runner-output/volgorde
  cp .runner-output/gen/schema.snapshot.stabiel.sql .runner-output/volgorde/versievolgorde.sql
  rm -rf .runner-output/gen
  if ! scripts/runner.sh gen-volgorde "$@" || [[ ! -f .runner-output/gen/schema.snapshot.sql ]]; then
    # Een latere migratie bereikt dbmate niet: het stopt bij de falende migratie, ook in productie (leerpunt #810).
    echo "✗ check:snapshot: de bouw op volgorde van binnenkomst faalt (eerst de bestaande migraties, daarna $namen) → in productie, waar de bestaande migraties al zijn toegepast, faalt een van deze migraties. De eerste fout van de runner of dbmate hierboven is het vertrekpunt; een latere migratie bereikt dbmate niet, dus houd de update tegen tot die oorzaak een uitvoerbaar herstel heeft (docs/nieuwe-app.md, \"Een template-update binnenhalen\")." >&2
    exit 1
  fi
  grep -v -E "$ONSTABIEL" .runner-output/gen/schema.snapshot.sql > .runner-output/volgorde/binnenkomst.sql
  if ! diff -u .runner-output/volgorde/versievolgorde.sql .runner-output/volgorde/binnenkomst.sql; then
    echo "✗ check:snapshot: op volgorde van binnenkomst (eerst de bestaande migraties, daarna $namen) ontstaat een ander schema dan op versievolgorde → een van deze migraties en een bestaande, nieuwere migratie raken hetzelfde object; $herstel." >&2
    exit 1
  fi
  echo "✓ check:snapshot: db/schema.snapshot.sql en src/api/db/schema.ts zijn gelijk aan de migraties, ook op volgorde van binnenkomst ($namen)"
  exit 0
fi
echo "✓ check:snapshot: db/schema.snapshot.sql en src/api/db/schema.ts zijn gelijk aan de migraties"
