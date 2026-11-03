import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { MERGE_FILES, trustedMerge } from '../../rails/hooks/lib/runner-authority.mjs';

// ADR 0069 punt 4, spec agent-merge-niet-kritiek AC-4: alleen de hoofdsessie, alleen `pnpm pr:merge <nr>`, en zonder prompt
// alleen met modus `niet-kritiek` in het anker en ongewijzigde scripts, rails en hostbestanden. Andere merge-routes blijven dicht.
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

function verdict(command: string, opties: { agent?: string; vertrouwd?: boolean; cwd?: string } = {}) {
  const decision = decide(
    { tool_name: 'Bash', tool_input: { command }, agent_type: opties.agent ?? '' },
    {
      root: '/repo',
      cwd: opties.cwd ?? '/repo',
      config,
      read: () => null,
      committed: () => false,
      isDir: () => false,
      branch: 'feat/x',
      mergeTrusted: opties.vertrouwd ?? true,
    },
  );
  if (decision.deny.length > 0) return { uitslag: 'deny', reden: decision.deny.join('; ') };
  if (decision.ask.length > 0) return { uitslag: 'ask', reden: decision.ask.join('; ') };
  return { uitslag: decision.allow === true ? 'allow' : 'context', reden: '' };
}

describe('agent-merge-niet-kritiek/AC-4 rolhek op pnpm pr:merge', () => {
  test.each(['pnpm pr:merge 12', 'pnpm run pr:merge 445', '  pnpm  pr:merge 7 '])(
    'hoofdsessie, vertrouwd: allow (%s)',
    (command) => {
      expect(verdict(command).uitslag).toBe('allow');
    },
  );

  test('hoofdsessie, niet vertrouwd (modus of bestanden wijken af): deny met de reden', () => {
    expect(verdict('pnpm pr:merge 12', { vertrouwd: false })).toEqual({
      uitslag: 'deny',
      reden: expect.stringMatching(/hostbestanden \(package\.json, \.npmrc/),
    });
  });

  test('buiten de repo-root: deny', () => {
    expect(verdict('pnpm pr:merge 12', { cwd: '/repo/src' }).uitslag).toBe('deny');
  });

  test.each(['developer', 'tester', 'architect', 'reviewer', 'docs', 'onbekend'])(
    'subagent %s: altijd deny',
    (agent) => {
      expect(verdict('pnpm pr:merge 12', { agent })).toEqual({
        uitslag: 'deny',
        reden: expect.stringMatching(/hoofdsessie|lezen|niet/),
      });
    },
  );

  test.each([
    'node scripts/kit/pr-merge.mjs 12',
    'pnpm pr:merge 12 && echo klaar',
    'pnpm pr:merge 12 --force',
    'npm run pr:merge 12',
    'pnpm pr:merge 012',
    'pnpm pr:merge $(echo 12)',
    'env X=1 node scripts/kit/pr-merge.mjs 12',
  ])('andere vorm: deny (%s)', (command) => {
    expect(verdict(command).uitslag).toBe('deny');
  });

  test.each(['gh pr merge 12 --squash', 'gh api -X PUT repos/o/r/pulls/12/merge', 'gh pr merge 12 --auto'])(
    'andere merge-routes blijven voor de hoofdsessie dicht (%s)',
    (command) => {
      expect(verdict(command).uitslag).toBe('deny');
    },
  );

  test.each(['cat scripts/kit/pr-merge.mjs', 'git log -- scripts/kit/pr-merge.mjs'])(
    'lezen blijft vrij (%s)',
    (command) => {
      expect(verdict(command).uitslag).not.toBe('deny');
    },
  );

  test('settings.json: deny voor gh pr merge, ask en sandbox-uitzondering voor pnpm pr:merge, niet in allow', () => {
    const settings: { permissions: Record<string, string[]>; sandbox: { excludedCommands: string[] } } = JSON.parse(
      readFileSync('.claude/settings.json', 'utf8'),
    );
    expect(settings.permissions['deny']).toEqual(
      expect.arrayContaining(['Bash(gh pr merge*)', 'Bash(gh api *merge*)']),
    );
    expect(settings.permissions['ask']).toContain('Bash(pnpm pr:merge *)');
    expect(settings.sandbox.excludedCommands).toContain('pnpm pr:merge *');
    expect(settings.permissions['allow']?.some((regel) => regel.includes('pr:merge'))).toBe(false);
  });
});

// trustedMerge op een echte git-fixture: anker = main, branch eraf.
const ROOTS: string[] = [];
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Merge test',
  GIT_AUTHOR_EMAIL: 'merge@example.test',
  GIT_COMMITTER_NAME: 'Merge test',
  GIT_COMMITTER_EMAIL: 'merge@example.test',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

afterEach(() => {
  for (const root of ROOTS.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root: string, args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } }).trim();
}

function write(root: string, file: string, text: string) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

function fixture(modus = 'niet-kritiek') {
  const root = mkdtempSync(path.join(tmpdir(), 'pr-merge-'));
  ROOTS.push(root);
  git(root, ['init', '-q', '-b', 'main']);
  const gates = JSON.stringify({ merge: modus });
  write(root, '.claude/gates.json', gates);
  write(root, 'package.json', '{"scripts":{"pr:merge":"node scripts/kit/pr-merge.mjs"}}\n');
  write(root, '.npmrc', '# fixture\n');
  write(root, 'scripts/kit/pr-merge.mjs', '// fixture; nooit uitvoeren\n');
  write(root, 'rails/hooks/lib/x.mjs', '// fixture\n');
  write(root, 'src/web/x.ts', 'export {};\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', 'test: fixture']);
  const sha = git(root, ['rev-parse', 'HEAD']);
  git(root, ['switch', '-q', '-c', 'feat/x']);
  return { root, basis: { sha, read: (rel: string) => (rel === '.claude/gates.json' ? gates : null) } };
}

describe('agent-merge-niet-kritiek/AC-4 trustedMerge', () => {
  test('MERGE_FILES dekt de hostbestanden, scripts en rails', () => {
    expect(MERGE_FILES).toEqual(
      expect.arrayContaining(['package.json', '.npmrc', '.pnpmfile.cjs', 'mise.toml', 'scripts', 'rails']),
    );
  });

  test('ongewijzigd en modus niet-kritiek: vertrouwd; app-code wijzigen mag', () => {
    const { root, basis } = fixture();
    write(root, 'src/web/x.ts', 'export const a = 1;\n');
    git(root, ['commit', '-qam', 'feat: app']);
    expect(trustedMerge(root, basis)).toBe(true);
  });

  test('modus eigenaar of zonder basis: niet vertrouwd', () => {
    const { root, basis } = fixture('eigenaar');
    expect(trustedMerge(root, basis)).toBe(false);
    expect(trustedMerge(root, null)).toBe(false);
  });

  test.each([
    ['package.json', '{"scripts":{"pr:merge":"node x.mjs"}}\n'],
    ['.npmrc', 'node-options=--require ./x.cjs\n'],
    ['scripts/kit/pr-merge.mjs', '// gewijzigd\n'],
    ['rails/hooks/lib/x.mjs', '// gewijzigd\n'],
    ['.pnpmfile.cjs', 'module.exports = {};\n'],
  ])('%s gewijzigd (lokaal of gecommit): niet vertrouwd', (bestand, inhoud) => {
    const lokaal = fixture();
    write(lokaal.root, bestand, inhoud);
    expect(trustedMerge(lokaal.root, lokaal.basis)).toBe(false);
    const gecommit = fixture();
    write(gecommit.root, bestand, inhoud);
    git(gecommit.root, ['add', '.']);
    git(gecommit.root, ['commit', '-q', '-m', 'test: gewijzigd']);
    expect(trustedMerge(gecommit.root, gecommit.basis)).toBe(false);
  });
});
