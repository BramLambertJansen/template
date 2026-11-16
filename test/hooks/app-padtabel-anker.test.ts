import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { trustedBase } from '../../rails/hooks/lib/authority-context.mjs';
import { rolhekContext } from '../../rails/hooks/lib/rolhek-context.mjs';
import { APP_PAYMENTS, laadVertrouwdeTekstOptioneel, optioneel, type Optioneel } from '../rails/app-padtabel-kit';
import { nieuw } from '../rails/padtabel-kit';

// Spec app-padtabel: het rolhek leest `.claude/gates.app.json` uit dezelfde bron als `.claude/gates.json`. In een hook (anker
// gezet) uit het anker, gecontroleerd gelezen (AC-7, AC-8); daarbuiten uit dezelfde commit als gates.json, en alleen als
// gates.json uit de werkmap komt ook het app-bestand uit de werkmap (Ontwerp, Lezers). Remotes en netwerk komen er niet aan te pas.
const ROLHEK_SCRIPT = path.join(process.cwd(), 'rails/hooks/rolhek.mjs');
const APP = '.claude/gates.app.json';
const dirs: string[] = [];

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

function tmp(prefix: string): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

function gitIn(cwd: string, input: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, input, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

const git = (cwd: string, ...args: string[]): string => gitIn(cwd, '', ...args);

function write(dir: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
}

/** Schrijft de bestanden, commit ze en geeft de SHA van de commit. */
function commit(dir: string, files: Record<string, string>, message = 'c'): string {
  write(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

function newRepo(): string {
  const dir = tmp('app-padtabel-');
  git(dir, 'init', '-q', '-b', 'main');
  return dir;
}

beforeEach(() => {
  // Buiten een hook is er geen anker; een test die er een wil, zet hem zelf.
  Reflect.deleteProperty(process.env, 'RAILS_ANKER');
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// ---------- vervalste objecten (zoals vertrouwde-basis-anker.test.ts) ----------

type Entry = [mode: string, name: string, oid: string];

function treeBody(entries: Entry[]): Buffer {
  return Buffer.concat(
    entries.map(([mode, name, oid]) => Buffer.concat([Buffer.from(`${mode} ${name}\0`), Buffer.from(oid, 'hex')])),
  );
}

/** Vervangt het losse object `oid` door een ander object; git leest een los object zonder de hash te controleren. */
function forgeLoose(dir: string, oid: string, object: { type: string; body: Buffer }) {
  const { type, body } = object;
  const file = path.join(dir, '.git/objects', oid.slice(0, 2), oid.slice(2));
  expect(() => {
    rmSync(file);
  }, `${oid} moet een los object zijn`).not.toThrow();
  writeFileSync(file, deflateSync(Buffer.concat([Buffer.from(`${type} ${String(body.length)}\0`), body])));
}

function mktree(dir: string, entries: Entry[]): string {
  const lines = entries.map(([mode, name, oid]) => {
    const soort = mode === '40000' ? 'tree' : 'blob';
    return `${mode.padStart(6, '0')} ${soort} ${oid}\t${name}\n`;
  });
  return gitIn(dir, lines.join(''), 'mktree');
}

function hashObject(dir: string, text: string): string {
  const file = path.join(tmp('app-padtabel-blob-'), 'blob');
  writeFileSync(file, text);
  return git(dir, 'hash-object', '-w', file);
}

// ---------- AC-7: vertrouwdeTekstOptioneel ----------

const APP_TEKST = `${JSON.stringify(APP_PAYMENTS)}\n`;
const GATES_TEKST = `${JSON.stringify(nieuw())}\n`;

/** Een repo met een app-bestand, een gewoon bestand, een symlink en een submodule; `.claude` bestaat. */
function metApp() {
  const dir = newRepo();
  const sha = commit(dir, {
    '.claude/gates.json': GATES_TEKST,
    [APP]: APP_TEKST,
    'diep/in/map/bestand.txt': 'diep ë\n',
    'script.sh': '#!/bin/sh\n',
  });
  git(dir, 'update-index', '--chmod=+x', 'script.sh');
  symlinkSync('.claude/gates.json', path.join(dir, 'link'));
  git(dir, 'add', 'link');
  git(dir, 'update-index', '--add', '--cacheinfo', `160000,${sha},submodule`);
  git(dir, 'commit', '-q', '-m', 'speciale modi');
  return { dir, sha: git(dir, 'rev-parse', 'HEAD') };
}

/** Een repo waarvan `.claude` bestaat maar het app-bestand ontbreekt. */
function zonderApp() {
  const dir = newRepo();
  const sha = commit(dir, { '.claude/gates.json': GATES_TEKST, 'README.md': 'x\n' });
  return { dir, sha };
}

/** Een repo waarin het app-bestand een symlink is. */
function appAlsSymlink() {
  const dir = newRepo();
  write(dir, { '.claude/gates.json': GATES_TEKST });
  symlinkSync('gates.json', path.join(dir, APP));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'symlink');
  return { dir, sha: git(dir, 'rev-parse', 'HEAD') };
}

describe('app-padtabel/AC-7 vertrouwdeTekstOptioneel(root, sha, pad)', () => {
  test('app-padtabel/AC-7: een gewoon bestand geeft de utf8-tekst, ook diep in een boom en uitvoerbaar', async () => {
    const lees = await laadVertrouwdeTekstOptioneel();
    const { dir, sha } = metApp();

    expect([
      lees(dir, sha, APP),
      lees(dir, sha, 'diep/in/map/bestand.txt'),
      lees(dir, sha, 'script.sh'),
    ]).toStrictEqual([APP_TEKST, 'diep ë\n', '#!/bin/sh\n']);
  });

  test('app-padtabel/AC-7: afwezig in een geverifieerde boom geeft { afwezig: true }', async () => {
    const lees = await laadVertrouwdeTekstOptioneel();
    const { dir, sha } = zonderApp();

    expect(lees(dir, sha, APP)).toStrictEqual({ afwezig: true });
    expect(lees(dir, sha, 'bestaat-niet.json')).toStrictEqual({ afwezig: true });
    // Het bestaande bestand ernaast blijft leesbaar.
    expect(lees(dir, sha, '.claude/gates.json')).toBe(GATES_TEKST);
  });

  test('app-padtabel/AC-7: een tekst en { afwezig: true } zijn verschillende uitkomsten (geen lege tekst voor afwezig)', async () => {
    const lees = await laadVertrouwdeTekstOptioneel();
    const { dir, sha } = zonderApp();
    const leeg = commit(dir, { [APP]: '' }, 'leeg app-bestand');

    expect(lees(dir, sha, APP)).not.toBe('');
    expect(lees(dir, leeg, APP)).toBe('');
  });

  test('app-padtabel/AC-7: een vervalst los blob-object gooit (en geeft nooit { afwezig: true })', async () => {
    const lees = await laadVertrouwdeTekstOptioneel();
    const { dir, sha } = metApp();
    forgeLoose(dir, git(dir, 'rev-parse', `${sha}:${APP}`), { type: 'blob', body: Buffer.from('{"paden":{}}\n') });
    expect(git(dir, 'cat-file', 'blob', `${sha}:${APP}`)).toBe('{"paden":{}}');

    expect(() => lees(dir, sha, APP)).toThrow();
    expect(lees(dir, sha, 'diep/in/map/bestand.txt')).toBe('diep ë\n');
  });

  test('app-padtabel/AC-7: een vervalste tree zonder de naam gooit: een vervalst object bootst afwezig niet na', async () => {
    const lees = await laadVertrouwdeTekstOptioneel();
    const { dir, sha } = metApp();
    const gates = git(dir, 'rev-parse', `${sha}:.claude/gates.json`);
    const claude = git(dir, 'rev-parse', `${sha}:.claude`);
    forgeLoose(dir, claude, { type: 'tree', body: treeBody([['100644', 'gates.json', gates]]) });
    expect(() => git(dir, 'cat-file', '-e', `${sha}:${APP}`)).toThrow();

    expect(() => lees(dir, sha, APP)).toThrow();
  });

  test('app-padtabel/AC-7: een vervalst los commit-object gooit', async () => {
    const lees = await laadVertrouwdeTekstOptioneel();
    const { dir, sha } = metApp();
    const evil = hashObject(dir, '{"paden":{}}\n');
    const claude = mktree(dir, [['100644', 'gates.app.json', evil]]);
    const root = mktree(dir, [['40000', '.claude', claude]]);
    const who = 't <t@example.com> 0 +0000';
    forgeLoose(dir, sha, {
      type: 'commit',
      body: Buffer.from(`tree ${root}\nauthor ${who}\ncommitter ${who}\n\nvervalst\n`),
    });

    expect(() => lees(dir, sha, APP)).toThrow();
  });

  test('app-padtabel/AC-7: een symlink op het pad gooit (ook als het app-bestand zelf een symlink is)', async () => {
    const lees = await laadVertrouwdeTekstOptioneel();
    const { dir, sha } = metApp();
    const link = appAlsSymlink();

    expect(() => lees(dir, sha, 'link')).toThrow();
    expect(() => lees(link.dir, link.sha, APP)).toThrow();
  });

  test.each([
    { naam: 'een submodule (160000)', pad: 'submodule' },
    { naam: 'een tree', pad: 'diep/in' },
  ])('app-padtabel/AC-7: $naam op het pad gooit', async ({ pad }) => {
    const lees = await laadVertrouwdeTekstOptioneel();
    const { dir, sha } = metApp();

    expect(() => lees(dir, sha, pad)).toThrow();
  });

  test('app-padtabel/AC-7: een onleesbare commit (onbekend, of een tree-oid) gooit, nooit { afwezig: true }', async () => {
    const lees = await laadVertrouwdeTekstOptioneel();
    const { dir, sha } = zonderApp();

    expect(() => lees(dir, 'a'.repeat(40), APP)).toThrow();
    expect(() => lees(dir, git(dir, 'rev-parse', `${sha}^{tree}`), APP)).toThrow();
  });
});

// ---------- het basisobject van authority-context: readOptional ----------

/** `readOptional` van het basisobject, of een mislukte assertie als die ontbreekt; gooit pas als je de lezer aanroept. */
function basisLezer(basis: ReturnType<typeof trustedBase>): (pad: string) => Optioneel {
  const functie: unknown =
    basis === null ? undefined : Object.entries(basis).find(([sleutel]) => sleutel === 'readOptional')?.[1];
  if (typeof functie !== 'function') return expect.fail('het basisobject van trustedBase heeft geen readOptional');
  return (pad) => {
    const uit: unknown = Reflect.apply(functie, undefined, [pad]);
    return optioneel(uit);
  };
}

describe('app-padtabel/AC-7 het basisobject krijgt readOptional', () => {
  test('app-padtabel/AC-7: buiten een hook (base): tekst als het bestand er is, { afwezig: true } als het ontbreekt', () => {
    const { dir, sha } = metApp();
    const zonder = zonderApp();

    expect(basisLezer(trustedBase(dir, sha))(APP)).toBe(APP_TEKST);
    expect(basisLezer(trustedBase(zonder.dir, zonder.sha))(APP)).toStrictEqual({ afwezig: true });
  });

  test('app-padtabel/AC-7: in een hook (anker): gecontroleerd gelezen; afwezig is afwezig', () => {
    const { dir, sha } = metApp();
    const zonder = zonderApp();

    vi.stubEnv('RAILS_ANKER', sha);
    expect(basisLezer(trustedBase(dir, undefined))(APP)).toBe(APP_TEKST);
    vi.stubEnv('RAILS_ANKER', zonder.sha);
    expect(basisLezer(trustedBase(zonder.dir, undefined))(APP)).toStrictEqual({ afwezig: true });
  });

  test('app-padtabel/AC-7: in een hook gooit een vervalst blob-object, en een vervalste tree geeft geen afwezig', () => {
    const een = metApp();
    forgeLoose(een.dir, git(een.dir, 'rev-parse', `${een.sha}:${APP}`), { type: 'blob', body: Buffer.from('{}\n') });
    vi.stubEnv('RAILS_ANKER', een.sha);
    const lezerEen = basisLezer(trustedBase(een.dir, undefined));
    expect(() => lezerEen(APP)).toThrow();

    const twee = metApp();
    const gates = git(twee.dir, 'rev-parse', `${twee.sha}:.claude/gates.json`);
    forgeLoose(twee.dir, git(twee.dir, 'rev-parse', `${twee.sha}:.claude`), {
      type: 'tree',
      body: treeBody([['100644', 'gates.json', gates]]),
    });
    vi.stubEnv('RAILS_ANKER', twee.sha);
    const lezerTwee = basisLezer(trustedBase(twee.dir, undefined));
    expect(() => lezerTwee(APP)).toThrow();
  });

  test('app-padtabel/AC-7: het bestaande read van het basisobject blijft zoals het is (null voor een ontbrekend bestand)', () => {
    const { dir, sha } = zonderApp();
    vi.stubEnv('RAILS_ANKER', sha);

    expect(trustedBase(dir, undefined)?.read(APP)).toBeNull();
    expect(trustedBase(dir, undefined)?.read('.claude/gates.json')).toBe(GATES_TEKST);
  });
});

// ---------- AC-8: het rolhek-script in een hook ----------

interface AnkerOpzet {
  /** gates.json van het anker */
  gates?: string;
  /** het app-bestand in het anker; null: het anker heeft er geen */
  app: string | null;
  /** het app-bestand in de werkmap (niet gecommit) */
  werk?: string;
}

/** Repo met het anker als enige commit (github-url zonder netwerk), branch feat/x en een werkmap. */
function ankerRepo(opzet: AnkerOpzet) {
  const dir = newRepo();
  const bestanden: Record<string, string> = { '.claude/gates.json': opzet.gates ?? GATES_TEKST, 'README.md': 'x\n' };
  if (opzet.app !== null) bestanden[APP] = opzet.app;
  const anker = commit(dir, bestanden, 'anker');
  git(dir, 'remote', 'add', 'origin', 'https://github.com/acme/app.git');
  git(dir, 'switch', '-q', '-c', 'feat/x');
  if (opzet.werk !== undefined) write(dir, { [APP]: opzet.werk });
  return { dir, anker };
}

function runRolhek({ dir, anker }: { dir: string; anker: string }, file: string, agent?: string) {
  const payload = {
    tool_name: 'Write',
    tool_input: { file_path: `${dir}/${file}`, content: 'x\n' },
    cwd: dir,
    ...(agent === undefined ? {} : { agent_type: agent }),
  };
  const base: Record<string, string | undefined> = { ...process.env, ...GIT_ENV, CLAUDE_PROJECT_DIR: dir };
  delete base['RAILS_ANKER'];
  const result = spawnSync('node', [ROLHEK_SCRIPT], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...base, RAILS_ANKER: anker },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const asks = (stdout: string) => stdout.includes('"permissionDecision":"ask"');

describe('app-padtabel/AC-8 rolhek in een hook: het app-bestand uit het anker', () => {
  test('app-padtabel/AC-8: met een app-bestand in het anker is de developer geweigerd op payments/x.ts (voorReview)', () => {
    const { dir, anker } = ankerRepo({ app: APP_TEKST });

    const result = runRolhek({ dir, anker }, 'payments/x.ts', 'developer');

    expect(result.status).toBe(2);
    expect(result.stderr.trim()).not.toBe('');
  });

  test('app-padtabel/AC-8: met een app-bestand in het anker vraagt de hoofdsessie op payments/x.ts', () => {
    const { dir, anker } = ankerRepo({ app: APP_TEKST });

    const result = runRolhek({ dir, anker }, 'payments/x.ts');

    expect([result.status, asks(result.stdout)]).toStrictEqual([0, true]);
  });

  test('app-padtabel/AC-8: geen app-bestand in het anker: zoals nu, payments/x.ts is vrij', () => {
    const { dir, anker } = ankerRepo({ app: null });

    const developer = runRolhek({ dir, anker }, 'payments/x.ts', 'developer');
    const hoofd = runRolhek({ dir, anker }, 'payments/x.ts');

    expect([developer.status, hoofd.status, asks(hoofd.stdout)]).toStrictEqual([0, 0, false]);
    // Wat de template al beschermt, blijft beschermd: .claude/** is voorReview.
    expect(runRolhek({ dir, anker }, '.claude/x.json', 'developer').status).toBe(2);
  });

  test('app-padtabel/AC-8: een app-bestand alleen in de werkmap geldt niet', () => {
    const { dir, anker } = ankerRepo({ app: null, werk: APP_TEKST });

    const developer = runRolhek({ dir, anker }, 'payments/x.ts', 'developer');
    const hoofd = runRolhek({ dir, anker }, 'payments/x.ts');

    expect([developer.status, hoofd.status, asks(hoofd.stdout)]).toStrictEqual([0, 0, false]);
  });

  test('app-padtabel/AC-8: een versoepeld app-bestand in de werkmap haalt de rij uit het anker niet weg', () => {
    const { dir, anker } = ankerRepo({ app: APP_TEKST, werk: JSON.stringify({ paden: {} }) });

    expect(runRolhek({ dir, anker }, 'payments/x.ts', 'developer').status).toBe(2);
  });

  test('app-padtabel/AC-8: een vervalst app-object in het anker laat het rolhek dichtvallen (exit 2)', () => {
    const { dir, anker } = ankerRepo({ app: APP_TEKST });
    forgeLoose(dir, git(dir, 'rev-parse', `${anker}:${APP}`), { type: 'blob', body: Buffer.from('{"paden":{}}\n') });
    expect(git(dir, 'show', `${anker}:${APP}`)).toContain('"paden":{}');

    for (const agent of [undefined, 'developer']) {
      const result = runRolhek({ dir, anker }, 'payments/x.ts', agent);
      expect(result.status).toBe(2);
      expect(result.stderr.trim()).not.toBe('');
    }
  });

  test.each([
    { naam: 'ongeldige JSON', app: '{kapot' },
    { naam: 'geen object', app: '[]' },
    { naam: 'zonder paden', app: '{}' },
    { naam: 'paden als lijst', app: '{"paden":[]}' },
  ])('app-padtabel/AC-8: een app-bestand in het anker met $naam laat het rolhek dichtvallen (exit 2)', ({ app }) => {
    const { dir, anker } = ankerRepo({ app });

    expect(runRolhek({ dir, anker }, 'payments/x.ts', 'developer').status).toBe(2);
  });

  test('app-padtabel/AC-8: andere sleutels in het app-bestand van het anker worden niet gelezen', () => {
    const { dir, anker } = ankerRepo({
      app: JSON.stringify({ ...APP_PAYMENTS, merge: 'eigenaar', autoRunner: false }),
    });

    expect(runRolhek({ dir, anker }, 'payments/x.ts', 'developer').status).toBe(2);
  });

  test('app-padtabel/AC-8: het app-bestand zelf is voor de developer geweigerd en voor de hoofdsessie ask (vloer)', () => {
    const { dir, anker } = ankerRepo({ app: null });

    expect(runRolhek({ dir, anker }, APP, 'developer').status).toBe(2);
    expect(asks(runRolhek({ dir, anker }, APP).stdout)).toBe(true);
  });
});

// ---------- buiten een hook: dezelfde bron als gates.json ----------

/** De lijsten uit de rolhek-context; `voorReview` bevat de globs met schrijven voorReview of hoger. */
function voorReview(dir: string): string[] {
  return rolhekContext(dir, dir).config.voorReview ?? [];
}

/** Een repo met origin/main op een eerste commit (de vertrouwde basis), github-url zonder netwerk en een werkmap. */
function basisRepo(opzet: { app: string | null; werk?: string | null }) {
  const dir = newRepo();
  const bestanden: Record<string, string> = { '.claude/gates.json': GATES_TEKST, 'README.md': 'x\n' };
  if (opzet.app !== null) bestanden[APP] = opzet.app;
  const sha = commit(dir, bestanden, 'basis');
  git(dir, 'update-ref', 'refs/remotes/origin/main', sha);
  git(dir, 'remote', 'add', 'origin', 'https://github.com/acme/app.git');
  git(dir, 'switch', '-q', '-c', 'feat/x');
  if (typeof opzet.werk === 'string') write(dir, { [APP]: opzet.werk });
  if (opzet.werk === null) rmSync(path.join(dir, APP), { force: true });
  return dir;
}

describe('app-padtabel/AC-8 buiten een hook (zonder anker)', () => {
  test('app-padtabel/AC-8: gates.json uit origin/main: het app-bestand komt uit dezelfde commit', () => {
    const dir = basisRepo({ app: APP_TEKST });

    expect(voorReview(dir)).toContain('payments/**');
  });

  test('app-padtabel/AC-8: een app-bestand alleen in de werkmap geldt niet naast een vertrouwde gates.json', () => {
    const dir = basisRepo({ app: null, werk: APP_TEKST });

    expect(voorReview(dir)).not.toContain('payments/**');
  });

  test('app-padtabel/AC-8: het app-bestand van de vertrouwde basis geldt ook als de werkmap het weghaalt of versoepelt', () => {
    expect(voorReview(basisRepo({ app: APP_TEKST, werk: null }))).toContain('payments/**');
    expect(voorReview(basisRepo({ app: APP_TEKST, werk: JSON.stringify({ paden: {} }) }))).toContain('payments/**');
  });

  test('app-padtabel/AC-8: zonder vertrouwde basis komt gates.json uit de werkmap, en dan ook het app-bestand', () => {
    const dir = tmp('app-padtabel-werkmap-');
    write(dir, { '.claude/gates.json': GATES_TEKST, [APP]: APP_TEKST });

    expect(voorReview(dir)).toContain('payments/**');
  });

  test('app-padtabel/AC-8: in de werkmap is ENOENT afwezig: geen app-bestand betekent geen app-rijen', () => {
    const dir = tmp('app-padtabel-werkmap-');
    write(dir, { '.claude/gates.json': GATES_TEKST });

    expect(voorReview(dir)).not.toContain('payments/**');
    expect(voorReview(dir)).toContain('.claude/**');
  });

  test('app-padtabel/AC-8: in de werkmap gooit elke andere fout dan ENOENT (hier: het app-bestand is een map)', () => {
    const dir = tmp('app-padtabel-werkmap-');
    write(dir, { '.claude/gates.json': GATES_TEKST, [`${APP}/x`]: 'x' });

    expect(() => rolhekContext(dir, dir)).toThrow();
  });

  test('app-padtabel/AC-8: ongeldige JSON in het app-bestand gooit, ook buiten een hook', () => {
    const dir = tmp('app-padtabel-werkmap-');
    write(dir, { '.claude/gates.json': GATES_TEKST, [APP]: '{kapot' });

    expect(() => rolhekContext(dir, dir)).toThrow();
  });
});
