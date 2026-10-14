import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../.claude/hooks/lib/rolhek.mjs';

// ADR 0030 punt 8: het opruimen na de merge gebruikt alleen deze gitvormen. Karakteriseringstests van bestaand rolhekgedrag.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

function exitCode(command: string, agent?: string): 0 | 2 {
  const decision = decide(
    { tool_name: 'Bash', tool_input: { command }, ...(agent === undefined ? {} : { agent_type: agent }) },
    { root: ROOT, cwd: ROOT, config, read: () => null, committed: () => false, isDir: () => false, branch: 'feat/x' },
  );
  return decision.deny.length > 0 ? 2 : 0;
}

describe('opruimen na de merge: hoofdsessie', () => {
  test.each([
    'git push origin --delete feat/x',
    'git merge --ff-only origin/main',
    'git branch -D feat/x',
    'git switch --detach origin/main',
    'git fetch origin',
    'git worktree remove ../wt',
  ])('toegestaan: %s', (command) => {
    expect(exitCode(command)).toBe(0);
  });

  test.each(['git push origin --delete main', 'git branch -D main', 'git push --force origin feat/x'])(
    'geweigerd: %s',
    (command) => {
      expect(exitCode(command)).toBe(2);
    },
  );
});

describe('opruimen na de merge: subagents', () => {
  test.each(['developer', 'tester', 'reviewer'])('%s: push en merge blijven geweigerd', (agent) => {
    const codes = ['git push origin --delete feat/x', 'git push origin feat/x', 'git merge --ff-only origin/main'].map(
      (command) => exitCode(command, agent),
    );
    expect(codes).toStrictEqual([2, 2, 2]);
  });
});
