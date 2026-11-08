import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';

// claude-sandbox-werkstraat/AC-10 (ADR 0085): `node scripts/kit/worktree-install.mjs` installeert in een gekoppelde
// worktree zonder (volledige) node_modules, met store, cache en state onder os.tmpdir(), en weigert in alle andere gevallen.
// Contract van de module (pure kern, geen echte pnpm in de unit-tests):
//   worktreeInstallBesluit({ worktree: boolean, nodeModules: 'afwezig' | 'map' | 'symlink', gewijzigd: string[] })
//     -> { actie: 'installeren' } | { actie: 'weigeren', melding: string }
//     'map' installeert wel (eigenaarbesluit: een idempotente frozen install maakt een halve installatie af).
//   worktreeInstallCommando(tmp: string) -> { command: 'pnpm', args: string[], env: Record<string, string> }
//     args = ['install', '--frozen-lockfile', '--package-import-method=copy', '--store-dir=<p>'], <p> onder tmp, en geen enkele
//     andere optie. Dit is een eigen keuze (de enige opties die het script meegeeft), met echte pnpm 11.28.5 gemeten als
//     geldig: `pnpm help install` kent --store-dir, en pnpm weigert `--state-dir` en `--cache-dir` met `Unknown option`
//     (exit 1). Cache en state staan dus alleen in de omgeving:
//     env zet XDG_DATA_HOME, XDG_CACHE_HOME en XDG_STATE_HOME onder tmp.
//   worktreeInstallFeiten(root: string) -> { worktree, nodeModules, gewijzigd } uit het echte bestandssysteem en git;
//     gewijzigd = beheerde bestanden die in de werkmap afwijken van HEAD (gewijzigd, verwijderd of untracked).
// De module wordt dynamisch geladen, zodat de typecheck ook vóór de implementatie slaagt en de tests op een assertie falen.
const REPO = path.join(import.meta.dirname, '../..');
const MODULE_PAD = '../../scripts/kit/worktree-install.mjs';
const mod: unknown = await import(MODULE_PAD);

type Besluit = { actie: 'installeren' } | { actie: 'weigeren'; melding: string };
type Commando = { command: string; args: string[]; env: Record<string, string> };
type Feiten = { worktree: boolean; nodeModules: string; gewijzigd: string[] };

function veld(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) throw new Error('object verwacht');
  return Object.fromEntries(Object.entries(raw));
}

function strings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
}

function exportFn(naam: string): (...args: unknown[]) => unknown {
  const f: unknown = typeof mod === 'object' && mod !== null ? Reflect.get(mod, naam) : undefined;
  // Een assertie (geen throw): een ontbrekende export is een falende test, geen import- of typefout.
  expect(typeof f, `export ${naam}`).toBe('function');
  if (typeof f !== 'function') return () => undefined;
  return (...args) => {
    const uit: unknown = Reflect.apply(f, mod, args);
    return uit;
  };
}

function worktreeInstallBesluit(feiten: { worktree: boolean; nodeModules: string; gewijzigd: string[] }): Besluit {
  const raw = veld(exportFn('worktreeInstallBesluit')(feiten));
  if (raw['actie'] === 'installeren') return { actie: 'installeren' };
  return { actie: 'weigeren', melding: typeof raw['melding'] === 'string' ? raw['melding'] : '' };
}

function worktreeInstallCommando(basis: string): Commando {
  const raw = veld(exportFn('worktreeInstallCommando')(basis));
  const env = Object.fromEntries(
    Object.entries(veld(raw['env'])).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])),
  );
  return { command: String(raw['command']), args: strings(raw['args']), env };
}

function worktreeInstallFeiten(root: string): Feiten {
  const raw = veld(exportFn('worktreeInstallFeiten')(root));
  return {
    worktree: raw['worktree'] === true,
    nodeModules: String(raw['nodeModules']),
    gewijzigd: strings(raw['gewijzigd']),
  };
}

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};
const INHOUD: Record<string, string> = {
  'package.json': '{"name":"x","packageManager":"pnpm@11.0.0"}\n',
  'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
  'pnpm-workspace.yaml': 'packages: []\n',
  '.npmrc': 'strict-peer-dependencies=true\n',
  '.pnpmfile.cjs': 'module.exports = {};\n',
  '.pnpmfile.mjs': 'export default {};\n',
};
const BEHEERD = Object.keys(INHOUD);
const ALLEEN_UNTRACKED = ['.npmrc', '.pnpmfile.cjs', '.pnpmfile.mjs'];
// Eigen keuze: de enige opties die worktreeInstallCommando mag meegeven. Hun geldigheid is gemeten met echte pnpm 11.28.5.
const PNPM_INSTALL_OPTIES = ['frozen-lockfile', 'package-import-method', 'store-dir'];
const XDG = ['XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME'];
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function gitUit(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function kopieerKit(root: string): void {
  const kit = path.join(root, 'scripts/kit');
  mkdirSync(kit, { recursive: true });
  for (const naam of readdirSync(path.join(REPO, 'scripts/kit')))
    if (naam.endsWith('.mjs')) copyFileSync(path.join(REPO, 'scripts/kit', naam), path.join(kit, naam));
}

// Hoofdcheckout met de beheerde bestanden gecommit (behalve `zonderInHead`), plus een gekoppelde worktree ernaast.
function fixture(zonderInHead: string[] = []): { main: string; wt: string } {
  const main = tmp('wti-main-');
  gitUit(main, 'init', '-q', '-b', 'main');
  for (const [naam, inhoud] of Object.entries(INHOUD))
    if (!zonderInHead.includes(naam)) writeFileSync(path.join(main, naam), inhoud);
  gitUit(main, 'add', '.');
  gitUit(main, 'commit', '-q', '-m', 'init');
  const wt = path.join(tmp('wti-wt-'), 'wt');
  gitUit(main, 'worktree', 'add', '-q', '-b', 'feat', wt);
  kopieerKit(main);
  kopieerKit(wt);
  return { main, wt };
}

// Nep-pnpm vooraan in PATH: legt argumenten en de volledige omgeving vast, installeert niets, eindigt met `exit`.
// Net als de echte pnpm weigert hij een onbekende optie (allowlist PNPM_INSTALL_OPTIES): `Unknown option` op stderr, exit 1 (gemeten met pnpm 11.28.5).
function nepPnpm(exit = 0): { bin: string; log: string } {
  const bin = tmp('wti-bin-');
  const log = path.join(bin, 'aanroep.json');
  const regels = [
    `#!${process.execPath}`,
    `const toegestaan = ${JSON.stringify(PNPM_INSTALL_OPTIES)};`,
    'const args = process.argv.slice(2);',
    `require('node:fs').writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args, env: process.env }));`,
    "const onbekend = args.filter((a) => a.startsWith('-')).map((a) => a.replace(/^-+/, '').split('=')[0]).find((n) => !toegestaan.includes(n));",
    "if (onbekend !== undefined) { process.stderr.write('[ERROR] Unknown option: \\'' + onbekend + '\\'\\n'); process.exitCode = 1; }",
    `else process.exitCode = ${String(exit)};`,
    '',
  ];
  writeFileSync(path.join(bin, 'pnpm'), regels.join('\n'));
  chmodSync(path.join(bin, 'pnpm'), 0o755);
  return { bin, log };
}

// PATH-map met alleen git (wrapper om de echte git), zonder pnpm.
function alleenGit(): string {
  const echt = (process.env['PATH'] ?? '')
    .split(path.delimiter)
    .map((dir) => path.join(dir, 'git'))
    .find((kandidaat) => existsSync(kandidaat));
  expect(echt, 'git in PATH').toBeDefined();
  const bin = tmp('wti-gitbin-');
  writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nexec ${echt ?? 'git'} "$@"\n`);
  chmodSync(path.join(bin, 'git'), 0o755);
  return bin;
}

const SCRIPT = 'scripts/kit/worktree-install.mjs';
// Variabelen die de tests zelf bepalen: nooit lekken uit de omgeving van de testrunner.
const EIGEN_ENV =
  /^(XDG_|MISE_|npm_config_|pnpm_config_|GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY)$|NODE_OPTIONS$)/i;

interface Opties {
  env?: Record<string, string>;
  tmpdir?: string;
  script?: string;
  pathDirs?: string[];
}

// De CLI krijgt een eigen TMPDIR (os.tmpdir() leest TMPDIR), zodat niets in de echte tmpdir achterblijft.
function draai(cwd: string, bin: string | null, opties: Opties = {}) {
  const tb = opties.tmpdir ?? tmp('wti-tmpdir-');
  const basis = Object.fromEntries(
    Object.entries(process.env).filter(([k, v]) => v !== undefined && !EIGEN_ENV.test(k)),
  );
  const dirsInPath = opties.pathDirs ?? [...(bin === null ? [] : [bin]), process.env['PATH'] ?? ''];
  return spawnSync(process.execPath, [opties.script ?? SCRIPT], {
    cwd,
    encoding: 'utf8',
    env: { ...basis, ...GIT_ENV, TMPDIR: tb, PATH: dirsInPath.join(path.delimiter), ...opties.env },
  });
}

function basisMap(tb: string): string {
  return path.join(tb, `pnpm-worktree-${String(process.getuid?.() ?? 'gebruiker')}`);
}

function gitMetEnv(cwd: string, env: Record<string, string>, ...args: string[]): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV, ...env } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
}

function aangeroepen(log: string): boolean {
  try {
    readFileSync(log);
    return true;
  } catch {
    return false;
  }
}

function logUit(log: string): { args: string[]; env: Record<string, string>; xdg: Record<string, string> } {
  const raw = veld(JSON.parse(readFileSync(log, 'utf8')));
  const env = Object.fromEntries(
    Object.entries(veld(raw['env'])).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])),
  );
  return { args: strings(raw['args']), env, xdg: Object.fromEntries(XDG.map((k) => [k, env[k] ?? ''])) };
}

function vlagWaarde(args: string[], vlag: string): string | undefined {
  const voorvoegsel = `--${vlag}=`;
  return args.find((a) => a.startsWith(voorvoegsel))?.slice(voorvoegsel.length);
}

function optieNamen(args: string[]): string[] {
  return args.slice(1).map((a) => a.replace(/^-+/, '').split('=')[0] ?? '');
}

function onder(basis: string, pad: string | undefined): boolean {
  return pad !== undefined && !path.relative(basis, path.resolve(pad)).startsWith('..');
}

describe('worktreeInstallBesluit', () => {
  const schoon = { worktree: true, nodeModules: 'afwezig', gewijzigd: [] };

  test('gekoppelde worktree, geen node_modules, schone beheerde bestanden: installeren', () => {
    expect(worktreeInstallBesluit(schoon)).toStrictEqual({ actie: 'installeren' });
  });

  // Omgekeerd t.o.v. de eerste versie van deze test (die 'map' niet liet installeren): eigenaarbesluit, de spec stuurt dit.
  test('bestaande (lege of halve) node_modules-map: wel installeren', () => {
    expect(worktreeInstallBesluit({ ...schoon, nodeModules: 'map' })).toStrictEqual({ actie: 'installeren' });
  });

  test('weigering bij gewijzigde bestanden noemt een volgende stap (commit of eigenaar)', () => {
    const besluit = worktreeInstallBesluit({ ...schoon, gewijzigd: ['pnpm-lock.yaml'] });

    expect('melding' in besluit ? besluit.melding : '').toMatch(/commit|eigenaar/i);
  });

  test('hoofdcheckout: weigeren met melding', () => {
    const besluit = worktreeInstallBesluit({ ...schoon, worktree: false });

    expect(besluit.actie).toBe('weigeren');
    expect('melding' in besluit ? besluit.melding : '').toMatch(/hoofdcheckout/i);
  });

  test('node_modules is een symlink: weigeren met melding', () => {
    const besluit = worktreeInstallBesluit({ ...schoon, nodeModules: 'symlink' });

    expect(besluit.actie).toBe('weigeren');
    expect('melding' in besluit ? besluit.melding : '').toMatch(/symlink/i);
  });

  test.each(BEHEERD)('niet-gecommitte wijziging in %s: weigeren en het bestand noemen', (bestand) => {
    const besluit = worktreeInstallBesluit({ ...schoon, gewijzigd: [bestand] });

    expect(besluit.actie).toBe('weigeren');
    expect('melding' in besluit ? besluit.melding : '').toContain(bestand);
  });
});

describe('worktreeInstallCommando', () => {
  // Gewijzigd t.o.v. #630: --cache-dir en --state-dir bestaan niet als pnpm-installoptie (gemeten met pnpm 11.28.5).
  test('gemeten pnpm 11.28.5-contract: frozen lockfile, copy-import en --store-dir onder tmp; cache en state via XDG_*', () => {
    const basis = path.join(tmpdir(), 'pnpm-wt');
    const { command, args, env } = worktreeInstallCommando(basis);

    expect(command).toBe('pnpm');
    expect(args.slice(0, 2)).toStrictEqual(['install', '--frozen-lockfile']);
    expect(args).not.toContain('--no-frozen-lockfile');
    expect(args).not.toContain('--force');
    expect(args).toContain('--package-import-method=copy');
    expect(onder(basis, vlagWaarde(args, 'store-dir')), 'store-dir').toBe(true);
    for (const naam of XDG) expect(onder(basis, env[naam]), naam).toBe(true);
    // Geen verwijzing naar een globale pnpm-map van de gebruiker.
    expectAbsent(JSON.stringify({ args, env }), /\.local\/share\/pnpm|\.cache\/pnpm|\.local\/state\/pnpm/, {
      recognizes: ['/home/u/.local/share/pnpm/store', '/home/u/.cache/pnpm', '/home/u/.local/state/pnpm'],
      allows: ['/tmp/pnpm-wt/store'],
    });
  });

  // Allowlist: onze eigen keuze van opties, waarvan de geldigheid met pnpm 11.28.5 is gemeten; een nieuwe vlag valt hier op
  // en moet eerst tegen echte pnpm gemeten en aan PNPM_INSTALL_OPTIES toegevoegd worden.
  test('alleen de met pnpm 11.28.5 gemeten geldige opties (--frozen-lockfile, --package-import-method, --store-dir), geen --state-dir of --cache-dir', () => {
    const basis = path.join(tmpdir(), 'pnpm-wt');
    const { args, env } = worktreeInstallCommando(basis);

    expect(args[0]).toBe('install');
    expect(args.slice(1).every((a) => a.startsWith('--'))).toBe(true);
    expect([...optieNamen(args)].sort()).toStrictEqual([...PNPM_INSTALL_OPTIES].sort());
    expectAbsent(args.join(' '), /--(state|cache)-dir/, {
      recognizes: ['--state-dir=/x', '--cache-dir=/x'],
      allows: ['--store-dir=/x'],
    });
    // Cache en state komen in samenhang daarmee alleen via de omgeving onder tmp.
    for (const naam of XDG) expect(onder(basis, env[naam]), naam).toBe(true);
    expect(new Set(XDG.map((naam) => env[naam])).size).toBe(XDG.length);
  });
});

describe('nep-pnpm (testhulp)', () => {
  test('weigert een onbekende optie zoals de echte pnpm: exit 1 en `Unknown option` op stderr', () => {
    const { bin } = nepPnpm();

    const r = spawnSync(path.join(bin, 'pnpm'), ['install', '--frozen-lockfile', '--state-dir=/x'], {
      encoding: 'utf8',
    });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Unknown option: 'state-dir'");
  });

  test.each(PNPM_INSTALL_OPTIES)('accepteert de geldige optie --%s', (optie) => {
    const { bin } = nepPnpm();

    const r = spawnSync(path.join(bin, 'pnpm'), ['install', '--' + optie + '=x'], { encoding: 'utf8' });

    expect(r.status, r.stderr).toBe(0);
  });
});

describe('worktreeInstallFeiten (echte git-fixture)', () => {
  test('gekoppelde worktree zonder node_modules en schone bestanden', () => {
    const { wt } = fixture();

    expect(worktreeInstallFeiten(wt)).toStrictEqual({ worktree: true, nodeModules: 'afwezig', gewijzigd: [] });
  });

  test('hoofdcheckout: worktree false', () => {
    const { main } = fixture();

    expect(worktreeInstallFeiten(main).worktree).toBe(false);
  });

  test('node_modules als symlink wordt als symlink herkend', () => {
    const { wt } = fixture();
    symlinkSync(tmp('wti-doel-'), path.join(wt, 'node_modules'));

    expect(worktreeInstallFeiten(wt).nodeModules).toBe('symlink');
  });

  test('lege node_modules-map wordt als map herkend', () => {
    const { wt } = fixture();
    mkdirSync(path.join(wt, 'node_modules'));

    expect(worktreeInstallFeiten(wt).nodeModules).toBe('map');
  });

  test.each(BEHEERD)('gewijzigd %s staat in gewijzigd', (bestand) => {
    const { wt } = fixture();
    writeFileSync(path.join(wt, bestand), `${INHOUD[bestand] ?? ''}# gewijzigd\n`);

    expect(worktreeInstallFeiten(wt).gewijzigd).toStrictEqual([bestand]);
  });

  test.each(BEHEERD)('verwijderd %s staat in gewijzigd', (bestand) => {
    const { wt } = fixture();
    rmSync(path.join(wt, bestand));

    expect(worktreeInstallFeiten(wt).gewijzigd).toStrictEqual([bestand]);
  });

  test.each(ALLEEN_UNTRACKED)('untracked %s (niet in HEAD) staat in gewijzigd', (bestand) => {
    const { wt } = fixture([bestand]);
    writeFileSync(path.join(wt, bestand), 'nieuw\n');

    expect(worktreeInstallFeiten(wt).gewijzigd).toStrictEqual([bestand]);
  });

  test('gestagede wijziging van pnpm-lock.yaml staat in gewijzigd', () => {
    const { wt } = fixture();
    writeFileSync(path.join(wt, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n# gestaged\n");
    gitUit(wt, 'add', 'pnpm-lock.yaml');

    expect(worktreeInstallFeiten(wt).gewijzigd).toStrictEqual(['pnpm-lock.yaml']);
  });

  test('gestaged gewijzigd maar in de werkmap teruggezet: niet gewijzigd t.o.v. HEAD', () => {
    const { wt } = fixture();
    writeFileSync(path.join(wt, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n# gestaged\n");
    gitUit(wt, 'add', 'pnpm-lock.yaml');
    writeFileSync(path.join(wt, 'pnpm-lock.yaml'), INHOUD['pnpm-lock.yaml'] ?? '');

    expect(worktreeInstallFeiten(wt).gewijzigd).toStrictEqual([]);
  });

  // De inhoud wordt met HEAD vergeleken, dus een voor de index verborgen wijziging telt toch.
  test.each(['--assume-unchanged', '--skip-worktree'])(
    'pnpm-lock.yaml gewijzigd maar met %s verborgen: staat in gewijzigd',
    (vlag) => {
      const { wt } = fixture();
      gitUit(wt, 'update-index', vlag, 'pnpm-lock.yaml');
      writeFileSync(path.join(wt, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n# verborgen\n");

      expect(worktreeInstallFeiten(wt).gewijzigd).toStrictEqual(['pnpm-lock.yaml']);
    },
  );
});

describe('node scripts/kit/worktree-install.mjs (nep-pnpm)', () => {
  // Gewijzigd t.o.v. #630: de oude assertie eiste --cache-dir en --state-dir onder tmpdir; echte pnpm 11.28.5 weigert die.
  test('gekoppelde worktree: pnpm install met alleen geldige opties, store en XDG-mappen onder tmpdir; lockfile ongewijzigd', () => {
    const { wt } = fixture();
    const { bin, log } = nepPnpm();
    const lockVoor = readFileSync(path.join(wt, 'pnpm-lock.yaml'), 'utf8');

    const tb = tmp('wti-tmpdir-');

    const r = draai(wt, bin, { tmpdir: tb });

    expect(r.status, r.stderr).toBe(0);
    expectAbsent(r.stderr, /Unknown option/, {
      recognizes: ["[ERROR] Unknown option: 'x'"],
      allows: ['install klaar'],
    });
    const { args, xdg } = logUit(log);
    expect(args.slice(0, 2)).toStrictEqual(['install', '--frozen-lockfile']);
    expect([...optieNamen(args)].sort()).toStrictEqual([...PNPM_INSTALL_OPTIES].sort());
    expect(onder(tb, vlagWaarde(args, 'store-dir')), 'store-dir').toBe(true);
    for (const naam of XDG) expect(onder(tb, xdg[naam]), naam).toBe(true);
    expect(readFileSync(path.join(wt, 'pnpm-lock.yaml'), 'utf8')).toBe(lockVoor);
  });

  test.each([
    { naam: 'lege map', bestanden: new Array<string>() },
    { naam: 'halve installatie (alleen .modules.yaml)', bestanden: ['.modules.yaml'] },
  ])('node_modules is een echte $naam: pnpm install --frozen-lockfile wordt aangeroepen', ({ bestanden }) => {
    const { wt } = fixture();
    mkdirSync(path.join(wt, 'node_modules'));
    for (const naam of bestanden) writeFileSync(path.join(wt, 'node_modules', naam), 'layoutVersion: 5\n');
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin);

    expect(r.status, r.stderr).toBe(0);
    expect(logUit(log).args.slice(0, 2)).toStrictEqual(['install', '--frozen-lockfile']);
  });

  test('gestaged gewijzigd en in de werkmap teruggezet: installeren', () => {
    const { wt } = fixture();
    writeFileSync(path.join(wt, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n# gestaged\n");
    gitUit(wt, 'add', 'pnpm-lock.yaml');
    writeFileSync(path.join(wt, 'pnpm-lock.yaml'), INHOUD['pnpm-lock.yaml'] ?? '');
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin);

    expect(r.status, r.stderr).toBe(0);
    expect(logUit(log).args.slice(0, 2)).toStrictEqual(['install', '--frozen-lockfile']);
  });

  test('hoofdcheckout: status 1, melding, pnpm niet aangeroepen', () => {
    const { main } = fixture();
    const { bin, log } = nepPnpm();

    const r = draai(main, bin);

    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/hoofdcheckout/i);
    expect([aangeroepen(log)]).not.toContain(true);
  });

  test('node_modules is een symlink: status 1 en pnpm niet aangeroepen', () => {
    const { wt } = fixture();
    symlinkSync(tmp('wti-doel-'), path.join(wt, 'node_modules'));
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin);

    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/symlink/i);
    expect([aangeroepen(log)]).not.toContain(true);
  });

  test.each(BEHEERD)('gewijzigd %s: status 1, bestand genoemd, pnpm niet aangeroepen', (bestand) => {
    const { wt } = fixture();
    writeFileSync(path.join(wt, bestand), `${INHOUD[bestand] ?? ''}# lokaal\n`);
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain(bestand);
    expect([aangeroepen(log)]).not.toContain(true);
  });

  test.each(BEHEERD)('verwijderd %s: status 1, bestand genoemd, pnpm niet aangeroepen', (bestand) => {
    const { wt } = fixture();
    rmSync(path.join(wt, bestand));
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain(bestand);
    expect([aangeroepen(log)]).not.toContain(true);
  });

  test.each(ALLEEN_UNTRACKED)('untracked %s: status 1, bestand genoemd, pnpm niet aangeroepen', (bestand) => {
    const { wt } = fixture([bestand]);
    writeFileSync(path.join(wt, bestand), 'nieuw\n');
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain(bestand);
    expect([aangeroepen(log)]).not.toContain(true);
  });

  test('gestagede wijziging van pnpm-lock.yaml: status 1 en pnpm niet aangeroepen', () => {
    const { wt } = fixture();
    writeFileSync(path.join(wt, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n# gestaged\n");
    gitUit(wt, 'add', 'pnpm-lock.yaml');
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('pnpm-lock.yaml');
    expect([aangeroepen(log)]).not.toContain(true);
  });

  test('git diff faalt (corrupte index): status 1, melding zonder stacktrace, pnpm niet aangeroepen', () => {
    const { wt } = fixture();
    const gitDir = path.resolve(wt, gitUit(wt, 'rev-parse', '--git-dir'));
    writeFileSync(path.join(gitDir, 'index'), 'geen geldige index');
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin);

    expect(r.status).toBe(1);
    expect(r.stderr.trim()).not.toBe('');
    expectAbsent(r.stderr, /\n\s+at\s/, {
      recognizes: ['Error: x\n    at foo (a.mjs:1:1)'],
      allows: ['git diff faalt'],
    });
    expect([aangeroepen(log)]).not.toContain(true);
  });

  // K2: de controle loopt op de werkmap-root; vanuit een submap is dat geen hoofdcheckout maar een verkeerde cwd.
  test('gestart in een submap van de worktree: weigeren met "vanuit de worktree-root", niet "hoofdcheckout"', () => {
    const { wt } = fixture();
    mkdirSync(path.join(wt, 'src'));
    const { bin, log } = nepPnpm();

    const r = draai(path.join(wt, 'src'), bin, { script: path.join(wt, SCRIPT) });

    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/worktree-root/i);
    expectAbsent(r.stderr, /hoofdcheckout/i, {
      recognizes: ['dit is de hoofdcheckout', 'Hoofdcheckout'],
      allows: ['draai het vanuit de worktree-root'],
    });
    expect([aangeroepen(log)]).not.toContain(true);
  });

  test('weigering bij een gewijzigd bestand noemt een volgende stap (commit of eigenaar)', () => {
    const { wt } = fixture();
    writeFileSync(path.join(wt, 'pnpm-lock.yaml'), 'anders\n');
    const { bin } = nepPnpm();

    const r = draai(wt, bin);

    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/commit|eigenaar/i);
  });
});

describe('node scripts/kit/worktree-install.mjs: basismap, omgeving en foutpaden', () => {
  test('basismap is een symlink: status 1 en pnpm niet aangeroepen', () => {
    const { wt } = fixture();
    const tb = tmp('wti-tmpdir-');
    symlinkSync(tmp('wti-doel-'), basisMap(tb));
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin, { tmpdir: tb });

    expect(r.status).toBe(1);
    expect(r.stderr.trim()).not.toBe('');
    expect([aangeroepen(log)]).not.toContain(true);
  });

  test('basismap met mode 0755: status 1 en pnpm niet aangeroepen', () => {
    const { wt } = fixture();
    const tb = tmp('wti-tmpdir-');
    mkdirSync(basisMap(tb));
    chmodSync(basisMap(tb), 0o755);
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin, { tmpdir: tb });

    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/0700|toegankelijk/i);
    expect([aangeroepen(log)]).not.toContain(true);
  });

  test('nieuwe basismap wordt met mode 0700 en onder de opgegeven TMPDIR aangemaakt', () => {
    const { wt } = fixture();
    const tb = tmp('wti-tmpdir-');
    const { bin } = nepPnpm();

    const r = draai(wt, bin, { tmpdir: tb });

    expect(r.status, r.stderr).toBe(0);
    expect(lstatSync(basisMap(tb)).mode & 0o777).toBe(0o700);
  });

  test('pnpm ontbreekt in PATH: status 1 en de melding noemt scripts/bootstrap.sh', () => {
    const { wt } = fixture();

    const r = draai(wt, null, { pathDirs: [alleenGit()] });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('scripts/bootstrap.sh');
  });

  test('git ontbreekt in PATH: status 1, melding en pnpm niet aangeroepen', () => {
    const { wt } = fixture();
    const { bin, log } = nepPnpm();

    const r = draai(wt, null, { pathDirs: [bin] });

    expect(r.status).toBe(1);
    expect(r.stderr.trim()).not.toBe('');
    expect([aangeroepen(log)]).not.toContain(true);
  });

  test('een niet-nul exitstatus van pnpm wordt doorgegeven', () => {
    const { wt } = fixture();
    const { bin, log } = nepPnpm(3);

    const r = draai(wt, bin);

    expect(aangeroepen(log)).toBe(true);
    expect(r.status).toBe(3);
  });

  test('npm_config_*, NPM_CONFIG_*, pnpm_config_* en NODE_OPTIONS uit de omgeving van de aanroeper bereiken pnpm niet', () => {
    const { wt } = fixture();
    const { bin, log } = nepPnpm();
    const env = {
      npm_config_store_dir: '/elders/store',
      NPM_CONFIG_REGISTRY: 'http://registry.example.invalid/',
      pnpm_config_ignore_scripts: 'false',
      NODE_OPTIONS: '--no-warnings',
      HARMLOOS: 'blijft',
    };

    const r = draai(wt, bin, { env });

    expect(r.status, r.stderr).toBe(0);
    const doorgegeven = logUit(log).env;
    expect(Object.keys(doorgegeven).filter((k) => /^(npm|pnpm)_config_/i.test(k) || k === 'NODE_OPTIONS')).toEqual([]);
    expect(doorgegeven['HARMLOOS']).toBe('blijft');
  });

  test('MISE_DATA_DIR en MISE_STATE_DIR van de aanroeper blijven behouden, XDG_* onder tmp', () => {
    const { wt } = fixture();
    const tb = tmp('wti-tmpdir-');
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin, {
      tmpdir: tb,
      env: {
        MISE_DATA_DIR: '/m/data',
        MISE_STATE_DIR: '/m/state',
        XDG_DATA_HOME: '/x/data',
        XDG_STATE_HOME: '/x/state',
      },
    });

    expect(r.status, r.stderr).toBe(0);
    const { env, xdg } = logUit(log);
    expect(env['MISE_DATA_DIR']).toBe('/m/data');
    expect(env['MISE_STATE_DIR']).toBe('/m/state');
    for (const naam of XDG) expect(onder(tb, xdg[naam]), naam).toBe(true);
  });

  test('zonder MISE_*: afgeleid van de oorspronkelijke XDG_DATA_HOME en XDG_STATE_HOME', () => {
    const { wt } = fixture();
    const tb = tmp('wti-tmpdir-');
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin, { tmpdir: tb, env: { XDG_DATA_HOME: '/x/data', XDG_STATE_HOME: '/x/state' } });

    expect(r.status, r.stderr).toBe(0);
    const { env, xdg } = logUit(log);
    expect(env['MISE_DATA_DIR']).toBe('/x/data/mise');
    expect(env['MISE_STATE_DIR']).toBe('/x/state/mise');
    for (const naam of XDG) expect(onder(tb, xdg[naam]), naam).toBe(true);
  });

  test('zonder MISE_* en XDG_*: afgeleid van $HOME/.local/{share,state}/mise', () => {
    const { wt } = fixture();
    const tb = tmp('wti-tmpdir-');
    const thuis = tmp('wti-home-');
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin, { tmpdir: tb, env: { HOME: thuis } });

    expect(r.status, r.stderr).toBe(0);
    const { env, xdg } = logUit(log);
    expect(env['MISE_DATA_DIR']).toBe(path.join(thuis, '.local/share/mise'));
    expect(env['MISE_STATE_DIR']).toBe(path.join(thuis, '.local/state/mise'));
    for (const naam of XDG) expect(onder(tb, xdg[naam]), naam).toBe(true);
  });

  // I5: Git-omgevingsvariabelen van de aanroeper mogen de vergelijking met HEAD niet omleiden.
  // De alternatieve index verbergt de wijziging (assume-unchanged); de echte index niet. Zonder scrub van
  // GIT_INDEX_FILE ziet het script de wijziging dus niet.
  test('GIT_INDEX_FILE naar een index die de lockfile-wijziging verbergt: nog steeds weigeren', () => {
    const { wt } = fixture();
    const gitDir = path.resolve(wt, gitUit(wt, 'rev-parse', '--git-dir'));
    const alt = path.join(tmp('wti-idx-'), 'index');
    copyFileSync(path.join(gitDir, 'index'), alt);
    gitMetEnv(wt, { GIT_INDEX_FILE: alt }, 'update-index', '--assume-unchanged', 'pnpm-lock.yaml');
    writeFileSync(path.join(wt, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n# gewijzigd\n");
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin, { env: { GIT_INDEX_FILE: alt } });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('pnpm-lock.yaml');
    expect([aangeroepen(log)]).not.toContain(true);
  });

  // Punt 1: een voor de index verborgen wijziging telt toch; de inhoud wordt met HEAD vergeleken.
  test.each(['--assume-unchanged', '--skip-worktree'])(
    'pnpm-lock.yaml gewijzigd maar met %s verborgen: CLI weigert en pnpm niet aangeroepen',
    (vlag) => {
      const { wt } = fixture();
      gitUit(wt, 'update-index', vlag, 'pnpm-lock.yaml');
      writeFileSync(path.join(wt, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n# verborgen\n");
      const { bin, log } = nepPnpm();

      const r = draai(wt, bin);

      expect(r.status).toBe(1);
      expect(r.stderr).toContain('pnpm-lock.yaml');
      expect([aangeroepen(log)]).not.toContain(true);
    },
  );

  // Punt 2: `.git` wordt eerst getoetst; een kapotte git-staat in de hoofdcheckout verandert de weigering niet.
  test('hoofdcheckout met kapotte index: hoofdcheckout-weigering, niet "git diff faalt"', () => {
    const { main } = fixture();
    writeFileSync(path.join(main, '.git/index'), 'geen geldige index');
    const { bin, log } = nepPnpm();

    const r = draai(main, bin);

    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/hoofdcheckout/i);
    expectAbsent(r.stderr, /git (diff|ls-files) faalt/, {
      recognizes: ['git diff faalt: index', 'git ls-files faalt: x'],
      allows: ['dit is de hoofdcheckout'],
    });
    expect([aangeroepen(log)]).not.toContain(true);
  });

  test('hoofdcheckout zonder commit (HEAD ongeboren): hoofdcheckout-weigering, niet "git diff faalt"', () => {
    const leeg = tmp('wti-leeg-');
    gitUit(leeg, 'init', '-q', '-b', 'main');
    kopieerKit(leeg);
    const { bin, log } = nepPnpm();

    const r = draai(leeg, bin);

    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/hoofdcheckout/i);
    expectAbsent(r.stderr, /git (diff|ls-files|rev-parse) faalt/, {
      recognizes: ['git diff faalt: x', 'git rev-parse faalt: y'],
      allows: ['dit is de hoofdcheckout'],
    });
    expect([aangeroepen(log)]).not.toContain(true);
  });

  // Punt 3: lege of relatieve waarden tellen als niet gezet; MISE_*-paden zijn altijd absoluut.
  test('lege XDG_DATA_HOME, XDG_STATE_HOME: afgeleid van $HOME', () => {
    const { wt } = fixture();
    const thuis = tmp('wti-home-');
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin, { env: { HOME: thuis, XDG_DATA_HOME: '', XDG_STATE_HOME: '' } });

    expect(r.status, r.stderr).toBe(0);
    const { env } = logUit(log);
    expect(env['MISE_DATA_DIR']).toBe(path.join(thuis, '.local/share/mise'));
    expect(env['MISE_STATE_DIR']).toBe(path.join(thuis, '.local/state/mise'));
  });

  test('relatieve XDG_* en MISE_*-waarden tellen als niet gezet: afgeleid absoluut pad', () => {
    const { wt } = fixture();
    const thuis = tmp('wti-home-');
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin, {
      env: {
        HOME: thuis,
        XDG_DATA_HOME: 'rel/data',
        XDG_STATE_HOME: 'rel/state',
        MISE_DATA_DIR: 'rel/mise-data',
        MISE_STATE_DIR: 'rel/mise-state',
      },
    });

    expect(r.status, r.stderr).toBe(0);
    const { env } = logUit(log);
    expect(env['MISE_DATA_DIR']).toBe(path.join(thuis, '.local/share/mise'));
    expect(env['MISE_STATE_DIR']).toBe(path.join(thuis, '.local/state/mise'));
  });

  // Gekozen: bij lege HOME én lege XDG valt het script terug op os.homedir() (de homedir uit de gebruikersdatabase).
  test('lege HOME en lege XDG_*: terugval op os.homedir()', () => {
    const { wt } = fixture();
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin, { env: { HOME: '', XDG_DATA_HOME: '', XDG_STATE_HOME: '' } });

    expect(r.status, r.stderr).toBe(0);
    const { env } = logUit(log);
    expect(env['MISE_DATA_DIR']).toBe(path.join(userInfo().homedir, '.local/share/mise'));
    expect(env['MISE_STATE_DIR']).toBe(path.join(userInfo().homedir, '.local/state/mise'));
    expect(path.isAbsolute(env['MISE_DATA_DIR'] ?? '')).toBe(true);
  });

  test('GIT_DIR en GIT_WORK_TREE naar een andere repo waarvan HEAD de wijziging bevat: nog steeds weigeren', () => {
    const { wt } = fixture();
    const wijziging = "lockfileVersion: '9.0'\n# gewijzigd\n";
    writeFileSync(path.join(wt, 'pnpm-lock.yaml'), wijziging);
    const andere = tmp('wti-andere-');
    gitUit(andere, 'init', '-q', '-b', 'main');
    for (const [naam, inhoud] of Object.entries(INHOUD))
      writeFileSync(path.join(andere, naam), naam === 'pnpm-lock.yaml' ? wijziging : inhoud);
    gitUit(andere, 'add', '.');
    gitUit(andere, 'commit', '-q', '-m', 'andere');
    const { bin, log } = nepPnpm();

    const r = draai(wt, bin, { env: { GIT_DIR: path.join(andere, '.git'), GIT_WORK_TREE: wt } });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('pnpm-lock.yaml');
    expect([aangeroepen(log)]).not.toContain(true);
  });
});
