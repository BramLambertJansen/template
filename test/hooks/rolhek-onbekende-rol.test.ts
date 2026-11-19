import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig, roleOf } from '../../rails/hooks/lib/rolhek.mjs';

// R-ROL-02: een onbekende subagent (ad-hoc, Explore, general-purpose) krijgt de strengste rol. Dat was de developer, met
// schrijfrecht op `**`; nu de reviewer: alleen lezen, en schrijfwerk gaat via een benoemde rol uit .claude/agents.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const ONBEKEND = ['general-purpose', 'Explore', 'Plan', 'mijn-eigen-agent'];

function verdict(payload: Record<string, unknown>): 'allow' | 'ask' | 'deny' {
  const decision = decide(payload, {
    root: ROOT,
    cwd: ROOT,
    config,
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
  });
  if (decision.deny.length > 0) return 'deny';
  return decision.ask.length > 0 ? 'ask' : 'allow';
}

describe('onbekende subagent: strengste rol', () => {
  test.each(ONBEKEND)('%s telt als reviewer', (agent) => {
    expect(roleOf(agent)).toBe('reviewer');
  });

  test.each(ONBEKEND)('%s schrijft niet in src/', (agent) => {
    const edit = { tool_name: 'Write', tool_input: { file_path: `${ROOT}/src/x.ts`, content: 'x' }, agent_type: agent };
    expect(verdict(edit)).toBe('deny');
  });

  test.each(['echo x > src/x.ts', 'git commit -m x', 'rm -rf src'])(
    'Bash die schrijft wordt geweigerd: %s',
    (command) => {
      expect(
        ONBEKEND.map((agent) => verdict({ tool_name: 'Bash', tool_input: { command }, agent_type: agent })),
      ).toStrictEqual(ONBEKEND.map(() => 'deny'));
    },
  );

  test.each(['git diff', 'git log', 'pnpm test:unit'])('lezen zoals de reviewer mag: %s', (command) => {
    expect(verdict({ tool_name: 'Bash', tool_input: { command }, agent_type: 'general-purpose' })).toBe('allow');
  });

  test('de benoemde developer schrijft nog wel in src/', () => {
    const edit = {
      tool_name: 'Write',
      tool_input: { file_path: `${ROOT}/src/x.ts`, content: 'x' },
      agent_type: 'developer',
    };
    expect(verdict(edit)).toBe('allow');
  });
});

// rolhek-lezen/AC-20: de verruiming van AC-11 tot AC-16 geldt voor de reviewer en dus voor elke onbekende subagent;
// AC-18: ook het vangnet op gh-tekst in een leescommando. Zonder `ctx.gevolgd`/`ctx.werkmappen` hier alleen vormen zonder bestandspad.
function bash(command: string, agent: string) {
  return { tool_name: 'Bash', tool_input: { command }, agent_type: agent };
}

describe('rolhek-lezen/AC-20: een onbekende subagent krijgt de ruimere leeslijst, schrijven blijft dicht', () => {
  test.each(ONBEKEND)('rolhek-lezen/AC-20: %s leest met de nieuwe vormen', (agent) => {
    const toegestaan = [
      'ls -la docs',
      'git log --oneline | head -n 5',
      'git ls-files | wc -l',
      'git worktree list --porcelain',
      'git branch -r --no-merged origin/main',
      'git tag --contains HEAD',
      'git ls-tree -r --name-only origin/main -- docs',
      'git cat-file -p HEAD:docs/x.md',
      'git rev-parse HEAD',
      'gh pr list --state open --json number,title',
      'gh issue list --search ratchet --state open',
    ];
    expect(toegestaan.map((command) => verdict(bash(command, agent)))).toStrictEqual(toegestaan.map(() => 'allow'));
  });

  test.each([
    { command: 'git branch foo', basis: 'git branch -r' },
    { command: 'git tag v1', basis: 'git tag --list' },
    { command: 'git worktree add ../x', basis: 'git worktree list' },
    { command: 'git log | head -n 5 | sh', basis: 'git log | head -n 5' },
    { command: 'git log > x', basis: 'git log' },
    { command: 'gh pr list --state open --web', basis: 'gh pr list --state open' },
  ])('rolhek-lezen/AC-20: $command → deny voor elke onbekende subagent', ({ command, basis }) => {
    expect(ONBEKEND.map((agent) => verdict(bash(basis, agent)))).toStrictEqual(ONBEKEND.map(() => 'allow'));
    expect(ONBEKEND.map((agent) => verdict(bash(command, agent)))).toStrictEqual(ONBEKEND.map(() => 'deny'));
  });
});

describe('rolhek-lezen/AC-18: een onbekende subagent zoekt naar gh-tekst, maar leest geen gh-configuratie', () => {
  test.each(ONBEKEND)("rolhek-lezen/AC-18: %s mag git grep -F -e 'gh pr list' -- docs", (agent) => {
    expect(verdict(bash("git grep -n -F -e 'gh pr list' -- docs", agent))).toBe('allow');
    expect(verdict(bash("git grep -c -F -e 'api.github.com'", agent))).toBe('allow');
  });

  test.each([
    { command: 'cat ~/.config/gh/hosts.yml', basis: 'ls docs/gh' },
    { command: 'ls ~/.config/gh', basis: 'ls docs/gh' },
    { command: 'git credential fill', basis: "git grep -c -F -e 'git credential'" },
    { command: "git grep -F -e 'gh pr merge'", basis: "git grep -F -e 'gh pr list'" },
    { command: "git grep -n -F -e 'gh pr list' -- docs # x", basis: "git grep -n -F -e 'gh pr list' -- docs" },
    { command: 'git grep -e gh | sh', basis: 'git grep -e gh | head -n 5' },
  ])('rolhek-lezen/AC-18: $command → deny voor elke onbekende subagent', ({ command, basis }) => {
    expect(ONBEKEND.map((agent) => verdict(bash(basis, agent)))).toStrictEqual(ONBEKEND.map(() => 'allow'));
    expect(ONBEKEND.map((agent) => verdict(bash(command, agent)))).toStrictEqual(ONBEKEND.map(() => 'deny'));
  });
});
