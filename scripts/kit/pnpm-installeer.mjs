// Eén installatiepad voor pnpm (spec pnpm-sandbox-installatie): de enige plek die pnpm voor een installatie start.
// `worktree-install.mjs` (modus `werkmap`), `cloud-setup.sh` en `bootstrap.sh` (modus `setup`) roepen deze module aan.
// Zonder dependencies, zodat het op een kale Node draait (zoals worktree-install.mjs).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {'werkmap' | 'setup'} InstallModus
 * @typedef {{ modus: InstallModus, cloud?: boolean }} InstallOpties
 * @typedef {{ command: 'pnpm', args: string[], env: Record<string, string> }} InstallCommando
 */

/**
 * Pure kern: het pnpm-commando met alle schrijfbare mappen onder `basis` (pnpm-sandbox/AC-4).
 * - `werkmap`: store en cache als vlag, data, cache, state en runtime via XDG onder `basis` (zie worktree-install.mjs voor
 *   de metingen achter elke map).
 * - `setup`: de gewone store, cache en state; alleen de store-vergrendeling van pnpm 12 (`XDG_RUNTIME_DIR`) onder `basis`
 *   (spec OV-1).
 * - `cloud`: `--config.confirm-modules-purge=false` als laatste argument, zodat pnpm zonder TTY niet afbreekt.
 * @param {string} basis
 * @param {InstallOpties} opties
 * @returns {InstallCommando}
 */
export function pnpmInstallCommando(basis, { modus, cloud = false }) {
  const purge = cloud ? ['--config.confirm-modules-purge=false'] : [];
  const runtime = path.join(basis, 'xdg-run');
  if (modus === 'setup')
    return { command: 'pnpm', args: ['install', '--frozen-lockfile', ...purge], env: { XDG_RUNTIME_DIR: runtime } };
  return {
    command: 'pnpm',
    args: [
      'install',
      '--frozen-lockfile',
      '--package-import-method=copy',
      `--store-dir=${path.join(basis, 'store')}`,
      `--cache-dir=${path.join(basis, 'cache')}`,
      ...purge,
    ],
    env: {
      XDG_DATA_HOME: path.join(basis, 'data'),
      XDG_CACHE_HOME: path.join(basis, 'xdg-cache'),
      XDG_STATE_HOME: path.join(basis, 'xdg-state'),
      XDG_RUNTIME_DIR: runtime,
    },
  };
}

/**
 * Installeert met pnpm in `process.cwd()` en geeft de exitcode van pnpm terug.
 * @param {InstallOpties} opties
 * @returns {number}
 */
export function installeer({ modus, cloud = false }) {
  throw new Error(`nog niet gebouwd (modus ${modus}, cloud ${String(cloud)})`);
}

/**
 * CLI: `--modus werkmap|setup [--cloud]`.
 * @param {string[]} argv
 * @returns {number}
 */
function main(argv) {
  console.error(`✗ pnpm-installeer: nog niet gebouwd (${argv.join(' ')})`);
  return 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
