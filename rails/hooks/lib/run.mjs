// `run` van de werkstraat-hooks (rails/hooks/werkstraat.mjs): één commando synchroon, uitslag `{ code, output }`.
// Getest in test/hooks/werkstraat-afgebroken.test.ts en, via het entry-script, test/hooks/werkstraat-startfout.test.ts.
import { spawnSync } from 'node:child_process';
import { checkEnv } from './check-env.mjs';

/**
 * Een fout van spawnSync is geen rode check met lege uitvoer: noem hem (leerpunt #720). "kon niet starten" alleen als
 * het proces niet startte (bv. ENOENT: pnpm ontbreekt); na een timeout of een overschreden maxBuffer liep het wel.
 * @param {Error} error
 * @param {string} command
 * @param {number | undefined} timeout
 */
function foutregel(error, command, timeout) {
  const code = 'code' in error ? String(error.code) : error.message;
  if (code === 'ETIMEDOUT') return `afgebroken na ${String(timeout)} ms: ${command}`;
  if (code === 'ENOBUFS') return `uitvoer te groot: ${command}`;
  return `kon niet starten: ${command} (${code})`;
}

/**
 * De `run` voor één werkmap: `(command, args, options) => { code, output }`.
 * @param {string} root
 * @returns {(command: string, args: readonly string[], options?: { timeout?: number, env?: Record<string, string> }) => { code: number, output: string }}
 */
export function createRun(root) {
  return (command, args, options = {}) => {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      env: checkEnv(process.env, options.env),
      timeout: options.timeout,
      maxBuffer: 32 * 1024 * 1024,
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    if (result.error !== undefined) {
      // De foutregel staat ná de gedeeltelijke uitvoer (leeg bij een startfout): de hook houdt van een rode check alleen de
      // laatste regels over (lastLines in werkstraat.mjs), dus vooraan zou hij bij veel uitvoer wegvallen.
      const regel = foutregel(result.error, command, options.timeout);
      return { code: 1, output: output === '' ? regel : `${output.trimEnd()}\n${regel}` };
    }
    return { code: result.status ?? 1, output };
  };
}
