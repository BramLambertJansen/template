import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { rolhekContext } from '../../rails/hooks/lib/rolhek-context.mjs';
import { nieuw } from '../rails/padtabel-kit';

// Spec cloud-netwerkvorm/AC-7: `rolhekContext` leest `sandbox.excludedCommands` uit de vertrouwde basis, zoals `gates.json`.
// Gekozen veldnaam in de ctx: `netwerkvormen: string[]` (de patronen, bv. `git push origin HEAD`, `git commit *`); `decide`
// leest hem uit `ctx.netwerkvormen` (rolhek-netwerkvorm.test.ts). Het anker zet een test zoals app-padtabel-anker.test.ts:
// `vi.stubEnv('RAILS_ANKER', <sha>)` op een echte tijdelijke repo; buiten een hook is er geen anker.
const SETTINGS = '.claude/settings.json';
const GATES_TEKST = `${JSON.stringify(nieuw())}\n`;
const LIJST = ['pnpm pr:merge *', 'git commit *', 'git push origin HEAD', 'gh api *'];
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

function write(dir: string, files: Record<string, string>) {
  for (const [rel, inhoud] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), inhoud);
  }
}

/** Een repo met één commit met deze bestanden (branch feat/x); geeft de map en de SHA van die commit. */
function repoMet(files: Record<string, string>): { dir: string; sha: string } {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'netwerkvorm-context-')));
  dirs.push(dir);
  git(dir, 'init', '-q', '-b', 'main');
  write(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'anker');
  git(dir, 'switch', '-q', '-c', 'feat/x');
  return { dir, sha: git(dir, 'rev-parse', 'HEAD') };
}

const settings = (sandbox?: unknown): string => `${JSON.stringify(sandbox === undefined ? {} : { sandbox })}\n`;

/** De ctx-lijst; `unknown` omdat het veld pas bij de bouw in de context komt (het type kent hem nog niet). */
function netwerkvormen(dir: string): unknown {
  const ctx: object = rolhekContext(dir, dir);
  return Object.entries(ctx).find(([naam]) => naam === 'netwerkvormen')?.[1];
}

beforeEach(() => {
  // Buiten een hook is er geen anker; een test die er een wil, zet hem zelf.
  Reflect.deleteProperty(process.env, 'RAILS_ANKER');
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('cloud-netwerkvorm/AC-7 rolhekContext leest sandbox.excludedCommands uit de vertrouwde basis', () => {
  test('cloud-netwerkvorm/AC-7 in een hook (anker): de lijst uit het settingsbestand in het anker', () => {
    const { dir, sha } = repoMet({
      '.claude/gates.json': GATES_TEKST,
      [SETTINGS]: settings({ excludedCommands: LIJST, filesystem: { denyRead: ['~/.ssh'] } }),
    });
    vi.stubEnv('RAILS_ANKER', sha);

    expect(netwerkvormen(dir)).toStrictEqual(LIJST);
  });

  test('cloud-netwerkvorm/AC-7 in een hook wint het anker van een gewijzigde werkmap', () => {
    const { dir, sha } = repoMet({
      '.claude/gates.json': GATES_TEKST,
      [SETTINGS]: settings({ excludedCommands: LIJST }),
    });
    write(dir, { [SETTINGS]: settings({ excludedCommands: ['curl *'] }) });
    vi.stubEnv('RAILS_ANKER', sha);

    expect(netwerkvormen(dir)).toStrictEqual(LIJST);
  });

  // cloud-netwerkvorm OV-8 (R-TEST-02): was "gooit rolhekContext"; een ontbrekend settingsbestand in het anker geeft nu een lege lijst.
  test('cloud-netwerkvorm/AC-7 in een hook zonder .claude/settings.json in het anker geeft rolhekContext een lege lijst, zonder fout', () => {
    const { dir, sha } = repoMet({ '.claude/gates.json': GATES_TEKST, 'README.md': 'x\n' });
    // De werkmap heeft er wel een, maar de hook leest alleen het anker: dat heeft er geen, dus leeg.
    write(dir, { [SETTINGS]: settings({ excludedCommands: LIJST }) });
    vi.stubEnv('RAILS_ANKER', sha);

    expect(netwerkvormen(dir)).toStrictEqual([]);
  });

  test('cloud-netwerkvorm/AC-7 in een hook met een settingsbestand dat geen geldige JSON is gooit rolhekContext', () => {
    const { dir, sha } = repoMet({ '.claude/gates.json': GATES_TEKST, [SETTINGS]: '{ dit is geen json\n' });
    vi.stubEnv('RAILS_ANKER', sha);

    expect(() => rolhekContext(dir, dir)).toThrow(SyntaxError);
  });

  test('cloud-netwerkvorm/AC-7 een geldig settingsbestand zonder excludedCommands geeft een lege lijst, zonder fout', () => {
    const zonderSandbox = repoMet({ '.claude/gates.json': GATES_TEKST, [SETTINGS]: settings() });
    vi.stubEnv('RAILS_ANKER', zonderSandbox.sha);
    expect(netwerkvormen(zonderSandbox.dir)).toStrictEqual([]);

    const zonderLijst = repoMet({
      '.claude/gates.json': GATES_TEKST,
      [SETTINGS]: settings({ filesystem: { denyRead: ['~/.ssh'] } }),
    });
    vi.stubEnv('RAILS_ANKER', zonderLijst.sha);
    expect(netwerkvormen(zonderLijst.dir)).toStrictEqual([]);
  });

  test('cloud-netwerkvorm/AC-7 buiten een hook zonder remote en basis: terugval op de werkmap', () => {
    const { dir } = repoMet({ '.claude/gates.json': GATES_TEKST, README: 'x\n' });
    write(dir, { [SETTINGS]: settings({ excludedCommands: LIJST }) });

    expect(netwerkvormen(dir)).toStrictEqual(LIJST);
  });
});
