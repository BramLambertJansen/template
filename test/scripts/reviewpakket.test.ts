import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// Spec agents-leveren, punt 1d (PR-5): het reviewpakket. Een echte tijdelijke git-repo met `origin/main`, geen mock van git.
const SCRIPT = path.join(import.meta.dirname, '../../scripts/kit/reviewpakket.mjs');
const REPO_ROOT = path.join(import.meta.dirname, '../..');
const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function schrijf(repo: string, rel: string, text: string): void {
  mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  writeFileSync(path.join(repo, rel), text);
}

function commit(repo: string, bericht: string, bestanden: Record<string, string>): string {
  for (const [rel, text] of Object.entries(bestanden)) schrijf(repo, rel, text);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', bericht);
  return git(repo, 'rev-parse', 'HEAD');
}

interface Repo {
  readonly repo: string;
  readonly basis: string;
  readonly c1: string;
  readonly c2: string;
}

/** Repo met `origin/main` en twee commits op `feat/x`: spec, code en lockfile in de diff. */
function maakRepo(): Repo {
  const repo = mkdtempSync(path.join(tmpdir(), 'reviewpakket-'));
  dirs.push(repo);
  git(repo, 'init', '-q', '-b', 'main');
  const basis = commit(repo, 'chore: start', {
    '.gitignore': '.reviewpakket/\n',
    'src/a.ts': 'export const a = 1;\n',
    'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  });
  git(repo, 'update-ref', 'refs/remotes/origin/main', basis);
  git(repo, 'checkout', '-q', '-b', 'feat/x');
  const c1 = commit(repo, 'docs: spec a', { 'docs/template/specs/a.md': '# Spec a\n' });
  const c2 = commit(repo, 'feat: change a', {
    'src/a.ts': 'export const a = 2;\n',
    'pnpm-lock.yaml': 'lockfileVersion: 9\nLOCKREGEL: ja\n',
  });
  return { repo, basis, c1, c2 };
}

function draai(repo: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function kort(sha: string): string {
  return sha.slice(0, 7);
}

/** Tekst onder een `## `-kop tot de volgende `## `-kop. */
function sectie(tekst: string, kop: string): string {
  const regels = tekst.split('\n');
  const start = regels.indexOf(`## ${kop}`);
  if (start === -1) throw new Error(`kop ## ${kop} ontbreekt`);
  const rest = regels.slice(start + 1);
  const eind = rest.findIndex((regel) => regel.startsWith('## '));
  return (eind === -1 ? rest : rest.slice(0, eind)).join('\n');
}

function pakketten(repo: string): string[] {
  const map = path.join(repo, '.reviewpakket');
  return existsSync(map) ? readdirSync(map).filter((naam) => naam.endsWith('.md')) : [];
}

describe('reviewpakket', () => {
  test('agents-leveren/AC-14: exit 0, één regel stdout met het pad, bestand bestaat, werkmap blijft schoon', () => {
    const { repo, c2 } = maakRepo();
    const uit = draai(repo);

    expect(uit.code).toBe(0);
    expect(uit.stdout).toBe(`.reviewpakket/feat-x-${kort(c2)}.md\n`);
    expect(existsSync(path.join(repo, `.reviewpakket/feat-x-${kort(c2)}.md`))).toBe(true);
    expect(git(repo, 'status', '--porcelain', '--untracked-files=all')).toBe('');
  });

  test('agents-leveren/AC-14: vanuit een submap komt het pakket in de repo-root', () => {
    const { repo, c2 } = maakRepo();
    const uit = draai(path.join(repo, 'src'));

    expect(uit.code).toBe(0);
    expect(uit.stdout).toBe(`.reviewpakket/feat-x-${kort(c2)}.md\n`);
    expect(existsSync(path.join(repo, `.reviewpakket/feat-x-${kort(c2)}.md`))).toBe(true);
  });

  test('agents-leveren/AC-15: koppen in volgorde, spec, log, stat en diff zonder gegenereerde bestanden', () => {
    const { repo, basis, c2 } = maakRepo();
    const uit = draai(repo);
    const tekst = readFileSync(path.join(repo, uit.stdout.trim()), 'utf8');
    const regels = tekst.split('\n');

    expect(regels[0]).toBe(`# Reviewpakket feat/x @ ${kort(c2)}`);
    expect(regels[1]).toBe(`Basis: ${kort(basis)}`);
    const koppen = regels.filter((regel) => regel.startsWith('## '));
    expect(koppen).toStrictEqual(['## Spec', '## Log', '## Stat', '## Diff']);
    expect(sectie(tekst, 'Spec')).toContain('docs/template/specs/a.md');
    expect(sectie(tekst, 'Log')).toContain(git(repo, 'log', '--oneline', `${basis}..HEAD`));
    expect(sectie(tekst, 'Stat')).toContain(git(repo, 'diff', '--stat', `${basis}..HEAD`));
    const diff = sectie(tekst, 'Diff');
    expect(diff).toContain('+export const a = 2;');
    expect(diff).not.toContain('LOCKREGEL');
    expect(diff).toContain('Weggelaten (gegenereerd, staat in Stat): pnpm-lock.yaml');
    expect(sectie(tekst, 'Stat')).toContain('pnpm-lock.yaml');
  });

  test('agents-leveren/AC-15: zonder spec in de diff de regel "geen spec in de diff"; met --spec dat pad', () => {
    const { repo } = maakRepo();
    const zonder = draai(repo, '--sinds', git(repo, 'rev-parse', 'HEAD~1'));
    expect(sectie(readFileSync(path.join(repo, zonder.stdout.trim()), 'utf8'), 'Spec').trim()).toBe(
      'geen spec in de diff',
    );

    const met = draai(repo, '--spec', 'docs/template/specs/b.md');
    expect(met.code).toBe(0);
    const spec = sectie(readFileSync(path.join(repo, met.stdout.trim()), 'utf8'), 'Spec');
    expect(spec).toContain('docs/template/specs/b.md');
    expect(spec).not.toContain('docs/template/specs/a.md');
  });

  test('agents-leveren/AC-15: alle gegenereerde bestanden uit de lijst staan alleen in Stat', () => {
    const { repo } = maakRepo();
    commit(repo, 'chore: gegenereerd', {
      'db/schema.snapshot.sql': 'SNAPSHOTREGEL\n',
      '.github/CODEOWNERS': 'CODEOWNERSREGEL\n',
    });
    const uit = draai(repo);
    const tekst = readFileSync(path.join(repo, uit.stdout.trim()), 'utf8');
    const diff = sectie(tekst, 'Diff');

    expect(diff).not.toContain('SNAPSHOTREGEL');
    expect(diff).not.toContain('CODEOWNERSREGEL');
    expect(diff).toContain(
      'Weggelaten (gegenereerd, staat in Stat): .github/CODEOWNERS, db/schema.snapshot.sql, pnpm-lock.yaml',
    );
    expect(sectie(tekst, 'Stat')).toContain('db/schema.snapshot.sql');
  });

  test('agents-leveren/AC-16: --sinds geeft een fixpakket met alleen de commits erna', () => {
    const { repo, c2 } = maakRepo();
    const c3 = commit(repo, 'fix: review a', { 'src/a.ts': 'export const a = 3;\n' });
    const uit = draai(repo, '--sinds', c2);

    expect(uit.code).toBe(0);
    expect(uit.stdout).toBe(`.reviewpakket/feat-x-${kort(c3)}-fix-${kort(c2)}.md\n`);
    const tekst = readFileSync(path.join(repo, uit.stdout.trim()), 'utf8');
    const regels = tekst.split('\n');
    expect(regels[0]).toBe(`# Reviewpakket feat/x @ ${kort(c3)}`);
    expect(regels[1]).toBe(`Fixdiff sinds: ${kort(c2)}`);
    const log = sectie(tekst, 'Log');
    expect(log).toContain(git(repo, 'log', '--oneline', `${c2}..HEAD`));
    expect(log).not.toContain('feat: change a');
    expect(log).not.toContain('docs: spec a');
    expect(sectie(tekst, 'Stat')).toContain(git(repo, 'diff', '--stat', `${c2}..HEAD`));
    expect(sectie(tekst, 'Stat')).not.toContain('pnpm-lock.yaml');
    const diff = sectie(tekst, 'Diff');
    expect(diff).toContain('+export const a = 3;');
    expect(diff).not.toContain('+export const a = 2;');
    expect(diff).not.toContain('Weggelaten');
  });

  test.each([
    ['--basis', '-x'],
    ['--basis', 'a;b'],
    ['--basis', 'bestaat-niet'],
    ['--sinds', '$(touch x)'],
  ])('agents-leveren/AC-17: %s %s is een ongeldige ref, exit 1 en geen bestand', (optie, waarde) => {
    const { repo } = maakRepo();
    const uit = draai(repo, optie, waarde);

    expect(uit.code).toBe(1);
    expect(uit.stderr).toBe(`reviewpakket: ongeldige ref ${waarde}\n`);
    expect(uit.stdout).toBe('');
    expect(pakketten(repo)).toStrictEqual([]);
    expect(readdirSync(repo)).not.toContain('x');
  });

  test('agents-leveren/AC-17: --sinds met een sha die geen voorouder van HEAD is', () => {
    const { repo } = maakRepo();
    git(repo, 'checkout', '-q', '-b', 'ander', 'main');
    const vreemd = commit(repo, 'chore: elders', { 'elders.txt': 'x\n' });
    git(repo, 'checkout', '-q', 'feat/x');
    const uit = draai(repo, '--sinds', vreemd);

    expect(uit.code).toBe(1);
    expect(uit.stderr).toBe(`reviewpakket: ${vreemd} is geen voorouder van HEAD; geef de laatst gereviewde commit\n`);
    expect(pakketten(repo)).toStrictEqual([]);
  });

  test('agents-leveren/AC-17: een branch zonder commits na de basis', () => {
    const { repo, basis } = maakRepo();
    git(repo, 'checkout', '-q', '-b', 'feat/leeg', 'main');
    const uit = draai(repo);

    expect(uit.code).toBe(1);
    expect(uit.stderr).toBe(`reviewpakket: geen commits in ${kort(basis)}..HEAD\n`);
    expect(pakketten(repo)).toStrictEqual([]);
  });

  test('agents-leveren/AC-17: niet-gecommitte wijziging geeft een waarschuwing, exit 0 en staat niet in het pakket', () => {
    const { repo } = maakRepo();
    schrijf(repo, 'src/a.ts', 'export const a = NIETGECOMMIT;\n');
    const uit = draai(repo);

    expect(uit.code).toBe(0);
    expect(uit.stderr).toBe(
      'reviewpakket: de werkmap heeft niet-gecommitte wijzigingen; die staan niet in het pakket\n',
    );
    const tekst = readFileSync(path.join(repo, uit.stdout.trim()), 'utf8');
    expect(tekst).not.toContain('NIETGECOMMIT');
  });

  test('detached HEAD: branchdeel `detached` in bestandsnaam en kop', () => {
    const { repo, c2 } = maakRepo();
    git(repo, 'checkout', '-q', '--detach', c2);
    const uit = draai(repo);

    expect(uit.code).toBe(0);
    expect(uit.stdout).toBe(`.reviewpakket/detached-${kort(c2)}.md\n`);
    const tekst = readFileSync(path.join(repo, uit.stdout.trim()), 'utf8');
    expect(tekst.split('\n')[0]).toBe(`# Reviewpakket detached @ ${kort(c2)}`);
  });

  test('agents-leveren/AC-18: .gitignore negeert de map .reviewpakket/', () => {
    const uit = spawnSync('git', ['check-ignore', '-q', '.reviewpakket/feat-x-1234567.md'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    expect(uit.status).toBe(0);
  });

  // R-TEST-02: structuur, geen hele zin. Stap 1 van de reviewer noemt het reviewpakket.
  test('agents-leveren/AC-18: stap 1 van de reviewer noemt het reviewpakket', () => {
    const reviewer = readFileSync(path.join(REPO_ROOT, '.claude/agents/reviewer.md'), 'utf8');
    const stap1 = reviewer.split('\n').find((regel) => regel.startsWith('1. ')) ?? '';

    expect(stap1).toMatch(/reviewpakket/);
  });
});
