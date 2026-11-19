import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { checks, strikt } from '../../scripts/kit/ratchet.mjs';

// proza-checks, pgTAP-vorm (R-TEST-05, docs/template/specs/proza-checks.md): de check `pgTapVormViolations(root)` in
// scripts/kit/check-policies.mjs leest `<root>/db/tests/*.sql` en geeft `{ key, message }` per bestand met een overtreding,
// sleutel `db/tests/<bestand>: <reden>`, reden `search_path`, `plan ontbreekt`, `plan na set local role` of `no_plan`.
// Elke fixture in fixtures/pgtap-vorm krijgt precies de genoemde reden (een nieuwe fixture zonder verwachting valt op).
//
// Importvorm: de export bestaat nog niet. `pgTapVormViolations()` laadt de module pas in de test en valideert het resultaat
// met type-guards in plaats van casts; ontbreekt de export, dan faalt elke test op een assertie. De check mag synchroon of
// asynchroon zijn (zoals conflictMarkerViolations, dat de ratchet in Promise.resolve wikkelt).
const REPO = path.resolve(import.meta.dirname, '../..');
const MODULE = ['../../scripts/kit', 'check-policies.mjs'].join('/');
const FIXTURES = path.join(REPO, 'test/rails/fixtures/pgtap-vorm');

const MELDING =
  'pgTAP-vorm (R-TEST-05): na `begin;` eerst `set search_path = tap, public;`, en `select plan(<n>);` vóór de eerste `set local role`; geen no_plan().';

interface Overtreding {
  key: string;
  message: string;
}

const dirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function alsOvertreding(item: unknown): Overtreding {
  if (
    typeof item === 'object' &&
    item !== null &&
    'key' in item &&
    typeof item.key === 'string' &&
    'message' in item &&
    typeof item.message === 'string'
  )
    return { key: item.key, message: item.message };
  throw new Error(`geen { key, message }: ${JSON.stringify(item)}`);
}

async function overtredingen(root: string): Promise<Overtreding[]> {
  const geladen: unknown = await import(/* @vite-ignore */ MODULE).catch(() => undefined);
  expect(geladen, 'scripts/kit/check-policies.mjs bestaat').toBeTypeOf('object');
  const functie: unknown =
    typeof geladen === 'object' && geladen !== null ? Reflect.get(geladen, 'pgTapVormViolations') : undefined;
  expect(functie, 'check-policies.mjs exporteert pgTapVormViolations').toBeTypeOf('function');
  if (typeof functie !== 'function') return [];
  const lijst: unknown = await Reflect.apply(functie, undefined, [root]);
  expect(Array.isArray(lijst), 'pgTapVormViolations geeft een lijst').toBe(true);
  return Array.isArray(lijst) ? lijst.map(alsOvertreding) : [];
}

/** Een tijdelijke root met de gevraagde fixtures in `db/tests/`. */
function rootMet(namen: readonly string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pgtap-vorm-'));
  dirs.push(root);
  mkdirSync(path.join(root, 'db/tests'), { recursive: true });
  for (const naam of namen) cpSync(path.join(FIXTURES, naam), path.join(root, 'db/tests', naam));
  return root;
}

const VERWACHT: Record<string, string | null> = {
  'goed.sql': null,
  'zonder-begin.sql': null,
  'goed-hoofdletters.sql': null,
  'goed-rol-geen-regelbegin.sql': null,
  'goed-dollar-in-commentaar.sql': null,
  'goed-dollar-in-staartcommentaar.sql': null,
  'search-path-ontbreekt.sql': 'search_path',
  'search-path-anders.sql': 'search_path',
  'search-path-later.sql': 'search_path',
  'plan-ontbreekt.sql': 'plan ontbreekt',
  'plan-in-commentaar.sql': 'plan ontbreekt',
  'plan-in-blok.sql': 'plan ontbreekt',
  'plan-na-rol.sql': 'plan na set local role',
  'plan-na-definer.sql': 'plan na set local role',
  'rol-tussen-commentaar-dollars.sql': 'plan na set local role',
  'no-plan.sql': 'no_plan',
};

const sleutels = (naam: string, reden: string | null) => (reden === null ? [] : [`db/tests/${naam}: ${reden}`]);

test.each(Object.entries(VERWACHT))('proza-checks/AC-10 %s geeft precies de reden %s', async (naam, reden) => {
  const gevonden = await overtredingen(rootMet([naam]));

  expect(gevonden.map(({ key }) => key)).toStrictEqual(sleutels(naam, reden));
});

test('proza-checks/AC-10 de melding is letterlijk die van de spec', async () => {
  const gevonden = await overtredingen(rootMet(['search-path-anders.sql']));

  expect(gevonden.map(({ message }) => message)).toStrictEqual([MELDING]);
});

test('proza-checks/AC-10 elke fixture heeft een verwachting (een nieuwe fixture zonder test valt op)', () => {
  const bestanden = readdirSync(FIXTURES).filter((naam) => naam.endsWith('.sql'));

  expect(bestanden.toSorted()).toStrictEqual(Object.keys(VERWACHT).toSorted());
});

test('proza-checks/AC-10 alle fixtures in één root: per bestand zijn eigen reden', async () => {
  const gevonden = await overtredingen(rootMet(Object.keys(VERWACHT)));
  const verwacht = Object.entries(VERWACHT).flatMap(([naam, reden]) => sleutels(naam, reden));

  expect(gevonden.map(({ key }) => key).toSorted()).toStrictEqual(verwacht.toSorted());
});

test('proza-checks/AC-11 een root zonder db/tests geeft geen overtreding en geen fout', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pgtap-vorm-'));
  dirs.push(root);

  expect(await overtredingen(root)).toStrictEqual([]);
});

test('proza-checks/AC-12 pgtap-vorm staat in het kanaal strikt van de ratchet, niet in de baseline-checks', () => {
  expect(Object.keys(strikt)).toContain('pgtap-vorm');
  expect(Object.keys(checks)).not.toContain('pgtap-vorm');
});

test('proza-checks/AC-12 de strikte check van de ratchet meldt een overtreding in db/tests van de huidige map', async () => {
  const run = Reflect.get(strikt, 'pgtap-vorm');
  expect(run, 'strikt heeft een check pgtap-vorm').toBeTypeOf('function');
  if (typeof run !== 'function') return;
  const root = rootMet(['plan-na-rol.sql']);
  vi.spyOn(process, 'cwd').mockReturnValue(root);

  const lijst: unknown = await Reflect.apply(run, undefined, []);

  expect(Array.isArray(lijst) ? lijst.map(alsOvertreding).map(({ key }) => key) : lijst).toStrictEqual([
    'db/tests/plan-na-rol.sql: plan na set local role',
  ]);
});

test('proza-checks/AC-12 de overtreding komt nooit in .kit/baseline.json: de baseline kent alleen de checks, niet pgtap-vorm', () => {
  const baseline: unknown = JSON.parse(readFileSync(path.join(REPO, '.kit/baseline.json'), 'utf8'));
  const sleutelLijst = typeof baseline === 'object' && baseline !== null ? Object.values(baseline).flat() : [];

  expect(Object.keys(baseline ?? {})).not.toContain('pgtap-vorm');
  expect(
    sleutelLijst.filter((sleutel) => typeof sleutel === 'string' && sleutel.startsWith('db/tests/')),
  ).toStrictEqual([]);
});

test('proza-checks/AC-13 alle bestanden in db/tests van de huidige repo voldoen', async () => {
  expect(await overtredingen(REPO)).toStrictEqual([]);
});
