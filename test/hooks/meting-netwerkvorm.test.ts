// Leerpunt #899: `pnpm meting --trend` draait in de cloud binnen de sandbox en bereikt de token-proxy niet; `pnpm meting *` hoort in excludedCommands.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { echteNetwerkvormen } from './netwerkvormen-kit.ts';

const config = loadConfig(readFileSync(path.resolve(import.meta.dirname, '../../.claude/gates.json'), 'utf8'));

function beslis(command: string): { deny: string; ask: string } {
  const ctx = {
    root: '/repo',
    cwd: '/repo',
    config,
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
    netwerkvormen: echteNetwerkvormen(),
  };
  const decision = decide({ tool_name: 'Bash', tool_input: { command } }, ctx);
  return { deny: decision.deny.join('\n'), ask: decision.ask.join('\n') };
}

describe('meting-netwerkvorm leerpunt #899', () => {
  test('meting-netwerkvorm: excludedCommands bevat pnpm meting *', () => {
    expect(echteNetwerkvormen()).toContain('pnpm meting *');
  });

  test.each(['pnpm meting --trend', 'pnpm meting --pr-tabel --branch feat/x', 'pnpm meting', 'pnpm meting --json'])(
    'meting-netwerkvorm: los commando geeft geen netwerkvorm-deny (%s)',
    (command) => {
      const uitslag = beslis(command);
      expect(`${uitslag.deny}\n${uitslag.ask}`).not.toContain('Netwerkvorm');
    },
  );

  test.each(['pnpm meting --trend | tail -3', 'pnpm meting --trend && echo x'])(
    'meting-netwerkvorm: samengesteld commando geeft een netwerkvorm-deny met pnpm meting … (%s)',
    (command) => {
      const { deny } = beslis(command);
      expect(deny).toContain('Netwerkvorm');
      expect(deny).toContain('pnpm meting …');
    },
  );
});
