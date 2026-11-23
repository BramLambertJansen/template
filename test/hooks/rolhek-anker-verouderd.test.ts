import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import * as authority from '../../rails/hooks/lib/runner-authority.mjs';

// Leerpunt #888: het rolhek weigert `pnpm pr:resolve|merge|log` terecht als het anker achterloopt na een merge op main,
// maar de melding (alleen `script.basis`) is dan onbegrijpelijk. Besluit van de eigenaar: blijf weigeren, leg het uit.
// Tests vóór de fix: `ankerVerouderd(root, basis)` in runner-authority.mjs en het ctx-veld `ankerVerouderd` in rolhek.mjs.
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const HINT = 'het anker loopt achter op origin/main';
const RESOLVE = 'pnpm pr:resolve 860';
const MERGE = 'pnpm pr:merge 860';

interface Opties {
  agent?: string;
  kitTrusted?: boolean;
  mergeTrusted?: boolean;
  ankerVerouderd?: boolean | (() => boolean);
}

function beslis(command: string, opties: Opties = {}) {
  const ctx = {
    root: '/repo',
    cwd: '/repo',
    config,
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
    kitTrusted: opties.kitTrusted ?? true,
    mergeTrusted: opties.mergeTrusted ?? true,
  };
  if (opties.ankerVerouderd !== undefined) Object.assign(ctx, { ankerVerouderd: opties.ankerVerouderd });
  return decide({ tool_name: 'Bash', tool_input: { command }, agent_type: opties.agent ?? '' }, ctx);
}

describe('anker-verouderd: de melding van het rolhek', () => {
  test('pr:resolve, niet vertrouwd, anker verouderd: deny met de hint, nooit allow', () => {
    const decision = beslis(RESOLVE, { kitTrusted: false, mergeTrusted: false, ankerVerouderd: true });
    const tekst = decision.deny.join('; ');
    expect(tekst).toContain(HINT);
    expect(tekst).toContain('nieuwe sessie');
    expect(tekst).toContain('/clear');
    expect(decision.allow).not.toBe(true);
  });

  test('pr:resolve, niet vertrouwd, ankerVerouderd false: deny zonder hint', () => {
    const decision = beslis(RESOLVE, { kitTrusted: false, mergeTrusted: false, ankerVerouderd: false });
    expect(decision.deny.length).toBeGreaterThan(0);
    expect(decision.deny.join('; ')).not.toContain(HINT);
    expect(decision.allow).not.toBe(true);
  });

  test('pr:resolve, niet vertrouwd, zonder het veld: deny zonder hint', () => {
    const decision = beslis(RESOLVE, { kitTrusted: false, mergeTrusted: false });
    expect(decision.deny.length).toBeGreaterThan(0);
    expect(decision.deny.join('; ')).not.toContain(HINT);
    expect(decision.allow).not.toBe(true);
  });

  test('pr:merge, niet vertrouwd, anker verouderd: dezelfde hint', () => {
    const decision = beslis(MERGE, { mergeTrusted: false, ankerVerouderd: true });
    const tekst = decision.deny.join('; ');
    expect(tekst).toContain(HINT);
    expect(tekst).toContain('nieuwe sessie');
    expect(tekst).toContain('/clear');
    expect(decision.allow).not.toBe(true);
  });

  test('ankerVerouderd als functie die true geeft: ook de hint', () => {
    const decision = beslis(RESOLVE, { kitTrusted: false, mergeTrusted: false, ankerVerouderd: () => true });
    expect(decision.deny.join('; ')).toContain(HINT);
    expect(decision.allow).not.toBe(true);
  });

  test('een developer krijgt geen hint: dat blijft de subagent-weigering', () => {
    const decision = beslis(RESOLVE, {
      agent: 'developer',
      kitTrusted: false,
      mergeTrusted: false,
      ankerVerouderd: true,
    });
    expect(decision.deny.join('; ')).toContain('Gesprekken sluiten via pnpm pr:resolve doet alleen de hoofdsessie');
    expect(decision.deny.join('; ')).not.toContain(HINT);
  });
});

describe('anker-verouderd: ankerVerouderd(root, basis) tegen echte git', () => {
  const GIT_ENV = {
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
  };
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function git(cwd: string, ...args: string[]): string {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  }

  function schrijf(root: string, rel: string, tekst: string) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), tekst);
  }

  function commit(root: string, rel: string, inhoud: { tekst: string; bericht: string }): string {
    const { tekst, bericht } = inhoud;
    schrijf(root, rel, tekst);
    git(root, 'add', '--', rel);
    git(root, 'commit', '-q', '-m', bericht);
    return git(root, 'rev-parse', 'HEAD');
  }

  /** Commit A op main met scripts/x.mjs en package.json; geeft root en sha van A. */
  function repoMetA() {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'anker-verouderd-')));
    dirs.push(root);
    git(root, 'init', '-q', '-b', 'main');
    schrijf(root, 'scripts/x.mjs', 'a\n');
    schrijf(root, 'package.json', '{}\n');
    git(root, 'add', '--', 'scripts/x.mjs', 'package.json');
    git(root, 'commit', '-q', '-m', 'A');
    return { root, a: git(root, 'rev-parse', 'HEAD') };
  }

  function origin(root: string, sha: string) {
    git(root, 'update-ref', 'refs/remotes/origin/main', sha);
  }

  function verouderd(root: string, basis: { sha: string } | null): unknown {
    expect(authority).toHaveProperty('ankerVerouderd');
    const functie: unknown = Reflect.get(authority, 'ankerVerouderd');
    expect(typeof functie, 'ankerVerouderd is een functie').toBe('function');
    return typeof functie === 'function' ? Reflect.apply(functie, authority, [root, basis]) : null;
  }

  test('anker A, origin/main B (wijzigt scripts), HEAD B, schone werkmap: true', () => {
    const { root, a } = repoMetA();
    const b = commit(root, 'scripts/x.mjs', { tekst: 'b\n', bericht: 'B' });
    origin(root, b);
    expect(verouderd(root, { sha: a })).toBe(true);
  });

  test('anker A, origin/main A: false (het anker loopt niet achter)', () => {
    const { root, a } = repoMetA();
    commit(root, 'scripts/x.mjs', { tekst: 'b\n', bericht: 'B' });
    origin(root, a);
    expect(verouderd(root, { sha: a })).toBe(false);
  });

  test('anker A, origin/main B, HEAD B met lokale ongecommitte wijziging in scripts: false', () => {
    const { root, a } = repoMetA();
    const b = commit(root, 'scripts/x.mjs', { tekst: 'b\n', bericht: 'B' });
    origin(root, b);
    schrijf(root, 'scripts/x.mjs', 'lokaal\n');
    expect(verouderd(root, { sha: a })).toBe(false);
  });

  test('anker A, origin/main B, HEAD een branch op B met een eigen commit in rails: false', () => {
    const { root, a } = repoMetA();
    const b = commit(root, 'scripts/x.mjs', { tekst: 'b\n', bericht: 'B' });
    origin(root, b);
    git(root, 'checkout', '-q', '-b', 'feat/eigen');
    commit(root, 'rails/y.mjs', { tekst: 'y\n', bericht: 'eigen' });
    expect(verouderd(root, { sha: a })).toBe(false);
  });

  test('basis null: false', () => {
    const { root } = repoMetA();
    const b = commit(root, 'scripts/x.mjs', { tekst: 'b\n', bericht: 'B' });
    origin(root, b);
    expect(verouderd(root, null)).toBe(false);
  });
});
