import { spawnSync } from 'node:child_process';
import { gates } from './gates.mjs';
import { cachedLint } from './cached-lint.mjs';

/**
 * @typedef {import('./cached-lint.mjs').Command} Command
 * @typedef {{ root: string, env: NodeJS.ProcessEnv, node?: string, run?: (command: Command) => number }} Options
 */

/** @param {Command} command */
function execute(command) {
  return (
    spawnSync(command.command, command.args, {
      cwd: command.root,
      env: command.env,
      stdio: 'inherit',
    }).status ?? 1
  );
}

/** @param {Options} options */
export function runLocalGate(options) {
  const run = options.run ?? execute;
  for (const gate of gates.filter((entry) => entry.snel)) {
    const result =
      gate.script === 'lint'
        ? cachedLint({ ...options, run })
        : run({ command: 'pnpm', args: [gate.script], root: options.root, env: options.env });
    if (result !== 0) return result;
  }
  return 0;
}

if (import.meta.main) {
  const options = { root: process.cwd(), env: process.env, run: execute };
  if (process.argv.length === 2) process.exitCode = runLocalGate(options);
  else if (process.argv.length === 3 && process.argv[2] === '--lint') process.exitCode = cachedLint(options);
  else {
    console.error('Gebruik: node scripts/kit/local-gate.mjs [--lint]');
    process.exitCode = 1;
  }
}
