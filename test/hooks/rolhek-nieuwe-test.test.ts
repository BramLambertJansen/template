import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import * as context from '../../rails/hooks/lib/rolhek-context.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// Leerpunt #887: een testbestand is pas "bestaand" als het op origin/main staat (ctx.bestaand), niet zodra het op schijf staat.
// Een nieuw, nog niet gemergd testbestand mag de developer dus bewerken en verwijderen, ook als het al op de branch is gecommit.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const PAD = 'test/scripts/x.test.ts';
const FILES: Record<string, string> = { [PAD]: "test('a', () => {});\ntest('b', () => {});\n" };

type Committed = boolean | 'zonder-origin';

function beslis(payload: unknown, committed: Committed) {
  return decide(payload, {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => FILES[rel] ?? null,
    committed: () => false,
    bestaand: () => committed,
    isDir: () => false,
    branch: 'feat/x',
  });
}

const alleMeldingen = (d: ReturnType<typeof decide>) => [...d.deny, ...d.ask, ...d.context];
const bestaandeTest = (d: ReturnType<typeof decide>) => alleMeldingen(d).filter((m) => m.includes('bestaande test'));

const edit = (agent?: string) => ({
  tool_name: 'Edit',
  tool_input: {
    file_path: `${ROOT}/${PAD}`,
    old_string: "test('a', () => {});",
    new_string: "test('a', () => { expect(1).toBe(1); });",
  },
  ...(agent === undefined ? {} : { agent_type: agent }),
});
const write = (agent?: string) => ({
  tool_name: 'Write',
  tool_input: {
    file_path: `${ROOT}/${PAD}`,
    content: "test('a', () => {});\ntest('b', () => {});\ntest('c', () => {});\n",
  },
  ...(agent === undefined ? {} : { agent_type: agent }),
});
const rm = (agent?: string) => ({
  tool_name: 'Bash',
  tool_input: { command: `rm ${PAD}` },
  ...(agent === undefined ? {} : { agent_type: agent }),
});

describe('nieuw testbestand (niet op origin/main): developer mag bewerken en verwijderen', () => {
  test('developer Edit op nieuw testbestand: geen "bestaande test"', () => {
    expect(bestaandeTest(beslis(edit('developer'), false))).toEqual([]);
    expect(beslis(edit('developer'), false).deny).toEqual([]);
  });

  test('developer Write op nieuw testbestand: geen "bestaande test"', () => {
    expect(bestaandeTest(beslis(write('developer'), false))).toEqual([]);
    expect(beslis(write('developer'), false).deny).toEqual([]);
  });

  test('developer rm op nieuw testbestand: geen deny of ask over een bestaande test', () => {
    const d = beslis(rm('developer'), false);
    expect(bestaandeTest(d)).toEqual([]);
    expect(d.deny).toEqual([]);
    expect(d.ask).toEqual([]);
  });

  test('hoofdsessie Edit op nieuw testbestand: geen context "is een bestaande test"', () => {
    expect(bestaandeTest(beslis(edit(), false))).toEqual([]);
  });
});

const BESTAAND: { naam: string; committed: Committed }[] = [
  { naam: 'op origin/main (true)', committed: true },
  { naam: 'zonder origin (faalt dicht)', committed: 'zonder-origin' },
];

describe.each(BESTAAND)('bestaand testbestand $naam: developer blijft vergrendeld', ({ committed }) => {
  test('developer Edit blijft een deny met "is een bestaande test"', () => {
    const d = beslis(edit('developer'), committed);
    expect(d.deny.some((m) => m.includes('is een bestaande test'))).toBe(true);
  });

  test('developer rm blijft een gate (verwijderen alleen met akkoord van de eigenaar)', () => {
    const d = beslis(rm('developer'), committed);
    const gates = [...d.deny, ...d.ask];
    expect(gates.some((m) => m.includes('verwijderen alleen met akkoord van de eigenaar'))).toBe(true);
  });
});

// Spec rolhek-leerpunten/AC-10 (#960): bij `bestaand` 'zonder-origin' wijst de weigering naar `git fetch origin`.
describe('rolhek-leerpunten/AC-10 de weigering zonder origin noemt git fetch origin', () => {
  const FETCHTEKST =
    '; (origin/main en het anker onleesbaar, daarom telt elk testbestand als bestaand: draai git fetch origin) (spec rolhek-leerpunten/AC-10)';
  const NIEUW_PAD = `${ROOT}/test/x/nieuw.test.ts`;
  const editNieuw = {
    tool_name: 'Edit',
    tool_input: { file_path: NIEUW_PAD, old_string: 'a', new_string: 'b' },
    agent_type: 'developer',
  };
  const beslisNieuw = (bestaand: Committed) =>
    decide(editNieuw, {
      root: ROOT,
      cwd: ROOT,
      config,
      read: () => 'a',
      committed: () => false,
      bestaand: () => bestaand,
      isDir: () => false,
      branch: 'feat/x',
    });

  test('rolhek-leerpunten/AC-10 zonder-origin: deny met "is een bestaande test" en de fetchtekst erachter', () => {
    const deny = beslisNieuw('zonder-origin').deny.join('\n');
    expect(deny).toContain('is een bestaande test');
    expect(deny).toContain(FETCHTEKST);
  });

  test('rolhek-leerpunten/AC-10 regressie: bestaand false geeft geen "is een bestaande test"', () => {
    expect(bestaandeTest(beslisNieuw(false))).toEqual([]);
  });

  test('rolhek-leerpunten/AC-10 regressie: bestaand true blijft een deny, zonder de fetchtekst', () => {
    const deny = beslisNieuw(true).deny.join('\n');
    expect(deny).toContain('is een bestaande test');
    expect(deny).not.toContain('git fetch origin');
  });
});

describe('ctx zonder bestaand en fixtures', () => {
  test('een ctx zonder `bestaand` houdt elk testbestand op schijf vergrendeld (faalt dicht)', () => {
    const d = decide(edit('developer'), {
      root: ROOT,
      cwd: ROOT,
      config,
      read: (rel: string) => FILES[rel] ?? null,
      committed: () => false,
      isDir: () => false,
      branch: 'feat/x',
    });
    expect(d.deny.some((m) => m.includes('is een bestaande test'))).toBe(true);
  });

  const FIXTURE = 'test/rails/fixtures/x/a.json';
  const fixtureWrite = {
    tool_name: 'Write',
    tool_input: { file_path: `${ROOT}/${FIXTURE}`, content: '{}\n' },
    agent_type: 'developer',
  };
  const fixtureCtx = (bestaand: Committed) => ({
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => (rel === FIXTURE ? '[]\n' : null),
    committed: () => false,
    bestaand: () => bestaand,
    isDir: () => false,
    branch: 'feat/x',
  });
  const vergrendeld = (d: ReturnType<typeof decide>) =>
    [...d.deny, ...d.ask].some((m) => m.includes('is een fixture of setup'));

  test('een fixture van main blijft vergrendeld; een nieuwe fixture op de branch niet', () => {
    expect(vergrendeld(decide(fixtureWrite, fixtureCtx(true)))).toBe(true);
    expect(vergrendeld(decide(fixtureWrite, fixtureCtx(false)))).toBe(false);
  });
});

// Het echte pad: opMain kijkt in de tip van origin/main of het anker, nooit in HEAD (review #887, B1).
describe('opMain tegen echte git', () => {
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

  function git(cwd: string, ...args: string[]) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  }

  function schrijf(root: string, rel: string) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), "test('a', () => {});\n");
    git(root, 'add', '--', rel);
    git(root, 'commit', '-q', '-m', rel);
  }

  // De export is nieuw: eerst toetsen dat hij er is, zodat de basis op een assertie faalt en niet op laden (leerpunt #892).
  function opMain(root: string, basis: string | null): (rel: string) => unknown {
    expect(context).toHaveProperty('opMain');
    const functie: unknown = Reflect.get(context, 'opMain');
    if (typeof functie !== 'function') throw new Error('opMain is geen functie');
    const toets: unknown = Reflect.apply(functie, undefined, [root, basis]);
    if (typeof toets !== 'function') throw new Error('opMain geeft geen functie');
    return (rel) => {
      const uitkomst: unknown = Reflect.apply(toets, undefined, [rel]);
      return uitkomst;
    };
  }

  /** main met test/a.test.ts (desgewenst ook als origin/main), daarna branch feat met test/b.test.ts. */
  function repo(origin: boolean) {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'rolhek-opmain-')));
    dirs.push(root);
    git(root, 'init', '-q', '-b', 'main');
    schrijf(root, 'test/a.test.ts');
    const main = git(root, 'rev-parse', 'HEAD');
    if (origin) git(root, 'update-ref', 'refs/remotes/origin/main', main);
    git(root, 'switch', '-q', '-c', 'feat');
    schrijf(root, 'test/b.test.ts');
    return { root, main };
  }

  test('een test van origin/main is bestaand, een test die alleen op de branch is gecommit niet', () => {
    const { root } = repo(true);
    const bestaand = opMain(root, null);
    expect(bestaand('test/a.test.ts')).toBe(true);
    expect(bestaand('test/b.test.ts')).toBe(false);
  });

  test('HEAD verzetten (checkout --orphan) maakt een test van main niet nieuw', () => {
    const { root } = repo(true);
    git(root, 'checkout', '-q', '--orphan', 'tmp');
    expect(opMain(root, null)('test/a.test.ts')).toBe(true);
  });

  test('zonder origin telt het anker; zonder beide is het zonder-origin, ook voor een nieuw bestand', () => {
    const { root, main } = repo(false);
    expect(opMain(root, main)('test/a.test.ts')).toBe(true);
    expect(opMain(root, main)('test/b.test.ts')).toBe(false);
    expect(opMain(root, null)('test/b.test.ts')).toBe('zonder-origin');
    expect(opMain(root, null)('test/nieuw.test.ts')).toBe('zonder-origin');
  });
});
