import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { regel } from '../../rails/hooks/lib/meting.mjs';

// `tc` in de meetregel: alleen het gehele getal totalToolUseCount van een Agent/Task-run, niets anders uit tool_response
// (spec agents-leveren, PR-1).
const cwd = mkdtempSync(path.join(tmpdir(), 'meting-per-rol-'));
const nu = new Date('2026-11-19T10:00:00.000Z');

function payload(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    session_id: 'sess-1',
    cwd,
    hook_event_name: 'PostToolUse',
    tool_name: 'Agent',
    tool_use_id: 'toolu_1',
    tool_input: { subagent_type: 'reviewer', prompt: 'geheime opdracht' },
    ...extra,
  };
}

const antwoord = {
  totalToolUseCount: 17,
  totalTokens: 1234,
  totalDurationMs: 5000,
  usage: { input_tokens: 10, output_tokens: 20 },
  content: [{ type: 'text', text: 'geheim antwoord' }],
};

test('agents-leveren/AC-1: PostToolUse van Agent krijgt tc uit totalToolUseCount en verder niets uit tool_response', () => {
  const r = regel(payload({ tool_response: antwoord }), nu);
  expect(r).toMatchObject({ e: 'PostToolUse', k: 'agent reviewer', tc: 17 });
  expect(Object.keys(r ?? {}).sort()).toStrictEqual(['a', 'b', 'e', 'id', 'k', 's', 't', 'tc', 'tool']);
  const tekst = JSON.stringify(r);
  expect(tekst).not.toContain('1234');
  expect(tekst).not.toContain('geheim');
  expect(tekst).not.toContain('5000');
});

test('agents-leveren/AC-1: de oudere naam Task krijgt ook tc', () => {
  expect(regel(payload({ tool_name: 'Task', tool_response: antwoord }), nu)).toMatchObject({
    k: 'agent reviewer',
    tc: 17,
  });
});

test('agents-leveren/AC-1: tc 0 is een geldige telling', () => {
  expect(regel(payload({ tool_response: { totalToolUseCount: 0 } }), nu)).toMatchObject({ tc: 0 });
});

test.each([
  ['ontbreekt (start op de achtergrond)', { status: 'async_launched' }],
  ['negatief', { totalToolUseCount: -1 }],
  ['geen geheel getal', { totalToolUseCount: 1.5 }],
  ['tekst', { totalToolUseCount: '17' }],
  ['oneindig', { totalToolUseCount: Number.POSITIVE_INFINITY }],
  ['geen object', 'tekst'],
])('agents-leveren/AC-1: zonder geldige totalToolUseCount (%s) ontbreekt tc', (_naam, response) => {
  const r = regel(payload({ tool_response: response }), nu);
  expect(r).toMatchObject({ k: 'agent reviewer' });
  expect(r).not.toHaveProperty('tc');
});

test('agents-leveren/AC-1: zonder tool_response ontbreekt tc', () => {
  expect(regel(payload({}), nu)).not.toHaveProperty('tc');
});

test.each(['PreToolUse', 'PostToolUseFailure', 'PermissionDenied', 'PermissionRequest'])(
  'agents-leveren/AC-1: het event %s krijgt nooit tc',
  (e) => {
    expect(regel(payload({ hook_event_name: e, tool_response: antwoord }), nu)).not.toHaveProperty('tc');
  },
);

test.each([
  ['Bash', { command: 'git status' }],
  ['Read', { file_path: 'README.md' }],
  ['mcp__x__y', {}],
])('agents-leveren/AC-1: de tool %s krijgt nooit tc', (tool, input) => {
  const r = regel(payload({ tool_name: tool, tool_input: input, tool_response: antwoord }), nu);
  expect(r).not.toBeNull();
  expect(r).not.toHaveProperty('tc');
});
