import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// Spec cloud-toolchain-zelfherstel, AC-10: de lader (.claude/hooks/laden.mjs) voor `werkstraat toolchain-herstel`.
// Echte tijdelijke repo's met een lokale bare remote (zoals hooks-van-main.test.ts); het script van main is een klein
// script dat zijn args en een versiemarkering echoot en met exit 7 stopt, zodat doorgegeven uitvoer en exitcode te meten zijn.
const STUB_SOURCE = path.join(process.cwd(), '.claude/hooks');
const dirs: string[] = [];
const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

const scriptVan = (versie: string) =>
  [
    'for await (const _ of process.stdin);',
    `process.stdout.write('uitvoer:' + process.argv.slice(2).join(' ') + ':${versie}\\n');`,
    'process.exit(7);',
    '',
  ].join('\n');

interface Repo {
  root: string;
  bare: string;
  cache: string;
}

function makeRepo(versie = 'v1', metRemote = true, bron?: string): Repo {
  const root = tmp('lp-repo-');
  git(root, 'init', '-q', '-b', 'main');
  mkdirSync(path.join(root, '.claude/hooks'), { recursive: true });
  for (const naam of ['laden.mjs', 'werkstraat.mjs'])
    copyFileSync(path.join(STUB_SOURCE, naam), path.join(root, '.claude/hooks', naam));
  mkdirSync(path.join(root, 'rails/hooks'), { recursive: true });
  writeFileSync(path.join(root, 'rails/hooks/werkstraat.mjs'), bron ?? scriptVan(versie));
  writeFileSync(path.join(root, '.gitignore'), '.claude/hooks/.cache/\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  const bare = tmp('lp-bare-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  git(root, 'remote', 'add', 'origin', bare);
  git(root, 'push', '-q', 'origin', 'main');
  if (!metRemote) git(root, 'remote', 'remove', 'origin');
  return { root, bare, cache: path.join(root, '.claude/hooks/.cache') };
}

/** Zet een nieuwe versie van het script op de remote main. */
function adviseer(repo: Repo, versie: string) {
  writeFileSync(path.join(repo.root, 'rails/hooks/werkstraat.mjs'), scriptVan(versie));
  git(repo.root, 'commit', '-q', '-am', `naar ${versie}`);
  git(repo.root, 'push', '-q', 'origin', 'main');
}

interface Uitkomst {
  status: number | null;
  stdout: string;
  stderr: string;
}

function draai(repo: Repo, args: string[], extra: Record<string, string | undefined> = {}): Promise<Uitkomst> {
  const cloud = 'CLAUDE_CODE_REMOTE' in extra ? extra : { CLAUDE_CODE_REMOTE: 'true', ...extra };
  return new Promise((resolve) => {
    const kind = spawn(process.execPath, [path.join(repo.root, '.claude/hooks/werkstraat.mjs'), ...args], {
      cwd: repo.root,
      env: { ...process.env, ...GIT_ENV, ...cloud },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    kind.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    kind.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    kind.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
    kind.stdin.end('{}');
  });
}

const boomOid = (repo: Repo) => git(repo.root, 'rev-parse', 'HEAD:rails/hooks');
const anker = (repo: Repo) => readFileSync(path.join(repo.cache, 'main'), 'utf8').trim();

describe('cloud-toolchain-zelfherstel/AC-10 lader', () => {
  test('cloud-toolchain-zelfherstel/AC-10a twee parallelle runs op een lege cache, twintig keer: uitvoer en exitcode van het script, map intact', async () => {
    const repo = makeRepo();
    for (let i = 0; i < 20; i++) {
      rmSync(repo.cache, { recursive: true, force: true });

      const [herstel, start] = await Promise.all([draai(repo, ['toolchain-herstel']), draai(repo, ['session-start'])]);

      expect([herstel.status, herstel.stdout]).toStrictEqual([7, 'uitvoer:toolchain-herstel:v1\n']);
      expect([start.status, start.stdout]).toStrictEqual([7, 'uitvoer:session-start:v1\n']);
      const map = path.join(repo.cache, boomOid(repo));
      expect(readFileSync(path.join(map, 'werkstraat.mjs'), 'utf8')).toBe(scriptVan('v1'));
      expect(readdirSync(map).sort()).toStrictEqual(['.compleet', 'werkstraat.mjs']);
    }
  }, 120_000);

  test('cloud-toolchain-zelfherstel/AC-10b een al intacte doelmap wordt niet gewist of herschreven', async () => {
    const repo = makeRepo();
    await draai(repo, ['toolchain-herstel']);
    const bestand = path.join(repo.cache, boomOid(repo), 'werkstraat.mjs');
    const eerder = statSync(bestand);

    const tweede = await draai(repo, ['toolchain-herstel']);

    expect(tweede.status).toBe(7);
    expect(statSync(bestand).ino).toBe(eerder.ino);
    expect(statSync(bestand).mtimeMs).toBe(eerder.mtimeMs);
  });

  test('cloud-toolchain-zelfherstel/AC-10b een niet-intacte doelmap blijft onder <tree-oid>.tmp-<pid>-<tijd> staan, naast een intacte nieuwe versie', async () => {
    const repo = makeRepo();
    await draai(repo, ['toolchain-herstel']);
    const oid = boomOid(repo);
    const kapot = path.join(repo.cache, oid, 'werkstraat.mjs');
    writeFileSync(kapot, 'VERVALST\n');

    const uitkomst = await draai(repo, ['toolchain-herstel']);

    expect([uitkomst.status, uitkomst.stdout]).toStrictEqual([7, 'uitvoer:toolchain-herstel:v1\n']);
    expect(readFileSync(kapot, 'utf8')).toBe(scriptVan('v1'));
    const weg = readdirSync(repo.cache).filter((naam) => new RegExp(`^${oid}\\.tmp-\\d+-\\d+$`).test(naam));
    expect(weg).toHaveLength(1);
    expect(readFileSync(path.join(repo.cache, weg[0] ?? '', 'werkstraat.mjs'), 'utf8')).toBe('VERVALST\n');
  });

  test('cloud-toolchain-zelfherstel/AC-10c met een verouderd anker ververst toolchain-herstel het anker en draait het script van de nieuwe main', async () => {
    const repo = makeRepo('v1');
    await draai(repo, ['session-start']);
    const oud = anker(repo);
    adviseer(repo, 'v2');

    const uitkomst = await draai(repo, ['toolchain-herstel']);

    expect(uitkomst.stdout).toBe('uitvoer:toolchain-herstel:v2\n');
    expect(anker(repo)).not.toBe(oud);
    expect(anker(repo)).toBe(git(repo.root, 'rev-parse', 'HEAD'));
  });

  test('cloud-toolchain-zelfherstel/AC-10c zonder anker legt toolchain-herstel het anker vast', async () => {
    const repo = makeRepo();

    const uitkomst = await draai(repo, ['toolchain-herstel']);

    expect(uitkomst.stdout).toBe('uitvoer:toolchain-herstel:v1\n');
    expect(anker(repo)).toBe(git(repo.root, 'rev-parse', 'HEAD'));
  });

  test('cloud-toolchain-zelfherstel/AC-10c ruimOp draait na session-start, niet na toolchain-herstel', async () => {
    const repo = makeRepo();
    await draai(repo, ['session-start']);
    const oud = path.join(repo.cache, 'b'.repeat(40));
    mkdirSync(oud);
    const tweeDagen = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    utimesSync(oud, tweeDagen, tweeDagen);

    await draai(repo, ['toolchain-herstel']);
    const naHerstel = existsSync(oud);
    await draai(repo, ['session-start']);

    expect(naHerstel).toBe(true);
    expect(existsSync(oud)).toBe(false);
  });

  test('cloud-toolchain-zelfherstel/AC-10d een laderfout bij toolchain-herstel geeft exit 0 en de !-regel op stdout, zonder "faalt dicht"', async () => {
    const repo = makeRepo('v1', false);

    const uitkomst = await draai(repo, ['toolchain-herstel']);

    expect(uitkomst.status).toBe(0);
    expect(uitkomst.stdout).toContain('! toolchain-herstel niet gestart (ADR 0045):');
    expect(uitkomst.stdout + uitkomst.stderr).not.toContain('faalt dicht');
  });

  test('cloud-toolchain-zelfherstel/AC-10e een geplant .git/commondir: exit 0 en de melding op stdout, zoals session-start', async () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo.root, '.git/commondir'), '../../elders\n');

    const uitkomst = await draai(repo, ['toolchain-herstel']);

    expect(uitkomst.status).toBe(0);
    expect(uitkomst.stdout).toMatch(/commondir\.geplant-\d+/);
    expect(existsSync(path.join(repo.root, '.git/commondir'))).toBe(false);
  });

  test('cloud-toolchain-zelfherstel/AC-10 K3 een script van main dat vóór zijn eigen try crasht: exit 0 en één !-regel op stdout bij toolchain-herstel', async () => {
    const repo = makeRepo('v1', true, "throw new Error('boem bij het laden');\n");

    const uitkomst = await draai(repo, ['toolchain-herstel']);

    const lijst = uitkomst.stdout.split('\n').filter((regel) => regel !== '');
    expect(uitkomst.status).toBe(0);
    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toMatch(/^! /);
  });

  test('cloud-toolchain-zelfherstel/AC-10 K2 lokaal (CLAUDE_CODE_REMOTE niet true) ververst toolchain-herstel het anker niet: geen ls-remote of fetch', async () => {
    const repo = makeRepo('v1');
    await draai(repo, ['session-start']);
    adviseer(repo, 'v2');
    const stubs = tmp('lp-stubs-');
    const log = path.join(stubs, 'git.log');
    const echt = (process.env['PATH'] ?? '')
      .split(path.delimiter)
      .map((dir) => path.join(dir, 'git'))
      .find((kandidaat) => existsSync(kandidaat));
    writeFileSync(path.join(stubs, 'git'), `#!/bin/sh\necho "$@" >> "${log}"\nexec ${echt ?? 'git'} "$@"\n`, {
      mode: 0o755,
    });
    const pad = { PATH: `${stubs}${path.delimiter}${process.env['PATH'] ?? ''}` };
    const gebruikt = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');

    const lokaal = await draai(repo, ['toolchain-herstel'], { ...pad, CLAUDE_CODE_REMOTE: undefined });
    const lokaalLog = gebruikt();
    const cloud = await draai(repo, ['toolchain-herstel'], { ...pad, CLAUDE_CODE_REMOTE: 'true' });

    expect(['ls-remote', 'fetch'].filter((woord) => lokaalLog.includes(woord))).toStrictEqual([]);
    expect(lokaal.stdout).toBe('uitvoer:toolchain-herstel:v1\n');
    expect(gebruikt()).toContain('ls-remote');
    expect(cloud.stdout).toBe('uitvoer:toolchain-herstel:v2\n');
  });
});
