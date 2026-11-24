import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const CLI = path.resolve(import.meta.dirname, '../../scripts/kit/pr-verify.mjs');
const BRANCH = 'claude/cloud-herstel';
const REPOSITORY = 'example/template';
const ROOTS: string[] = [];
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.test',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.test',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};
const AFWIJKING = 'PR, branch of head wijkt af van de gecontroleerde commit';

interface Fixture {
  root: string;
  bin: string;
  head: string;
}

function git(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function write(root: string, file: string, content: string) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

/**
 * De stub geeft bij de eerste PR-lezing `heads[0]`, bij elke volgende `heads[1]`. Checks bestaan alleen voor
 * `fixture.head` en zijn daar `status`/`conclusion`.
 */
function stubGh(
  fixture: Fixture,
  heads: [string, string],
  check: { status: string; conclusion: string | null } = { status: 'completed', conclusion: 'success' },
) {
  const counter = path.join(fixture.bin, 'pr-lezingen');
  const checks = {
    check_runs: [{ id: 1, name: 'gate:fast', head_sha: fixture.head, ...check, app: { id: 15368 } }],
  };
  const pr = (sha: string) => ({
    number: 329,
    state: 'open',
    merged: false,
    base: { ref: 'main', repo: { full_name: REPOSITORY } },
    head: { repo: { full_name: REPOSITORY }, ref: BRANCH, sha },
  });
  const script = `#!${process.execPath}
import { appendFileSync, readFileSync } from 'node:fs';
const endpoint = process.argv[3] ?? '';
if (endpoint === 'repos/${REPOSITORY}/pulls/329') {
  let eerder = 0;
  try { eerder = readFileSync(${JSON.stringify(counter)}, 'utf8').length; } catch {}
  appendFileSync(${JSON.stringify(counter)}, 'x');
  console.log(JSON.stringify(eerder === 0 ? ${JSON.stringify(pr(heads[0]))} : ${JSON.stringify(pr(heads[1]))}));
} else if (endpoint.startsWith('repos/${REPOSITORY}/commits/${fixture.head}/check-runs')) {
  console.log(${JSON.stringify(JSON.stringify(checks))});
} else {
  process.exitCode = 2;
}
`;
  write(fixture.bin, 'gh', script);
  chmodSync(path.join(fixture.bin, 'gh'), 0o755);
}

function fixture(): Fixture {
  const temp = mkdtempSync(path.join(tmpdir(), 'cloud-werkmap-herstel-cli-'));
  ROOTS.push(temp);
  const root = path.join(temp, 'repo');
  mkdirSync(root);
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'remote.origin.url', `https://github.com/${REPOSITORY}.git`]);
  write(root, '.claude/gates.json', JSON.stringify({ werkmapNegeer: ['.claude/launch.json'] }));
  write(root, '.claude/decisions.json', JSON.stringify({ version: 1, requiredChecks: ['gate:fast'], decisions: [] }));
  write(root, 'README.md', '# basis\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', 'test: basis']);
  const head = git(root, ['rev-parse', 'HEAD']);
  git(root, ['update-ref', 'refs/remotes/origin/main', head]);
  git(root, ['switch', '-q', '-c', BRANCH]);
  const result = { root, head, bin: path.join(temp, 'bin') };
  stubGh(result, [head, head]);
  return result;
}

/** `remote` zet `CLAUDE_CODE_REMOTE` expliciet; `undefined` verwijdert hem uit de omgeving. */
function run(setup: Fixture, remote: 'true' | undefined, args: string[] = ['--zonder-werkmap']) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...GIT_ENV,
    PATH: `${setup.bin}:${process.env['PATH'] ?? ''}`,
  };
  delete env['CLAUDE_CODE_REMOTE'];
  if (remote !== undefined) env['CLAUDE_CODE_REMOTE'] = remote;
  const result = spawnSync(process.execPath, [CLI, '329', ...args], { cwd: setup.root, encoding: 'utf8', env });
  expect(result.error).toBeUndefined();
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: result.stdout + result.stderr };
}

afterEach(() => {
  for (const root of ROOTS.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('pr:verify --zonder-werkmap als subproces', () => {
  test.each([
    { naam: 'groene checks', check: { status: 'completed', conclusion: 'success' } },
    { naam: 'lopende checks', check: { status: 'in_progress', conclusion: null } },
  ])(
    'cloud-werkmap-herstel/AC-8 (a): andere head-SHA bij een latere lezing geeft afwijking en exit 1, $naam',
    ({ check }) => {
      const setup = fixture();
      stubGh(setup, [setup.head, 'f'.repeat(40)], check);

      const result = run(setup, 'true');

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(AFWIJKING);
      expect(result.output).not.toContain('gate:fast: success');
    },
  );

  test('cloud-werkmap-herstel/AC-8 (b): vuile werkmap begint de uitvoer met de kopregel "werkmap niet getoetst"', () => {
    const setup = fixture();
    write(setup.root, 'README.md', 'gewijzigd en niet gecommit\n');
    write(setup.root, 'onbekend.txt', 'ongetrackt\n');

    const result = run(setup, 'true');

    expect(result.status).toBe(0);
    const kopregel = result.stdout.split('\n')[0] ?? '';
    expect(kopregel).toMatch(/^PR #329 · [0-9a-f]{40} .*werkmap niet getoetst/);
    expect(result.stdout).toContain('gate:fast: success');
    expect(result.output).not.toContain('Werkmap bevat blokkerende wijzigingen');
  });

  test('cloud-werkmap-herstel/AC-8 (c): zonder CLAUDE_CODE_REMOTE geeft --zonder-werkmap de cloudmelding en exit 1', () => {
    const setup = fixture();

    const result = run(setup, undefined);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--zonder-werkmap werkt alleen in een cloudsessie (CLAUDE_CODE_REMOTE=true)');
    expect(result.stdout).not.toContain('gate:fast');
  });

  test.each(['niet-een-sha', 'ABCDEF'.repeat(6) + 'ABCD', 'a'.repeat(39)])(
    'cloud-werkmap-herstel/AC-8 (d): head-SHA zonder geldige vorm (%s) eindigt met de bestaande fout en exit 1',
    (ongeldig) => {
      const setup = fixture();
      stubGh(setup, [ongeldig, ongeldig]);

      const result = run(setup, 'true');

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Geen vertrouwde verplichte checks of geldige commit');
      expect(result.stdout).not.toContain('gate:fast');
    },
  );
});
