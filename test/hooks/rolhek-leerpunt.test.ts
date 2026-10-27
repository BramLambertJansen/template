import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// Spec leerlus (docs/specs/leerlus.md) AC-5 t/m AC-7, ADR 0059 punt 3: alleen de hoofdsessie dient een leerpunt in, met
// `gh issue create --repo <onderhoud.repository> --label leerpunt …`; elke andere vorm is ask (met reden), elke subagent
// krijgt deny op `gh issue create` en op schrijvende `gh issue`-opdrachten. Vorm als test/hooks/rolhek.test.ts.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const REPO = config.onderhoud?.repository ?? '';

function ctx() {
  return {
    root: ROOT,
    cwd: ROOT,
    config,
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
  };
}

type Verdict = 'allow' | 'ask' | 'deny' | 'context';

function verdict(payload: unknown): Verdict {
  const decision = decide(payload, ctx());
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.context.length > 0 ? 'context' : 'allow';
}

const bash = (command: string, agent?: string) => ({
  tool_name: 'Bash',
  tool_input: { command },
  ...(agent === undefined ? {} : { agent_type: agent }),
});

const BODY = '--title "Leerpunt: Herhaald handwerk: x" --body "### Soort"';
const leerpunt = (repoFlag = `--repo ${REPO}`, labels = '--label leerpunt') =>
  `gh issue create ${repoFlag} ${labels} ${BODY}`;

const SUBAGENTS = ['developer', 'tester', 'reviewer', 'architect', 'docs', 'Explore'];

test('gates.json: onderhoud.repository is een <owner>/<repo>', () => {
  expect(REPO).toMatch(/^[\w.-]+\/[\w.-]+$/);
});

describe('hoofdsessie: gh issue create', () => {
  test.each([
    { name: 'juiste vorm', command: leerpunt() },
    { name: '-R in plaats van --repo', command: leerpunt(`-R ${REPO}`) },
    { name: 'repo in hoofdletters', command: leerpunt(`--repo ${REPO.toUpperCase()}`) },
    { name: 'label vóór repo', command: `gh issue create --label leerpunt --repo ${REPO} ${BODY}` },
  ])('leerlus/AC-5: $name → geen deny en geen ask', ({ command }) => {
    expect(decide(bash(command), ctx())).toMatchObject({ deny: [], ask: [] });
  });

  test.each([
    { name: 'geen --repo', command: `gh issue create --label leerpunt ${BODY}` },
    { name: 'andere repo', command: leerpunt('--repo iemand/anders') },
    { name: 'URL-vorm', command: leerpunt(`--repo https://github.com/${REPO}`) },
    { name: 'host-vorm', command: leerpunt(`--repo github.com/${REPO}`) },
    { name: 'geen label', command: leerpunt(`--repo ${REPO}`, '') },
    { name: 'ander label', command: leerpunt(`--repo ${REPO}`, '--label bug') },
    { name: '--label leerpunt,x', command: leerpunt(`--repo ${REPO}`, '--label leerpunt,x') },
    { name: 'twee --label', command: leerpunt(`--repo ${REPO}`, '--label leerpunt --label x') },
    { name: 'GH_REPO=', command: `GH_REPO=iemand/anders ${leerpunt()}` },
    { name: 'GH_HOST=', command: `GH_HOST=example.com ${leerpunt()}` },
    { name: 'export GH_REPO', command: `export GH_REPO=iemand/anders && ${leerpunt()}` },
    { name: 'bash -c', command: `bash -c '${leerpunt()}'` },
  ])('leerlus/AC-5: $name → ask met een reden', ({ command }) => {
    const decision = decide(bash(command), ctx());
    expect(verdict(bash(command))).toBe('ask');
    expect(decision.ask.join(' ').trim().length).toBeGreaterThan(10);
  });
});

describe('subagent: gh issue create', () => {
  test.each(SUBAGENTS)('leerlus/AC-6: %s → deny, ook met de juiste repo en het juiste label', (agent) => {
    expect([
      verdict(bash(leerpunt(), agent)),
      verdict(bash(leerpunt(`-R ${REPO}`), agent)),
      verdict(bash(`gh issue create --title x --body y`, agent)),
      verdict(bash(`bash -c '${leerpunt()}'`, agent)),
    ]).toStrictEqual(['deny', 'deny', 'deny', 'deny']);
  });
});

const SCHRIJVEND = [
  'edit',
  'close',
  'reopen',
  'delete',
  'transfer',
  'lock',
  'unlock',
  'pin',
  'unpin',
  'comment',
  'develop',
];
const SCHRIJVENDE_COMMANDOS = SCHRIJVEND.map((sub) => `gh issue ${sub} 1`);
const API_SCHRIJVEND = [
  'gh api -X POST repos/o/r/issues/1/comments -f body=x',
  'gh api repos/o/r/issues -f title=x',
  'gh api --method PATCH repos/o/r/issues/1 -f state=closed',
];

describe('subagent: schrijvende gh issue- en gh api-opdrachten', () => {
  test.each(SUBAGENTS)('leerlus/AC-7: %s → deny op gh issue edit|close|…|develop', (agent) => {
    expect(SCHRIJVENDE_COMMANDOS.map((command) => verdict(bash(command, agent)))).toStrictEqual(
      SCHRIJVEND.map(() => 'deny'),
    );
  });

  test.each(SUBAGENTS)('leerlus/AC-7: %s → deny op schrijvende gh api naar …/issues (bestaande regel)', (agent) => {
    expect(API_SCHRIJVEND.map((command) => verdict(bash(command, agent)))).toStrictEqual(
      API_SCHRIJVEND.map(() => 'deny'),
    );
  });

  // De reviewer valt erbuiten: zijn Bash-witlijst (gh pr view/diff/checks) verandert niet en weigert gh issue al.
  test.each(SUBAGENTS.filter((agent) => agent !== 'reviewer'))(
    'leerlus/AC-7: %s → gh issue view|list|status blijven toegestaan',
    (agent) => {
      expect(
        ['gh issue view 1', 'gh issue list --label leerpunt --state all', 'gh issue status'].map((command) =>
          verdict(bash(command, agent)),
        ),
      ).toStrictEqual(['allow', 'allow', 'allow']);
    },
  );
});

describe('hoofdsessie: andere gh issue-opdrachten veranderen niet', () => {
  // Uitslag vóór deze spec (gemeten op main na #310): allow, de permissievraag van Claude Code blijft de grens.
  test.each([...SCHRIJVENDE_COMMANDOS, 'gh api -X POST repos/o/r/issues/1/comments -f body=x', 'gh issue view 1'])(
    'leerlus/AC-7: hoofdsessie %s → geen nieuwe deny of ask',
    (command) => {
      expect(verdict(bash(command))).toBe('allow');
    },
  );
});
