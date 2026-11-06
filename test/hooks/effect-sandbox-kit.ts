import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { gitIn } from '../../rails/hooks/lib/effect-snapshot.mjs';
import { loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// Gedeelde helpers voor de tests van docs/specs/rolhek-effect.md AC-11 (ADR 0084). Echte tijdelijke git-repository's met een
// lokale bare `origin`; de hooks draaien als proces met dezelfde payload als Claude Code, zonder kooi (die draait niet in de sandbox).
// Geen testbestand zelf: vitest neemt alleen `*.test.ts` mee.
export const GATES = readFileSync('.claude/gates.json', 'utf8');
export const config = loadConfig(GATES);
export const EFFECT = path.resolve('rails/hooks/effect.mjs');
export const MIN = 90_000;

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
};
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

export function procEnv(): NodeJS.ProcessEnv {
  const basis = Object.entries(process.env).filter(([naam]) => !naam.startsWith('GIT_') && naam !== 'RAILS_ANKER');
  return { ...Object.fromEntries(basis), ...GIT_ENV };
}

export function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: procEnv() });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

export function schrijf(root: string, rel: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

export function commit(root: string, bestanden: Record<string, string>): void {
  for (const [rel, text] of Object.entries(bestanden)) schrijf(root, rel, text);
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'zonder hook');
}

export function nieuweDir(naam: string): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), `sandbox-${naam}-`)));
  dirs.push(dir);
  return dir;
}

export type Wereld = { a: string; bare: string };

/**
 * Eén repository (werkmap `a`, tak main) met een lokale bare `origin`; `.env` is genegeerd, zodat de vorm van AC-11 (a) en (c)
 * (een genegeerd `.env`) en de ongetrackte vorm (`config/.env.local`) allebei voorkomen.
 */
export function wereld(objectFormat: 'sha1' | 'sha256' = 'sha1'): Wereld {
  const bare = nieuweDir('bare');
  git(bare, 'init', '-q', '--bare', `--object-format=${objectFormat}`, '-b', 'main');
  const a = nieuweDir('a');
  git(a, 'init', '-q', `--object-format=${objectFormat}`, '-b', 'main');
  schrijf(a, 'src/a.ts', 'a\nb\n');
  schrijf(a, 'rails/x.mjs', 'x\n');
  schrijf(a, 'test/a.test.ts', "test('een', () => {});\n");
  schrijf(a, '.gitignore', 'node_modules/\n.env\n');
  schrijf(a, '.claude/gates.json', GATES);
  git(a, 'add', '-A');
  git(a, 'commit', '-qm', 'start');
  git(a, 'remote', 'add', 'origin', bare);
  git(a, 'push', '-q', '-u', 'origin', 'main');
  return { a, bare };
}

/** De blob-id van de lege inhoud in het objectformaat van deze repository (sha1 of sha256). */
export function legeBlob(root: string): string {
  const result = spawnSync('git', ['hash-object', '--stdin'], {
    cwd: root,
    input: '',
    encoding: 'utf8',
    env: procEnv(),
  });
  return result.stdout.trim();
}

/** De blob-id van een tekst zonder iets te schrijven (`git hash-object` zonder `-w`). */
export function blobVan(root: string, tekst: string): string {
  const result = spawnSync('git', ['hash-object', '--stdin'], {
    cwd: root,
    input: tekst,
    encoding: 'utf8',
    env: procEnv(),
  });
  return result.stdout.trim();
}

/** Alle object-id's in `.git/objects` (`git cat-file --batch-all-objects`): `toContain` of `not.toContain` op een blob. */
export function objecten(root: string): string[] {
  return git(root, 'cat-file', '--batch-all-objects', '--batch-check=%(objectname)')
    .split('\n')
    .filter((regel) => regel !== '');
}

export function repoVan(root: string) {
  const ctx = {
    root,
    cwd: root,
    config,
    read: (rel: string) => (existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), 'utf8') : null),
    committed: () => false,
    isDir: () => false,
    branch: git(root, 'rev-parse', '--abbrev-ref', 'HEAD').trim(),
  };
  return { root, git: gitIn(root), ctx, now: () => Date.now() };
}

// ---- hooks als proces -------------------------------------------------------------------------------------------

export type Wie = { sessie: string; rol?: 'reviewer' | 'tester' };
export const agentId = (wie: Wie): string => `agent-${wie.rol ?? 'hoofd'}-${wie.sessie}`;
export const REVIEWER: Wie = { sessie: 'S1', rol: 'reviewer' };
export const TESTER: Wie = { sessie: 'S1', rol: 'tester' };
let teller = 0;

function payloadVan(root: string, wie: Wie, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const agent = wie.rol === undefined ? {} : { agent_type: wie.rol, agent_id: agentId(wie) };
  return { cwd: root, session_id: wie.sessie, ...agent, ...extra };
}

/** `node rails/hooks/effect.mjs <event>` als proces; de uitvoer (stdout). */
function hook(root: string, event: string, input: Record<string, unknown>): string {
  const result = spawnSync(process.execPath, [EFFECT, event], {
    cwd: root,
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: procEnv(),
    timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(`effect ${event}: exit ${String(result.status)} ${result.stderr}`);
  return result.stdout;
}

export const blok = (stdout: string): string => (stdout.includes('"decision":"block"') ? stdout : '');
export const start = (root: string, wie: Wie): string => hook(root, 'subagent-start', payloadVan(root, wie));
export const stopAgent = (root: string, wie: Wie): string => hook(root, 'subagent-stop', payloadVan(root, wie));
export const stopHoofd = (root: string, sessie: string): string =>
  hook(root, 'stop', { cwd: root, session_id: sessie });

/** PreToolUse, het commando (`doe` is wat het in de werkmap doet), PostToolUse: de uitvoer van PostToolUse. */
export function bash(root: string, wie: Wie, uit: { command: string; doe: () => void }): string {
  const invoer = payloadVan(root, wie, {
    tool_name: 'Bash',
    tool_input: { command: uit.command },
    tool_use_id: `t${String((teller += 1))}`,
  });
  hook(root, 'pre', invoer);
  uit.doe();
  return hook(root, 'post', invoer);
}

// ---- een export die nog niet bestaat -----------------------------------------------------------------------------

/**
 * Roept `module[naam](...args)` aan. De handtekening of de export bestaat nog niet (de tests komen vóór de code): dan gooit dit
 * met een duidelijke melding, zodat elk geval op een eigen assertie faalt en niet op een import- of typefout van het hele bestand.
 */
export function roep(module: object, naam: string, ...args: unknown[]): unknown {
  const functie: unknown = Reflect.get(module, naam);
  if (typeof functie !== 'function') throw new Error(`export \`${naam}\` bestaat nog niet (AC-11 is nog niet gebouwd)`);
  return Reflect.apply(functie, undefined, args);
}

/** De waarde van een export die een constante moet zijn; gooit als hij nog niet bestaat. */
export function exportWaarde(module: object, naam: string): unknown {
  if (!(naam in module)) throw new Error(`export \`${naam}\` bestaat nog niet (AC-11 is nog niet gebouwd)`);
  return Reflect.get(module, naam);
}

// ---- een tekenapparaat dat een test niet zelf kan maken (geen mknod) -------------------------------------------------

/** Wat `lstatSync` teruggeeft voor een pad, voor zover de code het gebruikt: mode, de soortvragen en `rdev` (Linux: major*256+minor). */
export type StatUit = {
  mode: number;
  rdev: number;
  isCharacterDevice: () => boolean;
  isDirectory: () => boolean;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
};

export type Soort = 'apparaat-1-3' | 'apparaat-1-5' | 'apparaat-5-3' | 'map' | 'gewoon';

export function nepStat(soort: Soort): StatUit {
  const apparaat = soort.startsWith('apparaat-');
  const [major, minor] = apparaat ? soort.slice('apparaat-'.length).split('-').map(Number) : [0, 0];
  return {
    mode: apparaat ? 0o20666 : soort === 'map' ? 0o40755 : 0o100644,
    rdev: (major ?? 0) * 256 + (minor ?? 0),
    isCharacterDevice: () => apparaat,
    isDirectory: () => soort === 'map',
    isFile: () => soort === 'gewoon',
    isSymbolicLink: () => false,
  };
}

/**
 * Een `lstat` die voor de genoemde paden (relatief aan de werkmap) een andere soort meldt en voor de rest de echte `lstatSync`
 * gebruikt. Een test kan geen tekenapparaat maken (geen `mknod`, en de sandbox is er ook niet voor); daarom bestaat het pad als
 * leeg gewoon bestand op schijf (zodat git het ongetrackt noemt) en liegt deze functie over zijn soort. `momentopname` en
 * `padStaten` nemen deze functie als `repo.lstat` aan (de naam die deze tests aan de bouw voorschrijven).
 */
export function lstatMet(vals: Record<string, Soort>): (vol: string) => unknown {
  return (vol) => {
    const gevonden = Object.entries(vals).find(([rel]) => vol.endsWith(`/${rel}`));
    return gevonden === undefined ? lstatSync(vol) : nepStat(gevonden[1]);
  };
}
