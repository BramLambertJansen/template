import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// ADR 0083 punt 1 (leerpunt #553), spec rolhek-vooraf-krimp AC-3: een geplant `.git/commondir` (in de hoofdcheckout bestaat het
// niet, de sandbox maskeert het pad dan met /dev/null) breekt elke git-aanroep. De lader controleert dat vóór zijn eerste
// git-aanroep: hij hernoemt het pad naar `commondir.geplant-<tijd>`, roept geen git aan en meldt of blokkeert per event.
// Een nep-`git` vooraan in PATH bewijst "geen git-aanroep": hij schrijft een markerbestand en geeft exit 0.
const STUB_SOURCE = path.join(process.cwd(), '.claude/hooks');
const STUBS = ['rolhek', 'effect', 'werkstraat', 'meting', 'melding', 'statusregel', 'laden'];
const GEPLANT = /^commondir\.geplant-\d+$/;
const IS_ROOT = process.getuid?.() === 0;
const dirs: string[] = [];
const hersteld: string[] = [];

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
}

function kopieerStubs(root: string): void {
  mkdirSync(path.join(root, '.claude/hooks'), { recursive: true });
  for (const naam of STUBS)
    copyFileSync(path.join(STUB_SOURCE, `${naam}.mjs`), path.join(root, '.claude/hooks', `${naam}.mjs`));
}

/** Een anker (willekeurige geldige oid) zodat elke hook, ook het rolhek en de statusregel, zonder netwerk bij git uitkomt. */
function zetAnker(root: string): void {
  mkdirSync(path.join(root, '.claude/hooks/.cache'), { recursive: true });
  writeFileSync(path.join(root, '.claude/hooks/.cache/main'), 'a'.repeat(40) + '\n');
}

function nieuweRepo(): string {
  const root = tmp('laden-cd-');
  git(root, 'init', '-q', '-b', 'main');
  kopieerStubs(root);
  zetAnker(root);
  return root;
}

/** Een uitvoerbare nep-git die elke aanroep in het markerbestand vastlegt. */
function shim(): string {
  const dir = tmp('laden-cd-shim-');
  writeFileSync(path.join(dir, 'git'), '#!/bin/sh\necho "$@" >> "$GIT_MARKER"\nexit 0\n', { mode: 0o755 });
  return dir;
}

interface Uitkomst {
  status: number | null;
  stdout: string;
  stderr: string;
  marker: string;
}

function draai(root: string, naam: string, args: string[] = []): Uitkomst {
  const marker = path.join(tmp('laden-cd-marker-'), 'git-aangeroepen');
  const result = spawnSync(process.execPath, [path.join(root, '.claude/hooks', `${naam}.mjs`), ...args], {
    cwd: root,
    input: '',
    encoding: 'utf8',
    env: {
      ...process.env,
      ...GIT_ENV,
      PATH: `${shim()}${path.delimiter}${process.env['PATH'] ?? ''}`,
      GIT_MARKER: marker,
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, marker };
}

const gitDir = (root: string) => path.join(root, '.git');
const geplant = (root: string) => readdirSync(gitDir(root)).filter((naam) => GEPLANT.test(naam));
const plant = (root: string) => {
  writeFileSync(path.join(gitDir(root), 'commondir'), '../../elders\n');
};
const bestaat = (pad: string) => {
  try {
    lstatSync(pad);
    return true;
  } catch {
    return false;
  }
};

afterEach(() => {
  for (const pad of hersteld.splice(0)) {
    try {
      chmodSync(pad, 0o755);
    } catch {
      // al opgeruimd
    }
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Soort = 'blokkeert' | 'meldt' | 'zwijgt';
const EVENTS: { naam: string; args: string[]; soort: Soort }[] = [
  { naam: 'rolhek', args: [], soort: 'blokkeert' },
  { naam: 'rolhek', args: ['willekeurig'], soort: 'blokkeert' },
  { naam: 'effect', args: ['pre'], soort: 'blokkeert' },
  { naam: 'effect', args: ['post'], soort: 'blokkeert' },
  { naam: 'effect', args: ['edit-post'], soort: 'blokkeert' },
  { naam: 'effect', args: ['stop'], soort: 'blokkeert' },
  { naam: 'effect', args: ['subagent-stop'], soort: 'blokkeert' },
  { naam: 'werkstraat', args: ['post-edit'], soort: 'blokkeert' },
  { naam: 'werkstraat', args: ['stop'], soort: 'blokkeert' },
  { naam: 'werkstraat', args: ['subagent-stop'], soort: 'blokkeert' },
  { naam: 'werkstraat', args: ['session-start'], soort: 'meldt' },
  { naam: 'melding', args: [], soort: 'meldt' },
  { naam: 'effect', args: ['subagent-start'], soort: 'meldt' },
  { naam: 'effect', args: ['post-failure'], soort: 'meldt' },
  { naam: 'meting', args: [], soort: 'zwijgt' },
  { naam: 'statusregel', args: [], soort: 'zwijgt' },
];

/** Controleert de uitkomst van één event op een geplant commondir dat hernoemd kon worden. */
function verwachtHernoemd(root: string, uitkomst: Uitkomst, soort: Soort): void {
  const nieuw = geplant(root);

  expect(existsSync(uitkomst.marker)).toBe(false);
  expect(bestaat(path.join(gitDir(root), 'commondir'))).toBe(false);
  expect(nieuw).toHaveLength(1);
  const [naam = ''] = nieuw;
  if (soort === 'blokkeert') {
    expect(uitkomst.status).toBe(2);
    expect(uitkomst.stderr).toContain(naam);
  } else if (soort === 'meldt') {
    expect(uitkomst.status).toBe(0);
    expect(uitkomst.stdout).toContain(naam);
  } else {
    expect([uitkomst.status, uitkomst.stdout, uitkomst.stderr]).toStrictEqual([0, '', '']);
  }
}

describe('laden: een geplant .git/commondir wordt hernoemd, zonder git-aanroep', () => {
  test.each(EVENTS)('gewoon bestand: $naam $args -> $soort', ({ naam, args, soort }) => {
    const root = nieuweRepo();
    plant(root);

    verwachtHernoemd(root, draai(root, naam, args), soort);
  });

  test('symlink als .git/commondir valt dicht (rolhek en session-start)', () => {
    for (const { naam, args, soort } of EVENTS.filter((e) => e.naam === 'rolhek' || e.args[0] === 'session-start')) {
      const root = nieuweRepo();
      writeFileSync(path.join(root, 'doel'), 'x\n');
      symlinkSync(path.join(root, 'doel'), path.join(gitDir(root), 'commondir'));

      verwachtHernoemd(root, draai(root, naam, args), soort);
    }
  });

  test('map als .git/commondir valt dicht (rolhek en session-start)', () => {
    for (const { naam, args, soort } of EVENTS.filter((e) => e.naam === 'rolhek' || e.args[0] === 'session-start')) {
      const root = nieuweRepo();
      mkdirSync(path.join(gitDir(root), 'commondir'));

      verwachtHernoemd(root, draai(root, naam, args), soort);
    }
  });

  test.skipIf(IS_ROOT)('onleesbaar bestand (chmod 000) valt dicht (rolhek en session-start)', () => {
    for (const { naam, args, soort } of EVENTS.filter((e) => e.naam === 'rolhek' || e.args[0] === 'session-start')) {
      const root = nieuweRepo();
      plant(root);
      chmodSync(path.join(gitDir(root), 'commondir'), 0o000);

      verwachtHernoemd(root, draai(root, naam, args), soort);
    }
  });

  test.skipIf(IS_ROOT)('hernoemen mislukt (.git alleen-lezen): rolhek blokkeert en noemt buiten Claude Code', () => {
    const root = nieuweRepo();
    plant(root);
    hersteld.push(gitDir(root));
    chmodSync(gitDir(root), 0o555);

    const uitkomst = draai(root, 'rolhek');
    chmodSync(gitDir(root), 0o755);

    expect(uitkomst.status).toBe(2);
    expect(uitkomst.stderr).toContain('buiten Claude Code');
    expect(existsSync(uitkomst.marker)).toBe(false);
    expect(bestaat(path.join(gitDir(root), 'commondir'))).toBe(true);
    expect(geplant(root)).toStrictEqual([]);
  });

  test.skipIf(IS_ROOT)('hernoemen mislukt: session-start meldt nog steeds en noemt buiten Claude Code', () => {
    const root = nieuweRepo();
    plant(root);
    hersteld.push(gitDir(root));
    chmodSync(gitDir(root), 0o555);

    const uitkomst = draai(root, 'werkstraat', ['session-start']);
    chmodSync(gitDir(root), 0o755);

    expect([uitkomst.status, existsSync(uitkomst.marker)]).toStrictEqual([0, false]);
    expect(uitkomst.stdout).toContain('buiten Claude Code');
  });

  test.skipIf(IS_ROOT)('lstat geeft EACCES (.git niet doorzoekbaar): geen git-aanroep, rolhek blokkeert', () => {
    const root = nieuweRepo();
    plant(root);
    hersteld.push(gitDir(root));
    chmodSync(gitDir(root), 0o000);

    const uitkomst = draai(root, 'rolhek');
    chmodSync(gitDir(root), 0o755);

    expect(uitkomst.status).toBe(2);
    expect(uitkomst.stderr).toContain('buiten Claude Code');
    expect(existsSync(uitkomst.marker)).toBe(false);
  });

  test('zonder .git: de lader roept git aan en hernoemt niets', () => {
    const root = tmp('laden-cd-zondergit-');
    kopieerStubs(root);
    zetAnker(root);

    const uitkomst = draai(root, 'rolhek');

    expect(existsSync(path.join(root, '.git'))).toBe(false);
    expect(existsSync(uitkomst.marker)).toBe(true);
    expect(readdirSync(root).filter((naam) => GEPLANT.test(naam))).toStrictEqual([]);
  });

  test('gekoppelde worktree: .git is een bestand, de lader roept git aan en hernoemt niets', () => {
    const hoofd = nieuweRepo();
    writeFileSync(path.join(hoofd, 'README.md'), 'x\n');
    git(hoofd, 'add', 'README.md');
    git(hoofd, 'commit', '-q', '-m', 'init');
    const wt = path.join(tmp('laden-cd-wt-'), 'wt');
    git(hoofd, 'worktree', 'add', '-q', '-b', 'feat/wt', wt);
    kopieerStubs(wt);
    zetAnker(wt);

    expect(lstatSync(path.join(wt, '.git')).isFile()).toBe(true);
    const uitkomst = draai(wt, 'rolhek');

    expect(existsSync(uitkomst.marker)).toBe(true);
    expect(geplant(hoofd)).toStrictEqual([]);
    expect(readdirSync(path.join(gitDir(hoofd), 'worktrees', 'wt')).filter((naam) => GEPLANT.test(naam))).toStrictEqual(
      [],
    );
    expect(bestaat(path.join(gitDir(hoofd), 'worktrees', 'wt', 'commondir'))).toBe(true);
  });

  test.each(EVENTS)('zonder .git/commondir: $naam $args roept git aan en hernoemt niets', ({ naam, args }) => {
    const root = nieuweRepo();

    const uitkomst = draai(root, naam, args);

    expect(existsSync(uitkomst.marker)).toBe(true);
    expect(geplant(root)).toStrictEqual([]);
  });
});
