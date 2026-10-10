import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Het echte hook-script (.claude/hooks/rolhek.mjs) met echte stdin-payloads: exitcode en uitvoer zoals Claude Code ze leest.
// Exit 2 blokkeert; een interne fout is ook exit 2 (faalt dicht, framework §8).
const root = process.cwd();

function run(input: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', ['.claude/hooks/rolhek.mjs'], {
    input,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const bash = (command: string) => JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: root });

test('verboden: exit 2 met de reden op stderr', () => {
  const result = run(bash('git push origin main'));

  expect([result.status, result.stderr.trim()]).toStrictEqual([2, 'rolhek: push naar main is verboden; open een PR']);
});

test('beschermd pad voor de hoofdsessie: permissionDecision ask', () => {
  const result = run(bash('echo x > src/core/x.ts'));
  const output: unknown = JSON.parse(result.stdout);

  expect(result.status).toBe(0);
  expect(output).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' } });
});

test('bestaande test wijzigen: door, met context voor de PR', () => {
  const payload = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: `${root}/test/hooks/rolhek.test.ts`, old_string: 'Rolhek', new_string: 'Het rolhek' },
    cwd: root,
  });
  const result = run(payload);

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse' } });
  expect(result.stdout).toContain('is een bestaande test: noem de wijziging met reden in de PR');
});

test('gewoon commando: door, zonder uitvoer', () => {
  expect(run(bash('ls'))).toStrictEqual({ status: 0, stdout: '', stderr: '' });
});

test('kapotte invoer: faalt dicht (exit 2)', () => {
  const result = run('geen json');

  expect([result.status, result.stderr.startsWith('rolhek: interne fout, daarom geweigerd')]).toStrictEqual([2, true]);
});

test('.claude/settings.json registreert het rolhek voor Edit, Write en Bash', () => {
  const settings = readFileSync('.claude/settings.json', 'utf8');

  expect(settings).toContain('"matcher": "Edit|Write|MultiEdit|NotebookEdit|Bash"');
  expect(settings).toContain('.claude/hooks/rolhek.mjs');
});
