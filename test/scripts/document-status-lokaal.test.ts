import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { VOLGORDE, lokaleInvoer, oordeel, prUitGh } from '../../scripts/kit/document-status-lokaal.mjs';

// Spec document-status-lokaal: pre-push draait de document-status-check lokaal en blokkeert op de volgorde (ADR 0062 punt 3).

const PREFIX = 'pre-push: document-status';
const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);

interface Antwoord {
  readonly originMain?: string | null;
  readonly head?: string;
  readonly branch?: string;
  readonly url?: string | null;
  readonly opgenomen?: boolean;
}

/** Nep-git die op de argumenten matcht; de volgorde van de aanroepen telt niet. */
function nepGit(antwoord: Antwoord = {}) {
  const { originMain = BASE, head = HEAD, branch = 'feat/x', opgenomen = false } = antwoord;
  const url = antwoord.url === undefined ? 'https://github.com/voorbeeld/repo.git' : antwoord.url;
  return (args: readonly string[]) => {
    const sleutel = args.join(' ');
    if (sleutel === 'rev-parse --verify --quiet refs/remotes/origin/main')
      return originMain === null ? { code: 1, output: '' } : { code: 0, output: `${originMain}\n` };
    if (sleutel === 'rev-parse --verify --quiet HEAD') return { code: 0, output: `${head}\n` };
    if (sleutel === 'branch --show-current') return { code: 0, output: `${branch}\n` };
    if (sleutel === 'config --get remote.origin.url')
      return url === null ? { code: 1, output: '' } : { code: 0, output: `${url}\n` };
    if (sleutel === 'merge-base --is-ancestor HEAD refs/remotes/origin/main')
      return { code: opgenomen ? 0 : 1, output: '' };
    return { code: 1, output: 'onverwacht' };
  };
}

function meldingVan(uitslag: ReturnType<typeof lokaleInvoer>): string | null {
  return 'melding' in uitslag ? uitslag.melding : null;
}

describe('lokaleInvoer (AC-2, AC-6)', () => {
  test('volledige invoer: origin/main, HEAD, branch en owner/naam, getrimd', () => {
    expect(lokaleInvoer(nepGit())).toStrictEqual({ base: BASE, head: HEAD, ref: 'feat/x', repo: 'voorbeeld/repo' });
  });

  test('ssh-remote geeft dezelfde owner/naam', () => {
    const uitslag = lokaleInvoer(nepGit({ url: 'git@github.com:voorbeeld/repo.git' }));

    expect(uitslag).toStrictEqual({ base: BASE, head: HEAD, ref: 'feat/x', repo: 'voorbeeld/repo' });
  });

  test('geen origin/main: melding, geen invoer', () => {
    const uitslag = lokaleInvoer(nepGit({ originMain: null }));

    expect(meldingVan(uitslag)?.startsWith(PREFIX)).toBe(true);
    expect(uitslag).not.toHaveProperty('base');
  });

  test('detached HEAD (geen huidige branch): melding, geen invoer', () => {
    const uitslag = lokaleInvoer(nepGit({ branch: '' }));

    expect(meldingVan(uitslag)?.startsWith(PREFIX)).toBe(true);
    expect(uitslag).not.toHaveProperty('base');
  });

  test('geen remote.origin.url: melding, geen invoer', () => {
    const uitslag = lokaleInvoer(nepGit({ url: null }));

    expect(meldingVan(uitslag)?.startsWith(PREFIX)).toBe(true);
    expect(uitslag).not.toHaveProperty('base');
  });

  test('remote zonder herkenbare owner/naam op github.com: melding, geen invoer', () => {
    const uitslag = lokaleInvoer(nepGit({ url: 'https://gitlab.com/voorbeeld/repo.git' }));

    expect(meldingVan(uitslag)?.startsWith(PREFIX)).toBe(true);
    expect(uitslag).not.toHaveProperty('base');
  });

  test('HEAD opgenomen in origin/main (niets te pushen): melding, geen invoer', () => {
    const uitslag = lokaleInvoer(nepGit({ opgenomen: true }));

    expect(meldingVan(uitslag)?.startsWith(PREFIX)).toBe(true);
    expect(uitslag).not.toHaveProperty('base');
  });

  test('HEAD gelijk aan origin/main: melding, geen invoer', () => {
    const uitslag = lokaleInvoer(nepGit({ head: BASE, opgenomen: true }));

    expect(meldingVan(uitslag)?.startsWith(PREFIX)).toBe(true);
    expect(uitslag).not.toHaveProperty('base');
  });
});

describe('prUitGh (AC-3)', () => {
  test.each([
    ['[{"number":7}]', 7],
    ['[{"number":7}]\n', 7],
    ['[{"number":12,"head":{"ref":"feat/x"}}]', 12],
  ])('precies één open PR %s: %d', (uitvoer, verwacht) => {
    expect(prUitGh(uitvoer)).toBe(verwacht);
  });

  test.each([
    ['geen gh of netwerk', null],
    ['lege uitvoer', ''],
    ['geen PR', '[]'],
    ['twee PRs', '[{"number":7},{"number":8}]'],
    ['kapotte JSON', '[{"number":7'],
    ['geen array', '{"number":7}'],
    ['nummer 0', '[{"number":0}]'],
    ['negatief nummer', '[{"number":-3}]'],
    ['geen geheel getal', '[{"number":1.5}]'],
    ['nummer als tekst', '[{"number":"7"}]'],
    ['element zonder nummer', '[{}]'],
    ['element null', '[null]'],
  ])('%s: onbekend', (_naam, uitvoer) => {
    expect(prUitGh(uitvoer)).toBeNull();
  });
});

const FOUT = 'docs/specs/x.md: herzieningsregel noemt niet deze PR';
const VOLGORDEFOUT = `docs/specs/x.md: de spec staat niet in een commit vóór de eerste code of test ${VOLGORDE}; commit de spec eerst`;

describe('oordeel (AC-4, AC-5, AC-7)', () => {
  test('VOLGORDE is de vaste tekst uit de check', () => {
    expect(VOLGORDE).toBe('(volgorde, ADR 0062 punt 3)');
  });

  test('check geslaagd: exit 0 zonder melding', () => {
    expect(oordeel({ status: 0, uitvoer: 'document-status: ok', pr: null })).toStrictEqual({ exit: 0, melding: null });
    expect(oordeel({ status: 0, uitvoer: '', pr: 7 })).toStrictEqual({ exit: 0, melding: null });
  });

  test.each([7, null])('kindproces zonder exitcode (pr %s): waarschuwing, exit 0', (pr) => {
    const uitslag = oordeel({ status: null, uitvoer: VOLGORDEFOUT, pr });

    expect(uitslag.exit).toBe(0);
    expect(uitslag.melding?.startsWith(PREFIX)).toBe(true);
    expect(uitslag.melding).toContain('waarschuwing');
    expect(uitslag.melding).not.toContain('blokkade');
  });

  test.each([FOUT, VOLGORDEFOUT])('bekende PR, afkeuring "%s": blokkade met de melding van de check', (uitvoer) => {
    const uitslag = oordeel({ status: 1, uitvoer, pr: 7 });

    expect(uitslag.exit).toBe(1);
    expect(uitslag.melding?.startsWith(PREFIX)).toBe(true);
    expect(uitslag.melding).toContain('blokkade');
    expect(uitslag.melding).toContain(uitvoer);
  });

  test('onbekende PR, afkeuring op de volgorde: blokkade met herstelroute', () => {
    const uitslag = oordeel({ status: 1, uitvoer: VOLGORDEFOUT, pr: null });

    expect(uitslag.exit).toBe(1);
    expect(uitslag.melding?.startsWith(PREFIX)).toBe(true);
    expect(uitslag.melding).toContain('blokkade');
    expect(uitslag.melding).toContain('git reset --soft');
    expect(uitslag.melding).toContain('nieuwe branch');
    expect(uitslag.melding).toContain('origin/main');
  });

  test.each([1, 2])('onbekende PR, andere afkeuring (status %d): waarschuwing met de uitvoer, exit 0', (status) => {
    const uitslag = oordeel({ status, uitvoer: FOUT, pr: null });

    expect(uitslag.exit).toBe(0);
    expect(uitslag.melding?.startsWith(PREFIX)).toBe(true);
    expect(uitslag.melding).toContain('waarschuwing');
    expect(uitslag.melding).toContain(FOUT);
    expect(uitslag.melding).not.toContain('blokkade');
  });
});

// Het echte script met de echte check, in een tijdelijke repo met origin/main en zonder `gh` in PATH (AC-2, AC-3).
const root = process.cwd();
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(result.stderr);
}

function schrijf(cwd: string, bestand: string, inhoud: string) {
  mkdirSync(path.dirname(path.join(cwd, bestand)), { recursive: true });
  writeFileSync(path.join(cwd, bestand), inhoud);
}

function commit(cwd: string, bericht: string, bestanden: Record<string, string>) {
  for (const [bestand, inhoud] of Object.entries(bestanden)) schrijf(cwd, bestand, inhoud);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', bericht);
}

const SPEC = '---\nstatus: goedgekeurd\nnamespace: x\n---\n\n# X\n\nEen nieuwe spec voor de proef.\n';
const CODE = 'export const x = 1;\n';

/** Repo met een basis (gates en besluiten uit de template) op origin/main en een branch feat/x. */
function fixture() {
  const basis = mkdtempSync(path.join(tmpdir(), 'document-status-lokaal-'));
  dirs.push(basis);
  const repo = path.join(basis, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  for (const bestand of ['.claude/gates.json', '.claude/decisions.json']) {
    mkdirSync(path.join(repo, '.claude'), { recursive: true });
    copyFileSync(path.join(root, bestand), path.join(repo, bestand));
  }
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'basis');
  git(repo, 'config', 'remote.origin.url', 'https://github.com/voorbeeld/repo.git');
  git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(repo, 'switch', '-qc', 'feat/x');
  return { basis, repo };
}

/** PATH met alleen node en git, zodat `gh` ontbreekt en het PR-nummer onbekend is. */
function padZonderGh(basis: string) {
  const bin = path.join(basis, 'bin');
  mkdirSync(bin);
  const gitPad = (process.env['PATH'] ?? '')
    .split(path.delimiter)
    .map((map) => path.join(map, 'git'))
    .find((kandidaat) => existsSync(kandidaat));
  if (gitPad === undefined) throw new Error('git niet gevonden in PATH');
  symlinkSync(gitPad, path.join(bin, 'git'));
  symlinkSync(process.execPath, path.join(bin, 'node'));
  return bin;
}

function script(basis: string, repo: string) {
  const weg = ['GITHUB_STEP_SUMMARY', 'BASE_SHA', 'HEAD_SHA', 'HEAD_REF', 'REPO', 'PR_NUMBER'];
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([naam]) => !weg.includes(naam))),
    PATH: padZonderGh(basis),
    GIT_TERMINAL_PROMPT: '0',
  };
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/kit/document-status-lokaal.mjs')], {
    cwd: repo,
    encoding: 'utf8',
    env,
    timeout: 60_000,
  });
  return { status: result.status, uitvoer: `${result.stdout}${result.stderr}` };
}

describe('script scripts/kit/document-status-lokaal.mjs', () => {
  test('spec en code in één commit, geen PR: blokkade op de volgorde', { timeout: 60_000 }, () => {
    const { basis, repo } = fixture();
    commit(repo, 'feat: x', { 'docs/specs/x.md': SPEC, 'src/x.ts': CODE });

    const result = script(basis, repo);

    expect(result.status, result.uitvoer).toBe(1);
    expect(result.uitvoer).toContain(VOLGORDE);
    expect(result.uitvoer).toContain('blokkade');
  });

  test('spec in een eerdere commit, daarna code: exit 0', { timeout: 60_000 }, () => {
    const { basis, repo } = fixture();
    commit(repo, 'docs: spec x', { 'docs/specs/x.md': SPEC });
    commit(repo, 'feat: x', { 'src/x.ts': CODE });

    const result = script(basis, repo);

    expect(result.status, result.uitvoer).toBe(0);
    expect(result.uitvoer).not.toContain('blokkade');
    expect(result.uitvoer).not.toContain(VOLGORDE);
  });

  test('HEAD gelijk aan origin/main: niets te pushen, exit 0', { timeout: 60_000 }, () => {
    const { basis, repo } = fixture();

    const result = script(basis, repo);

    expect(result.status, result.uitvoer).toBe(0);
    expect(result.uitvoer).not.toContain('blokkade');
  });
});
