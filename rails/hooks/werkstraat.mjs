// Entry voor de werkstraat-hooks (framework §8): `node rails/hooks/werkstraat.mjs <post-edit|stop|subagent-stop|session-start>`.
// De beslissingen staan in lib/werkstraat.mjs (getest in test/hooks/werkstraat.test.ts); hier alleen stdin, commando's en uitvoer.
// Root: de git-root van `cwd` uit de payload (een worktree), terugval CLAUDE_PROJECT_DIR en dan process.cwd() (lib/root.mjs).
// Een fout in de hook: bij stop en subagent-stop blokkeert hij met de fout (Claude Code stopt zelf na 8 keer), bij de
// andere meldt hij hem alleen; die blokkeren nooit iets.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { payloadCwd, projectRoot } from './lib/root.mjs';
import { rolhekContext } from './lib/rolhek-context.mjs';
import { createRun } from './lib/run.mjs';
import { changedFiles, postEdit, sessionStart, stop, subagentStop } from './lib/werkstraat.mjs';

const event = process.argv[2] ?? '';

/** @param {string} root */
function makeDeps(root) {
  const run = createRun(root);
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
    // Spec cloud-netwerkvorm/AC-10: de Cloud-regel van session-start leest `CLAUDE_CODE_REMOTE` uit deze omgeving.
    env: process.env,
    // Spec rolhek-leerpunten/AC-7: alleen session-start leest dit, dus pas bij gebruik.
    get netwerkvormen() {
      return netwerkvormen(root);
    },
  };
}

/**
 * De patronen uit het anker (zoals het rolhek ze leest) en uit de settings in `CLAUDE_PROJECT_DIR`. Fail-open: lukt het lezen
 * van het anker niet, dan geen vergelijking en geen melding.
 * @param {string} root
 */
function netwerkvormen(root) {
  try {
    const ctx = rolhekContext(root, root);
    return { anker: ctx.netwerkvormen, lokaal: ctx.lokaleNetwerkvormen };
  } catch {
    return undefined;
  }
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
