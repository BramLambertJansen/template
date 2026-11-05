// Entry voor de werkstraat-hooks (framework §8): `node rails/hooks/werkstraat.mjs <post-edit|stop|subagent-stop|session-start>`.
// De beslissingen staan in lib/werkstraat.mjs (getest in test/hooks/werkstraat.test.ts); hier alleen stdin, commando's en uitvoer.
// Root: de git-root van `cwd` uit de payload (een worktree), terugval CLAUDE_PROJECT_DIR en dan process.cwd() (lib/root.mjs).
// Een fout in de hook: bij stop en subagent-stop blokkeert hij met de fout (Claude Code stopt zelf na 8 keer), bij de
// andere meldt hij hem alleen; die blokkeren nooit iets. Session-start legt als eerste stap het venster `hook` van de toets
// op effect vast over `.claude/hooks/.cache/` (de stub-lader ververste het anker al; spec rolhek-effect AC-10 c), fail-open.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkEnv } from './lib/check-env.mjs';
import { legVensterVast } from './lib/effect.mjs';
import { bestandenOnder, gitIn } from './lib/effect-snapshot.mjs';
import { rolhekContext } from './lib/rolhek-context.mjs';
import { payloadCwd, projectRoot } from './lib/root.mjs';
import { changedFiles, postEdit, sessionStart, stop, subagentStop } from './lib/werkstraat.mjs';

const CACHE = '.claude/hooks/.cache';

const event = process.argv[2] ?? '';

/** @param {string} root */
function makeDeps(root) {
  /**
   * @param {string} command
   * @param {readonly string[]} args
   * @param {{ timeout?: number, env?: Record<string, string> }} [options]
   */
  const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      env: checkEnv(process.env, options.env),
      timeout: options.timeout,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { code: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  };
  return {
    run,
    changed: () => changedFiles(run, (rel) => existsSync(path.join(root, rel))),
    read: (/** @type {string} */ rel) => {
      try {
        return readFileSync(path.join(root, rel), 'utf8');
      } catch {
        return null;
      }
    },
    onthoud: (/** @type {string} */ sleutel) => onthoud(run, root, sleutel),
  };
}

/**
 * Legt een sleutel vast onder `<git common dir>/werkstraat/` (buiten git-tracking, zoals de meethook); true als hij nieuw
 * was. Fail-open: lukt het niet, dan telt de sleutel als nieuw.
 * @param {(command: string, args: readonly string[]) => { code: number, output: string }} run
 * @param {string} root
 * @param {string} sleutel
 */
function onthoud(run, root, sleutel) {
  try {
    const common = run('git', ['rev-parse', '--git-common-dir']);
    if (common.code !== 0) return true;
    const map = path.resolve(root, common.output.trim(), 'werkstraat');
    const bestand = path.join(map, sleutel.replace(/[^\w-]/g, '_'));
    mkdirSync(map, { recursive: true });
    // 'wx': aanmaken en controleren in één stap (geen race tussen bestaan en schrijven).
    writeFileSync(bestand, '', { flag: 'wx' });
    return true;
  } catch (error) {
    return !(error instanceof Error && 'code' in error && error.code === 'EEXIST');
  }
}

/**
 * Het venster van de actor `hook` (spec rolhek-effect AC-10 c): elk bestand onder `.claude/hooks/.cache/`, in de staat van
 * nu. Fail-open: session-start blokkeert nooit; zonder cachebestanden geen venster.
 * @param {string} root
 */
function hookVenster(root) {
  try {
    const paden = bestandenOnder(path.join(root, CACHE), CACHE);
    if (paden.length === 0) return;
    const nu = Date.now();
    const repo = { root, git: gitIn(root), ctx: rolhekContext(root, root), now: () => Date.now() };
    legVensterVast(repo, { actor: 'hook', start: nu, eind: nu, paden });
  } catch (error) {
    process.stderr.write(`werkstraat-hook session-start: venster van de hook niet vastgelegd: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

/** Lege stdin (session-start kan zonder payload komen) telt als `{}`; kapotte JSON is een fout. */
function readPayload() {
  const text = readFileSync(0, 'utf8');
  /** @type {unknown} */
  const payload = text.trim() === '' ? {} : JSON.parse(text);
  return payload;
}

/** @param {unknown} payload */
function handle(payload) {
  const root = projectRoot(payloadCwd(payload), process.cwd());
  const deps = makeDeps(root);
  switch (event) {
    case 'post-edit':
      return postEdit(payload, { root, deps });
    case 'stop':
      return stop(payload, deps);
    case 'subagent-stop':
      return subagentStop(payload, deps);
    case 'session-start':
      hookVenster(root);
      return sessionStart(deps);
    default:
      throw new Error(`onbekende hook "${event}"`);
  }
}

try {
  const result = handle(readPayload());
  if (result.stdout !== undefined) process.stdout.write(result.stdout);
  if (result.stderr !== undefined) process.stderr.write(`${result.stderr}\n`);
  process.exit(result.exit ?? 0);
} catch (error) {
  const message = `werkstraat-hook ${event}: ${error instanceof Error ? error.message : String(error)}`;
  if (event === 'stop' || event === 'subagent-stop') {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: `${message} (meld dit; de hook zelf faalt)` }));
    process.exit(0);
  }
  process.stderr.write(`${message}\n`);
  process.exit(event === 'post-edit' ? 2 : 0);
}
