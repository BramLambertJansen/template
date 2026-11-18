import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  MIGRATIES,
  draai,
  git,
  leesResultaat,
  maakFixture,
  psqlLog,
  ruimOp,
  stapStatus,
  type Fixture,
} from './nieuwe-app-kit.ts';

// Tests voor `db-bewijs` van scripts/kit/nieuwe-app.mjs (spec nieuwe-app-script, AC-11), geschreven vóór de bouw. De psql-stub
// (nieuwe-app-kit.ts) geeft per bewering de uitvoer van playbook 8, met de commandotags en de foutmelding van de echte psql, en
// logt per aanroep poort, gebruiker en sql.
afterEach(ruimOp);

const STAPPEN = [
  'migraties',
  'schemas',
  'geen-superuser',
  'api-zonder-rol',
  'rol-zonder-gebruiker',
  'rolwissel-lokaal',
];

interface Poortenbestand {
  uitslag?: 'ok' | 'fout';
  dryRun?: boolean;
  /** `huidig` (standaard): de HEAD van de fixture-repo, dus vers; `oud`: een andere sha. */
  head?: 'huidig' | 'oud';
}

function schrijfPoortenbestand(fx: Fixture, pg: number, opties: Poortenbestand = {}): void {
  const map = path.join(fx.repo, '.template');
  mkdirSync(map, { recursive: true });
  writeFileSync(
    path.join(map, 'nieuwe-app-poorten.json'),
    JSON.stringify({
      schema: 1,
      commando: 'poorten',
      tijd: new Date().toISOString(),
      head: opties.head === 'oud' ? '0'.repeat(40) : git(fx.repo, 'rev-parse', 'HEAD'),
      dryRun: opties.dryRun ?? false,
      uitslag: opties.uitslag ?? 'ok',
      stappen: [],
      gegevens: { pg, mailUi: pg + 2, smtp: pg + 3, api: 8787, web: 5173, origin: 'http://localhost:5173' },
    }),
  );
}

describe('nieuwe-app-script/AC-11: db-bewijs', () => {
  test('nieuwe-app-script/AC-11 met --pg 54332 zijn de zes stappen ok en gebruikt elke psql-aanroep poort 54332', () => {
    const fx = maakFixture();
    const r = draai(fx, ['db-bewijs', '--pg', '54332']);
    expect(r.status, r.uit).toBe(0);
    const resultaat = leesResultaat(fx.repo, 'db-bewijs');
    expect(resultaat.stappen.map((s) => s.id)).toStrictEqual(STAPPEN);
    for (const id of STAPPEN) expect(stapStatus(resultaat, id), id).toBe('ok');
    const aanroepen = psqlLog(fx);
    expect(aanroepen.length).toBeGreaterThanOrEqual(STAPPEN.length);
    for (const aanroep of aanroepen) expect(aanroep.poort, aanroep.sql).toBe('54332');
  });

  test('nieuwe-app-script/AC-11 de gebruikers komen uit .env.example: app_migrator voor migraties en rol, api_user voor de rest', () => {
    const fx = maakFixture();
    draai(fx, ['db-bewijs', '--pg', '54332']);
    const per = (deel: string): string[] => [
      ...new Set(
        psqlLog(fx)
          .filter((a) => a.sql.toLowerCase().includes(deel))
          .map((a) => a.gebruiker),
      ),
    ];
    expect(per('schema_migrations')).toStrictEqual(['app_migrator']);
    expect(per('rolsuper')).toStrictEqual(['app_migrator']);
    expect(per('string_agg')).toStrictEqual(['app_migrator']);
    expect(per('current_user_id')).toStrictEqual(['api_user']);
    expect(per('set local role')).toStrictEqual(['api_user']);
  });

  test('nieuwe-app-script/AC-11 het aantal toegepaste migraties wordt vergeleken met db/migrations/*.sql', () => {
    const ok = maakFixture({ migraties: MIGRATIES });
    expect(draai(ok, ['db-bewijs', '--pg', '54332']).status).toBe(0);
    const afwijkend = maakFixture({ migraties: MIGRATIES - 1 });
    const r = draai(afwijkend, ['db-bewijs', '--pg', '54332']);
    expect(r.status, r.uit).toBe(1);
    const resultaat = leesResultaat(afwijkend.repo, 'db-bewijs');
    expect(stapStatus(resultaat, 'migraties')).toBe('fout');
    for (const id of STAPPEN.filter((s) => s !== 'migraties')) expect(stapStatus(resultaat, id), id).toBe('ok');
  });

  test('nieuwe-app-script/AC-11 geeft de stub bij geen-superuser t, dan is die stap fout en de exitcode 1', () => {
    const fx = maakFixture();
    const r = draai(fx, ['db-bewijs', '--pg', '54332'], { env: { STUB_SUPERUSER: 't' } });
    expect(r.status, r.uit).toBe(1);
    const resultaat = leesResultaat(fx.repo, 'db-bewijs');
    expect(resultaat.uitslag).toBe('fout');
    expect(stapStatus(resultaat, 'geen-superuser')).toBe('fout');
    expect(resultaat.stappen.find((s) => s.id === 'geen-superuser')?.herstel).not.toBeNull();
    for (const id of STAPPEN.filter((s) => s !== 'geen-superuser')) expect(stapStatus(resultaat, id), id).toBe('ok');
    expect(r.stdout).toMatch(/^✗ nieuwe-app db-bewijs: 1 fout\(en\) → \.template\/nieuwe-app-db-bewijs\.json$/m);
  });

  test("nieuwe-app-script/AC-11 ontbreken de schema's, dan is alleen die stap fout", () => {
    const fx = maakFixture();
    const r = draai(fx, ['db-bewijs', '--pg', '54332'], { env: { STUB_SCHEMAS: 'app,tap' } });
    expect(r.status).toBe(1);
    expect(stapStatus(leesResultaat(fx.repo, 'db-bewijs'), 'schemas')).toBe('fout');
  });

  test('nieuwe-app-script/AC-11 zonder --pg gebruikt het de poort uit .template/nieuwe-app-poorten.json', () => {
    const fx = maakFixture();
    schrijfPoortenbestand(fx, 54332);
    const r = draai(fx, ['db-bewijs']);
    expect(r.status, r.uit).toBe(0);
    for (const aanroep of psqlLog(fx)) expect(aanroep.poort).toBe('54332');
  });

  const ONBETROUWBAAR: { naam: string; opties: Poortenbestand }[] = [
    { naam: 'uitslag fout', opties: { uitslag: 'fout' } },
    { naam: 'een dry-run', opties: { dryRun: true } },
    { naam: 'een andere head dan HEAD', opties: { head: 'oud' } },
  ];
  test.each(ONBETROUWBAAR)(
    'nieuwe-app-script/AC-11 een poortenbestand met $naam telt niet: ✗ PG-poort onbekend, geen psql-aanroep',
    ({ opties }) => {
      const fx = maakFixture();
      schrijfPoortenbestand(fx, 54999, opties);
      const r = draai(fx, ['db-bewijs']);
      expect(r.status, r.uit).toBe(1);
      expect(r.stdout).toContain('✗ PG-poort onbekend');
      expect(r.stdout).toContain('→ eerst poorten, of geef --pg <poort>');
      expect(psqlLog(fx), 'de poort uit het onbetrouwbare bestand is niet gebruikt').toStrictEqual([]);
      expect(leesResultaat(fx.repo, 'db-bewijs').uitslag).toBe('fout');
    },
  );

  test('nieuwe-app-script/AC-11 een onbetrouwbaar poortenbestand wijkt voor --pg', () => {
    const fx = maakFixture();
    schrijfPoortenbestand(fx, 54999, { uitslag: 'fout' });
    const r = draai(fx, ['db-bewijs', '--pg', '54332']);
    expect(r.status, r.uit).toBe(0);
    for (const aanroep of psqlLog(fx)) expect(aanroep.poort).toBe('54332');
  });

  test('nieuwe-app-script/AC-11 --pg gaat vóór het poortenbestand', () => {
    const fx = maakFixture();
    schrijfPoortenbestand(fx, 54322);
    const r = draai(fx, ['db-bewijs', '--pg', '54332']);
    expect(r.status, r.uit).toBe(0);
    for (const aanroep of psqlLog(fx)) expect(aanroep.poort).toBe('54332');
  });

  test('nieuwe-app-script/AC-11 zonder --pg en zonder poortenbestand: ✗ PG-poort onbekend, en .env.local wordt niet geopend', () => {
    const fx = maakFixture();
    const envLocal = path.join(fx.repo, '.env.local');
    writeFileSync(envLocal, 'PG_PORT=54332\n');
    chmodSync(envLocal, 0o000);
    const r = draai(fx, ['db-bewijs']);
    expect(r.status, r.uit).toBe(1);
    expect(r.stdout).toContain('✗ PG-poort onbekend');
    expect(r.stdout).toContain('→ eerst poorten, of geef --pg <poort>');
    expect(r.uit, 'geen toegangsfout van een geopend .env.local').not.toContain('EACCES');
    expect(psqlLog(fx)).toStrictEqual([]);
    expect(leesResultaat(fx.repo, 'db-bewijs').uitslag).toBe('fout');
  });

  test('nieuwe-app-script/AC-11 een leesbare .env.local met PG_PORT telt niet als bron van de poort', () => {
    const fx = maakFixture();
    writeFileSync(path.join(fx.repo, '.env.local'), 'PG_PORT=54332\n');
    const r = draai(fx, ['db-bewijs']);
    expect(r.status, r.uit).toBe(1);
    expect(r.stdout).toContain('✗ PG-poort onbekend');
    expect(psqlLog(fx)).toStrictEqual([]);
  });

  test('nieuwe-app-script/AC-11 een ongeldige --pg geeft exitcode 2', () => {
    const fx = maakFixture();
    for (const waarde of ['abc', '0', '70000']) {
      const r = draai(fx, ['db-bewijs', '--pg', waarde]);
      expect(r.status, `--pg ${waarde}: ${r.uit}`).toBe(2);
    }
    expect(psqlLog(fx)).toStrictEqual([]);
  });
});
