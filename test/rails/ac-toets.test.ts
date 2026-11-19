import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { acItems, acToetsMeldingen, acToetsUitGit, geldigeToets } from '../../scripts/kit/ac-toets.mjs';

// Spec ac-toets (docs/template/specs/ac-toets.md), tests vóór de bouw. Verwachte exports van scripts/kit/ac-toets.mjs:
// - acItems(tekst, eigen): { id, regel, tekst }[] — de AC-items van de eigen namespace, tekst genormaliseerd.
// - geldigeToets(tekst): boolean — minstens één `Toets:` met een testpad tussen backticks.
// - acToetsUitGit(root, inCi): Violation[] — strikt kanaal; sleutel `docs:ac-toets:<bestand>:<regel>:<AC-n>`.
// - acToetsMeldingen(root): string[] — de "let op"-regel zonder merge-base.
const root = path.resolve(import.meta.dirname, '../..');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
}

function schrijf(dir: string, bestanden: Record<string, string>) {
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(dir, pad)), { recursive: true });
    writeFileSync(path.join(dir, pad), inhoud);
  }
}

const SPEC = 'docs/template/specs/x.md';
const ADR = 'docs/template/adr/0100-proces.md';

function spec(acs: string, status = 'voorstel'): string {
  return `---\nstatus: ${status}\nnamespace: x\n---\n\n# X\n\n## Acceptatiecriteria\n\n${acs}\n\n## Testplan\n`;
}

/** Een repo met `basis` gecommit als origin/main en daarna `head` in de werkmap (getrackt, niet gecommit). */
function repo(basis: Record<string, string>, head: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'ac-toets-'));
  dirs.push(dir);
  schrijf(dir, {
    'package.json': JSON.stringify({ scripts: {} }),
    'src/leeg.ts': 'export {};\n',
    '.kit/baseline.json': '{}\n',
    [ADR]: '# 0100 — Proces\n\nStatus: geaccepteerd\n',
    ...basis,
  });
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'basis');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  schrijf(dir, head);
  git(dir, 'add', '-A');
  return dir;
}

function sleutels(dir: string, inCi = false): string[] {
  return acToetsUitGit(dir, inCi).map((violation) => violation.key);
}

const GELDIG = 'Toets: `test/rails/x.test.ts`';

describe('ac-toets: de pure delen', () => {
  test('ac-toets/AC-1: geldigeToets herkent een testpad en weigert plaatshouder, commando, map en niet-testpad', () => {
    const goed = [
      GELDIG,
      'Toets: `test/rails/x.test.ts` (nieuw)',
      'tekst. Toets: `src/x.test.tsx`',
      'Toets: `e2e/accounts.spec.ts`',
      'Toets: `db/tests/rls.sql`',
      'eerst Toets: `<testbestand>` en dan Toets: `test/x.test.ts`',
      'zonder geldige `Toets:` is wel rood. Toets: `test/rails/x.test.ts`',
    ];
    const fout = [
      'geen veld',
      'Toets: test/x.test.ts',
      'Toets: ``',
      'Toets: `<testbestand>`',
      'Toets: `test/<pad>.test.ts`',
      'Toets: `pnpm test:unit`',
      'Toets: `test/`',
      'Toets: `e2e/`',
      'Toets: `src/x.ts`',
      'noemt `Toets:` als code',
    ];
    expect(goed.filter((tekst) => !geldigeToets(tekst))).toEqual([]);
    expect(fout.filter((tekst) => geldigeToets(tekst))).toEqual([]);
  });

  test('ac-toets/AC-2: acItems leest het hele item met vervolgregels en normaliseert witruimte en merktekens', () => {
    const tekst = [
      '- **x/AC-1** — Eerste regel',
      '  tweede regel met `src/a.ts` (vervallen).',
      '- **x/AC-2** — Los.',
      '',
      '- **andere/AC-3** — Kruisverwijzing.',
      '  - **x/AC-4** — ingesprongen telt niet als item',
    ].join('\n');
    const items = acItems(tekst, new Set(['x']));
    expect(items.map((item) => item.id)).toEqual(['AC-1', 'AC-2']);
    expect(items[0]?.regel).toBe(1);
    expect(items[0]?.tekst).toBe('- **x/AC-1** — Eerste regel tweede regel met `src/a.ts`.');
    expect(acItems('- **x/AC-1** — Eerste\r\n  regel  `a` (nieuw)', new Set(['x']))[0]?.tekst).toBe(
      '- **x/AC-1** — Eerste regel `a`',
    );
  });
});

describe('ac-toets: tegen de merge-base', { timeout: 60_000 }, () => {
  test('ac-toets/AC-1: een nieuwe AC zonder geldige Toets is rood, met een geldige niet', () => {
    const basis = { [SPEC]: spec('- **x/AC-1** — Oud.') };
    const zonder = repo(basis, { [SPEC]: spec('- **x/AC-1** — Oud.\n- **x/AC-2** — Nieuw, Toets: `pnpm test:unit`.') });
    expect(sleutels(zonder)).toEqual([`docs:ac-toets:${SPEC}:11:AC-2`]);
    expect(acToetsUitGit(zonder, false)[0]?.message).toContain('Toets:');
    const met = repo(basis, { [SPEC]: spec(`- **x/AC-1** — Oud.\n- **x/AC-2** — Nieuw. ${GELDIG} (nieuw)`) });
    expect(sleutels(met)).toEqual([]);
  });

  test('ac-toets/AC-2: een ongewijzigde AC zonder Toets is groen, ook met andere witruimte of een merkteken', () => {
    const oud = '- **x/AC-1** — Leest `src/a.ts` en schrijft.';
    const herschikt = '- **x/AC-1** — Leest `src/a.ts`\n  (vervallen) en   schrijft.';
    expect(sleutels(repo({ [SPEC]: spec(oud) }, { [SPEC]: spec(herschikt) }))).toEqual([]);
    const anders = '- **x/AC-1** — Leest `src/a.ts` en verwijdert.';
    expect(sleutels(repo({ [SPEC]: spec(oud) }, { [SPEC]: spec(anders) }))).toEqual([`docs:ac-toets:${SPEC}:10:AC-1`]);
  });

  test('ac-toets/AC-3: een nieuwe spec telt elke AC als nieuw; een hernoemde spec vergelijkt met het oude bestand', () => {
    const nieuw = repo({}, { [SPEC]: spec('- **x/AC-1** — Een.\n- **x/AC-2** — Twee.') });
    expect(sleutels(nieuw)).toEqual([`docs:ac-toets:${SPEC}:10:AC-1`, `docs:ac-toets:${SPEC}:11:AC-2`]);
    const inhoud = spec('- **x/AC-1** — Een met genoeg tekst om als hernoeming te tellen.\n- **x/AC-2** — Twee.');
    const dir = repo({ 'docs/template/specs/oud.md': inhoud });
    git(dir, 'mv', 'docs/template/specs/oud.md', SPEC);
    expect(sleutels(dir)).toEqual([]);
  });

  test('ac-toets/AC-4: vervallen AC, vervallen spec en sjablonen tellen niet; een onbekend ADR wel', () => {
    const vervallen = '- **x/AC-1** — Vervallen door ADR 0100 (proces). Was: iets.';
    expect(sleutels(repo({}, { [SPEC]: spec(vervallen) }))).toEqual([]);
    expect(sleutels(repo({}, { [SPEC]: spec('- **x/AC-1** — Nieuw.', 'vervallen') }))).toEqual([]);
    const sjablonen = {
      'docs/specs/_template.md': spec('- **x/AC-1** — Nieuw.'),
      'docs/template/specs/archief/x.md': spec('- **x/AC-1** — Nieuw.'),
      'docs/notities.md': spec('- **x/AC-1** — Nieuw.'),
    };
    expect(sleutels(repo({}, sjablonen))).toEqual([]);
    const onbekend = '- **x/AC-1** — Vervallen door ADR 9999 (proces). Was: iets.';
    expect(sleutels(repo({}, { [SPEC]: spec(onbekend) }))).toEqual([`docs:ac-toets:${SPEC}:10:AC-1`]);
  });

  test('ac-toets/AC-4: een niet-getrackte spec telt pas na git add', () => {
    const dir = repo({});
    schrijf(dir, { [SPEC]: spec('- **x/AC-1** — Nieuw.') });
    expect(sleutels(dir)).toEqual([]);
    git(dir, 'add', SPEC);
    expect(sleutels(dir)).toEqual([`docs:ac-toets:${SPEC}:10:AC-1`]);
  });

  test('ac-toets/AC-5: zonder merge-base lokaal een melding, in CI een overtreding', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ac-toets-'));
    dirs.push(dir);
    schrijf(dir, { [SPEC]: spec('- **x/AC-1** — Nieuw.') });
    git(dir, 'init', '-q');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'zonder origin');
    expect(sleutels(dir, false)).toEqual([]);
    expect(acToetsMeldingen(dir)).toEqual(['let op: geen merge-base met origin/main; ac-toets toetst niets']);
    expect(sleutels(dir, true)).toEqual(['docs:ac-toets:geen-basis']);
    expect(acToetsMeldingen(repo({}))).toEqual([]);
  });
});

function ratchet(dir: string, ...args: string[]) {
  return spawnSync(process.execPath, [path.join(root, 'scripts/kit/ratchet.mjs'), ...args], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, GITHUB_ACTIONS: '' },
  });
}

describe('ac-toets: in de ratchet', { timeout: 60_000 }, () => {
  test('ac-toets/AC-6: strikt rood, ook na ratchet --update, en de baseline krijgt de sleutel niet', () => {
    const dir = repo({}, { [SPEC]: spec('- **x/AC-1** — Nieuw zonder veld.') });
    expect(ratchet(dir, '--update').status).toBe(0);
    const r = ratchet(dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`docs:ac-toets:${SPEC}:10:AC-1`);
    expect(r.stderr).toContain('Komt nooit in');
    expect(readFileSync(path.join(dir, '.kit/baseline.json'), 'utf8')).not.toContain('docs:ac-toets:');
  });

  test('ac-toets/AC-6: los gedraaid geeft de module geen stil groen', () => {
    const r = spawnSync(process.execPath, ['scripts/kit/ac-toets.mjs'], { cwd: root, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('pnpm ratchet');
  });
});
