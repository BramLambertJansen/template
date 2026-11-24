import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { rolhekContext } from '../../rails/hooks/lib/rolhek-context.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
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

// Spec rolhek-leerpunten/AC-6: `ctx.lokaleNetwerkvormen` komt uit `CLAUDE_PROJECT_DIR` (de projectmap van de sessie), los van het
// anker en de werkmap; `decide` noemt bij een netwerkvorm-weigering de ontbrekende patronen van de geraakte groep.
const LOKAAL = '.claude/settings.local.json';
const ANKER_LIJST = ['git commit *', 'git push origin HEAD'];
const TEKST6 = 'je lokale .claude/settings.json en settings.local.json missen in sandbox.excludedCommands:';
const STAART6 = 'dus ook deze vorm draait in de sandbox; de eigenaar werkt de hoofdcheckout bij naar main';
const VERWIJZING6 = '(docs/ENVIRONMENT.md, "Grens van de sandbox") (spec rolhek-leerpunten/AC-6)';
const aanhangsel6 = (patronen: string): string => `; ${TEKST6} ${patronen}, ${STAART6} ${VERWIJZING6}`;
const COMMIT_COMMANDO = "printf 'x' > msg.txt && git commit -F msg.txt";

/** Een aparte projectmap (niet de repo) met settings.json en optioneel settings.local.json. */
function projectMet(files: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'netwerkvorm-project-')));
  dirs.push(dir);
  write(dir, files);
  return dir;
}

/** `lokaleNetwerkvormen` uit de ctx; `unknown` omdat het type het veld pas na de bouw kent. */
function lokaal(dir: string): unknown {
  const ctx: object = rolhekContext(dir, dir);
  return Object.entries(ctx).find(([naam]) => naam === 'lokaleNetwerkvormen')?.[1];
}

const gatesConfig = loadConfig(GATES_TEKST);

/** `decide` voor de hoofdsessie met het anker en (optioneel) de lokale lijst; de ctx is een ruimer type dan `Ctx`. */
function beslisHoofdsessie(command: string, lokaleLijst?: readonly string[]) {
  const ctx = {
    root: '/repo',
    cwd: '/repo',
    config: gatesConfig,
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
    mergeTrusted: true,
    kitTrusted: true,
    netwerkvormen: [...ANKER_LIJST],
    ...(lokaleLijst === undefined ? {} : { lokaleNetwerkvormen: [...lokaleLijst] }),
  };
  const besluit = decide({ tool_name: 'Bash', tool_input: { command } }, ctx);
  return { deny: besluit.deny.join('\n') };
}

describe('rolhek-leerpunten/AC-6 rolhekContext leest de lokale lijst uit CLAUDE_PROJECT_DIR', () => {
  beforeEach(() => {
    Reflect.deleteProperty(process.env, 'CLAUDE_PROJECT_DIR');
  });

  test('rolhek-leerpunten/AC-6 zonder CLAUDE_PROJECT_DIR (of leeg) is lokaleNetwerkvormen undefined', () => {
    const { dir } = repoMet({ '.claude/gates.json': GATES_TEKST, [SETTINGS]: settings({ excludedCommands: LIJST }) });
    expect(lokaal(dir)).toBeUndefined();
    vi.stubEnv('CLAUDE_PROJECT_DIR', '');
    expect(lokaal(dir)).toBeUndefined();
  });

  test('rolhek-leerpunten/AC-6 met CLAUDE_PROJECT_DIR: de vereniging van settings.json en settings.local.json, zonder dubbelen', () => {
    const { dir } = repoMet({
      '.claude/gates.json': GATES_TEKST,
      [SETTINGS]: settings({ excludedCommands: ['curl *'] }),
    });
    const projectDir = projectMet({
      [SETTINGS]: settings({ excludedCommands: ['git commit *', 'git push origin HEAD'] }),
      [LOKAAL]: settings({ excludedCommands: ['git push origin HEAD', 'gh api *'] }),
    });
    vi.stubEnv('CLAUDE_PROJECT_DIR', projectDir);

    const lijst = lokaal(dir);
    expect(Array.isArray(lijst)).toBe(true);
    expect(lijst).toHaveLength(3);
    expect(lijst).toEqual(expect.arrayContaining(['gh api *', 'git commit *', 'git push origin HEAD']));
  });

  test('rolhek-leerpunten/AC-6 een ontbrekend settings.local.json of ongeldige JSON draagt niets bij en gooit niet', () => {
    const { dir } = repoMet({ '.claude/gates.json': GATES_TEKST, [SETTINGS]: settings({ excludedCommands: LIJST }) });
    vi.stubEnv('CLAUDE_PROJECT_DIR', projectMet({ [SETTINGS]: settings({ excludedCommands: ['git commit *'] }) }));
    expect(lokaal(dir)).toStrictEqual(['git commit *']);

    vi.stubEnv(
      'CLAUDE_PROJECT_DIR',
      projectMet({ [SETTINGS]: settings({ excludedCommands: ['git commit *'] }), [LOKAAL]: '{ dit is geen json\n' }),
    );
    expect(lokaal(dir)).toStrictEqual(['git commit *']);

    vi.stubEnv('CLAUDE_PROJECT_DIR', projectMet({ [SETTINGS]: '{ kapot\n', [LOKAAL]: '[[' }));
    expect(lokaal(dir)).toStrictEqual([]);
  });

  test('rolhek-leerpunten/AC-6 de lokale lijst is los van het anker en de werkmap', () => {
    const { dir, sha } = repoMet({
      '.claude/gates.json': GATES_TEKST,
      [SETTINGS]: settings({ excludedCommands: LIJST }),
    });
    vi.stubEnv('RAILS_ANKER', sha);
    vi.stubEnv('CLAUDE_PROJECT_DIR', projectMet({ [SETTINGS]: settings({ excludedCommands: ['alleen lokaal *'] }) }));

    expect(lokaal(dir)).toStrictEqual(['alleen lokaal *']);
    expect(netwerkvormen(dir)).toStrictEqual(LIJST);
  });
});

describe('rolhek-leerpunten/AC-6 decide noemt de ontbrekende patronen van de geraakte groep', () => {
  beforeEach(() => {
    Reflect.deleteProperty(process.env, 'CLAUDE_PROJECT_DIR');
  });

  test('rolhek-leerpunten/AC-6 ticketrij: lokaal mist git commit *, dan staat de tekst met git commit * achter de weigering', () => {
    const uitslag = beslisHoofdsessie(COMMIT_COMMANDO, ['git push origin HEAD']);
    expect(uitslag.deny).toContain('Netwerkvorm:');
    expect(uitslag.deny).toContain(aanhangsel6('git commit *'));
  });

  test('rolhek-leerpunten/AC-6 een lege lokale lijst noemt alleen de patronen van de geraakte groep (git commit *)', () => {
    const uitslag = beslisHoofdsessie(COMMIT_COMMANDO, []);
    expect(uitslag.deny).toContain(aanhangsel6('git commit *'));
  });

  test('rolhek-leerpunten/AC-6 end-to-end: ctx uit rolhekContext met een projectmap zonder git commit *', () => {
    const { dir } = repoMet({
      '.claude/gates.json': GATES_TEKST,
      [SETTINGS]: settings({ excludedCommands: ANKER_LIJST }),
    });
    vi.stubEnv(
      'CLAUDE_PROJECT_DIR',
      projectMet({ [SETTINGS]: settings({ excludedCommands: ['git push origin HEAD'] }) }),
    );

    const ctx = { ...rolhekContext(dir, dir), mergeTrusted: true, kitTrusted: true };
    const besluit = decide({ tool_name: 'Bash', tool_input: { command: COMMIT_COMMANDO } }, ctx);
    expect(besluit.deny.join('\n')).toContain(aanhangsel6('git commit *'));
  });

  test('rolhek-leerpunten/AC-6 regressie: staat de groep in de lokale lijst, dan geen tekst en nog steeds een weigering', () => {
    const uitslag = beslisHoofdsessie(COMMIT_COMMANDO, ['git commit *', 'git push origin HEAD']);
    expect(uitslag.deny).toContain('Netwerkvorm:');
    expect(uitslag.deny).not.toContain(TEKST6);
  });

  test('rolhek-leerpunten/AC-6 regressie: zonder lokaleNetwerkvormen geen tekst en nog steeds een weigering', () => {
    const uitslag = beslisHoofdsessie(COMMIT_COMMANDO);
    expect(uitslag.deny).toContain('Netwerkvorm:');
    expect(uitslag.deny).not.toContain(TEKST6);
  });

  test('rolhek-leerpunten/AC-6 regressie: settings.json heeft het patroon en settings.local.json ontbreekt, dan geen tekst', () => {
    const { dir } = repoMet({
      '.claude/gates.json': GATES_TEKST,
      [SETTINGS]: settings({ excludedCommands: ANKER_LIJST }),
    });
    vi.stubEnv('CLAUDE_PROJECT_DIR', projectMet({ [SETTINGS]: settings({ excludedCommands: ANKER_LIJST }) }));

    const ctx = { ...rolhekContext(dir, dir), mergeTrusted: true, kitTrusted: true };
    const besluit = decide({ tool_name: 'Bash', tool_input: { command: COMMIT_COMMANDO } }, ctx);
    expect(besluit.deny.join('\n')).toContain('Netwerkvorm:');
    expect(besluit.deny.join('\n')).not.toContain(TEKST6);
  });
});
