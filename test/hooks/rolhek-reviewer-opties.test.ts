import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// De reviewer-commando's (pnpm-checks, git diff|log|show|status, gh pr view|diff|checks, feiten) hadden alleen een
// vaste kop; elke optie mocht. Daarmee kon de reviewer schrijven (`--outputFile`, `-u`) of een andere configuratie laden.
// Nu dezelfde vaste optielijst als de leeslijst van rolhek-lezen/AC-1 (review 2026-11-02, R1).
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

function verdict(command: string): 'allow' | 'ask' | 'deny' {
  const decision = decide(
    { tool_name: 'Bash', tool_input: { command }, agent_type: 'reviewer' },
    { root: ROOT, cwd: ROOT, config, read: () => null, committed: () => false, isDir: () => false, branch: 'feat/x' },
  );
  if (decision.deny.length > 0) return 'deny';
  return decision.ask.length > 0 ? 'ask' : 'allow';
}

describe('reviewer: vaste opties', () => {
  test.each([
    'pnpm test:unit --reporter=json --outputFile=src/core/api/env.ts',
    'pnpm test:unit --outputFile src/x.ts',
    'pnpm test:unit -u',
    'pnpm test:e2e --update-snapshots',
    'pnpm test:unit --config /tmp/x.config.ts',
    'pnpm check:docs-drift --fix',
    'pnpm testx',
    'git diff --ext-diff',
    'git log --format=%H',
    'git show --textconv HEAD',
    'git status --ignored=matching',
    'gh pr view 1 --json body --jq env',
    'gh pr view 1 --web',
    'gh pr view 1 -R other/repo',
    'gh pr diff 1 --color always',
    'gh pr checks 1 --watch',
    'node scripts/kit/feiten.mjs --eval x',
    // pnpm geeft alles na -- door aan het script; een script kan dat als optie lezen.
    'pnpm test:unit -- --outputFile x',
    'pnpm test:unit -- -u',
    'pnpm check:new-resource -- --bewaar',
  ])('geweigerd: %s', (command) => {
    expect(verdict(command)).toBe('deny');
  });

  test.each([
    'pnpm test:unit',
    'pnpm test:unit test/hooks/rolhek-git-config.test.ts',
    'pnpm gate:fast',
    'pnpm check:docs-drift',
    'git diff origin/main...HEAD',
    'git diff --stat origin/main...HEAD',
    'git diff --name-only origin/main...HEAD -- src',
    'git log --oneline -n 20',
    'git log --stat origin/main..HEAD',
    'git show HEAD:docs/framework.md',
    'git diff HEAD~1',
    'git show HEAD^:docs/framework.md',
    'pnpm test:unit -- test/hooks',
    'git show --stat HEAD',
    'git status --short',
    'git status',
    'gh pr view 425',
    'gh pr view 425 --json body,files --jq .body',
    'gh pr view 425 --comments',
    'gh pr diff 425 --name-only',
    'gh pr checks 425',
    'node scripts/kit/feiten.mjs gates specs fase',
    'node scripts/kit/feiten.mjs hoofdstuk 8',
    'node scripts/kit/feiten.mjs adr --alle',
  ])('mag: %s', (command) => {
    expect(verdict(command)).toBe('allow');
  });
});
