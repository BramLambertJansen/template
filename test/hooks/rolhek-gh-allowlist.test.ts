import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

const ctx = {
  root: '/repo',
  cwd: '/repo',
  config: loadConfig(readFileSync('.claude/gates.json', 'utf8')),
  read: () => null,
  committed: () => false,
  isDir: () => false,
  branch: 'feat/example',
};

function run(command: string, role?: string) {
  return decide(
    { tool_name: 'Bash', tool_input: { command }, ...(role === undefined ? {} : { agent_type: role }) },
    ctx,
  );
}

const SUBAGENTS = ['developer', 'tester', 'architect', 'docs'];

const SUBAGENT_DENIED = [
  'gh pr new --title x --body y',
  "gh alias set pc 'pr create'",
  'gh pc',
  'gh auth token',
  'curl -H "Authorization: token $(gh auth token)" https://api.github.com/repos/o/r/pulls -X POST',
  'gh pr edit 1 --base x',
  'gh pr comment 1 -b x',
  'gh workflow run x',
  'gh run rerun 1',
  'gh label create x',
  'gh secret set X',
  'gh extension install x',
  'gh api repos/o/r/issues -f title=x',
  'gh api -X PATCH repos/o/r',
  "gh api graphql -f query='query { viewer { login } }'",
  'gh api graphql -f "query=query { viewer { login } }"',
];

const SUBAGENT_ALLOWED = [
  'gh pr view 1',
  'gh pr diff 1',
  'gh pr checks 1',
  'gh pr list',
  'gh pr status',
  'gh run view 1',
  'gh run list',
  'gh run watch 1',
  'gh issue view 1',
  'gh issue list',
  'gh repo view',
  'gh api repos/o/r/pulls/1',
];

const ALL_ROLES_DENIED = [
  "gh api /graphql -f query='mutation{mergePullRequest(input:{})}'",
  "gh api https://api.github.com/graphql -f query='mutation{mergePullRequest(input:{})}'",
  "gh api graphql -f query=$'\\x6dutation{mergePullRequest}'",
  'gh api graphql -f query="$(cat q)"',
  'gh api graphql -F query=@q.graphql',
  'gh api graphql --input q.json',
  'EP=repos/o/r/pulls/1/merge; gh api -X PUT "$EP"',
  'gh api -X PUT /repos/o/r/pulls/1/merge',
  'gh api -X PUT https://api.github.com/repos/o/r/pulls/1/merge',
  // zelfreview en label, volgens SELF_REVIEW_API
  'gh api -X POST repos/o/r/pulls/1/reviews -f event=APPROVE',
  'gh api -X POST /repos/o/r/pulls/1/reviews -f event=APPROVE',
  'gh api -X POST https://api.github.com/repos/o/r/pulls/1/reviews -f event=APPROVE',
  'gh api -X POST repos/o/r/issues/1/labels -f labels[]=gate-wijziging',
  'gh api -X POST https://api.github.com/repos/o/r/issues/1/labels -f labels[]=x',
  'gh api -X POST repos/o/r/statuses/abc -f state=success',
  "gh api /graphql -f query='mutation{addPullRequestReview(input:{})}'",
  "gh api https://api.github.com/graphql -f query='mutation{addLabelsToLabelable(input:{})}'",
  "gh api graphql -f query='mutation{addPullRequestReview(input:{})}'",
  'EP=repos/o/r/issues/1/labels; gh api -X POST "$EP" -f labels[]=x',
];

describe('gh-allowlist voor subagents', () => {
  describe.each(SUBAGENTS)('%s', (role) => {
    test.each(SUBAGENT_DENIED)('geweigerd: %s', (command) => {
      expect(run(command, role).deny.length).toBeGreaterThan(0);
    });
    test.each(SUBAGENT_ALLOWED)('toegestaan: %s', (command) => {
      expect(run(command, role).deny).toEqual([]);
    });
  });
});

describe('gh-omzeilingen die voor elke rol dicht zijn', () => {
  test.each(ALL_ROLES_DENIED)('subagent: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });
  test.each(ALL_ROLES_DENIED)('hoofdsessie: %s', (command) => {
    expect(run(command).deny.length).toBeGreaterThan(0);
  });
});

describe('pnpm format via opties en brede formatters', () => {
  test.each([
    'pnpm -s format',
    'pnpm --dir . format',
    'pnpm -C . format',
    'pnpm exec prettier --write .',
    'npx prettier -w .',
    'pnpm exec eslint --fix .',
  ])('subagent geweigerd: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });

  test('gerichte formattering met expliciete paden blijft toegestaan', () => {
    expect(run('pnpm exec prettier --write src/a.ts', 'developer').deny).toEqual([]);
  });

  test('de hoofdsessie houdt een ask op pnpm -s format', () => {
    const decision = run('pnpm -s format');
    expect(decision.ask.length).toBeGreaterThan(0);
    expect(decision.deny).toEqual([]);
  });
});

describe('review-omzeilingen: optieclusters, vlaggen, wrappers, tokens, brede formatters', () => {
  const ALL = [
    'gh api -iX PUT repos/o/r/pulls/1/merge',
    'gh api -XPUT repos/o/r/pulls/1/merge',
    'gh api --method=PUT repos/o/r/pulls/1/merge',
    'gh pr -R o/r merge 1 --auto',
    'gh -R o/r pr merge 1',
    'gh --repo o/r pr review 1 --approve',
    'gh --repo=o/r pr merge 1',
    "gh alias set m 'pr merge'",
    'gh alias import x',
    'gh m 1',
  ];
  const SUB = [
    'gh api -iX DELETE repos/o/r/git/refs/heads/x',
    'gh api --field x=y repos/o/r/issues',
    'gh api --raw-field x=y repos/o/r/issues',
    'gh api -F x=@- repos/o/r/issues',
    'env -u X gh pr create',
    'env GH_TOKEN=x gh pr create',
    'nice -n 5 gh pr create',
    'command gh pr create',
    '/usr/bin/gh pr create',
    'echo 1 | xargs gh pr merge',
    "bash -c 'gh pr create'",
    'sh -c "gh pr merge 1"',
    'curl -H @hdr "$U"',
    'curl -K cfg',
    'curl --config cfg',
    "printf 'host=github.com\\n' | git credential fill",
    'wget --header="Authorization: token x" https://api.github.com/x',
    'pnpm lint --fix',
    'pnpm run lint --fix',
    'git ls-files | xargs prettier --write',
    'xargs eslint --fix',
  ];

  test.each(ALL)('alle rollen: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });
  test.each(SUB)('subagent: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });
  test('subagent mag een letterlijke URL zonder token of config ophalen', () => {
    expect(run('curl https://example.com/x', 'developer').deny).toEqual([]);
  });
  test.each([
    "gh api graphql -f query='query($n:Int!){viewer{login}}' -F n=1",
    'gh pr view 1 --json state --jq \'.state | test("\\w")\'',
    'gh pr view 1 --json state,mergedAt',
    'gh run view 1 --log-failed',
  ])('hoofdsessie blijft toegestaan: %s', (command) => {
    expect(run(command).deny).toEqual([]);
  });
});

describe('ruwe-tekstregel', () => {
  // Eigenaarsbesluit 2026-10-26: een grove, dichte regel op de ruwe commandotekst, geen shell-parsing.
  const SUB_RAW_DENIED = [
    'gh api {repos/o/r/pulls,-XPOST,-fhead=x,-fbase=main,-ftitle=t}',
    'echo $(gh pr create --title x --body y)',
    'echo `gh pr create --title x`',
    "eval 'gh pr create --title x --body y'",
    "echo 'gh pr create' | bash",
    "bash <<'E'\ngh pr create --title x\nE",
    'source ./x.sh',
    '. ./x.sh',
    'sh < x.sh',
    // Bewust geaccepteerd vals positief: `gh` als los woord in een niet-gh-commando.
    'grep gh x',
    'cat x | grep api.github.com',
  ];
  const SUB_RAW_ALLOWED = [
    'gh pr view 1',
    'gh pr view 1 --json state --jq .state',
    'gh run view 1 --log-failed',
    'gh api repos/o/r/pulls/1',
    'ls',
    'pnpm exec vitest run test/x.test.ts',
    'echo hallo | grep h',
    'echo {a}',
    // Shell-trucs tellen alleen als de tekst gh, github of credential bevat.
    'echo $(date)',
    'echo `date`',
    'ls $(git rev-parse --show-toplevel)',
    "cat <<'E'\nhallo\nE",
  ];
  const ALL_RAW_DENIED = [
    '{ gh pr merge 1; }',
    'if true; then gh pr merge 1; fi',
    'env -u X gh pr merge 1',
    '$(gh pr merge 1)',
    'gh api -X PUT {repos/o/r/pulls/1/merge,--silent}',
    'echo x && gh pr review 1 --approve',
  ];

  test.each(SUB_RAW_DENIED)('subagent geweigerd: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });
  test.each(SUB_RAW_ALLOWED)('subagent toegestaan: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny).toEqual([]);
  });
  test.each(ALL_RAW_DENIED)('vangnet voor elke rol: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });
  // `mergeCommit` is een veldnaam; de skill opleveren heeft dit leescommando nodig, dus het blijft toegestaan.
  test.each([
    'gh pr view 1 --json state,mergedAt,mergeCommit',
    'git merge --ff-only origin/main',
    'git merge origin/main',
  ])('hoofdsessie toegestaan: %s', (command) => {
    expect(run(command).deny).toEqual([]);
  });
});

describe('genormaliseerde-tekst', () => {
  const SUB_OBFUSCATED = [
    'echo $(g\\h pr create --title t --body b)',
    'G=g\\h; $G pr create --title t --body b',
    'x=g; ${x}h pr create --title t',
    "$'\\x67h' pr create --title t",
    'echo $(g""h pr create)',
    "echo $(g''h pr create)",
  ];
  const ALL_OBFUSCATED_MERGE = [
    'echo $(gh pr m\\erge 1)',
    'echo $(g""h pr merge 1)',
    'x=g; ${x}h pr merge 1',
    'gh pr mer""ge 1',
  ];
  // Een niet-letterlijk commandowoord: subagent deny; de hoofdsessie krijgt deny of ask (beide acceptabel).
  const NON_LITERAL = ['$CMD pr view 1', '$(echo ls)'];
  const CURL_MERGE = [
    'curl -H "Authorization: bearer $T" https://api.github.com/graphql -d \'{"query":"mutation{mergePullRequest(input:{pullRequestId:\\"x\\"}){clientMutationId}}"}\'',
    'curl -H "Authorization: bearer $T" https://api.github.com/graphql -d \'{"query":"mutation{enablePullRequestAutoMerge(input:{pullRequestId:\\"x\\"}){clientMutationId}}"}\'',
    'curl -X PUT https://api.github.com/repos/o/r/pulls/1/merge',
  ];

  test.each(SUB_OBFUSCATED)('subagent: verhulde gh-naam geweigerd: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });
  test.each(ALL_OBFUSCATED_MERGE)('alle rollen: verhulde merge geweigerd: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });
  test.each(NON_LITERAL)('niet-letterlijk commandowoord: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    const main = run(command);
    expect(main.deny.length + main.ask.length).toBeGreaterThan(0);
  });
  test.each(CURL_MERGE)('mergen via curl geweigerd voor alle rollen: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  test.each([
    'gh pr view 1 --json state,mergedAt,mergeCommit',
    'git merge --ff-only origin/main',
    'gh pr create --title "fix: x" --body-file /tmp/b.md',
    'echo "it\'s fine" | grep fine',
  ])('hoofdsessie blijft toegestaan: %s', (command) => {
    expect(run(command).deny).toEqual([]);
  });

  // Geaccepteerde valse melding: "merge " in een titel raakt het vangnet. De oplossing is `--body-file` en een titel zonder "merge ".
  test('geaccepteerde valse melding: "merge" in een PR-titel wordt geweigerd', () => {
    expect(run('gh pr create --title "fix: merge conflict" --body-file x').deny.length).toBeGreaterThan(0);
  });
});

describe('substituties-en-woordgrens', () => {
  test.each(['x=g; echo $(${x}h pr merge 1)', 'x=g; echo `${x}h pr merge 1`', 'echo $(echo $(gh pr merge 1))'])(
    'hoofdsessie: inhoud van substituties wordt gecontroleerd: %s',
    (command) => {
      expect(run(command).deny.length).toBeGreaterThan(0);
    },
  );
  test.each(['x=g; echo `${x}h pr create --title t --body b`', 'echo $(${x}h pr create --title t)'])(
    'subagent: inhoud van substituties wordt gecontroleerd: %s',
    (command) => {
      for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
    },
  );
  test('alle rollen: een niet-letterlijk commandowoord in een substitutie', () => {
    expect(run('echo $($CMD x)', 'developer').deny.length).toBeGreaterThan(0);
    expect(run('echo $($CMD x)').deny.length).toBeGreaterThan(0);
  });
  test.each(['echo $(date)', 'ls $(git rev-parse --show-toplevel)', 'echo $(pwd)'])(
    'onschuldige substituties blijven toegestaan voor hoofdsessie en subagent: %s',
    (command) => {
      expect(run(command).deny).toEqual([]);
      expect(run(command, 'developer').deny).toEqual([]);
    },
  );

  // Woordgrens: `gh` binnen een pad of bestandsnaam is geen gh-commando.
  test.each([
    'pnpm test test/hooks/rolhek-gh-allowlist.test.ts',
    './node_modules/.bin/vitest run test/hooks/rolhek-gh-allowlist.test.ts',
    'cat docs/gh-notes.md',
    'ls high-gh',
  ])('subagent: gh in een pad is geen gh-commando: %s', (command) => {
    for (const role of ['developer', 'tester']) expect(run(command, role).deny).toEqual([]);
  });
  test('reviewer: git log op de branch fix/rolhek-gh-allowlist', () => {
    expect(run('git log fix/rolhek-gh-allowlist', 'reviewer').deny).toEqual([]);
  });
  test.each(['x; gh pr create', '(gh pr create)', 'echo|gh pr create'])(
    'subagent: gh na een scheidingsteken blijft geweigerd: %s',
    (command) => {
      for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
    },
  );

  // Besluit: de uitzondering voor commitberichten vervalt (een zelfherhalend bericht liet een echte merge uit de tekst wegvallen).
  // Geaccepteerde valse melding; de oplossing is `git commit -F <bestand>`.
  test.each([
    'git commit -m "fix(rolhek): block graphql merge mutations"',
    'git commit --message "merge conflict via gh solved"',
  ])('hoofdsessie: commitbericht met merge/gh/graphql wordt geweigerd: %s', (command) => {
    expect(run(command).deny.length).toBeGreaterThan(0);
  });
  // Via een bestand staat de tekst niet in het commando, dus dit blijft de werkende route.
  test('hoofdsessie: git commit -F msg.txt blijft toegestaan', () => {
    expect(run('git commit -F msg.txt').deny).toEqual([]);
  });
});

describe('ronde-5', () => {
  test.each([
    "git commit --allow-empty -m x; bash -cm 'gh pr merge 1'",
    'git commit -m x && sh -cm "gh pr merge 1"',
    '{ gh>/dev/null pr merge 1; }',
    'if gh</dev/null pr merge 1; then :; fi',
    '{ gh 2>/dev/null pr merge 1; }',
  ])('geweigerd voor elke rol: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Geen commitbericht-uitzondering meer: geaccepteerde valse melding, oplossing is `git commit -F <bestand>`.
  test.each(['git commit -m "fix: graphql merge note"', 'git commit -am "merge gh notes"'])(
    'hoofdsessie: commitbericht met merge/gh/graphql wordt geweigerd: %s',
    (command) => {
      expect(run(command).deny.length).toBeGreaterThan(0);
    },
  );

  // Een zelfherhalend bericht mag de echte merge niet uit de tekst laten wegvallen.
  test('geweigerd voor elke rol: zelfherhalend commitbericht verbergt de merge niet', () => {
    const command = "bash -c 'gh pr merge 1'; git commit -m 'gh pr merge 1; git commit -m gh pr me'";
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Regressie: zonder gh, merge of graphql in het bericht blijft een gewone commit toegestaan.
  test('hoofdsessie: gewoon commitbericht blijft toegestaan', () => {
    expect(run('git commit -m "fix(ui): toast timers"').deny).toEqual([]);
  });
});

describe('ronde-7', () => {
  // Globs, tilde en xargs/find -exec maken het commandowoord niet-letterlijk: dicht falen voor elke rol.
  test.each([
    '/usr/bin/g[h] pr merge 1',
    '/usr/bin/g?  pr merge 1',
    '/usr/bin/g* pr merge 1',
    // Een `~` in het commandowoord telt als niet-letterlijk; weigeren is goed, ook als het pad niet bestaat.
    '~/bin/gh pr merge 1',
    'echo g | xargs -I% %h pr merge 1',
    "find /usr/bin -name 'g[h]' -exec {} pr merge 1 \\;",
    'C=g; eval "${C}h pr merge 1"',
    'C=g; bash -c "${C}h pr merge 1"',
  ])('geweigerd voor elke rol: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Keuze: subagents mogen xargs/find -exec niet met een commandowoord gebruiken; gewone testcommando's
  // (`pnpm test`, `vitest run`, `git status`) hebben dat niet nodig en blijven toegestaan (zie onder).
  test.each(['echo g | xargs -I% %h pr create --title t --body b', 'find . -name x -exec {} \\;', 'ls | xargs cat'])(
    'subagent: xargs of find -exec met een commandowoord geweigerd: %s',
    (command) => {
      for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
    },
  );

  test.each(['find . -name "*.ts"', 'ls *.md', 'git status'])(
    "hoofdsessie: gewone commando's blijven toegestaan: %s",
    (command) => {
      expect(run(command).deny).toEqual([]);
    },
  );
  test('subagent: een testcommando zonder xargs blijft toegestaan', () => {
    expect(run('pnpm test test/hooks/rolhek-gh-allowlist.test.ts', 'tester').deny).toEqual([]);
  });
});

describe('ronde-8', () => {
  // Een glob-commandowoord achter een shell-sleutelwoord, `!`, `time`, `env`, `nice` of `command` is nog steeds een commandowoord.
  test.each([
    '! /usr/bin/g[h] pr merge 1',
    'if /usr/bin/g[h] pr merge 1; then :; fi',
    'time -p /usr/bin/g[h] pr merge 1',
    'while /usr/bin/g? pr merge 1; do :; done',
    '{ /usr/bin/g[h] pr merge 1; }',
    'env -u X /usr/bin/g[h] pr merge 1',
    'nice -n 5 /usr/bin/g* pr merge 1',
    'command -p /usr/bin/g[h] pr merge 1',
  ])('geweigerd voor hoofdsessie en developer: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Regressie: gewone shell-constructies zonder gh blijven toegestaan.
  test.each([
    'if [ -f x ]; then echo ok; fi',
    '! git diff --quiet',
    'time pnpm test',
    '{ echo a; echo b; }',
    'env FOO=1 node scripts/x.mjs',
  ])('hoofdsessie: blijft toegestaan: %s', (command) => {
    expect(run(command).deny).toEqual([]);
  });
});

describe('ronde-9', () => {
  // Onbekende wrappers en een gh-glob als argument van een willekeurig programma: dicht falen.
  test.each([
    'setsid /usr/bin/g[h] pr merge 1',
    'flock /tmp/l /usr/bin/g[h] pr merge 1',
    'watch -n1 /usr/bin/g[h] pr merge 1',
    'coproc /usr/bin/g[h] pr merge 1',
    'chroot / /usr/bin/g[h] pr merge 1',
    'unbuffer /usr/bin/g? pr merge 1',
    'parallel /usr/bin/g* ::: x',
    'echo 1 | xargs /usr/bin/g[h] pr merge',
    'foo /opt/x/g[h].exe pr merge 1',
  ])('geweigerd voor hoofdsessie en developer: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Regressie: globs als argument zijn geen gh. `cat g*.txt` matcht `gh` niet, want `*.txt` vereist de extensie .txt.
  test.each(['ls src/*.ts', 'grep -r foo docs/*.md', 'rm -f $TMPDIR/x*', 'cat g*.txt'])(
    'hoofdsessie: blijft toegestaan: %s',
    (command) => {
      expect(run(command).deny).toEqual([]);
    },
  );
});

describe('ronde-10', () => {
  // Brace-expansie en POSIX-klassen in een glob die precies `gh` opleveren.
  test.each([
    'setsid /usr/bin/{g..g}h pr merge 1',
    'ionice /usr/bin/g{h..h} pr merge 1',
    'taskset 1 /usr/bin/{g,x}h pr merge 1',
    'ionice /usr/bin/g[[=h=]] pr merge 1',
    'ionice /usr/bin/g[[:alpha:]] pr merge 1',
    'ionice /usr/bin/g[[.h.]] pr merge 1',
  ])('geweigerd voor hoofdsessie en developer: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Geaccepteerd vals positief: een vangnet heeft geen brace-expander nodig, dus elke brace-expansie
  // met `,` of `..` na het eerste woord wordt geweigerd, ook zonder gh.
  test.each(['echo {a,b}', 'echo {1..3}'])('geweigerd voor alle rollen (dicht falen): %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Regressie: `{` zonder `,` of `..` op het bovenste niveau en `[[ ]]` blijven toegestaan.
  test.each(['if [[ -n x ]]; then :; fi', 'node -e "console.log({a:1})"', "git log --format='%h %s'"])(
    'hoofdsessie: blijft toegestaan: %s',
    (command) => {
      expect(run(command).deny).toEqual([]);
    },
  );
});

describe('ronde-11', () => {
  // Regel: een woord na de eerste positie met `$` of backtick, plus een gh-subcommandowoord als los woord, wordt geweigerd.
  test.each([
    'G=g; ionice ${G}h pr merge 1',
    'G=g; taskset 1 ${G}h pr create --title t --body b',
    'G=gh; nice $G api -X PUT repos/o/r/pulls/1/merge',
  ])('geweigerd voor hoofdsessie en developer: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Regressie: `$` zonder gh-subcommandowoord blijft toegestaan.
  test.each([
    'rm -f $TMPDIR/x*',
    'ls $(git rev-parse --show-toplevel)',
    'TMPDIR=$TMPDIR ./node_modules/.bin/vitest run test/x.test.ts',
    'echo $HOME',
    'cp $TMPDIR/a $TMPDIR/b',
  ])('hoofdsessie en developer: blijft toegestaan: %s', (command) => {
    expect(run(command, 'developer').deny).toEqual([]);
    expect(run(command).deny).toEqual([]);
  });

  // Geaccepteerd vals positief: `run` is een gh-subcommandowoord, dus `$HOME` plus `run` wordt geweigerd.
  test('geaccepteerd vals positief: echo $HOME run wordt geweigerd', () => {
    expect(run('echo $HOME run').deny.length).toBeGreaterThan(0);
  });
});

describe('ronde-12', () => {
  // Besluit: bevat een woord na het eerste woord shell-expansie, dan is alleen een programma uit een vaste lijst
  // (echo, cat, ls, cp, rm, ...) toegestaan. Anders: subagent deny, hoofdsessie ask.
  test.each([
    'G=g P=p M=mer; ionice ${G}h ${P}r ${M}ge 1',
    'G=g P=p C=cre; ionice ${G}h ${P}r ${C}ate --title t --body b',
    'X=y; pnpm exec $X',
  ])('subagent deny, hoofdsessie deny of ask: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    const main = run(command);
    expect(main.deny.length + main.ask.length).toBeGreaterThan(0);
  });

  test.each(['git diff $BASE', 'node scripts/x.mjs $ARG'])('subagent deny, hoofdsessie ask: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).ask.length).toBeGreaterThan(0);
  });

  // Programma's uit de lijst starten zelf geen commando; een toewijzing (`TMPDIR=$TMPDIR`) is geen geëxpandeerd argument.
  test.each([
    'rm -f $TMPDIR/x*',
    'ls $(git rev-parse --show-toplevel)',
    'cp $TMPDIR/a $TMPDIR/b',
    'echo $HOME',
    'cat $TMPDIR/x',
    'TMPDIR=$TMPDIR ./node_modules/.bin/vitest run test/x.test.ts',
  ])('toegestaan voor subagent en hoofdsessie: %s', (command) => {
    for (const role of [undefined, 'developer']) {
      const decision = run(command, role);
      expect(decision.deny).toEqual([]);
      expect(decision.ask).toEqual([]);
    }
  });
});

describe('positieve regressie', () => {
  test.each([
    'pnpm check:docs',
    'pnpm test',
    'git diff',
    'git status',
    'gh pr view',
    'gh pr diff',
    'gh pr checks',
    'node scripts/kit/feiten.mjs',
  ])('reviewer voert nog uit: %s', (command) => {
    expect(run(command, 'reviewer').deny).toEqual([]);
  });

  test.each(['gh pr create --title x --body y', 'gh api repos/o/r/pulls/1', 'gh pr view 1', 'gh pr list'])(
    'hoofdsessie kan nog: %s',
    (command) => {
      expect(run(command).deny).toEqual([]);
    },
  );
});

// Aanvulling van de bouwer (opdracht hoofdsessie): na een omhulsel moet elk woord letterlijk zijn, ook achter een onbekende optie.
describe('ronde-8b', () => {
  test.each(['sudo --weird v /usr/bin/g[h] pr merge 1', 'env --weird v /usr/bin/g* pr merge 1'])(
    'geweigerd voor hoofdsessie en developer: %s',
    (command) => {
      expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
      expect(run(command).deny.length).toBeGreaterThan(0);
    },
  );
});

// Review-bevindingen B1 en I1: omzeilingen via env -S, git-aliassen en xargs.
describe('omzeilingen B1/I1', () => {
  const MERGE_ALL_ROLES = [
    "env -S'gh pr merge 1'",
    'env -Sgh pr merge 1',
    "env --split-string='gh pr merge 1'",
    "git -c 'alias.x=!gh pr merge 1' x",
    "git config alias.x '!gh pr merge 1'",
  ];

  test.each(MERGE_ALL_ROLES)('geweigerd voor hoofdsessie en developer: %s', (command) => {
    expect(run(command).deny.length).toBeGreaterThan(0);
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });

  test.each([
    "env -S'gh pr create --title x --body y'",
    "env -S'gh api -X POST repos/o/r/issues'",
    "git -c 'alias.x=!gh pr create --title x' x",
    "git -c 'alias.x=!gh api -X POST repos/o/r/issues' x",
    "git config alias.x '!gh pr create --title x'",
    "git config alias.x '!gh api -X POST repos/o/r/issues'",
    'git --config-env=alias.x=FOO x',
  ])('geweigerd voor subagent developer: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });

  test.each(['xargs -a args.txt gh', 'cat f | xargs gh', 'xargs gh < f'])(
    'xargs met gh geweigerd voor hoofdsessie en developer: %s',
    (command) => {
      expect(run(command).deny.length).toBeGreaterThan(0);
      expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    },
  );

  test.each(['git -c core.quotepath=false log', 'env FOO=1 pnpm lint'])('hoofdsessie kan nog: %s', (command) => {
    expect(run(command).deny).toEqual([]);
  });

  test('reviewer kan nog: gh pr view 1 --json state', () => {
    expect(run('gh pr view 1 --json state', 'reviewer').deny).toEqual([]);
  });
});

describe('omzeilingen ronde 2', () => {
  test.each([
    "env -u X -vS'gh pr create --title x --body y'",
    "env -u X -S'gh api -X POST repos/o/r/issues'",
    "env -C . -S'\\_gh pr create --title x'",
    "env --unset=X -S'gh pr create --title x'",
    "env --chdir . -S'gh pr create --title x'",
  ])('env optie-met-waarde voor -S geweigerd voor developer: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });

  test('env -u X -vS review --approve geweigerd voor hoofdsessie en developer', () => {
    const command = "env -u X -vS'gh pr review 1 --approve'";
    expect(run(command).deny.length).toBeGreaterThan(0);
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });

  test('env -u X -S gate-label geweigerd voor hoofdsessie', () => {
    expect(run("env -u X -S'gh pr edit 1 --add-label gate-wijziging'").deny.length).toBeGreaterThan(0);
  });

  test.each([
    'xargs -a args.txt env gh',
    'xargs -a args.txt command gh',
    'xargs -a args.txt nice gh',
    'xargs -a args.txt timeout 9 gh',
    'xargs -a args.txt /usr/bin/env gh',
    'xargs -a args.txt git',
    'cat f | xargs sh',
    String.raw`find . -exec env gh pr view 1 \;`,
  ])('xargs/find met omhulsel of git geweigerd voor hoofdsessie en developer: %s', (command) => {
    expect(run(command).deny.length).toBeGreaterThan(0);
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });

  test.each([
    'env -u X pnpm lint',
    'xargs -a files.txt prettier --check',
    "find . -name '*.ts' -exec grep -l foo {} +",
    'git config --get alias.st',
  ])('hoofdsessie kan nog: %s', (command) => {
    expect(run(command).deny).toEqual([]);
  });
});

describe('omzeilingen ronde 3', () => {
  test.each([
    'env -i gh pr review 1 -ab ok',
    'env -i gh pr review 1 -aR o/r',
    'setsid gh pr review 1 -ab ok',
    'timeout 9 gh pr review 1 -aF body.txt',
    'env -i gh pr review 1 --comment -b ok',
  ])('gh pr review via omhulsel geweigerd voor hoofdsessie: %s', (command) => {
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  test('hoofdsessie kan nog: gh pr view 1 --json reviews', () => {
    expect(run('gh pr view 1 --json reviews').deny).toEqual([]);
  });
});

describe('omzeilingen ronde 4: leeg woord vóór de gh-groep', () => {
  test.each([
    'gh "" api -X POST repos/o/r/statuses/abc -f state=success -f context=ci',
    'gh "" alias import a.yml',
    'gh "" m 1',
    'gh "" api graphql -F query=@q.graphql',
    "gh '' '' pr review 1 --comment -b x",
    'gh "" pr edit 1 --add-label gate-wijziging',
  ])('gh met leeg woord geweigerd voor hoofdsessie en developer: %s', (command) => {
    expect(run(command).deny.length).toBeGreaterThan(0);
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });

  test.each(['gh pr view 1 --json state', 'gh "" pr view 1'])('hoofdsessie kan nog: %s', (command) => {
    expect(run(command).deny).toEqual([]);
  });
});

// rolhek-vooraf-krimp/AC-10 (ADR 0083 punt 3, leerpunten #583 en #587): vangnetten per segment, alleen op woorden die de shell
// echt expandeert. Elk doorgelaten geval hieronder faalt op de vangnetten die het hele commando of aangehaalde woorden toetsen.
describe('AC-10: vangnetten per segment', () => {
  const ROLES: (string | undefined)[] = [undefined, ...SUBAGENTS];
  const doorgelaten = (command: string, roles: readonly (string | undefined)[] = ROLES) => {
    for (const role of roles) {
      const decision = run(command, role);
      expect({ role, deny: decision.deny, ask: decision.ask }).toEqual({ role, deny: [], ask: [] });
    }
  };

  // (a) Het gh-subcommando staat in een ander segment dan het geëxpandeerde argument (eigenaarsbesluit: voor de hoofdsessie;
  // een kaal `$TMPDIR` telt als letterlijk onder de voorwaarde van (d)). Subagents houden "gh alleen als één direct gh-leescommando".
  test('(a) hoofdsessie: subcommando in ander segment gaat door: ls $HOME | gh run list', () => {
    doorgelaten('ls $HOME | gh run list', [undefined]);
  });

  // Eigenaarbesluit: na `cd $TMPDIR` is de werkmap onbekend (TMPDIR_MAP vervalt); een ask uit AC-3 is toegestaan, een deny niet.
  test.each(['cd $TMPDIR && gh issue list --limit 5', 'cd $TMPDIR; gh pr view 1', 'cd "$TMPDIR" && gh pr view 1'])(
    '(a) hoofdsessie: geen deny en geen melding over een variabel woord naast een gh-subcommando: %s',
    (command) => {
      const decision = run(command);
      expect(decision.deny).toEqual([]);
    },
  );

  test.each(['cd $TMPDIR && gh issue list --limit 5', 'cd $TMPDIR; gh pr view 1', 'ls $HOME | gh run list'])(
    '(a) subagent: geen melding over een variabel woord naast een gh-subcommando: %s',
    (command) => {
      for (const role of SUBAGENTS) {
        expect(
          run(command, role).deny.filter((melding) => melding.includes('variabel woord naast een gh-subcommando')),
        ).toEqual([]);
      }
    },
  );

  test('(a) hoofdsessie: TMPDIR elders toegewezen is niet letterlijk, dus niet volledig doorgelaten', () => {
    const decision = run('TMPDIR=x; cd $TMPDIR && gh issue list');
    expect(decision.deny.length + decision.ask.length).toBeGreaterThan(0);
  });

  // (b) Aangehaald is geen glob, brace-expansie of POSIX-klasse.
  test.each([
    `python3 -c "print(s.get('hooks', {}), {1: 2, 3: 4})"`,
    `gh pr view 1 --json files --jq '.files[] | {path: .path, n: .additions}'`,
    `echo '{a,b}'`,
    `echo "{a,b}"`,
    `echo '{1..3}'`,
    `node -e "console.log({a:1,b:2})"`,
    `echo '[[:alpha:]]'`,
  ])('(b) aangehaald woord is letterlijk: %s', (command) => {
    doorgelaten(command, [undefined, 'developer', 'tester']);
  });

  test.each([`echo '{a,b}'`])('(b) aangehaald woord is letterlijk voor architect en docs: %s', (command) => {
    doorgelaten(command, ['architect', 'docs']);
  });

  // De spec-voorbeelden zelf slagen al op de huidige code (geen komma voor `{`, geen klasse die gh oplevert); ze blijven vastgelegd.
  // Reviewer valt af: die mag alleen `--jq` met waarden uit [A-Za-z0-9_./,:-] (spec rolhek-lezen).
  test.each([`python3 -c "print(s.get('hooks', {}))"`, `gh pr view 1 --json files --jq '.files[].path'`])(
    '(b) spec-voorbeeld blijft doorgelaten: %s',
    (command) => {
      doorgelaten(command, [undefined, 'developer', 'tester']);
    },
  );

  // `$` en backtick tussen dubbele aanhalingstekens blijven tellen.
  test.each([
    'G=gh; "$G" pr merge 1',
    '"$G" pr merge 1',
    'G=gh; "${G}" pr create --title t --body b',
    'echo "`gh pr merge 1`"',
    'echo "$(gh pr merge 1)"',
  ])(
    '(b) $ en backtick tussen dubbele aanhalingstekens blijven geweigerd voor developer en hoofdsessie: %s',
    (command) => {
      expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
      expect(run(command).deny.length).toBeGreaterThan(0);
    },
  );

  // (c) Geen geldige tekenklasse: geen interne fout, het woord telt letterlijk.
  test.each(['echo [z-a]', 'echo a[z-a]b', 'echo g[', 'echo [h', 'echo /usr/bin/g[z-a]h', 'ls x[', 'ls g[z-a]'])(
    '(c) ongeldige klasse is letterlijk, geen interne fout: %s',
    (command) => {
      for (const role of ROLES) expect(() => run(command, role)).not.toThrow();
      doorgelaten(command);
    },
  );

  // (d) `$TMPDIR/` aan het begin van een woord is letterlijk, zolang TMPDIR nergens anders in het commando staat.
  test.each(['ls $TMPDIR/x', 'cat "$TMPDIR/x"', 'cat "$TMPDIR"/x', 'cat $TMPDIR/x pr', 'cat "$TMPDIR/x" run'])(
    '(d) $TMPDIR/ is letterlijk: %s',
    (command) => {
      doorgelaten(command);
    },
  );

  test.each(['TMPDIR=x; cat "$TMPDIR/a" pr', 'export TMPDIR=x && cat $TMPDIR/a run'])(
    '(d) TMPDIR elders toegewezen: niet letterlijk, variabel woord naast subcommando geweigerd voor elke rol: %s',
    (command) => {
      expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
      expect(run(command).deny.length).toBeGreaterThan(0);
    },
  );

  // (e) Een for-lus waarvan elk segment een EXPANSION_SAFE-programma of git met een GIT_LEZEN-subcommando start.
  test.each([
    'for d in .claude/worktrees/*/; do echo "== $d"; git -C "$d" status -sb; done',
    'for f in docs/*.md; do cat "$f"; done',
    'for d in .claude/worktrees/*/; do git -C "$d" log -1; done',
  ])('(e) for-lus met alleen veilige segmenten: %s', (command) => {
    doorgelaten(command);
  });

  test('(e) for-lus met een schrijvend git-subcommando blijft geweigerd voor een subagent', () => {
    const command = 'for d in .claude/worktrees/*/; do git -C "$d" reset --hard; done';
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });

  // Regressie: wat blijft weigeren.
  test.each([
    'G=gh; $G pr merge 1',
    'x=g; ${x}h pr merge 1',
    '$(echo gh) pr merge 1',
    'g[h] pr merge 1',
    '{g,x}h pr merge 1',
    '[[:alpha:]]h pr merge 1',
  ])('regressie: niet-letterlijk gh blijft geweigerd voor elke rol: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });
  test.each(["env -S'gh pr merge 1'", 'env -Sgh pr merge 1', "env --split-string='gh pr merge 1'"])(
    'regressie: env -S blijft geweigerd voor elke rol: %s',
    (command) => {
      expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
      expect(run(command).deny.length).toBeGreaterThan(0);
    },
  );
  test.each(['echo {a,b}', 'echo {1..3}', 'echo $HOME run', 'echo $HOME pr; echo x'])(
    'regressie: onaangehaalde brace-expansie en variabel woord naast subcommando in hetzelfde segment blijven geweigerd: %s',
    (command) => {
      expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
      expect(run(command).deny.length).toBeGreaterThan(0);
    },
  );

  // Na `cd $TMPDIR` (een vaste map buiten de repo; ctx.root is /repo) blijft het schrijven naar beschermde paden dicht.
  test.each([
    'cd $TMPDIR && cp x /repo/.claude/settings.json',
    'cd $TMPDIR && cd .. && cp x repo/.claude/settings.json',
    'cd $TMPDIR/.. && cp x .claude/settings.json',
    'cd $TMPDIR && rm -rf ..',
    'cd $TMPDIR && cd /repo && cp x .claude/settings.json',
  ])('regressie: na cd $TMPDIR blijft dicht (hoofdsessie ask of deny, subagent deny): %s', (command) => {
    const main = run(command);
    expect(main.deny.length + main.ask.length).toBeGreaterThan(0);
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });

  test('regressie: na cd $TMPDIR blijft schrijven in .git dicht voor elke rol', () => {
    const command = 'cd $TMPDIR && echo x > /repo/.git/config';
    expect(run(command).deny.length).toBeGreaterThan(0);
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });

  test('regressie: (c) een klasse die nog gh oplevert blijft geweigerd', () => {
    const command = 'foo /usr/bin/g[z-ah] pr list';
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Review B1: ANSI-C quoting `$'…'` kent `\'`; een enkele quote daarin sluit het woord niet. Wat daarna onaangehaald staat,
  // blijft brace-expansie of glob, ook zonder letterlijk `gh`. Subagent: deny.
  test.each([
    String.raw`echo $'\'' {g,x}h`,
    String.raw`echo $'a\'b' {g,x}h`,
    String.raw`echo $'\'' /usr/bin/g[h]`,
    String.raw`echo $'\'' g*`,
    String.raw`echo $'\'' g?`,
    String.raw`echo $'\'' [[:alpha:]]h`,
    String.raw`echo $'\'' g{h..h}`,
    String.raw`echo $'x' $'\'' /usr/bin/g[h]`,
    String.raw`echo $(echo "it's") {g,x}h`,
    String.raw`echo "$(echo '"')" {g,x}h`,
    String.raw`echo $(echo $'\'') /usr/bin/g[h]`,
    String.raw`echo "$(echo "a'b")" g*`,
  ])('review B1: ANSI-C- of geneste quotes verbergen geen brace of glob voor een subagent: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });

  // Review B2: een toewijzing van TMPDIR via een builtin met een gequote of ge-escapete naam maakt `cd $TMPDIR` niet bekend.
  test.each([
    String.raw`printf -v 'TMPDIR' %s x; cd $TMPDIR && gh issue list`,
    String.raw`printf -v "TMPDIR" %s x; cd $TMPDIR && gh issue list`,
    String.raw`printf -v TMP\DIR %s x; cd $TMPDIR && gh issue list`,
    String.raw`read "TMPDIR" <<< x; cd $TMPDIR && gh issue list`,
    String.raw`read 'TMPDIR' <<< x; cd $TMPDIR && gh issue list`,
    String.raw`declare T\MPDIR=x; cd $TMPDIR && gh issue list`,
    String.raw`declare 'TMPDIR=x'; cd $TMPDIR && gh issue list`,
    String.raw`export "TMPDIR=x"; cd $TMPDIR && gh issue list`,
    String.raw`typeset T"MP"DIR=x; cd $TMPDIR && gh issue list`,
    String.raw`local TMP''DIR=x; cd $TMPDIR && gh issue list`,
  ])('review B2: indirecte TMPDIR-toewijzing, hoofdsessie ask of deny: %s', (command) => {
    const decision = run(command);
    expect(decision.deny.length + decision.ask.length).toBeGreaterThan(0);
  });

  // Review B3 (eigenaarbesluit): een lus gaat alleen door met echt lezende git, niet met de volledige GIT_LEZEN.
  test.each(['commit -m x', 'add .', 'fetch', 'push', 'config x y', 'branch x', 'remote add x y'])(
    'review B3: lus met git %s gaat voor de hoofdsessie niet volledig door',
    (sub) => {
      const decision = run(`for d in a b; do git -C "$d" ${sub}; done`);
      expect(decision.deny.length + decision.ask.length).toBeGreaterThan(0);
    },
  );

  test.each(['status -sb', 'log -1', 'diff', 'show'])(
    'review B3: lus met git %s blijft doorgelaten voor de hoofdsessie',
    (sub) => {
      doorgelaten(`for d in a b; do git -C "$d" ${sub}; done`, [undefined]);
    },
  );

  test.each([
    'for d in a/*/; do git -c x=y -C "$d" status; done',
    'for d in a/*/; do git --git-dir=x -C "$d" log; done',
    'for d in a/*/; do env echo "$d"; done',
    'for d in a/*/; do /tmp/echo "$d"; done',
  ])('regressie: (e) lus met een onveilig segment geweigerd voor een subagent: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });

  test.each([
    String.raw`unset TMPDIR; cd $TMPDIR && gh issue list`,
    'n=TMP; declare ${n}DIR=x; cd $TMPDIR && gh issue list',
    'for d in a b; do git -C "$d" reflog; done',
    'for d in a b; do git -C "$d" format-patch -1; done',
    'for d in a b; do git -C "$d" ls-remote; done',
  ])('review: hoofdsessie ask of deny: %s', (command) => {
    const decision = run(command);
    expect(decision.deny.length + decision.ask.length).toBeGreaterThan(0);
  });

  test('review: een ongeldige klasse na een escape geeft geen throw', () => {
    const command = String.raw`echo '\ [[:alpha:]]h'`;
    for (const role of ROLES) expect(() => run(command, role)).not.toThrow();
  });

  test('geaccepteerd vals positief (R-ROL-11): een gesplitst woord als "x g"* wordt geweigerd', () => {
    const command = 'echo "x g"*';
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Reviewronde 2, R2-B1: een onaangehaalde backtick met een `'` erin, of een `$(…)` met een `)` tussen aanhalingstekens,
  // brengt de lezer uit de pas; wat daarachter onaangehaald staat, blijft brace of glob. Subagent: deny.
  test.each([
    "echo `echo '` {g,x}h '`",
    "echo `echo '` /usr/bin/g[h] '`",
    "echo `echo '` g* '`",
    "echo `printf '%s' a` x' {g,x}h '",
    String.raw`echo $(echo ')') {g,x}h`,
    String.raw`echo $(echo ')' ) g*`,
    String.raw`echo $(printf '%s' ')') /usr/bin/g[h]`,
    String.raw`echo $(echo "(" ) g*`,
    String.raw`echo $(echo ')') '{x}' {g,x}h '`,
  ])('review R2-B1: backtick of $( ) met quotes verbergt geen brace of glob voor een subagent: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });

  // Besloten gedrag: staat ergens in het commando `$'`, een backtick of `$(`, dan telt geen woord als aangehaald voor de glob- en brace-toetsen.
  test.each([String.raw`echo $(date) '{a,b}'`, String.raw`echo "$(date)" '{a,b}'`])(
    'geaccepteerd vals positief (R-ROL-11): aangehaalde brace naast een substitutie wordt geweigerd voor een subagent: %s',
    (command) => {
      for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
    },
  );

  test("zonder substitutie blijft echo '{a,b}' doorgelaten voor een subagent", () => {
    doorgelaten("echo '{a,b}'", ['developer', 'tester']);
  });

  test.each(['source x; cd $TMPDIR && gh issue list', '. x; cd $TMPDIR && gh issue list'])(
    'review: source of punt maakt de TMPDIR-uitzondering ongeldig (hoofdsessie ask of deny): %s',
    (command) => {
      const decision = run(command);
      expect(decision.deny.length + decision.ask.length).toBeGreaterThan(0);
    },
  );

  test('review: builtin declare met een ge-escapete TMPDIR-naam maakt cd $TMPDIR niet bekend (hoofdsessie ask of deny)', () => {
    const decision = run(String.raw`builtin declare T\MPDIR=x; cd $TMPDIR && gh issue list`);
    expect(decision.deny.length + decision.ask.length).toBeGreaterThan(0);
  });

  // Eigenaarbesluit (b), 6 november 2026: aanhalingstekens tellen alleen als het hele commando geen onzekere constructie bevat
  // (`#`, `${`, `$'`, `$(`, backtick, `\`, newline). Anders telt elk woord als ongequote voor de glob- en brace-toetsen.
  test.each([
    "echo a; # it's\necho {g,x}h\necho x'",
    "true && # it's\necho /usr/bin/g[h]\necho x'",
    "echo a | # it's\ncat g*\necho x'",
    "echo a ; # it's\necho {g,x}h '\necho '",
    'echo "${x#\'x"y\'}" {g,x}h \'',
    'echo "${x#\'x"y\'}" /usr/bin/g[h]',
    'echo /usr/bin/g\\\n* pr',
    'echo /usr/bin/g\\\n[h]',
    'echo {g,\\\nx}h',
  ])('review ronde 3: onzekere constructie maakt aanhalingstekens ongeldig, subagent deny: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });

  test.each([
    "echo '{a,b}'",
    `python3 -c "print(s.get('hooks', {}))"`,
    `gh pr view 1 --json files --jq '.files[] | {path: .path, n: .additions}'`,
  ])('(b) blijft doorgelaten voor hoofdsessie, developer en tester: %s', (command) => {
    doorgelaten(command, [undefined, 'developer', 'tester']);
  });

  test.each(["echo '{a,b}' # x", 'echo "${HOME}" \'{a,b}\''])(
    'geaccepteerd vals positief (R-ROL-11): aangehaalde brace naast een onzekere constructie wordt geweigerd voor een subagent: %s',
    (command) => {
      for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
    },
  );

  // Backslash-newline is een regelvoortzetting, zoals in bash.
  test('regelvoortzetting: ca\\<nl>t x leest als cat en gaat door voor developer en hoofdsessie', () => {
    doorgelaten('ca\\\nt x', [undefined, 'developer']);
  });

  test('regelvoortzetting: g\\<nl>h pr merge 1 leest als gh pr merge en wordt geweigerd voor elke rol', () => {
    const command = 'g\\\nh pr merge 1';
    expect(run(command).deny.length).toBeGreaterThan(0);
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });

  test('regelvoortzetting: git pu\\<nl>sh wordt geweigerd voor een subagent', () => {
    for (const role of SUBAGENTS) expect(run('git pu\\\nsh', role).deny.length).toBeGreaterThan(0);
  });

  // R4-1: `((` (arithmetic command, zonder `$`) telt als onzekere constructie.
  test.each([
    "(( x = 1 )); echo ' ; echo {g,x}h '",
    "(( x = 1 )) && echo it's && echo /usr/bin/g[h] '",
    "(( x = ')' )); echo {g,x}h '",
    '(( x = 1 )); echo "\'" g* \'',
  ])('review R4-1: ((-commando met een quote maakt aanhalingstekens ongeldig, subagent deny: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });

  test("geaccepteerd vals positief (R-ROL-11): (( 1 )); echo '{a,b}' wordt geweigerd voor een subagent", () => {
    for (const role of SUBAGENTS) expect(run("(( 1 )); echo '{a,b}'", role).deny.length).toBeGreaterThan(0);
  });

  // R4-2: een voortzetting als los woord vóór gh maakt het eerste woord leeg en verandert de uitkomst niet.
  test('review R4-2: een losse regelvoortzetting vóór gh geeft voor de hoofdsessie dezelfde uitkomst', () => {
    const zonder = run('gh api repos/o/r/labels -f name=x');
    const met = run('\\\n gh api repos/o/r/labels -f name=x');
    expect(met.deny).toEqual(zonder.deny);
    expect(met.ask).toEqual(zonder.ask);
  });

  // Codex P1-1: een lusvariabele kan een git- of programma-optie worden (`--output=docs/framework.md`, `-rf`, een glob).
  test('Codex P1-1: lus met een optiewaarde als git-argument: subagent deny, hoofdsessie ask of deny', () => {
    const command = 'for d in --output=docs/framework.md; do git diff "$d"; done';
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
    const main = run(command);
    expect(main.deny.length + main.ask.length).toBeGreaterThan(0);
  });

  test.each([
    'for f in -rf; do rm "$f" x; done',
    'for d in *; do git diff "$d"; done',
    'for d in $X; do git log "$d"; done',
  ])('Codex P1-1: lus met onzekere waarde gaat niet volledig door (hoofdsessie ask of deny): %s', (command) => {
    const main = run(command);
    expect(main.deny.length + main.ask.length).toBeGreaterThan(0);
  });

  test.each([
    'for d in .claude/worktrees/*/; do git -C "$d" status -sb; done',
    'for f in docs/*.md; do cat "$f"; done',
  ])('Codex P1-1: lus met een veilig voorvoegsel blijft doorgelaten: %s', (command) => {
    doorgelaten(command, [undefined, 'developer']);
  });

  // Codex P1-2: de checkout kan onder TMPDIR staan; na `cd $TMPDIR` is de werkmap onbekend.
  test.each([
    'cd "$TMPDIR/repo/.claude" && cp /tmp/payload settings.json',
    'cd "$TMPDIR/repo/.git" && cp /tmp/payload config',
  ])('Codex P1-2: checkout onder TMPDIR, schrijven na cd gaat voor geen rol volledig door: %s', (command) => {
    const tmpCtx = { ...ctx, root: '/tmp/repo', cwd: '/tmp/repo' };
    for (const role of [undefined, ...SUBAGENTS]) {
      const decision = decide(
        { tool_name: 'Bash', tool_input: { command }, ...(role === undefined ? {} : { agent_type: role }) },
        tmpCtx,
      );
      expect({ role, dicht: decision.deny.length + decision.ask.length > 0 }).toEqual({ role, dicht: true });
    }
  });
});
