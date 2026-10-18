import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { laneVan } from '../../scripts/kit/lane.mjs';

// ADR 0029 punt 7: lane-herkenning. `laneVan({ changes, besluiten, mini, config })` is puur.
//   changes   — de name-status-wijzigingen van de PR ({ status: 'A' | 'M' | 'D' | 'R' | 'C', pad, van? })
//   besluiten — de documenten die in de PR een eigenaarstatus krijgen zonder record op main
//   mini      — of dat ene besluitdocument `sjabloon: mini` heeft
//   config    — de gates uit .claude/gates.json op main
// Resultaat: { lane: 'feature' | 'framework' | null, reden: string }.
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const SPEC = 'docs/specs/demo.md';
const ADR = 'docs/adr/0099-demo.md';

interface Wijziging {
  status: string;
  pad: string;
  van?: string;
}

const A = (pad: string): Wijziging => ({ status: 'A', pad });
const M = (pad: string): Wijziging => ({ status: 'M', pad });

function lane(changes: Wijziging[], opties: { besluiten?: string[]; mini?: boolean } = {}) {
  return laneVan({ changes, besluiten: opties.besluiten ?? [SPEC], mini: opties.mini ?? true, config });
}

describe('feature-lane: positief', () => {
  test('mini-spec, web, route en nieuwe test', () => {
    const resultaat = lane([
      A(SPEC),
      A('src/web/features/demo/page.tsx'),
      A('src/api/routes/demo.ts'),
      A('src/api/routes/demo.test.ts'),
    ]);
    expect(resultaat.lane).toBe('feature');
  });

  test('een bestaand bronbestand wijzigen mag, ook src/api/app.ts en permissions.ts (punt 6)', () => {
    expect(lane([M(SPEC), M('src/api/app.ts'), M('src/shared/permissions.ts')]).lane).toBe('feature');
  });

  test.each([
    ['CHANGELOG', 'CHANGELOG.md'],
    ['de roadmap', 'docs/roadmap.md'],
    ['andere docs', 'docs/gouden-pad.md'],
    ['het schema-snapshot', 'db/schema.snapshot.sql'],
  ])('%s mag meewijzigen', (_naam, pad) => {
    expect(lane([A(SPEC), A('src/web/features/demo/page.tsx'), M(pad)]).lane).toBe('feature');
  });

  test('een nieuwe migratie en een nieuwe pgTAP-test', () => {
    expect(lane([A(SPEC), A('db/migrations/20261018120000_demo.sql'), A('db/tests/demo.sql')]).lane).toBe('feature');
  });
});

describe('feature-lane: negatief (moet de strenge route geven)', () => {
  test.each([
    ['1 een pad in src/core', [A(SPEC), M('src/core/web/ui/toast.tsx')]],
    ['2a een pad uit voorReview: scripts', [A(SPEC), M('scripts/kit/check-docs.mjs')]],
    ['2b een pad uit voorReview: .claude', [A(SPEC), M('.claude/gates.json')]],
    ['2c een pad uit voorReview: workflow', [A(SPEC), M('.github/workflows/guard.yml')]],
    ['2d een pad uit voorReview: package.json', [A(SPEC), M('package.json')]],
    ['3a een gewijzigde bestaande test', [A(SPEC), M('src/web/features/demo/page.test.tsx')]],
    ['3b een verwijderde bestaande test', [A(SPEC), { status: 'D', pad: 'test/rails/lane.test.ts' }]],
    ['4 een ADR in dezelfde PR', [A(SPEC), A(ADR)]],
    ['6 een gewijzigde migratie', [A(SPEC), M('db/migrations/20260101000000_oud.sql')]],
    ['6b een verwijderde migratie', [A(SPEC), { status: 'D', pad: 'db/migrations/20260101000000_oud.sql' }]],
    ['7 een rename van src/core naar src/web', [A(SPEC), { status: 'R', van: 'src/core/x.ts', pad: 'src/web/x.ts' }]],
    ['7b een rename van een bestaande test', [A(SPEC), { status: 'R', van: 'test/a.test.ts', pad: 'test/b.test.ts' }]],
  ])('%s', (_naam, changes) => {
    const resultaat = lane(changes);
    expect(resultaat.lane).toBeNull();
    expect(resultaat.reden).not.toBe('');
  });

  test('5 twee specs naar een eigenaarstatus', () => {
    const resultaat = lane([A(SPEC), A('docs/specs/andere.md')], { besluiten: [SPEC, 'docs/specs/andere.md'] });
    expect(resultaat.lane).toBeNull();
  });

  test('8 een volledige spec (geen sjabloon: mini) met code', () => {
    expect(lane([A(SPEC), A('src/api/routes/demo.ts')], { mini: false }).lane).toBeNull();
  });

  test('een ontbrekende voorReview telt elke gate als voorReview (faalt dicht)', () => {
    const zonder = loadConfig(
      JSON.stringify({ ...JSON.parse(readFileSync('.claude/gates.json', 'utf8')), voorReview: undefined }),
    );
    expect(
      laneVan({ changes: [A(SPEC), M('docs/dod.md')], besluiten: [SPEC], mini: true, config: zonder }).lane,
    ).toBeNull();
  });
});

describe('framework-lane', () => {
  test('alleen een ADR slaagt', () => {
    expect(lane([A(ADR)], { besluiten: [ADR], mini: false }).lane).toBe('framework');
  });

  test('een ADR met zijn record slaagt', () => {
    expect(lane([A(ADR), M('.claude/decisions.json')], { besluiten: [ADR], mini: false }).lane).toBe('framework');
  });

  test('10 een in-PR-status én code geeft geen lane', () => {
    expect(lane([A(ADR), M('scripts/kit/check-docs.mjs')], { besluiten: [ADR], mini: false }).lane).toBeNull();
  });

  test('twee besluitdocumenten in één framework-PR geven geen lane', () => {
    expect(
      lane([A(ADR), A('docs/adr/0098-demo.md')], { besluiten: [ADR, 'docs/adr/0098-demo.md'], mini: false }).lane,
    ).toBeNull();
  });

  test('zonder besluit in de PR is er geen lane', () => {
    expect(lane([M('scripts/kit/check-docs.mjs')], { besluiten: [] }).lane).toBeNull();
  });
});
