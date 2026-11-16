import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { trustedBase } from '../../rails/hooks/lib/authority-context.mjs';
import { APP_PAYMENTS, optioneel, type Optioneel } from '../rails/app-padtabel-kit';
import { nieuw } from '../rails/padtabel-kit';

// Spec app-padtabel (Ontwerp, "Afwezig of vervalst"; AC-7, AC-8): buiten een hook onderscheidt `readOptional` van het basisobject
// echte afwezigheid (`{ afwezig: true }`, de enige uitkomst die "geen app-rijen" mag betekenen) van een basisobject dat er wel
// is maar niet gelezen kan worden: een ontbrekend of kapot blob- of tree-object, een gitlink of een symlink op het pad gooit.
const APP = '.claude/gates.app.json';
const APP_TEKST = `${JSON.stringify(APP_PAYMENTS)}\n`;
const GATES_TEKST = `${JSON.stringify(nieuw())}\n`;
const dirs: string[] = [];

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

/** Een repo met één commit met deze bestanden (alle objecten los, niet ingepakt) en de SHA van die commit. */
function repoMet(files: Record<string, string>): { dir: string; sha: string } {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'app-padtabel-buiten-')));
  dirs.push(dir);
  git(dir, 'init', '-q', '-b', 'main');
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'c');
  return { dir, sha: git(dir, 'rev-parse', 'HEAD') };
}

const metApp = () => repoMet({ '.claude/gates.json': GATES_TEKST, [APP]: APP_TEKST });

/** Het losse objectbestand van `oid`; de test faalt als het object niet los staat. */
function losseObject(dir: string, oid: string): string {
  return path.join(dir, '.git/objects', oid.slice(0, 2), oid.slice(2));
}

function verwijder(dir: string, oid: string) {
  expect(() => {
    rmSync(losseObject(dir, oid));
  }, `${oid} moet een los object zijn`).not.toThrow();
}

function beschadig(dir: string, oid: string) {
  verwijder(dir, oid);
  writeFileSync(losseObject(dir, oid), Buffer.from('dit is geen zlib-stroom'));
}

/** `readOptional` buiten een hook (geen anker), op de commit `sha`. */
function lezer(dir: string, sha: string): (pad: string) => Optioneel {
  const basis = trustedBase(dir, sha);
  const functie: unknown =
    basis === null ? undefined : Object.entries(basis).find(([sleutel]) => sleutel === 'readOptional')?.[1];
  if (typeof functie !== 'function') return expect.fail('het basisobject van trustedBase heeft geen readOptional');
  return (pad) => {
    const uit: unknown = Reflect.apply(functie, undefined, [pad]);
    return optioneel(uit);
  };
}

beforeEach(() => {
  // Buiten een hook is er geen anker.
  Reflect.deleteProperty(process.env, 'RAILS_ANKER');
});

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('app-padtabel/AC-7 readOptional van de vertrouwde basis buiten een hook', () => {
  test('app-padtabel/AC-7: een bestand dat niet in de boom van de commit staat geeft { afwezig: true }', () => {
    const { dir, sha } = repoMet({ '.claude/gates.json': GATES_TEKST, 'README.md': 'x\n' });

    expect(lezer(dir, sha)(APP)).toStrictEqual({ afwezig: true });
    // Ook als `.claude` zelf ontbreekt.
    const zonderClaude = repoMet({ 'README.md': 'x\n' });
    expect(lezer(zonderClaude.dir, zonderClaude.sha)(APP)).toStrictEqual({ afwezig: true });
  });

  test('app-padtabel/AC-7: een gewoon bestand geeft zijn tekst', () => {
    const { dir, sha } = metApp();

    expect(lezer(dir, sha)(APP)).toBe(APP_TEKST);
  });

  test('app-padtabel/AC-7: een bestaand maar leeg bestand geeft een lege tekst, geen afwezig', () => {
    const { dir, sha } = repoMet({ '.claude/gates.json': GATES_TEKST, [APP]: '' });

    expect(lezer(dir, sha)(APP)).toBe('');
  });

  test('app-padtabel/AC-7: een verwijderd blob-object van het app-bestand gooit en geeft nooit { afwezig: true }', () => {
    const { dir, sha } = metApp();
    verwijder(dir, git(dir, 'rev-parse', `${sha}:${APP}`));

    expect(() => lezer(dir, sha)(APP)).toThrow();
  });

  test('app-padtabel/AC-7: een beschadigd blob-object van het app-bestand gooit', () => {
    const { dir, sha } = metApp();
    beschadig(dir, git(dir, 'rev-parse', `${sha}:${APP}`));

    expect(() => lezer(dir, sha)(APP)).toThrow();
  });

  test('app-padtabel/AC-7: een gitlink (160000) op het pad gooit', () => {
    const { dir } = repoMet({ '.claude/gates.json': GATES_TEKST });
    // Een submodule-commit die niet in deze repo staat, zoals bij een echte submodule.
    git(dir, 'update-index', '--add', '--cacheinfo', `160000,${'a'.repeat(40)},${APP}`);
    git(dir, 'commit', '-q', '-m', 'gitlink');
    const gitlink = git(dir, 'rev-parse', 'HEAD');
    expect(git(dir, 'ls-tree', gitlink, APP)).toContain('160000 commit');

    expect(() => lezer(dir, gitlink)(APP)).toThrow();
    // Het bestaande bestand ernaast blijft leesbaar.
    expect(lezer(dir, gitlink)('.claude/gates.json')).toBe(GATES_TEKST);
  });

  test('app-padtabel/AC-7: een symlink (120000) op het pad gooit, in plaats van de doeltekst te geven', () => {
    const dir = repoMet({ '.claude/gates.json': GATES_TEKST }).dir;
    symlinkSync('gates.json', path.join(dir, APP));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'symlink');
    const sha = git(dir, 'rev-parse', 'HEAD');
    expect(git(dir, 'ls-tree', sha, APP)).toContain('120000 blob');

    expect(() => lezer(dir, sha)(APP)).toThrow();
  });

  test('app-padtabel/AC-7: een tree op het pad (het app-bestand is een map) gooit', () => {
    const { dir, sha } = repoMet({ '.claude/gates.json': GATES_TEKST, [`${APP}/x`]: 'x\n' });

    expect(() => lezer(dir, sha)(APP)).toThrow();
  });

  test('app-padtabel/AC-7: een verwijderd tree-object van .claude gooit, en geeft niet { afwezig: true }', () => {
    const { dir, sha } = metApp();
    verwijder(dir, git(dir, 'rev-parse', `${sha}:.claude`));

    expect(() => lezer(dir, sha)(APP)).toThrow();
  });

  test('app-padtabel/AC-7: een beschadigd tree-object van .claude gooit', () => {
    const { dir, sha } = metApp();
    beschadig(dir, git(dir, 'rev-parse', `${sha}:.claude`));

    expect(() => lezer(dir, sha)(APP)).toThrow();
  });

  test('app-padtabel/AC-7: een verwijderd root-tree-object gooit', () => {
    const { dir, sha } = metApp();
    verwijder(dir, git(dir, 'rev-parse', `${sha}^{tree}`));

    expect(() => lezer(dir, sha)(APP)).toThrow();
  });
});
