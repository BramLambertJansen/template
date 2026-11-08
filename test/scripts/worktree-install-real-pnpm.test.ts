import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';

// Leerpunt bij #630/#631: de nep-pnpm in worktree-install.test.ts accepteerde `--state-dir`, echte pnpm weigert
// die met `Unknown option`. Deze tests draaien dezelfde args van `worktreeInstallCommando` tegen de ECHTE pnpm, zonder
// netwerk (onbereikbare registry, alleen een lokale `file:`-dependency). Start pnpm niet, dan faalt de test; niets wordt
// overgeslagen.
// Grenzen: de test toetst het optiecontract met de pnpm die hier gevonden wordt (`npm_execpath` of `pnpm` in PATH), niet
// noodzakelijk met de pnpm-versie die package.json pint; de fixture pint die gevonden versie, anders schakelt pnpm om en
// downloadt. De repo-instellingen uit pnpm-workspace.yaml (strictDepBuilds, minimumReleaseAge, trustPolicy,
// verifyDepsBeforeRun) vallen buiten deze test.
const MODULE_PAD = '../../scripts/kit/worktree-install.mjs';
const mod: unknown = await import(MODULE_PAD);
const PNPM = process.env['npm_execpath'] ?? 'pnpm';
const TIMEOUT = 20_000;
// Tot drie pnpm-aanroepen per test (versie, lockfile, install), elk met `TIMEOUT`; vitest.config zet testTimeout op 15 s.
const TEST_TIMEOUT = 3 * TIMEOUT + 10_000;
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function veld(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) throw new Error('object verwacht');
  return Object.fromEntries(Object.entries(raw));
}

function commando(tmp: string): { args: string[]; env: Record<string, string> } {
  const f: unknown = typeof mod === 'object' && mod !== null ? Reflect.get(mod, 'worktreeInstallCommando') : undefined;
  expect(typeof f, 'export worktreeInstallCommando').toBe('function');
  if (typeof f !== 'function') return { args: [], env: {} };
  const raw = veld(Reflect.apply(f, mod, [tmp]));
  const args = Array.isArray(raw['args']) ? raw['args'].filter((a): a is string => typeof a === 'string') : [];
  const env = Object.fromEntries(
    Object.entries(veld(raw['env'])).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])),
  );
  return { args, env };
}

// Absoluut pad uit de omgeving van de aanroeper; leeg of relatief telt als niet gezet.
function absoluut(naam: string): string | undefined {
  const waarde = process.env[naam];
  return waarde !== undefined && path.isAbsolute(waarde) ? waarde : undefined;
}

// MISE_*-mappen met hun oorspronkelijke waarde (aanroeper, anders afgeleid van de oorspronkelijke XDG_* of HOME), omdat
// XDG_* in de test naar tmp wijst en HOME naar een lege map; zo blijft een eventuele mise-shim bereikbaar.
function miseMappen(): Record<string, string> {
  const thuis = absoluut('HOME') ?? userInfo().homedir;
  return {
    MISE_DATA_DIR:
      absoluut('MISE_DATA_DIR') ?? path.join(absoluut('XDG_DATA_HOME') ?? path.join(thuis, '.local/share'), 'mise'),
    MISE_STATE_DIR:
      absoluut('MISE_STATE_DIR') ?? path.join(absoluut('XDG_STATE_HOME') ?? path.join(thuis, '.local/state'), 'mise'),
  };
}

// Omgeving van de aanroeper zonder npm_config_/pnpm_config_/NODE_OPTIONS (zoals het script) en zonder CI (dat zou
// --frozen-lockfile impliciet maken). Daarna: onbereikbare registry en geen update-notifier, zodat niets het netwerk raakt.
function basisEnv(): Record<string, string> {
  const schoon = Object.entries(process.env).flatMap(([k, v]): [string, string][] =>
    v === undefined || /^((npm|pnpm)_config_|NODE_OPTIONS$|CI$)/i.test(k) ? [] : [[k, v]],
  );
  return {
    ...Object.fromEntries(schoon),
    npm_config_registry: 'http://127.0.0.1:9/',
    pnpm_config_registry: 'http://127.0.0.1:9/',
    npm_config_update_notifier: 'false',
    pnpm_config_update_notifier: 'false',
  };
}

function pnpm(cwd: string, args: string[], env: Record<string, string>) {
  return spawnSync(PNPM, args, { cwd, env, encoding: 'utf8', timeout: TIMEOUT });
}

// Foutmelding bij een niet-geslaagde pnpm: ook de startfout (ontbrekende binary, timeout) staat erin.
function uitvoer(r: SpawnSyncReturns<string>): string {
  return [r.error?.message, r.stdout, r.stderr].filter((deel) => deel !== undefined && deel !== '').join('\n');
}

// De pin in de fixture is de pnpm die hier echt draait (gemeten in een map zonder package.json): een andere pin laat pnpm
// van versie wisselen en dus downloaden, en dat mag in deze test niet.
function runningManager(cwd: string, env: Record<string, string>): string {
  const r = pnpm(cwd, ['--version'], env);
  expect(r.status, uitvoer(r)).toBe(0);
  return ['pnpm', r.stdout.trim()].join('@');
}

function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

// Kleine fixture met een lockfile; de eigen tijdelijke map `eigen` bevat store en XDG-mappen, `home` is een lege nephome.
function fixture() {
  const base = tmp('wti-real-pnpm-');
  const dir = path.join(base, 'project');
  const dependency = path.join(base, 'dependency');
  const eigen = path.join(base, 'eigen');
  const home = path.join(base, 'home');
  for (const map of [dir, dependency, eigen, home]) mkdirSync(map);
  writeFileSync(path.join(dependency, 'package.json'), JSON.stringify({ name: 'local', version: '1.0.0' }));
  const { args, env } = commando(eigen);
  // De MISE_*-mappen worden afgeleid vóór HOME wordt vervangen. HOME wijst naar een lege map: lekt pnpm naast XDG_* en
  // --store-dir toch naar de home, dan zie je dat daar terug.
  const uitvoerEnv = { ...basisEnv(), ...miseMappen(), HOME: home, ...env };
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'worktree-install-fixture',
      version: '1.0.0',
      private: true,
      packageManager: runningManager(eigen, uitvoerEnv),
      dependencies: { local: 'file:../dependency' },
    }),
  );
  const lock = pnpm(
    dir,
    ['install', '--lockfile-only', '--offline', `--store-dir=${path.join(eigen, 'store')}`],
    uitvoerEnv,
  );
  expect(lock.status, uitvoer(lock)).toBe(0);
  expect(existsSync(path.join(dir, 'pnpm-lock.yaml'))).toBe(true);
  return { dir, eigen, home, args, env: uitvoerEnv };
}

describe('worktreeInstallCommando tegen de echte pnpm', () => {
  test(
    'de args en env van het script worden door echte pnpm geaccepteerd; store onder de eigen tmp-map, home blijft leeg',
    { timeout: TEST_TIMEOUT },
    () => {
      const { dir, eigen, home, args, env } = fixture();
      expect(args).toContain('--frozen-lockfile');

      const r = pnpm(dir, args, env);

      expect(r.error, uitvoer(r)).toBeUndefined();
      expectAbsent(r.stderr, /Unknown option/, {
        recognizes: ["[ERROR] Unknown option: 'state-dir'", 'ERR_PNPM_UNKNOWN_OPTION: Unknown option: state-dir'],
        allows: ['Lockfile is up to date, resolution step is skipped'],
      });
      expect(r.status, uitvoer(r)).toBe(0);
      expect(existsSync(path.join(dir, 'node_modules/local/package.json'))).toBe(true);
      // Gecontroleerd: de store (via --store-dir) staat onder de eigen map en is gevuld, en de nephome blijft leeg.
      expect(existsSync(path.join(eigen, 'store')), 'store onder tmp').toBe(true);
      expect(readdirSync(path.join(eigen, 'store')).length).toBeGreaterThan(0);
      expect(readdirSync(home), 'niets in de home van de gebruiker').toStrictEqual([]);
    },
  );
});

describe('contract van echte pnpm (bewaakt dat de test zelf geloofwaardig blijft)', () => {
  // Alleen --state-dir: gemeten met pnpm 11.28.2 en 11.28.5 weigert `install` die, maar accepteert `--cache-dir` (exit 0).
  test('weigert --state-dir als installoptie met `Unknown option` en niet-nul exit', { timeout: TEST_TIMEOUT }, () => {
    const { dir, eigen, env } = fixture();

    const r = pnpm(dir, ['install', '--frozen-lockfile', `--state-dir=${path.join(eigen, 'x')}`], env);

    expect(r.error, uitvoer(r)).toBeUndefined();
    expect(r.status, uitvoer(r)).not.toBe(0);
    expect(r.stderr).toMatch(/Unknown option/);
  });
});
