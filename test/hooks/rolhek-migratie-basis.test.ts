import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as context from '../../rails/hooks/lib/rolhek-context.mjs';
import { rolhekContext } from '../../rails/hooks/lib/rolhek-context.mjs';
import { decide } from '../../rails/hooks/lib/rolhek.mjs';

// Leerpunt #927: een migratie is gecommit als hij in de TIP van het anker of van origin/main staat, nooit via HEAD.
// Een developer kan HEAD verzetten (`checkout --orphan`, `reset --soft`); dan mag een migratie van main niet schrijfbaar worden.
const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};
const MAIN_MIGRATIE = 'db/migrations/20260101000000_x.sql';
const BRANCH_MIGRATIE = 'db/migrations/20260102000000_y.sql';
const dirs: string[] = [];

beforeEach(() => {
  Reflect.deleteProperty(process.env, 'RAILS_ANKER');
});

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function commitBestand(root: string, rel: string, inhoud: string) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), inhoud);
  git(root, 'add', '--', rel);
  git(root, 'commit', '-q', '-m', rel);
}

/** Repo met gates.json (commit `voor`), daarna de migratie van main (commit `main`); desgewenst staat main ook op origin/main. */
function repo(origin: boolean) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'rolhek-mig-basis-')));
  dirs.push(root);
  git(root, 'init', '-q', '-b', 'main');
  commitBestand(root, '.claude/gates.json', readFileSync('.claude/gates.json', 'utf8'));
  const voor = git(root, 'rev-parse', 'HEAD');
  commitBestand(root, MAIN_MIGRATIE, 'create table a();\n');
  const main = git(root, 'rev-parse', 'HEAD');
  if (origin) git(root, 'update-ref', 'refs/remotes/origin/main', main);
  return { root, voor, main };
}

// De export is nieuw: eerst toetsen dat hij er is, zodat de basis op een assertie faalt en niet op laden (leerpunt #892).
function migratieGecommit(root: string, basis: string | null): (rel: string) => unknown {
  expect(context).toHaveProperty('migratieGecommit');
  const functie: unknown = Reflect.get(context, 'migratieGecommit');
  if (typeof functie !== 'function') throw new Error('migratieGecommit is geen functie');
  const toets: unknown = Reflect.apply(functie, undefined, [root, basis]);
  if (typeof toets !== 'function') throw new Error('migratieGecommit geeft geen functie');
  return (rel) => {
    const uitkomst: unknown = Reflect.apply(toets, undefined, [rel]);
    return uitkomst;
  };
}

describe('migratieGecommit tegen echte git: tip van anker en origin/main, nooit HEAD', () => {
  test('een migratie van origin/main is gecommit, een migratie die alleen op de branch staat niet', () => {
    const { root } = repo(true);
    git(root, 'switch', '-q', '-c', 'feat');
    commitBestand(root, BRANCH_MIGRATIE, 'create table b();\n');
    const gecommit = migratieGecommit(root, null);
    expect(gecommit(MAIN_MIGRATIE)).toBe(true);
    expect(gecommit(BRANCH_MIGRATIE)).toBe(false);
  });

  test('HEAD verzetten (checkout --orphan) maakt de migratie van main niet schrijfbaar', () => {
    const { root } = repo(true);
    git(root, 'checkout', '-q', '--orphan', 'tmp');
    expect(migratieGecommit(root, null)(MAIN_MIGRATIE)).toBe(true);
  });

  test('HEAD terugzetten (reset --soft naar vóór de migratie) maakt de migratie van main niet schrijfbaar', () => {
    const { root, voor } = repo(true);
    git(root, 'switch', '-q', '-c', 'feat');
    git(root, 'reset', '-q', '--soft', voor);
    expect(migratieGecommit(root, null)(MAIN_MIGRATIE)).toBe(true);
  });

  test('review #927: een lokale branch origin/main schaduwt de remote-tracking ref niet', () => {
    const { root, voor } = repo(true);
    git(root, 'update-ref', 'refs/heads/origin/main', voor);
    expect(migratieGecommit(root, null)(MAIN_MIGRATIE)).toBe(true);
  });

  test('zonder origin telt het anker: de migratie van main is gecommit, een branch-migratie niet', () => {
    const { root, main } = repo(false);
    git(root, 'switch', '-q', '-c', 'feat');
    commitBestand(root, BRANCH_MIGRATIE, 'create table b();\n');
    const gecommit = migratieGecommit(root, main);
    expect(gecommit(MAIN_MIGRATIE)).toBe(true);
    expect(gecommit(BRANCH_MIGRATIE)).toBe(false);
  });

  test('zonder origin en zonder anker: zonder-origin voor een migratie in HEAD of op schijf, false voor een onbekend pad', () => {
    const { root } = repo(false);
    const OP_SCHIJF = 'db/migrations/20260103000000_z.sql';
    writeFileSync(path.join(root, OP_SCHIJF), 'create table c();\n');
    const gecommit = migratieGecommit(root, null);
    expect(gecommit(MAIN_MIGRATIE)).toBe('zonder-origin');
    expect(gecommit(OP_SCHIJF)).toBe('zonder-origin');
    expect(gecommit('db/migrations/20269999000000_bestaat_niet.sql')).toBe(false);
  });
});

describe('decide met de echte ctx van rolhekContext', () => {
  test('developer Edit op een migratie van main na checkout --orphan: deny voor een gecommitte migratie', () => {
    const { root } = repo(true);
    git(root, 'checkout', '-q', '--orphan', 'tmp');
    const d = decide(
      {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(root, MAIN_MIGRATIE), old_string: 'table a', new_string: 'table b' },
        agent_type: 'developer',
      },
      rolhekContext(root, root),
    );
    expect(d.deny.some((m) => m.includes('is een gecommitte migratie'))).toBe(true);
  });
});
