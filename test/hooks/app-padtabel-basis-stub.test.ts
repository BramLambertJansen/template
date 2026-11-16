import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { rolhekContext } from '../../rails/hooks/lib/rolhek-context.mjs';
import { APP_PAYMENTS } from '../rails/app-padtabel-kit';
import { nieuw } from '../rails/padtabel-kit';

// Spec app-padtabel, Ontwerp "Lezers": een basisobject zonder `readOptional` (oudere aanroepers, teststubs) telt buiten een hook als
// "geen app-bestand"; in een hook valt het rolhek dicht met `geen gecontroleerde .claude/gates.app.json in het anker (ADR 0045)`.
// Hier levert `trustedBase` een basisobject zonder `readOptional`.
vi.mock('../../rails/hooks/lib/authority-context.mjs', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../rails/hooks/lib/authority-context.mjs')>();
  return {
    ...echt,
    trustedBase: (root: string, base: string | undefined) => {
      const basis = echt.trustedBase(root, base);
      return basis === null ? null : { sha: basis.sha, read: basis.read };
    },
  };
});

const APP = '.claude/gates.app.json';
const GATES_TEKST = `${JSON.stringify(nieuw())}\n`;
const dirs: string[] = [];
const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

/** Een repo met origin/main op de eerste commit (gates.json en een app-bestand), github-url en branch feat/x. */
function repoMetApp(): { dir: string; sha: string } {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'app-padtabel-stub-')));
  dirs.push(dir);
  git(dir, 'init', '-q', '-b', 'main');
  for (const [rel, inhoud] of Object.entries({
    '.claude/gates.json': GATES_TEKST,
    [APP]: JSON.stringify(APP_PAYMENTS),
  })) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), inhoud);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'basis');
  const sha = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'update-ref', 'refs/remotes/origin/main', sha);
  git(dir, 'remote', 'add', 'origin', 'https://github.com/acme/app.git');
  git(dir, 'switch', '-q', '-c', 'feat/x');
  return { dir, sha };
}

beforeEach(() => {
  Reflect.deleteProperty(process.env, 'RAILS_ANKER');
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('app-padtabel/AC-8 een basisobject zonder readOptional', () => {
  test('app-padtabel/AC-8: in een hook valt het rolhek dicht met de melding over het anker', () => {
    const { dir, sha } = repoMetApp();
    vi.stubEnv('RAILS_ANKER', sha);

    expect(() => rolhekContext(dir, dir)).toThrow(
      /geen gecontroleerde \.claude\/gates\.app\.json in het anker \(ADR 0045\)/,
    );
  });

  test('app-padtabel/AC-8: buiten een hook telt het app-bestand als afwezig (geen gooi, geen app-rijen)', () => {
    const { dir } = repoMetApp();

    const lijst = rolhekContext(dir, dir).config.voorReview ?? [];

    expect(lijst).toContain('.claude/**');
    expect(lijst).not.toContain('payments/**');
  });
});
