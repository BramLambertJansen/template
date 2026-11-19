import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { rolhekContext } from '../../rails/hooks/lib/rolhek-context.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// docs/specs/rolhek-lezen.md: de reviewer leest met een kleine lijst commando's en opties (AC-1, AC-3, AC-4); `git diff
// --output` en `git grep -O` zijn voor elke rol dicht (AC-2); de andere rollen veranderen verder niet (AC-5).
const ctx = {
  root: '/repo',
  cwd: '/repo',
  config: loadConfig(readFileSync('.claude/gates.json', 'utf8')),
  read: () => null,
  committed: () => false,
  isDir: () => false,
  branch: 'feat/x',
};

type Verdict = 'allow' | 'ask' | 'deny' | 'context';

function run(command: string, role?: string) {
  return decide(
    { tool_name: 'Bash', tool_input: { command }, ...(role === undefined ? {} : { agent_type: role }) },
    ctx,
  );
}

function verdict(command: string, role?: string): Verdict {
  const decision = run(command, role);
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.context.length > 0 ? 'context' : 'allow';
}

const REVIEWER = 'reviewer';

describe('rolhek-lezen/AC-1: de leeslijst van de reviewer', () => {
  test.each([
    // git ls-files: vlag-loos, paden na `--`
    'git ls-files',
    'git ls-files -- src/api/server.ts',
    'git ls-files -- src docs',
    // gh issue view <nr>: vlag --comments, met waarde --json, --jq
    'gh issue view 5',
    'gh issue view 5 --comments',
    'gh issue view 5 --json title,body',
    'gh issue view 5 --jq .title',
    'gh issue view 5 --comments --json body --jq .body',
    // gh issue list: met waarde --label --state --limit --json --jq
    'gh issue list',
    'gh issue list --label bug --state open --limit 10',
    'gh issue list --json number,title --jq .title',
    // een optie met waarde neemt altijd het volgende woord als waarde, ook als dat met `-` begint (pflag)
    'gh issue list --label --web',
    'gh issue view 5 --json -x',
    // gh run view <id>: vlaggen --log --log-failed, met waarde --json --jq --job
    'gh run view 123',
    'gh run view 123 --log',
    'gh run view 123 --log-failed',
    'gh run view 123 --job 456',
    'gh run view 123 --json jobs --jq .jobs',
    // gh run list: met waarde --branch --workflow --limit --json --jq
    'gh run list',
    'gh run list --branch main --workflow ci.yml --limit 5',
    'gh run list --json databaseId,status --jq .status',
    // pnpm leespad: vlag --json, met waarde --ref
    'pnpm leespad',
    'pnpm leespad --json',
    'pnpm leespad --ref origin/main',
    'pnpm leespad --json --ref origin/main',
    // pnpm meting: vlaggen --json --pr-tabel --trend --help, met waarde --branch --sessie
    'pnpm meting',
    'pnpm meting --json',
    'pnpm meting --pr-tabel',
    'pnpm meting --trend',
    'pnpm meting --help',
    'pnpm meting --branch feat/x',
    'pnpm meting --sessie abc-123',
    'pnpm meting --json --branch claude/rolhek-lezen --sessie s_01:x',
  ])('toegestaan: %s', (command) => {
    expect(verdict(command, REVIEWER)).toBe('allow');
  });

  // Elk geval heeft een basis uit de tabel hierboven die zonder de afwijking slaagt.
  test.each([
    // --web, -R/--repo en gh api blijven dicht
    { name: 'issue view --web', command: 'gh issue view 5 --web', basis: 'gh issue view 5' },
    { name: 'issue view -w', command: 'gh issue view 5 -w', basis: 'gh issue view 5' },
    {
      name: '--comments heeft geen waarde',
      command: 'gh issue view 5 --comments --web',
      basis: 'gh issue view 5 --comments',
    },
    { name: '--log heeft geen waarde', command: 'gh run view 1 --log --web', basis: 'gh run view 1 --log' },
    { name: 'run view --web', command: 'gh run view 1 --web', basis: 'gh run view 1' },
    { name: 'issue list --web', command: 'gh issue list --web', basis: 'gh issue list' },
    { name: 'run list --web', command: 'gh run list --web', basis: 'gh run list' },
    { name: 'issue view -R', command: 'gh issue view 5 -R o/r', basis: 'gh issue view 5' },
    { name: 'issue view --repo', command: 'gh issue view 5 --repo o/r', basis: 'gh issue view 5' },
    { name: 'issue list --repo=', command: 'gh issue list --repo=o/r', basis: 'gh issue list' },
    { name: 'run view -R vóór de actie', command: 'gh -R o/r run view 1', basis: 'gh run view 1' },
    { name: 'run list --repo', command: 'gh run list --repo o/r', basis: 'gh run list' },
    { name: 'gh api (lezen)', command: 'gh api repos/o/r/issues/5', basis: 'gh issue view 5' },
    { name: 'gh api (runs)', command: 'gh api repos/o/r/actions/runs/1', basis: 'gh run view 1' },
    // andere acties van dezelfde groepen
    { name: 'issue create', command: 'gh issue create --title x', basis: 'gh issue list' },
    { name: 'issue comment', command: 'gh issue comment 5', basis: 'gh issue view 5' },
    { name: 'issue close', command: 'gh issue close 5', basis: 'gh issue view 5' },
    { name: 'run rerun', command: 'gh run rerun 1', basis: 'gh run view 1' },
    { name: 'run download', command: 'gh run download 1', basis: 'gh run view 1' },
    { name: 'run watch', command: 'gh run watch 1', basis: 'gh run view 1' },
    // --jq alleen met paden: geen jq-functies zoals env (tokens uit de omgeving)
    { name: '--jq env', command: 'gh issue view 5 --jq env', basis: 'gh issue view 5 --jq .title' },
    { name: '--jq .x,env', command: 'gh run view 1 --jq .x,env', basis: 'gh run view 1 --jq .x,.y' },
    { name: '--jq zonder punt', command: 'gh issue list --jq length', basis: 'gh issue list --jq .title' },
    // vastgeplakte waarden en clusters staan niet in de lijst
    { name: '--json=…', command: 'gh issue view 5 --json=title', basis: 'gh issue view 5 --json title' },
    { name: '--limit=…', command: 'gh issue list --limit=5', basis: 'gh issue list --limit 5' },
    { name: 'korte -L5', command: 'gh issue list -L5', basis: 'gh issue list --limit 5' },
    { name: 'korte -l', command: 'gh issue list -l bug', basis: 'gh issue list --label bug' },
    { name: 'korte -s', command: 'gh issue list -s open', basis: 'gh issue list --state open' },
    { name: 'korte -q', command: 'gh run view 1 -q .x', basis: 'gh run view 1 --jq .x' },
    { name: 'run view -v', command: 'gh run view 1 -v', basis: 'gh run view 1' },
    { name: 'run view --exit-status', command: 'gh run view 1 --exit-status', basis: 'gh run view 1' },
    { name: 'run view --attempt', command: 'gh run view 1 --attempt 2', basis: 'gh run view 1' },
    { name: 'issue list --search', command: 'gh issue list --search x', basis: 'gh issue list' },
    { name: 'leespad --ref=…', command: 'pnpm leespad --ref=main', basis: 'pnpm leespad --ref main' },
    { name: 'leespad onbekende vlag', command: 'pnpm leespad --write', basis: 'pnpm leespad' },
    { name: 'meting --branch=…', command: 'pnpm meting --branch=x', basis: 'pnpm meting --branch x' },
    { name: 'meting onbekende vlag', command: 'pnpm meting --write', basis: 'pnpm meting' },
    { name: 'meting cluster', command: 'pnpm meting -jh', basis: 'pnpm meting --json' },
    { name: 'pnpm-optie vóór het script', command: 'pnpm -s meting --json', basis: 'pnpm meting --json' },
    { name: 'pnpm run meting', command: 'pnpm run meting --json', basis: 'pnpm meting --json' },
    // git ls-files is vlag-loos
    { name: 'ls-files -o', command: 'git ls-files -o', basis: 'git ls-files' },
    { name: 'ls-files --others', command: 'git ls-files --others', basis: 'git ls-files' },
    { name: 'ls-files -z', command: 'git ls-files -z', basis: 'git ls-files' },
    { name: 'ls-files --format=…', command: 'git ls-files --format=x', basis: 'git ls-files' },
    { name: 'ls-files -C3', command: 'git ls-files -C3', basis: 'git ls-files' },
    { name: 'ls-files -efoo', command: 'git ls-files -efoo', basis: 'git ls-files' },
    { name: 'ls-files -nOvim', command: 'git ls-files -nOvim', basis: 'git ls-files' },
    { name: 'git-optie vóór ls-files', command: 'git -C /tmp ls-files', basis: 'git ls-files' },
    // waarden met tekens waarmee de shell van pnpm iets kan uitvoeren
    { name: 'waarde met $', command: "pnpm meting --branch '$(touch x)'", basis: 'pnpm meting --branch x' },
    { name: 'waarde met backtick', command: "pnpm meting --sessie '`id`'", basis: 'pnpm meting --sessie x' },
    { name: 'waarde met ;', command: "pnpm meting --branch 'a;touch x'", basis: 'pnpm meting --branch x' },
    { name: 'waarde met spatie', command: "pnpm leespad --ref 'a b'", basis: 'pnpm leespad --ref x' },
    {
      name: 'waarde met enkel aanhalingsteken',
      command: `pnpm meting --sessie "a'b"`,
      basis: 'pnpm meting --sessie x',
    },
    { name: 'waarde met dubbel aanhalingsteken', command: `pnpm leespad --ref 'a"b'`, basis: 'pnpm leespad --ref x' },
    { name: 'gh-waarde met spatie', command: "gh issue list --label 'a b'", basis: 'gh issue list --label x' },
    { name: 'gh-waarde met $', command: "gh run view 1 --jq '$x'", basis: 'gh run view 1 --jq .x' },
    // een tweede commando of een omleiding
    { name: 'tweede commando', command: 'gh issue view 5; touch a', basis: 'gh issue view 5' },
    { name: 'omleiding', command: 'gh run view 1 --log > log.txt', basis: 'gh run view 1 --log' },
    { name: 'pipe naar een niet-lezer', command: 'gh run view 1 --log | node', basis: 'gh run view 1 --log' },
  ])('$name → deny', ({ command, basis }) => {
    expect(verdict(basis, REVIEWER)).toBe('allow');
    expect(verdict(command, REVIEWER)).toBe('deny');
  });

  // Randgevallen: de weigering van git blame, wc en pipes wijst naar een route die werkt (AC-10, onderaan).

  test('git show <ref>:<pad> blijft toegestaan', () => {
    expect(verdict('git show HEAD:src/api/server.ts', REVIEWER)).toBe('allow');
  });

  test.each([
    { command: '/usr/bin/env gh issue view 5', basis: 'gh issue view 5' },
    { command: './env git ls-files', basis: 'git ls-files' },
    { command: 'gh issue view $N', basis: 'gh issue view 5' },
    { command: 'pnpm meting --branch $B', basis: 'pnpm meting --branch x' },
  ])('pad-wrapper of geëxpandeerd argument: $command → deny', ({ command, basis }) => {
    expect(verdict(basis, REVIEWER)).toBe('allow');
    expect(verdict(command, REVIEWER)).toBe('deny');
  });
});

const ALLE_ROLLEN: readonly (string | undefined)[] = [
  undefined,
  'developer',
  'tester',
  'architect',
  'docs',
  'reviewer',
];
const rolNaam = (role: string | undefined) => role ?? 'hoofdsessie';

describe('rolhek-lezen/AC-2: git diff|log|show --output en git grep -O voor elke rol', () => {
  const OUTPUT = [
    { command: 'git diff --output out.txt', basis: 'git diff' },
    { command: 'git diff --output=out.txt', basis: 'git diff' },
    { command: 'git diff --outp=out.txt', basis: 'git diff' },
    { command: 'git diff --outpu out.txt', basis: 'git diff' },
    { command: 'git diff HEAD --output=/tmp/x.patch', basis: 'git diff HEAD' },
    { command: 'git log --output out.txt', basis: 'git log' },
    { command: 'git log -p --output=out.txt', basis: 'git log -p' },
    { command: 'git log --outp=out.txt', basis: 'git log' },
    { command: 'git show --output out.txt', basis: 'git show' },
    { command: 'git show HEAD --output=out.txt', basis: 'git show HEAD' },
    { command: 'git show --outp=out.txt', basis: 'git show' },
  ];
  const GREP = [
    'git grep -O foo',
    'git grep -Ovim foo',
    'git grep -nOvim foo',
    'git grep -iO foo',
    'git grep --open-files foo',
    'git grep --open-files-in-pager foo',
    'git grep --open-files-in-pager=vim foo',
    'git grep --open foo',
  ];
  // Dezelfde familie schrijft met --output; format-patch met -o/--output-directory/--output.
  const FAMILIE = [
    'git diff-tree --output=out.txt HEAD',
    'git diff-index --output=out.txt HEAD',
    'git diff-files --output=out.txt',
    'git range-diff --output=out.txt a...b',
    'git whatchanged --output=out.txt',
    'git format-patch -o out HEAD~1',
    'git format-patch -oout HEAD~1',
    'git format-patch -ko out -1',
    'git reflog show --output=out.txt',
    'git stash show -p --output=out.txt',
    'git format-patch --output-directory out HEAD~1',
    'git format-patch --output=x.patch HEAD~1',
  ];
  // Vals-positieven: deze mogen niet geweigerd worden door AC-2.
  const GEEN_SCHRIJFOPTIE = [
    'git log --oneline',
    'git diff --output-indicator-new=x',
    // geen schrijfoptie; voor de reviewer geweigerd als vastgeplakte waarde (AC-6, eigen negatief geval hieronder)
    'git grep -eFOO',
  ];
  // AC-6: `-e <patroon>` is voor elke rol toegestaan, ook voor de reviewer; `-e -O` zoekt de tekst `-O`.
  const GREP_PATROON = ['git grep -e FOO', 'git grep -e -O'];

  describe.each(ALLE_ROLLEN.map((role) => ({ role, naam: rolNaam(role) })))('$naam', ({ role }) => {
    test.each(FAMILIE)('%s → deny', (command) => {
      expect(verdict(command, role)).toBe('deny');
    });
    if (role !== REVIEWER)
      test.each(GEEN_SCHRIJFOPTIE)('%s → niet geweigerd', (command) => {
        expect(verdict(command, role)).not.toBe('deny');
      });
    test.each(GREP_PATROON)('%s → niet geweigerd', (command) => {
      expect(verdict(command, role)).not.toBe('deny');
    });
    // `-eFOO` is geen schrijfoptie, maar de reviewer staat geen vastgeplakte waarde toe (AC-6): eigen negatief geval.
    test('git grep -eFOO → deny voor de reviewer, basis -e FOO slaagt', () => {
      if (role === REVIEWER) {
        expect(verdict('git grep -e FOO', role)).toBe('allow');
        expect(verdict('git grep -eFOO', role)).toBe('deny');
      } else {
        expect(verdict('git grep -eFOO', role)).not.toBe('deny');
      }
    });
    test.each(OUTPUT)('$command → deny', ({ command, basis }) => {
      expect(verdict(basis, role)).not.toBe('deny');
      expect(verdict(command, role)).toBe('deny');
    });
    test.each(GREP)('%s → deny', (command) => {
      expect(verdict('git grep foo', role)).not.toBe('deny');
      expect(verdict(command, role)).toBe('deny');
    });
  });
});

describe('rolhek-lezen/AC-3: weigermelding en ongewijzigde leescommando’s', () => {
  test.each([
    { command: 'gh issue view 5 --web', opties: ['--comments', '--json', '--jq'] },
    { command: 'gh issue list --web', opties: ['--label', '--state', '--limit', '--json', '--jq'] },
    { command: 'gh run view 1 --web', opties: ['--log', '--log-failed', '--json', '--jq', '--job'] },
    { command: 'gh run list --web', opties: ['--branch', '--workflow', '--limit', '--json', '--jq'] },
    { command: 'pnpm leespad --write', opties: ['--json', '--ref'] },
    { command: 'pnpm meting --write', opties: ['--json', '--pr-tabel', '--trend', '--help', '--branch', '--sessie'] },
  ])('$command: de weigering noemt de toegestane opties', ({ command, opties }) => {
    const melding = run(command, REVIEWER).deny.join('\n');
    for (const optie of opties) expect(melding).toContain(optie);
  });

  test.each([
    'git diff',
    'git diff --stat',
    'git diff origin/main...HEAD -- src',
    'git log --oneline -5',
    'git show HEAD',
    'git status --short',
    'gh pr view 1',
    'gh pr view 1 --json files',
    'gh pr diff 1',
    'gh pr checks 1',
    'node scripts/kit/feiten.mjs gates specs fase',
    // leesbudget/AC-9: reviewer.md schrijft `feiten.mjs hoofdstuk` voor, ADR 0064 punt 2.
    'node scripts/kit/feiten.mjs hoofdstuk 9',
  ])('blijft toegestaan voor de reviewer: %s', (command) => {
    expect(verdict(command, REVIEWER)).toBe('allow');
  });
});

describe('rolhek-lezen/AC-4: geen variabele vóór een commando van de reviewer', () => {
  const BASIS = [
    'git ls-files',
    'git diff',
    'git log',
    'git show HEAD',
    'git status',
    'gh issue view 5',
    'gh issue list',
    'gh run view 1',
    'gh run list',
    'gh pr view 1',
    'gh pr diff 1',
    'gh pr checks 1',
    'pnpm leespad',
    'pnpm meting --json',
    'node scripts/kit/feiten.mjs fase',
  ];
  const VARIABELEN = ['METING_GH=/tmp/x', 'GIT_EXTERNAL_DIFF=/tmp/x', 'NODE_OPTIONS=--require=/tmp/x.js'];
  const GEVALLEN = BASIS.flatMap((basis) =>
    VARIABELEN.flatMap((variabele) => [
      { basis, command: `${variabele} ${basis}` },
      { basis, command: `env ${variabele} ${basis}` },
    ]),
  );

  test.each(GEVALLEN)('$command → deny', ({ basis, command }) => {
    expect(verdict(basis, REVIEWER)).toBe('allow');
    expect(verdict(command, REVIEWER)).toBe('deny');
  });

  test('LC_ALL=C git status → deny (basis git status slaagt)', () => {
    expect(verdict('git status', REVIEWER)).toBe('allow');
    expect(verdict('LC_ALL=C git status', REVIEWER)).toBe('deny');
  });
});

describe('rolhek-lezen/AC-5: hoofdsessie, developer en tester ongewijzigd buiten AC-2', () => {
  const LEZEN = [
    'git ls-files',
    'git ls-files -o',
    'git ls-files -- src',
    'gh issue view 5',
    'gh issue view 5 --comments',
    'gh issue list --state open',
    'gh run view 1 --log-failed',
    'gh run view 1 --log',
    'gh run list --limit 5',
    'gh run list --repo o/r',
    'gh issue view 5 --web',
  ];
  describe.each([undefined, 'developer', 'tester'].map((role) => ({ role, naam: rolNaam(role) })))(
    '$naam',
    ({ role }) => {
      test.each(LEZEN)('%s → allow zoals nu', (command) => {
        expect(verdict(command, role)).toBe('allow');
      });
    },
  );
});

// docs/specs/rolhek-lezen.md AC-6 tot AC-10 (ADR 0087): de reviewer zoekt met `git grep` en `git ls-files` met een glob.
function decideIn(command: string, cwd: string, role = REVIEWER) {
  return decide({ tool_name: 'Bash', tool_input: { command }, agent_type: role }, { ...ctx, cwd });
}
function verdictIn(command: string, cwd: string): Verdict {
  const d = decideIn(command, cwd);
  if (d.deny.length > 0) return 'deny';
  return d.ask.length > 0 ? 'ask' : 'allow';
}
const melding = (command: string) => run(command, REVIEWER).deny.join('\n');

describe('rolhek-lezen/AC-6 en rolhek-lezen/AC-7: git grep voor de reviewer', () => {
  test.each([
    // elke vlag los
    ...['-n', '-i', '-w', '-v', '-l', '-L', '-c', '--count', '-h', '-F', '-E', '-I'].map((v) => `git grep ${v} foo`),
    'git grep foo',
    'git grep -n -i -w -F foo',
    // waarde-opties
    'git grep -e foo',
    'git grep -e foo -e bar',
    'git grep -n -e foo -e bar -- src',
    'git grep -C 3 foo',
    'git grep -A 3 foo',
    'git grep -B 999 foo',
    'git grep -n -C 0 -A 1 -B 2 -e foo',
    // refs en paden
    'git grep -n foo origin/main -- docs',
    'git grep -n foo HEAD',
    'git grep -n -e foo HEAD~1 -- src docs',
    'git grep -n foo -- src/api/server.ts',
    // AC-7: patronen
    "git grep -n -F -e '7 dagen'",
    "git grep -n '7 dagen'",
    'git grep -n -e "foo(bar)"',
    "git grep -n -e '^## '",
    "git grep -n -E -e 'a|b'",
    "git grep -n -e 'a.*b'",
    "git grep -n -E -e '[0-9]+'",
    "git grep -n -e 'x$'",
    'git grep -e -O',
    'git grep -e --no-index',
    'git grep -n -e -O -- docs',
    "git grep -n -F -e '.git/hooks'",
  ])('toegestaan: %s', (command) => {
    expect(verdict(command, REVIEWER)).toBe('allow');
  });

  // Elk geval heeft de basis `git grep -n -e x`, die slaagt.
  test.each([
    { name: '-O', command: 'git grep -n -e x -O' },
    { name: '--textconv', command: 'git grep -n -e x --textconv' },
    { name: '--no-index', command: 'git grep -n -e x --no-index' },
    { name: '--untracked', command: 'git grep -n -e x --untracked' },
    { name: '--no-exclude-standard', command: 'git grep -n -e x --no-exclude-standard' },
    { name: '--recurse-submodules', command: 'git grep -n -e x --recurse-submodules' },
    { name: '-f bestand', command: 'git grep -n -e x -f pat.txt' },
    { name: '-P', command: 'git grep -n -e x -P' },
    { name: '--threads 2', command: 'git grep -n -e x --threads 2' },
    { name: 'cluster -in', command: 'git grep -n -e x -in' },
    { name: 'vastgeplakte waarde -C3', command: 'git grep -n -e x -C3' },
    { name: '--context=3', command: 'git grep -n -e x --context=3' },
    { name: '-C x', command: 'git grep -n -e x -C x' },
    { name: '-C 1000', command: 'git grep -n -e x -C 1000' },
    { name: '-A 1000', command: 'git grep -n -e x -A 1000' },
    { name: '-eFOO', command: 'git grep -n -eFOO' },
    { name: 'pathspec-magie als los woord', command: "git grep -n -e x ':/docs'" },
    { name: 'pathspec-magie met !', command: "git grep -n -e x ':!docs'" },
    { name: 'patroon met newline', command: "git grep -n -e 'a\nb'" },
    { name: 'patroon met tab', command: "git grep -n -e 'a\tb'" },
    { name: 'geëxpandeerd patroon', command: 'git grep -n -e "$X"' },
    { name: 'substitutie', command: 'git grep -n -e "$(cat f)"' },
    { name: 'backtick', command: 'git grep -n -e "`id`"' },
    { name: 'globale -c vóór grep', command: 'git -c core.pager=less grep -n -e x' },
    { name: 'globale --no-pager', command: 'git --no-pager grep -n -e x' },
    { name: 'globale -C vóór grep', command: 'git -C /tmp grep -n -e x' },
    { name: 'variabele vóór het commando', command: 'LC_ALL=C git grep -n -e x' },
    { name: 'pipe naar een niet-lezer', command: 'git grep -n -e x | node' },
    { name: 'omleiding', command: 'git grep -n -e x > out.txt' },
  ])('$name → deny', ({ command }) => {
    expect(verdict('git grep -n -e x', REVIEWER)).toBe('allow');
    expect(verdict(command, REVIEWER)).toBe('deny');
  });

  test('de weigering van een onbekende optie noemt de opties uit AC-6', () => {
    expect(verdict('git grep -n -e x', REVIEWER)).toBe('allow');
    const tekst = melding('git grep -n -e x -P');
    for (const optie of ['-n', '-i', '-C <n>', '-e']) expect(tekst).toContain(optie);
    expect(tekst).toContain('stuurteken');
  });

  // AC-7: een onaangehaalde glob- of brace-teken in een patroon of los woord wordt geweigerd; basis met aanhalingstekens slaagt.
  test.each(['git grep x*', 'git grep -e a?', 'git grep {a,b}', 'git grep -n -e x[ab]'])('%s → deny', (command) => {
    expect(verdict("git grep 'x*'", REVIEWER)).toBe('allow');
    expect(verdict(command, REVIEWER)).toBe('deny');
    expect(melding(command)).toContain('alleen tussen enkele aanhalingstekens');
  });

  // Voor de andere rollen verandert git grep niet.
  test.each([undefined, 'developer', 'tester'])('%s: git grep blijft zoals nu', (role) => {
    expect(verdict('git grep -n -e x', role)).not.toBe('deny');
    expect(verdict('git grep --no-index -e x', role)).not.toBe('deny');
  });

  // Het vangnet op een merge-commando van gh als patroon blijft gelden, met een omweg-basis die slaagt. Vanaf AC-18 gaan
  // `git grep -e gh`, `-F -e 'api.github.com'` en `-F -e 'git credential'` door (zie het blok van AC-18 onderaan).
  test.each([{ command: "git grep -F -e 'gh pr merge'", basis: "git grep -F -e 'merge'" }])(
    'vangnet: $command → deny',
    ({ command, basis }) => {
      expect(verdict(basis, REVIEWER)).toBe('allow');
      expect(verdict(command, REVIEWER)).toBe('deny');
    },
  );
});

describe('rolhek-lezen/AC-8: globs bij git ls-files en git grep', () => {
  test.each([
    "git ls-files -- '*.md'",
    "git ls-files -- 'docs/**'",
    "git ls-files '*.md'",
    "git ls-files 'docs/**'",
    "git ls-files -- '.claude/**'",
    "git ls-files -- 'src/?.ts' 'docs/[ab].md'",
    "git grep -n -e x -- 'src/*.ts'",
  ])('toegestaan: %s', (command) => {
    expect(verdict(command, REVIEWER)).toBe('allow');
  });

  test.each([
    { name: 'onaangehaald *.md', command: 'git ls-files -- *.md', basis: 'git ls-files -- docs' },
    { name: ':!docs', command: "git ls-files -- ':!docs'", basis: 'git ls-files -- docs' },
    { name: ':(attr:x)', command: "git ls-files -- ':(attr:x)'", basis: 'git ls-files -- docs' },
    { name: '/*', command: "git ls-files -- '/*'", basis: 'git ls-files -- docs' },
    { name: '~/*', command: "git ls-files -- '~/*'", basis: 'git ls-files -- docs' },
    { name: '../*', command: "git ls-files -- '../*'", basis: 'git ls-files -- docs' },
    { name: 'docs/../../*', command: "git ls-files -- 'docs/../../*'", basis: 'git ls-files -- docs' },
    { name: ':!docs zonder --', command: "git ls-files ':!docs'", basis: 'git ls-files docs' },
    { name: '/* zonder --', command: "git ls-files '/*'", basis: 'git ls-files docs' },
    { name: '../* zonder --', command: "git ls-files '../*'", basis: 'git ls-files docs' },
    { name: 'ls-files blijft vlag-loos', command: "git ls-files -z '*.md'", basis: "git ls-files '*.md'" },
    { name: 'grep: :! na --', command: "git grep -n -e x -- ':!docs'", basis: "git grep -n -e x -- 'src/*.ts'" },
    { name: 'grep: ../* na --', command: "git grep -n -e x -- '../*'", basis: "git grep -n -e x -- 'src/*.ts'" },
    { name: 'grep: / na --', command: "git grep -n -e x -- '/etc/*'", basis: "git grep -n -e x -- 'src/*.ts'" },
  ])('$name → deny', ({ command, basis }) => {
    expect(verdict(basis, REVIEWER)).toBe('allow');
    expect(verdict(command, REVIEWER)).toBe('deny');
  });

  test("onaangehaalde glob: de melding noemt git ls-files -- '*.md'", () => {
    expect(verdict('git ls-files -- docs', REVIEWER)).toBe('allow');
    expect(melding('git ls-files -- *.md')).toContain("git ls-files -- '*.md'");
  });

  test('aangehaalde glob in een commando dat het rolhek niet zeker leest: vals-positief met eigen melding', () => {
    expect(verdict("git grep -n -e '##' -- docs", REVIEWER)).toBe('allow');
    const tekst = melding("git grep -n -e '## ' -- '*.md'");
    expect(tekst).toContain('laat de glob weg of zoek in een map (bijv. `-- docs`)');
    expect(tekst).not.toContain("-- '*.md'");
  });

  test("echt onaangehaalde glob in zo'n commando: de melding noemt '*.md'", () => {
    const tekst = melding("git grep -n -e '## ' -- *.md");
    expect(tekst).toContain("'*.md'");
    expect(tekst).not.toContain('laat de glob weg');
  });
});

describe('rolhek-lezen/AC-9: git grep alleen met de werkmap in de repo', () => {
  test.each(['/repo', '/repo/docs', '/repo/src/api'])('werkmap %s → allow', (cwd) => {
    expect(verdictIn('git grep -n -e x', cwd)).toBe('allow');
  });

  test.each(['/tmp', '/', '/repo-elders', '/home/someone'])('werkmap %s buiten de repo → deny', (cwd) => {
    expect(verdictIn('git grep -n -e x', '/repo')).toBe('allow');
    expect(verdictIn('git grep -n -e x', cwd)).toBe('deny');
  });

  test('werkmap onbekend na een cd naar een geëxpandeerd doel → deny', () => {
    expect(verdictIn('git grep -n -e x', '/repo/docs')).toBe('allow');
    expect(verdictIn('cd "$X" && git grep -n -e x', '/repo/docs')).toBe('deny');
  });

  test('cd naar buiten de repo binnen het commando → deny', () => {
    expect(verdictIn('git grep -n -e x', '/repo/docs')).toBe('allow');
    expect(verdictIn('cd /tmp && git grep -n -e x', '/repo/docs')).toBe('deny');
  });
});

describe('rolhek-lezen/AC-10: de weigering wijst naar een route die werkt', () => {
  // Vanaf AC-11 mogen `wc -l x` en `git log | head`; de sjabloontoets neemt `git blame x` en `cat x` (spec "Raakt ook" voor AC-11 tot AC-20).
  const GEWEIGERD = ['git blame x', 'cat x'];
  const COMMANDO = /^reviewer: alleen lezen \(`([^`]*)` mag niet; framework §8\)/;

  // Het sjabloon is de echte weigertekst met alleen het geweigerde commando vervangen door `<commando>`.
  const sjabloon = (command: string) => {
    const tekst = run(command, REVIEWER).deny[0] ?? '';
    const gevonden = COMMANDO.exec(tekst)?.[1];
    return gevonden === undefined ? tekst : tekst.replace(`\`${gevonden}\``, '`<commando>`');
  };
  const termen = (tekst: string) =>
    [...tekst.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1] ?? '')
      .filter((term) => term.includes('<tekst>') || term.includes('<glob>'));

  test('de weigertekst van git blame en cat is één sjabloon met plaatshouders', () => {
    const eerste = sjabloon('git blame x');
    for (const command of GEWEIGERD) expect(sjabloon(command)).toBe(eerste);
    for (const plaatshouder of ['<commando>', '<tekst>', '<glob>']) expect(eerste).toContain(plaatshouder);
    expect(eerste).toContain('gebruik de Grep-tool');
  });

  test('elke term met <tekst> of <glob> geeft, ingevuld met 7 dagen en *.md, allow voor de reviewer', () => {
    const lijst = termen(sjabloon('git blame x'));
    expect(lijst.length).toBeGreaterThanOrEqual(3);
    for (const term of lijst) {
      expect(term).not.toContain('<commando>');
      const commando = term.replaceAll('<tekst>', '7 dagen').replaceAll('<glob>', '*.md');
      expect(verdict(commando, REVIEWER), commando).toBe('allow');
    }
  });
});

// docs/template/specs/rolhek-lezen.md AC-11 tot AC-20 (ADR 0099): de leeslijst van de reviewer (en dus van elke onbekende
// subagent) wordt ruimer, schrijven blijft dicht. `ctx.gevolgd(paden)` (AC-11) en `ctx.werkmappen()` (AC-15) komen van de
// hook-ingang; hier zijn het stubs die hun aanroepen tellen. Aanname over de vorm (de spec noemt hem niet): `gevolgd`
// geeft een Set met de doorgegeven paden die als gevolgd gewoon bestand tellen; `werkmappen` geeft de roots als lijst.
const GEVOLGD = ['docs/framework.md', 'docs/a.md', 'docs/b.md', 'docs/gh', 'scripts/kit/pr-merge.mjs'];
const WERKMAPPEN = (): string[] => ['/repo', '/wt/ander'];
const relatief = (pad: string) => (pad.startsWith('/repo/') ? pad.slice('/repo/'.length) : pad);

function leesContext(werkmappen?: () => string[]) {
  const gevolgdAanroepen: string[][] = [];
  const teller = { werkmappen: 0 };
  const context = {
    ...ctx,
    gevolgd: (paden: readonly string[]) => {
      gevolgdAanroepen.push([...paden]);
      return new Set(paden.filter((pad) => GEVOLGD.includes(relatief(pad))));
    },
    ...(werkmappen === undefined
      ? {}
      : {
          werkmappen: () => {
            teller.werkmappen += 1;
            return werkmappen();
          },
        }),
  };
  return { context, gevolgdAanroepen, teller };
}
type LeesContext = ReturnType<typeof leesContext>;

function uitslagVan(decision: ReturnType<typeof decide>): Verdict {
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.context.length > 0 ? 'context' : 'allow';
}

// Een gooiende `decide` is een eigen uitslag, zodat een ontbrekende voorziening als assertie faalt.
function verdictLees(command: string, role: string | undefined, lees: LeesContext = leesContext()): Verdict | 'fout' {
  const payload = { tool_name: 'Bash', tool_input: { command }, ...(role === undefined ? {} : { agent_type: role }) };
  try {
    return uitslagVan(decide(payload, lees.context));
  } catch {
    return 'fout';
  }
}

function meldingLees(command: string, role: string, lees: LeesContext = leesContext()): string {
  return decide({ tool_name: 'Bash', tool_input: { command }, agent_type: role }, lees.context).deny.join('\n');
}

interface Afwijzing {
  role: string | undefined;
  werkmappen?: (() => string[]) | undefined;
}

// Elk negatief geval heeft een basis die eerst slaagt en verschilt er één woord, optie of teken van.
function afwijzing(basis: string, command: string, { role, werkmappen }: Afwijzing) {
  expect(verdictLees(basis, role, leesContext(werkmappen)), `basis: ${basis}`).toBe('allow');
  expect(verdictLees(command, role, leesContext(werkmappen)), command).toBe('deny');
}

describe('rolhek-lezen/AC-11: wc, head, tail, sed en ls voor de reviewer', () => {
  test.each([
    'wc -l docs/framework.md',
    'wc -lw docs/framework.md',
    'wc -w docs/framework.md',
    'wc -c docs/framework.md',
    'wc -m docs/framework.md',
    'wc -l docs/framework.md docs/a.md',
    'head -n 20 docs/framework.md',
    'head -20 docs/framework.md',
    'head -n 5 -- docs/framework.md',
    'head -n 1234567 docs/framework.md',
    'tail -n 5 docs/framework.md',
    'tail -n +5 docs/framework.md',
    'tail -5 docs/framework.md',
    "sed -n '1,20p' docs/framework.md",
    "sed -n '7p' docs/framework.md",
    "sed -n '$p' docs/framework.md",
    "sed -n '5,$p' docs/framework.md",
    "sed -n '1234567p' docs/framework.md",
    'ls -la docs',
    'ls -1 docs',
    'ls -lhtr docs src',
    'ls -1aAlhdrtSRF docs',
    'ls -la -- docs',
    // als filter achter een pipe (zonder pad)
    'git log | head -n 5',
    'git log | tail -n 5',
    'git ls-files | wc -l',
    "git log | sed -n '1,3p'",
  ])('rolhek-lezen/AC-11: toegestaan: %s', (command) => {
    expect(verdictLees(command, REVIEWER)).toBe('allow');
  });

  test.each([
    // sed: alleen `sed -n '<a>p'` of `sed -n '<a>,<b>p'`
    { command: "sed -i '1p' docs/framework.md", basis: "sed -n '1p' docs/framework.md" },
    { command: "sed --in-place '1p' docs/framework.md", basis: "sed -n '1p' docs/framework.md" },
    { command: "sed -ni '1p' docs/framework.md", basis: "sed -n '1p' docs/framework.md" },
    { command: "sed -n '1w x' docs/framework.md", basis: "sed -n '1p' docs/framework.md" },
    { command: "sed -n '1e touch x' docs/framework.md", basis: "sed -n '1p' docs/framework.md" },
    { command: "sed -n 's/a/b/p' docs/framework.md", basis: "sed -n '1p' docs/framework.md" },
    { command: "sed -e '1p' docs/framework.md", basis: "sed -n '1p' docs/framework.md" },
    { command: 'sed -f s.sed docs/framework.md', basis: "sed -n '1p' docs/framework.md" },
    { command: "sed -E '1p' docs/framework.md", basis: "sed -n '1p' docs/framework.md" },
    { command: "sed '1p' docs/framework.md", basis: "sed -n '1p' docs/framework.md" },
    { command: "sed -n '/x/p' docs/framework.md", basis: "sed -n '1p' docs/framework.md" },
    { command: "sed -n '1p;2p' docs/framework.md", basis: "sed -n '1p' docs/framework.md" },
    { command: "sed -n '12345678p' docs/framework.md", basis: "sed -n '1234567p' docs/framework.md" },
    { command: "sed -n '1p' docs/framework.md -i", basis: "sed -n '1p' docs/framework.md" },
    { command: "sed -n '1p' docs/framework.md --in-place", basis: "sed -n '1p' docs/framework.md" },
    // tail
    { command: 'tail -f docs/framework.md', basis: 'tail -n 5 docs/framework.md' },
    { command: 'tail -F docs/framework.md', basis: 'tail -n 5 docs/framework.md' },
    { command: 'tail --pid 1 docs/framework.md', basis: 'tail -n 5 docs/framework.md' },
    { command: 'tail -n 5 docs/framework.md -f', basis: 'tail -n 5 docs/framework.md' },
    { command: 'tail -c 5 docs/framework.md', basis: 'tail -n 5 docs/framework.md' },
    { command: 'tail -n x docs/framework.md', basis: 'tail -n 5 docs/framework.md' },
    { command: 'tail -n 12345678 docs/framework.md', basis: 'tail -n 1234567 docs/framework.md' },
    // wc
    { command: 'wc --files0-from=f', basis: 'wc -l docs/framework.md' },
    { command: 'wc --lines docs/framework.md', basis: 'wc -l docs/framework.md' },
    { command: 'wc -L docs/framework.md', basis: 'wc -l docs/framework.md' },
    { command: 'wc -lx docs/framework.md', basis: 'wc -lw docs/framework.md' },
    { command: 'wc -l docs/framework.md -c', basis: 'wc -l docs/framework.md' },
    // head
    { command: 'head -c 5 docs/framework.md', basis: 'head -n 5 docs/framework.md' },
    { command: 'head -n -5 docs/framework.md', basis: 'head -n 5 docs/framework.md' },
    { command: 'head -n 5x docs/framework.md', basis: 'head -n 5 docs/framework.md' },
    { command: 'head -n 12345678 docs/framework.md', basis: 'head -n 1234567 docs/framework.md' },
    { command: 'head -n 5 docs/framework.md -v', basis: 'head -n 5 docs/framework.md' },
    // ls
    { command: 'ls -la /', basis: 'ls -la docs' },
    { command: 'ls -la ~', basis: 'ls -la docs' },
    { command: 'ls -la ../x', basis: 'ls -la docs' },
    { command: 'ls -la docs/../..', basis: 'ls -la docs' },
    { command: 'ls --hyperlink docs', basis: 'ls -la docs' },
    { command: 'ls -lax docs', basis: 'ls -la docs' },
    { command: 'ls -la docs -x', basis: 'ls -la docs' },
    { command: "ls -la '*.md'", basis: 'ls -la docs' },
    { command: 'ls -la *.md', basis: 'ls -la docs' },
    // een pad dat git niet volgt, of dat een glob of geëxpandeerd woord is
    { command: 'head -n 5 .env', basis: 'head -n 5 docs/framework.md' },
    { command: 'wc -l .env.local', basis: 'wc -l docs/framework.md' },
    { command: 'head -n 5 docs/onbekend.md', basis: 'head -n 5 docs/framework.md' },
    { command: 'head -n 5 /etc/passwd', basis: 'head -n 5 docs/framework.md' },
    { command: 'head -n 5 ~/.ssh/id_rsa', basis: 'head -n 5 docs/framework.md' },
    { command: 'head -n 5 ../x', basis: 'head -n 5 docs/framework.md' },
    { command: 'head docs/*.md', basis: 'head docs/a.md' },
    { command: "head 'docs/*.md'", basis: 'head docs/a.md' },
    { command: 'wc -l docs/*.md', basis: 'wc -l docs/a.md' },
    { command: 'head -n 5 "$X"', basis: 'head -n 5 docs/framework.md' },
    // als filter: dezelfde optieregels, en een pad blijft gevolgd moeten zijn
    { command: 'git log | head -c 5', basis: 'git log | head -n 5' },
    { command: 'git log | tail -f', basis: 'git log | tail -n 5' },
    { command: "git log | sed -n '1w x'", basis: "git log | sed -n '1p'" },
    { command: 'git log | wc -x', basis: 'git log | wc -l' },
    { command: 'git log | head -n 5 .env', basis: 'git log | head -n 5' },
  ])('rolhek-lezen/AC-11: $command → deny', ({ command, basis }) => {
    afwijzing(basis, command, { role: REVIEWER });
  });

  test('rolhek-lezen/AC-11: ctx.gevolgd wordt één keer aangeroepen, met alle padargumenten van het commando', () => {
    const lees = leesContext();
    expect(verdictLees('wc -l docs/framework.md && head -n 5 docs/a.md', REVIEWER, lees)).toBe('allow');
    expect(lees.gevolgdAanroepen).toHaveLength(1);
    const paden = (lees.gevolgdAanroepen[0] ?? []).map(relatief);
    expect(paden).toContain('docs/framework.md');
    expect(paden).toContain('docs/a.md');
    expect(paden).not.toContain('-l');
    expect(paden).not.toContain('-n');
  });

  test('rolhek-lezen/AC-11: zonder ctx.gevolgd telt geen pad als gevolgd (faalt dicht)', () => {
    expect(verdictLees('head -n 5 docs/framework.md', REVIEWER)).toBe('allow');
    expect(verdict('head -n 5 docs/framework.md', REVIEWER)).toBe('deny');
  });
});

// De ingang: `rolhekContext` bouwt de ctx van `rails/hooks/rolhek.mjs`. `gevolgd` leest de index met één
// `git --literal-pathspecs ls-files -s -- <paden>`, na de realpath van elk pad.
describe('rolhek-lezen/AC-11: de hook-ingang meldt alleen gevolgde gewone bestanden (ctx.gevolgd)', () => {
  const GIT_ENV = {
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
  };
  const dirs: string[] = [];

  function git(cwd: string, ...args: string[]) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  }

  function schrijf(dir: string, rel: string, inhoud: string) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), inhoud);
  }

  /** Een repo met gewone gevolgde bestanden, gevolgde links naar buiten en een link naar een niet-gevolgd `.env`. */
  function gevolgdeRepo(): string {
    const basis = realpathSync(mkdtempSync(path.join(tmpdir(), 'rolhek-lezen-')));
    dirs.push(basis);
    const dir = path.join(basis, 'repo');
    const buiten = path.join(basis, 'buiten');
    schrijf(dir, '.claude/gates.json', readFileSync('.claude/gates.json', 'utf8'));
    schrijf(dir, 'docs/framework.md', 'x\n');
    schrijf(dir, 'docs/uitvoerbaar.sh', 'x\n');
    chmodSync(path.join(dir, 'docs/uitvoerbaar.sh'), 0o755);
    schrijf(dir, '-streep.md', 'x\n');
    schrijf(dir, 'mapl/f.md', 'x\n');
    schrijf(dir, '.env', 'GEHEIM=1\n');
    schrijf(dir, 'niet-gevolgd.md', 'x\n');
    schrijf(buiten, 'id_rsa', 'sleutel\n');
    schrijf(buiten, 'f.md', 'x\n');
    symlinkSync(path.join(buiten, 'id_rsa'), path.join(dir, 'ssh-link'));
    symlinkSync('.env', path.join(dir, 'env-link'));
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'add', '--', '.claude/gates.json', 'docs', '-streep.md', 'mapl', 'ssh-link', 'env-link');
    git(dir, 'commit', '-q', '-m', 'basis');
    // Het gevolgde `mapl/f.md` staat in de index, maar de map is op schijf een link naar buiten.
    rmSync(path.join(dir, 'mapl'), { recursive: true });
    symlinkSync(buiten, path.join(dir, 'mapl'));
    return dir;
  }

  const gevolgdVan = (dir: string) => (paden: readonly string[]) => {
    const context = rolhekContext(dir, dir);
    const functie: unknown = Reflect.get(context, 'gevolgd');
    expect(typeof functie, 'rolhekContext levert ctx.gevolgd').toBe('function');
    if (typeof functie !== 'function') return null;
    const resultaat: unknown = Reflect.apply(functie, context, [paden]);
    return resultaat;
  };

  function telt(resultaat: unknown, pad: string): 'telt' | 'telt niet' {
    const lijst: unknown[] = resultaat instanceof Set ? [...resultaat] : Array.isArray(resultaat) ? resultaat : [];
    return lijst.includes(pad) ? 'telt' : 'telt niet';
  }

  beforeEach(() => {
    Reflect.deleteProperty(process.env, 'RAILS_ANKER');
  });
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  test.each([
    { pad: 'docs/framework.md', uitslag: 'telt' },
    { pad: 'docs/uitvoerbaar.sh', uitslag: 'telt' },
    { pad: '-streep.md', uitslag: 'telt' },
    { pad: 'niet-gevolgd.md', uitslag: 'telt niet' },
    { pad: '.env', uitslag: 'telt niet' },
    { pad: 'ssh-link', uitslag: 'telt niet' },
    { pad: 'env-link', uitslag: 'telt niet' },
    { pad: 'mapl/f.md', uitslag: 'telt niet' },
    { pad: 'docs', uitslag: 'telt niet' },
    { pad: 'docs/*.md', uitslag: 'telt niet' },
    { pad: ':(top)docs/framework.md', uitslag: 'telt niet' },
    { pad: 'bestaat-niet.md', uitslag: 'telt niet' },
  ])('rolhek-lezen/AC-11: ingang, $pad $uitslag als gevolgd', ({ pad, uitslag }) => {
    expect(telt(gevolgdVan(gevolgdeRepo())([pad]), pad)).toBe(uitslag);
  });

  test('rolhek-lezen/AC-11: ingang, één aanroep met meerdere paden meldt precies de gevolgde gewone bestanden', () => {
    const paden = ['docs/framework.md', '-streep.md', '.env', 'ssh-link', 'env-link', 'mapl/f.md', 'docs'];
    const resultaat = gevolgdVan(gevolgdeRepo())(paden);
    expect(paden.filter((pad) => telt(resultaat, pad) === 'telt')).toStrictEqual(['docs/framework.md', '-streep.md']);
  });

  test('rolhek-lezen/AC-11: ingang, faalt de git-aanroep dan telt geen pad als gevolgd', () => {
    const dir = gevolgdeRepo();
    expect(telt(gevolgdVan(dir)(['docs/framework.md']), 'docs/framework.md')).toBe('telt');
    rmSync(path.join(dir, '.git'), { recursive: true });
    expect(telt(gevolgdVan(dir)(['docs/framework.md']), 'docs/framework.md')).toBe('telt niet');
  });
});

describe('rolhek-lezen/AC-12: pipes en voorwaardelijke reeksen tussen lezers; geen redirect', () => {
  test.each([
    'git log --oneline -20 | head -n 5',
    'git ls-files | wc -l',
    'git log | head',
    'git status && git log -3',
    'git status; git log -3',
    'git status || git log -3',
    'git log --oneline | head -n 5 | wc -l',
    'git status && git log -3 | head -n 5',
  ])('rolhek-lezen/AC-12: toegestaan: %s', (command) => {
    expect(verdictLees(command, REVIEWER)).toBe('allow');
  });

  test.each([
    { command: 'git log | head -n 5 | node', basis: 'git log | head -n 5' },
    { command: 'git log | head -n 5 | sh', basis: 'git log | head -n 5' },
    { command: 'git log | head -n 5 | xargs rm', basis: 'git log | head -n 5' },
    { command: 'git log | head -n 5 | tee x', basis: 'git log | head -n 5' },
    { command: 'git ls-files | xargs rm', basis: 'git ls-files | wc -l' },
    { command: 'git log && node x.js', basis: 'git log && git status' },
    { command: 'git log; touch x', basis: 'git log; git status' },
    { command: 'git log || touch x', basis: 'git log || git status' },
    { command: 'git log | head -n 5 > x', basis: 'git log | head -n 5' },
    { command: 'git log | head -n 5 2>/dev/null', basis: 'git log | head -n 5' },
    { command: 'git log | head -n 5 &', basis: 'git log | head -n 5' },
    { command: 'git log |& head -n 5', basis: 'git log | head -n 5' },
    { command: 'git log &', basis: 'git log' },
    { command: '( git log )', basis: 'git log' },
    { command: '{ git log; }', basis: 'git log' },
    { command: 'wc -l < .env', basis: 'wc -l docs/framework.md' },
    { command: 'wc -l docs/framework.md < .env', basis: 'wc -l docs/framework.md' },
    { command: 'wc -l <<< x', basis: 'wc -l docs/framework.md' },
    { command: 'wc -l <<EOF\nx\nEOF', basis: 'wc -l docs/framework.md' },
    { command: 'wc -l <&3', basis: 'wc -l docs/framework.md' },
    { command: 'wc -l docs/framework.md 2>/dev/null', basis: 'wc -l docs/framework.md' },
  ])('rolhek-lezen/AC-12: $command → deny', ({ command, basis }) => {
    afwijzing(basis, command, { role: REVIEWER });
  });

  test.each([
    { command: 'git log | node', segment: 'node' },
    { command: 'git log | xargs rm', segment: 'xargs rm' },
    { command: 'git status && touch x', segment: 'touch x' },
  ])('rolhek-lezen/AC-12: de weigering van $command noemt het geweigerde segment', ({ command, segment }) => {
    expect(verdictLees('git log | head -n 5', REVIEWER)).toBe('allow');
    const tekst = meldingLees(command, REVIEWER);
    expect(tekst).toContain(`alleen lezen (\`${segment}\` mag niet; framework §8)`);
    expect(tekst).toContain('gebruik de Grep-tool');
  });
});

describe('rolhek-lezen/AC-13 en rolhek-lezen/AC-14: git worktree, branch, tag, ls-tree, cat-file en rev-parse', () => {
  const LS_TREE_VLAGGEN = [
    '-r',
    '-t',
    '-d',
    '-l',
    '--long',
    '--name-only',
    '--name-status',
    '--full-name',
    '--full-tree',
  ];
  const REV_PARSE_VLAGGEN = [
    '--show-toplevel',
    '--show-prefix',
    '--show-cdup',
    '--is-inside-work-tree',
    '--abbrev-ref HEAD',
    '--short HEAD',
    '--verify HEAD',
    '--symbolic-full-name HEAD',
  ];

  test.each([
    'git worktree list',
    'git worktree list --porcelain',
    'git branch -r',
    'git branch -a',
    'git branch -v',
    'git branch -vv',
    'git branch -l',
    'git branch --list',
    'git branch -r --no-merged origin/main',
    'git branch --merged origin/main',
    'git branch --contains HEAD',
    "git branch --list 'chore/*'",
    "git branch -l 'feat/rolhek-*'",
    'git branch --list chore/x',
    'git tag --list',
    'git tag -l',
    "git tag --list 'v*'",
    'git tag --contains HEAD',
    'git tag --points-at HEAD',
    'git ls-tree HEAD docs',
    'git ls-tree -r --name-only origin/main -- docs',
    ...LS_TREE_VLAGGEN.map((vlag) => `git ls-tree ${vlag} HEAD`),
    'git cat-file -s HEAD:docs/x.md',
    'git cat-file -t HEAD',
    'git cat-file -e HEAD:docs/x.md',
    'git cat-file -p HEAD:docs/x.md',
    'git cat-file -p stash^3:.env',
    'git rev-parse HEAD',
    'git rev-parse HEAD~1 origin/main',
    ...REV_PARSE_VLAGGEN.map((vlag) => `git rev-parse ${vlag}`),
  ])('rolhek-lezen/AC-13 en rolhek-lezen/AC-14: toegestaan: %s', (command) => {
    expect(verdictLees(command, REVIEWER)).toBe('allow');
  });

  test.each([
    // git worktree
    ...['add ../x', 'remove ../x', 'prune', 'move a b', 'lock ../x', 'unlock ../x', 'repair'].map((deel) => ({
      command: `git worktree ${deel}`,
      basis: 'git worktree list',
    })),
    { command: 'git worktree list --verbose', basis: 'git worktree list --porcelain' },
    { command: 'git worktree list --porcelain -z', basis: 'git worktree list --porcelain' },
    // git branch: een los woord maakt een branch; schrijfopties
    { command: 'git branch foo', basis: 'git branch -r' },
    { command: 'git branch -r foo', basis: 'git branch -r' },
    ...['-d foo', '-D foo', '-m a b', '-M a b', '-c a b', '-C a b', '-f foo', '-u origin/main', '--delete foo'].map(
      (deel) => ({ command: `git branch ${deel}`, basis: 'git branch -r' }),
    ),
    ...['--move a b', '--copy a b', '--force foo', '--set-upstream-to=origin/main', '--unset-upstream'].map((deel) => ({
      command: `git branch ${deel}`,
      basis: 'git branch -r',
    })),
    { command: 'git branch --edit-description', basis: 'git branch -r' },
    { command: 'git branch --track foo', basis: 'git branch -r' },
    // de patroonregel van --list: tekens uit [A-Za-z0-9_./*-], een globteken aangehaald
    { command: 'git branch --list chore/*', basis: "git branch --list 'chore/*'" },
    { command: "git branch --list 'a b'", basis: "git branch --list 'a-b'" },
    { command: "git branch --list 'a;b'", basis: "git branch --list 'a-b'" },
    { command: "git branch --list '$X'", basis: "git branch --list 'X'" },
    { command: 'git branch --list "$X"', basis: 'git branch --list X' },
    { command: 'git branch --merged', basis: 'git branch --merged HEAD' },
    { command: 'git branch --merged ../x', basis: 'git branch --merged origin/main' },
    { command: 'git branch --contains /tmp', basis: 'git branch --contains HEAD' },
    // git tag: een los woord maakt een tag
    { command: 'git tag v1', basis: 'git tag --list' },
    { command: 'git tag --contains HEAD v1', basis: 'git tag --contains HEAD' },
    ...['-d v1', '-a v1', '-s v1', '-f v1', '-m x v1', '-F f v1', '--delete v1'].map((deel) => ({
      command: `git tag ${deel}`,
      basis: 'git tag --list',
    })),
    { command: 'git tag --list v*', basis: "git tag --list 'v*'" },
    { command: 'git tag --points-at ../x', basis: 'git tag --points-at HEAD' },
    // git ls-tree, git cat-file, git rev-parse
    { command: 'git ls-tree --format=%(path) HEAD docs', basis: 'git ls-tree HEAD docs' },
    { command: 'git ls-tree --format %(path) HEAD docs', basis: 'git ls-tree HEAD docs' },
    { command: 'git ls-tree -z HEAD docs', basis: 'git ls-tree HEAD docs' },
    { command: 'git ls-tree ../x docs', basis: 'git ls-tree HEAD docs' },
    { command: "git ls-tree HEAD ':!docs'", basis: 'git ls-tree HEAD docs' },
    { command: 'git ls-tree HEAD ../x', basis: 'git ls-tree HEAD docs' },
    ...['--batch', '--batch-check', '--batch-command', '--batch-all-objects'].map((vlag) => ({
      command: `git cat-file ${vlag}`,
      basis: 'git cat-file -p HEAD:docs/x.md',
    })),
    { command: 'git cat-file --textconv HEAD:docs/x.md', basis: 'git cat-file -p HEAD:docs/x.md' },
    { command: 'git cat-file --filters HEAD:docs/x.md', basis: 'git cat-file -p HEAD:docs/x.md' },
    { command: 'git cat-file -s -t HEAD', basis: 'git cat-file -s HEAD' },
    { command: 'git cat-file HEAD:docs/x.md', basis: 'git cat-file -p HEAD:docs/x.md' },
    { command: 'git cat-file -p HEAD HEAD~1', basis: 'git cat-file -p HEAD' },
    { command: 'git cat-file -p ../x', basis: 'git cat-file -p HEAD:docs/x.md' },
    { command: 'git cat-file -p /etc/passwd', basis: 'git cat-file -p HEAD:docs/x.md' },
    { command: 'git cat-file -p HEAD:../x', basis: 'git cat-file -p HEAD:docs/x.md' },
    ...['--parseopt', '--sq-quote', '--local-env-vars', '--git-path HEAD', '--git-dir'].map((vlag) => ({
      command: `git rev-parse ${vlag}`,
      basis: 'git rev-parse HEAD',
    })),
    { command: 'git rev-parse ../x', basis: 'git rev-parse HEAD' },
  ])('rolhek-lezen/AC-13 en rolhek-lezen/AC-14: $command → deny', ({ command, basis }) => {
    afwijzing(basis, command, { role: REVIEWER });
  });
});

describe('rolhek-lezen/AC-15: git -C <werkmap> alleen naar een root uit git worktree list', () => {
  test.each([
    'git -C /wt/ander status',
    'git -C /repo log',
    'git -C /wt/ander grep -n -e x',
    'git -C /wt/ander diff origin/main...HEAD',
    'git -C /wt/ander ls-files',
    'git -C /wt/ander show HEAD',
    'git -C /wt/ander worktree list',
    'git -C /wt/ander branch -r',
    'git -C /wt/ander rev-parse HEAD',
  ])('rolhek-lezen/AC-15: toegestaan: %s', (command) => {
    expect(verdictLees(command, REVIEWER, leesContext(WERKMAPPEN))).toBe('allow');
  });

  test.each([
    { command: 'git -C /tmp status', basis: 'git -C /wt/ander status' },
    { command: 'git -C ~ status', basis: 'git -C /wt/ander status' },
    { command: 'git -C ../ander-project log', basis: 'git -C /repo log' },
    { command: 'git -C "$X" status', basis: 'git -C /wt/ander status' },
    { command: 'git -C `pwd` status', basis: 'git -C /wt/ander status' },
    { command: 'git -C docs diff', basis: 'git -C /repo diff' },
    { command: 'git -C /wt/ander/src status', basis: 'git -C /wt/ander status' },
    { command: 'git -C /wt/ander -C /repo status', basis: 'git -C /wt/ander status' },
    { command: 'git -C /wt/ander -c core.pager=x log', basis: 'git -C /wt/ander log' },
    { command: 'git -C /wt/ander --git-dir=/tmp/x status', basis: 'git -C /wt/ander status' },
    { command: 'git -C /wt/ander --work-tree=/tmp/x status', basis: 'git -C /wt/ander status' },
    { command: 'git -C /wt/ander worktree add x', basis: 'git -C /wt/ander worktree list' },
    { command: 'git -C /wt/ander checkout x', basis: 'git -C /wt/ander status' },
    { command: 'git -C /tmp grep -n -e x', basis: 'git -C /wt/ander grep -n -e x' },
  ])('rolhek-lezen/AC-15: $command → deny', ({ command, basis }) => {
    afwijzing(basis, command, { role: REVIEWER, werkmappen: WERKMAPPEN });
  });

  test('rolhek-lezen/AC-15: een relatief pad wordt tegen de werkmap van het segment opgelost', () => {
    const lees = leesContext(WERKMAPPEN);
    const { context } = lees;
    const payload = { tool_name: 'Bash', tool_input: { command: 'git -C .. status' }, agent_type: REVIEWER };
    const vanuitDocs = { ...context, cwd: '/repo/docs' };
    expect(uitslagVan(decide({ ...payload, tool_input: { command: 'git -C /repo status' } }, vanuitDocs))).toBe(
      'allow',
    );
    expect(uitslagVan(decide(payload, vanuitDocs))).toBe('allow');
    expect(uitslagVan(decide({ ...payload, tool_input: { command: 'git -C . status' } }, vanuitDocs))).toBe('deny');
  });

  test.each([
    {
      naam: 'ctx.werkmappen faalt',
      werkmappen: () => {
        throw new Error('git worktree list faalde');
      },
    },
    { naam: 'ctx.werkmappen ontbreekt', werkmappen: undefined },
  ])('rolhek-lezen/AC-15: zonder lijst ($naam) telt alleen ctx.root', ({ werkmappen }) => {
    expect(verdictLees('git -C /repo log', REVIEWER, leesContext(werkmappen))).toBe('allow');
    expect(verdictLees('git -C /wt/ander status', REVIEWER, leesContext(werkmappen))).toBe('deny');
  });

  test('rolhek-lezen/AC-15: ctx.werkmappen wordt alleen aangeroepen als een segment git -C heeft, hooguit één keer', () => {
    const zonder = leesContext(WERKMAPPEN);
    expect(verdictLees('git status', REVIEWER, zonder)).toBe('allow');
    expect(zonder.teller.werkmappen).toBe(0);
    const met = leesContext(WERKMAPPEN);
    expect(verdictLees('git -C /wt/ander status && git -C /repo log', REVIEWER, met)).toBe('allow');
    expect(met.teller.werkmappen).toBe(1);
  });
});

describe('rolhek-lezen/AC-16: gh pr list en gh issue list met zoeken', () => {
  test.each([
    'gh pr list',
    'gh pr list --state open --json number,title',
    'gh pr list --limit 5 --label bug --base main --head feat/x --author someone --jq .title',
    'gh pr list --search "ratchet in:title"',
    "gh pr list --search 'is:merged'",
    'gh issue list --search ratchet --state open',
    'gh issue list --search "ratchet in:title" --author someone',
  ])('rolhek-lezen/AC-16: toegestaan: %s', (command) => {
    expect(verdictLees(command, REVIEWER)).toBe('allow');
  });

  test.each([
    { command: 'gh pr list --state open --web', basis: 'gh pr list --state open' },
    { command: 'gh pr list --state open -R x/y', basis: 'gh pr list --state open' },
    { command: 'gh pr list --state open --repo x/y', basis: 'gh pr list --state open' },
    { command: 'gh pr list --state open --search "$X"', basis: 'gh pr list --state open --search "x"' },
    { command: 'gh pr list --state open --search "$(id)"', basis: 'gh pr list --state open --search "x"' },
    { command: 'gh pr list --state open --search "a\tb"', basis: 'gh pr list --state open --search "a b"' },
    { command: "gh pr list --state open --jq 'env'", basis: 'gh pr list --state open --jq .title' },
    { command: 'gh pr list --state open --label "a b"', basis: 'gh pr list --state open --label x' },
    { command: 'gh pr list --state open x', basis: 'gh pr list --state open' },
    { command: 'gh issue list --search "$X"', basis: 'gh issue list --search "x"' },
    { command: 'gh pr list --state open && gh pr close 5', basis: 'gh pr list --state open && gh pr view 5' },
    { command: 'gh pr list --state open; gh pr edit 5 --add-label x', basis: 'gh pr list --state open; gh pr view 5' },
    { command: 'gh pr list --state open; gh pr merge 5', basis: 'gh pr list --state open; gh pr view 5' },
    { command: 'gh pr list --search "merge"', basis: 'gh pr list --search "is:merged"' },
  ])('rolhek-lezen/AC-16: $command → deny', ({ command, basis }) => {
    afwijzing(basis, command, { role: REVIEWER });
  });

  // Het vangnet uit WS-04 geldt ook buiten de reviewerlijst: de hoofdsessie mag `gh pr list`, maar geen merge erachter.
  test('rolhek-lezen/AC-16: gh pr list; gh pr merge 5 blijft voor de hoofdsessie geweigerd door het vangnet (WS-04)', () => {
    expect(verdictLees('gh pr list; gh pr view 5', undefined)).not.toBe('deny');
    expect(verdictLees('gh pr list; gh pr merge 5', undefined)).toBe('deny');
  });
});

const SUBAGENT_ROLLEN = ['developer', 'tester', 'architect', 'docs', 'reviewer'];

describe('rolhek-lezen/AC-18: git grep naar gh, api.github.com of git credential door een subagent', () => {
  describe.each(SUBAGENT_ROLLEN.map((role) => ({ role })))('$role', ({ role }) => {
    test.each([
      "git grep -n -F -e 'gh pr list' -- docs",
      "git grep -c -F -e 'api.github.com'",
      'git grep -e gh',
      "git grep -F -e 'git credential'",
      "git grep -n -F -e 'gh pr list' -- docs | head -n 5",
      "git grep -n -F -e 'gh pr list' -- docs && git log -3",
      'ls docs/gh',
    ])('rolhek-lezen/AC-18: toegestaan: %s', (command) => {
      expect(verdictLees(command, role)).toBe('allow');
    });

    test.each([
      { command: 'git credential fill', basis: "git grep -c -F -e 'git credential'" },
      { command: 'echo x | gh pr view 5', basis: 'gh pr view 5' },
      { command: 'git grep -e gh | sh', basis: 'git grep -e gh | head -n 5' },
      { command: 'curl https://api.github.com/user', basis: "git grep -c -F -e 'api.github.com'" },
      { command: 'git grep -e "$(gh auth token)"', basis: 'git grep -e gh' },
      { command: "git grep -F -e 'gh pr merge'", basis: "git grep -F -e 'gh pr list'" },
      { command: "git grep -n -F -e 'gh pr list' -- docs # x", basis: "git grep -n -F -e 'gh pr list' -- docs" },
      {
        command: "git grep -n -F -e 'gh pr list' -- docs && echo klaar",
        basis: "git grep -n -F -e 'gh pr list' -- docs && git log -3",
      },
      { command: "git grep -n -F -e 'gh pr list' -- /home/x/.config", basis: "git grep -n -F -e 'gh pr list' -- docs" },
      {
        command: "git grep -n --context=3 -F -e 'gh pr list' -- docs",
        basis: "git grep -n -C 3 -F -e 'gh pr list' -- docs",
      },
      { command: "git grep --no-index -n -F -e 'gh pr list' -- docs", basis: "git grep -n -F -e 'gh pr list' -- docs" },
      { command: 'cat ~/.config/gh/hosts.yml', basis: 'ls docs/gh' },
      { command: 'head -n 5 /home/x/.config/gh/hosts.yml', basis: 'head -n 5 docs/gh' },
      { command: 'ls ~/.config/gh', basis: 'ls docs/gh' },
      { command: 'git diff /dev/null /home/x/.config/gh/hosts.yml', basis: 'git diff docs/a docs/gh' },
      { command: 'git diff --no-index docs/gh docs/a', basis: 'git diff docs/gh docs/a' },
      { command: 'diff --from-file=/home/x/.config/gh/hosts.yml docs/gh', basis: 'ls docs/gh' },
      { command: 'grep -f/home/x/.config/gh/hosts.yml docs/gh', basis: 'ls docs/gh' },
      { command: 'git -C /home/x/.config/gh diff config.yml hosts.yml', basis: 'git diff config.yml hosts.yml' },
      { command: 'git --work-tree=/home/x/.config/gh diff a b', basis: 'git diff a b' },
    ])('rolhek-lezen/AC-18: $command → deny', ({ command, basis }) => {
      afwijzing(basis, command, { role });
    });
  });

  test('rolhek-lezen/AC-18: het vangnet voor de hoofdsessie en op mergen verandert niet', () => {
    expect(verdictLees("git grep -F -e 'gh pr merge'", undefined)).toBe('deny');
    expect(verdictLees("git grep -F -e 'gh pr list'", undefined)).not.toBe('deny');
  });
});

describe('rolhek-lezen/AC-20: de andere rollen houden de leesvormen en schrijven blijft dicht', () => {
  const ANDERE_ROLLEN = [undefined, 'developer', 'tester', 'architect', 'docs'].map((role) => ({
    role,
    naam: rolNaam(role),
  }));
  const LEESVORMEN = [
    // AC-11 en AC-12
    'wc -l docs/framework.md',
    'head -n 20 docs/framework.md',
    'tail -n +5 docs/framework.md',
    "sed -n '1,20p' docs/framework.md",
    'ls -la docs',
    'git log --oneline -20 | head -n 5',
    'git ls-files | wc -l',
    'git status && git log -3',
    // AC-13 en AC-14
    'git worktree list --porcelain',
    'git branch -r --no-merged origin/main',
    "git branch --list 'chore/*'",
    'git tag --contains HEAD',
    'git ls-tree -r --name-only origin/main -- docs',
    'git cat-file -s HEAD:docs/x.md',
    'git cat-file -p stash^3:.env',
    'git rev-parse --show-toplevel',
    // AC-15 en AC-16
    'git -C /wt/ander status',
    'gh pr list --state open --json number,title',
    'gh pr list --search "ratchet in:title"',
    'gh issue list --search ratchet --state open',
  ];

  describe.each(ANDERE_ROLLEN)('$naam', ({ role }) => {
    test.each(LEESVORMEN)('rolhek-lezen/AC-20: %s → zonder weigering', (command) => {
      expect(verdictLees(command, role, leesContext(WERKMAPPEN))).not.toBe('deny');
    });
  });

  test('rolhek-lezen/AC-20: git checkout <ref> -- <spec> door de tester blijft geweigerd (schrijven)', () => {
    const basis = 'git diff origin/main -- docs/template/specs/x.md';
    expect(verdictLees(basis, 'tester')).not.toBe('deny');
    expect(verdictLees('git checkout origin/main -- docs/template/specs/x.md', 'tester')).toBe('deny');
  });
});
