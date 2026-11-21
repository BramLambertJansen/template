import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { echteNetwerkvormen } from './netwerkvormen-kit.ts';

// ADR 0046: het opruimen na de merge gebruikt alleen deze gitvormen. Karakteriseringstests van bestaand rolhekgedrag; het weigeren van `git branch -D main` is nieuw gedrag (ADR 0046).
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
// cloud-netwerkvorm (OV-5, OV-7): de ctx heeft de echte patronen uit `excludedCommands`, zoals de hook ze krijgt.
const netwerkvormen = echteNetwerkvormen();

function exitCode(command: string, agent?: string): 0 | 2 {
  // Een variabele, geen letterlijke: het veld `netwerkvormen` komt pas bij de bouw in het type `Ctx`.
  const ctx = {
    root: ROOT,
    cwd: ROOT,
    config,
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
    netwerkvormen,
  };
  const decision = decide(
    { tool_name: 'Bash', tool_input: { command }, ...(agent === undefined ? {} : { agent_type: agent }) },
    ctx,
  );
  return decision.deny.length > 0 ? 2 : 0;
}

describe('opruimen na de merge: hoofdsessie', () => {
  test.each([
    // cloud-netwerkvorm (OV-7): de opruimstap voor een remote branch is `gh api -X DELETE …`, niet meer `git push origin --delete`.
    'gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/feat/x',
    'git merge --ff-only origin/main',
    'git branch -D feat/x',
    'git switch --detach origin/main',
    'git fetch origin',
    'git worktree remove ../wt',
  ])('toegestaan: %s', (command) => {
    expect(exitCode(command)).toBe(0);
  });

  // cloud-netwerkvorm (OV-5, OV-7): `git push origin --delete feat/x` was toegestaan; het is niet `git push origin HEAD`.
  test.each(['git push origin --delete feat/x', 'git push origin --delete main', 'git push --force origin feat/x'])(
    'geweigerd: %s',
    (command) => {
      expect(exitCode(command)).toBe(2);
    },
  );

  test.each([
    'git branch -D main',
    'git branch -d main',
    'git branch --delete main',
    'git branch -fD main',
    'git branch -D refs/heads/main',
    'git branch --delete --force main',
    'git branch -D feat/x main',
    'git -C . branch -D main',
    'git branch --del main',
    'git branch --d main',
    'git branch --dele main',
  ])('geweigerd, main verwijderen: %s', (command) => {
    expect(exitCode(command)).toBe(2);
  });

  test.each([
    'git branch -D main-old',
    'git branch -D feat/main',
    'git branch --list main',
    'git branch -m main x',
    'git branch -u origin/main',
    'git branch -D feat/x',
  ])('toegestaan, geen valse positief: %s', (command) => {
    expect(exitCode(command)).toBe(0);
  });
});

describe('opruimen na de merge: subagents', () => {
  test.each(['developer', 'tester', 'reviewer'])('%s: push en merge blijven geweigerd', (agent) => {
    const codes = ['git push origin --delete feat/x', 'git push origin feat/x', 'git merge --ff-only origin/main'].map(
      (command) => exitCode(command, agent),
    );
    expect(codes).toStrictEqual([2, 2, 2]);
  });
});
