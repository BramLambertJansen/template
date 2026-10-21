import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lintEnvironment, lintInputKey } from './lint-inputs.mjs';

/**
 * @typedef {{ command: string, args: readonly string[], root: string, env: NodeJS.ProcessEnv }} Command
 * @typedef {{ root: string, env: NodeJS.ProcessEnv, node?: string, run: (command: Command) => number }} Options
 * @typedef {{ key: string, cache: string }} Record
 */

/** @param {string} file @param {string} key @returns {string | null} */
function priorCache(file, key) {
  try {
    /** @type {unknown} */
    const record = JSON.parse(readFileSync(file, 'utf8'));
    if (
      typeof record !== 'object' ||
      record === null ||
      !('key' in record) ||
      record.key !== key ||
      !('cache' in record)
    )
      return null;
    if (typeof record.cache !== 'string') return null;
    /** @type {unknown} */
    const cache = JSON.parse(record.cache);
    if (typeof cache !== 'object' || cache === null) return null;
    return record.cache;
  } catch {
    return null;
  }
}

/** @param {Options} options */
function ordinary(options) {
  return options.run({ command: 'pnpm', args: ['lint'], root: options.root, env: options.env });
}

/** @param {{ root: string, env: NodeJS.ProcessEnv, key: string }} input */
function prepare({ root, env, key }) {
  const identity = createHash('sha256').update(path.resolve(root)).digest('hex');
  const directory = path.join(env['TMPDIR'] ?? tmpdir(), 'template-lint-cache', identity);
  mkdirSync(directory, { recursive: true });
  const temporary = mkdtempSync(path.join(directory, 'run-'));
  const record = path.join(directory, 'lint.json');
  const cache = path.join(temporary, 'eslint.json');
  const prior = priorCache(record, key);
  if (prior !== null) writeFileSync(cache, prior);
  return { temporary, record, cache };
}

/** @param {ReturnType<typeof prepare>} files @param {string} key */
function publish(files, key) {
  if (!existsSync(files.cache)) return;
  const pending = path.join(files.temporary, 'record.json');
  const record = { key, cache: readFileSync(files.cache, 'utf8') };
  writeFileSync(pending, JSON.stringify(record));
  renameSync(pending, files.record);
}

/** @param {ReturnType<typeof prepare>} files */
function clean(files) {
  try {
    rmSync(files.temporary, { recursive: true, force: true });
  } catch {
    /* Cacheopruimen bepaalt de lintuitslag niet. */
  }
}

/**
 * ESLint blijft iedere keer draaien en valideert zijn eigen cache; geen eigen groene uitslag.
 * @param {Options} options
 */
export function cachedLint(options) {
  if (['CI', 'GITHUB_ACTIONS', 'RUNNER_CACHE_DIR'].some((name) => options.env[name] !== undefined))
    return ordinary(options);
  const key = lintInputKey(options);
  if (key === null) return ordinary(options);
  /** @type {ReturnType<typeof prepare>} */
  let files;
  try {
    files = prepare({ ...options, key });
  } catch {
    return ordinary(options);
  }
  try {
    const args = [
      'node_modules/eslint/bin/eslint.js',
      '.',
      '--max-warnings',
      '0',
      '--cache',
      '--cache-strategy',
      'content',
      '--cache-location',
      files.cache,
    ];
    const code = options.run({
      command: options.node ?? process.execPath,
      args,
      root: options.root,
      env: lintEnvironment(options.env, options.root),
    });
    if (code !== 0) return code;
    if (lintInputKey(options) !== key) return ordinary(options);
    try {
      publish(files, key);
    } catch {
      /* Een mislukte cachepublicatie laat de echte groene lintuitslag staan. */
    }
    return 0;
  } finally {
    clean(files);
  }
}
