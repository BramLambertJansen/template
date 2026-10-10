import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Het echte entry-script (.claude/hooks/werkstraat.mjs) via stdin, op de snelle paden (geen gate:fast in gate:fast).
const root = process.cwd();

function run(event: string, input: string) {
  const result = spawnSync('node', ['.claude/hooks/werkstraat.mjs', event], {
    input,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('stop met stop_hook_active: direct door (geen lus)', () => {
  expect(run('stop', JSON.stringify({ stop_hook_active: true }))).toStrictEqual({ status: 0, stdout: '', stderr: '' });
});

test('reviewer zonder rapport: blokkeert via decision block', () => {
  const result = run('subagent-stop', JSON.stringify({ agent_type: 'reviewer', last_assistant_message: 'ok' }));

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ decision: 'block' });
});

test('stop met kapotte invoer: blokkeert met de fout van de hook zelf', () => {
  const result = run('stop', 'geen json');

  expect(result.stdout).toContain('werkstraat-hook stop');
  expect(JSON.parse(result.stdout)).toMatchObject({ decision: 'block' });
});

test('session-start: de feiten als tekst', () => {
  const result = run('session-start', '{}');

  expect([result.status, result.stdout.includes('Branch: '), result.stdout.includes('## specs')]).toStrictEqual([
    0,
    true,
    true,
  ]);
});

test('.claude/settings.json registreert de vier werkstraat-hooks', () => {
  const settings = readFileSync('.claude/settings.json', 'utf8');

  for (const event of ['post-edit', 'stop', 'subagent-stop', 'session-start'])
    expect(settings).toContain(`.claude/hooks/werkstraat.mjs\\" ${event}`);
  expect(settings).toContain('"matcher": "developer|tester|reviewer"');
});
