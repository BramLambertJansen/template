import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// Spec nachtrun AC-1 t/m AC-3, ADR 0115 punt 5: de hoofdsessie opent een PR van haar eigen werkbranch via de MCP-tool
// met een allow van het rolhek; elke andere vorm blijft ask (hoofdsessie) of deny (subagent). Tabeltest zoals ADR 0078 punt 4
// voor een doorlaat eist. Vorm als test/hooks/rolhek-leerpunt-bijwerken.test.ts.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

function ctx(branch: string) {
  return {
    root: ROOT,
    cwd: ROOT,
    config,
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch,
  };
}

// `allow` alleen met een expliciete allow van het rolhek; zonder uitspraak beslist Claude Code zelf (dan een vraag).
type Verdict = 'allow' | 'ask' | 'deny' | 'geen';

function verdict(payload: unknown, branch = 'feat/x'): Verdict {
  const decision = decide(payload, ctx(branch));
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.allow === true ? 'allow' : 'geen';
}

const pr = (input: Record<string, unknown>, agent?: string, tool = 'mcp__github__create_pull_request') => ({
  tool_name: tool,
  tool_input: { owner: 'o', repo: 'r', title: 't', body: 'b', ...input },
  ...(agent === undefined ? {} : { agent_type: agent }),
});

const SUBAGENTS = ['developer', 'tester', 'reviewer', 'architect', 'docs', 'Explore'];

describe('nachtrun/AC-1: hoofdsessie, eigen werkbranch → geen vraag', () => {
  test.each([
    { naam: 'base main', input: { head: 'feat/x', base: 'main' } },
    { naam: 'gestapeld op een andere branch', input: { head: 'feat/x', base: 'feat/vorige' } },
    { naam: 'als draft', input: { head: 'feat/x', base: 'main', draft: true } },
  ])('nachtrun/AC-1: $naam', ({ input }) => {
    expect(verdict(pr(input))).toBe('allow');
  });

  test('nachtrun/AC-1: ook onder een andere servernaam', () => {
    expect(
      verdict(pr({ head: 'feat/x', base: 'main' }, undefined, 'mcp__plugin_engineering_github__create_pull_request')),
    ).toBe('allow');
  });
});

describe('nachtrun/AC-2: hoofdsessie, andere vorm → ask', () => {
  test.each([
    { naam: 'head is een andere branch', input: { head: 'feat/y', base: 'main' }, branch: 'feat/x' },
    { naam: 'head met eigenaar ervoor', input: { head: 'o:feat/x', base: 'main' }, branch: 'feat/x' },
    { naam: 'head ontbreekt', input: { base: 'main' }, branch: 'feat/x' },
    { naam: 'base ontbreekt', input: { head: 'feat/x' }, branch: 'feat/x' },
    { naam: 'base gelijk aan head', input: { head: 'feat/x', base: 'feat/x' }, branch: 'feat/x' },
    { naam: 'head geen tekst', input: { head: ['feat/x'], base: 'main' }, branch: 'feat/x' },
    { naam: 'sessie staat op main', input: { head: 'main', base: 'feat/x' }, branch: 'main' },
    { naam: 'losse HEAD', input: { head: 'HEAD', base: 'main' }, branch: 'HEAD' },
    { naam: 'branch onbekend', input: { head: '', base: 'main' }, branch: '' },
  ])('nachtrun/AC-2: $naam', ({ input, branch }) => {
    expect(verdict(pr(input), branch)).toBe('ask');
  });

  test('nachtrun/AC-2: een andere MCP-schrijftool blijft ask', () => {
    expect(verdict(pr({ head: 'feat/x', base: 'main' }, undefined, 'mcp__github__merge_pull_request'))).toBe('ask');
    expect(verdict(pr({ head: 'feat/x', base: 'main' }, undefined, 'mcp__github__update_pull_request'))).toBe('ask');
  });
});

describe('nachtrun/AC-3: subagent → deny, ook met de eigen werkbranch', () => {
  test.each(SUBAGENTS)('nachtrun/AC-3: %s', (agent) => {
    expect(verdict(pr({ head: 'feat/x', base: 'main' }, agent))).toBe('deny');
  });
});
