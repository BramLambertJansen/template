import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { nacontrole } from '../../rails/hooks/lib/effect-hooks.mjs';
import { gitIn } from '../../rails/hooks/lib/effect-snapshot.mjs';
import { agentOpnamen, legVensterVast, opslag, overtredingen } from '../../rails/hooks/lib/effect.mjs';
import { loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { neemOver } from '../../scripts/kit/rolhek-overnemen.mjs';

// docs/specs/rolhek-effect.md AC-10 (ADR 0083 punt 2, leerpunt #582): de nacontrole is begrensd tot wat de subagent zelf kan
// hebben gedaan. Echte tijdelijke git-repository's met een lokale bare `origin` en gekoppelde worktrees; de hooks draaien als
// proces met dezelfde payload als Claude Code. Zonder `inKooi`: wat de commando's schrijven, blijft binnen de tijdelijke mappen.
const GATES = readFileSync('.claude/gates.json', 'utf8');
const config = loadConfig(GATES);
const EFFECT = path.resolve('rails/hooks/effect.mjs');
const WERKSTRAAT = path.resolve('rails/hooks/werkstraat.mjs');
const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
};
// De doctor van session-start legt vast wat er bij zijn start al aan vensters stond ("als eerste stap", AC-10 c).
const DOCTOR = '#!/bin/sh\ncat .git/rolhek-effect/vensters.jsonl > .git/doctor-zag 2>/dev/null\nexit 0\n';
const MIN = 90_000;
const dirs: string[] = [];
let teller = 0;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function procEnv(): NodeJS.ProcessEnv {
  const basis = Object.entries(process.env).filter(([naam]) => !naam.startsWith('GIT_') && naam !== 'RAILS_ANKER');
  return { ...Object.fromEntries(basis), ...GIT_ENV };
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: procEnv() });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function schrijf(root: string, rel: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}

/** Schrijft de bestanden en commit ze zonder hook: een "achtergrondproces" of de eigenaar in zijn eigen terminal. */
function commit(root: string, bestanden: Record<string, string>): void {
  for (const [rel, text] of Object.entries(bestanden)) schrijf(root, rel, text);
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'zonder hook');
}

function nieuweDir(naam: string): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), `nacontrole-${naam}-`)));
  dirs.push(dir);
  return dir;
}

type Wereld = { a: string; b: string; bare: string };

/** Eén repository (werkmap `a`, tak main) met een lokale bare `origin` en een gekoppelde worktree `b` (detached). */
function wereld(): Wereld {
  const bare = nieuweDir('bare');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const a = nieuweDir('a');
  git(a, 'init', '-q', '-b', 'main');
  schrijf(a, 'src/a.ts', 'a\nb\n');
  schrijf(a, 'rails/x.mjs', 'x\n');
  schrijf(a, 'test/a.test.ts', "test('een', () => {});\n");
  schrijf(a, '.gitignore', 'node_modules/\n');
  schrijf(a, '.claude/gates.json', GATES);
  schrijf(a, 'scripts/doctor.sh', DOCTOR);
  chmodSync(path.join(a, 'scripts/doctor.sh'), 0o755);
  git(a, 'add', '-A');
  git(a, 'commit', '-qm', 'start');
  git(a, 'remote', 'add', 'origin', bare);
  git(a, 'push', '-q', '-u', 'origin', 'main');
  const b = `${a}-b`;
  dirs.push(b);
  git(a, 'worktree', 'add', '-q', '--detach', b);
  return { a, b, bare };
}

/** Een derde kloon duwt een commit naar de remote: de volgende `git fetch` verschuift `refs/remotes/origin/main`. */
function duwNaRemote(bare: string): void {
  const derde = nieuweDir('derde');
  git(derde, 'clone', '-q', bare, derde);
  schrijf(derde, 'remote.txt', `${String((teller += 1))}\n`);
  git(derde, 'add', '-A');
  git(derde, 'commit', '-qm', 'remote');
  git(derde, 'push', '-q', 'origin', 'main');
}

type Wie = { sessie: string; rol?: 'reviewer' | 'tester' };
const agentId = (wie: Wie): string => `agent-${wie.rol ?? 'hoofd'}-${wie.sessie}`;
const REVIEWER: Wie = { sessie: 'S1', rol: 'reviewer' };
const HOOFD: Wie = { sessie: 'S1' };

function payloadVan(root: string, wie: Wie, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const agent = wie.rol === undefined ? {} : { agent_type: wie.rol, agent_id: agentId(wie) };
  return { cwd: root, session_id: wie.sessie, ...agent, ...extra };
}

/** `node rails/hooks/effect.mjs <event>` als proces; de uitvoer (stdout). */
function hook(root: string, event: string, input: Record<string, unknown>): string {
  const result = spawnSync(process.execPath, [EFFECT, event], {
    cwd: root,
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: procEnv(),
    timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(`effect ${event}: exit ${String(result.status)} ${result.stderr}`);
  return result.stdout;
}

const blok = (stdout: string): string => (stdout.includes('"decision":"block"') ? stdout : '');
const start = (root: string, wie: Wie): string => hook(root, 'subagent-start', payloadVan(root, wie));
const stopAgent = (root: string, wie: Wie): string => hook(root, 'subagent-stop', payloadVan(root, wie));
const stopHoofd = (root: string, sessie: string): string => hook(root, 'stop', { cwd: root, session_id: sessie });

function toolInvoer(root: string, wie: Wie, command: string): Record<string, unknown> {
  return payloadVan(root, wie, {
    tool_name: 'Bash',
    tool_input: { command },
    tool_use_id: `t${String((teller += 1))}`,
  });
}

/** PreToolUse, het commando (`doe` is wat het in de werkmap doet), PostToolUse: de uitvoer van PostToolUse. */
function bash(root: string, wie: Wie, uit: { command: string; doe: () => void }): string {
  const invoer = toolInvoer(root, wie, uit.command);
  hook(root, 'pre', invoer);
  uit.doe();
  return hook(root, 'post', invoer);
}

/** De uitvoer van PreToolUse van de hoofdsessie van `sessie`: de open overtredingen als context (AC-5). */
const preContext = (root: string, sessie: string): string =>
  hook(root, 'pre', toolInvoer(root, { sessie }, 'git status'));

function sessionStart(root: string, sessie = 'S1'): void {
  const result = spawnSync(process.execPath, [WERKSTRAAT, 'session-start'], {
    cwd: root,
    input: JSON.stringify({ cwd: root, session_id: sessie }),
    encoding: 'utf8',
    env: procEnv(),
    timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(`werkstraat session-start: exit ${String(result.status)} ${result.stderr}`);
}

function repoVan(root: string) {
  const ctx = {
    root,
    cwd: root,
    config,
    read: (rel: string) => (existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), 'utf8') : null),
    committed: () => false,
    isDir: () => false,
    branch: git(root, 'rev-parse', '--abbrev-ref', 'HEAD').trim(),
  };
  return { root, git: gitIn(root), ctx, now: () => Date.now() };
}

/** `pnpm pr:verify` (`verifyEffect`): `nacontrole(repo, null)`, alleen lezen, alle sessies. */
const prVerify = (root: string) => nacontrole({ ...repoVan(root), alleenLezen: true }, null);

const agentMap = (root: string): string => path.join(opslag(repoVan(root)), 'agent');
const vensterBestand = (root: string): string => path.join(opslag(repoVan(root)), 'vensters.jsonl');

function bestanden(map: string): string[] {
  return existsSync(map) ? readdirSync(map).toSorted() : [];
}

function opnameVan(root: string, wie: Wie): unknown {
  const opname: unknown = JSON.parse(readFileSync(path.join(agentMap(root), `${agentId(wie)}.json`), 'utf8'));
  return opname;
}

function veld(waarde: unknown, sleutel: string): unknown {
  if (typeof waarde !== 'object' || waarde === null) return undefined;
  const gevonden = Object.entries(waarde).find(([naam]) => naam === sleutel);
  return gevonden?.[1];
}

function getal(waarde: unknown, sleutel: string): number {
  const gevonden = veld(waarde, sleutel);
  return typeof gevonden === 'number' ? gevonden : Number.NaN;
}

function snapPaden(opname: unknown): string[] {
  const paden = veld(veld(opname, 'snap'), 'paden');
  return typeof paden === 'object' && paden !== null ? Object.keys(paden) : [];
}

/** De commando's van alle hookregels onder één event in `.claude/settings.json`. */
function hookCommands(settings: unknown, event: string): string[] {
  const regels = veld(veld(settings, 'hooks'), event);
  if (!Array.isArray(regels)) return [];
  return regels.flatMap((regel: unknown) => {
    const hooks = veld(regel, 'hooks');
    if (!Array.isArray(hooks)) return [];
    return hooks.flatMap((hookregel: unknown) => {
      const command = veld(hookregel, 'command');
      return typeof command === 'string' ? [command] : [];
    });
  });
}

type Venster = { actor: string; paden: string[] };

function isVenster(waarde: unknown): waarde is Venster {
  return (
    typeof waarde === 'object' &&
    waarde !== null &&
    'actor' in waarde &&
    typeof waarde.actor === 'string' &&
    'paden' in waarde &&
    Array.isArray(waarde.paden)
  );
}

function vensters(bestand: string): Venster[] {
  if (!existsSync(bestand)) return [];
  return readFileSync(bestand, 'utf8')
    .split('\n')
    .filter((regel) => regel !== '')
    .flatMap((regel) => {
      const venster: unknown = JSON.parse(regel);
      return isVenster(venster) ? [venster] : [];
    });
}

/** Een open overtreding die de nacontrole niet zelf zette, rechtstreeks in `overtredingen.json`. */
function zetOvertreding(root: string, overtreding: Record<string, unknown>): void {
  const map = opslag(repoVan(root));
  mkdirSync(map, { recursive: true });
  writeFileSync(path.join(map, 'overtredingen.json'), `${JSON.stringify([overtreding])}\n`);
}

const OUD = {
  rel: 'rails/oud.mjs',
  actor: 'agent-oud',
  rol: 'reviewer',
  commando: '',
  reden: 'buiten je rol',
  voor: null,
};

/** Een reviewer van S1 eindigt in `a`; daarna zet een proces zonder hook een derde ref (de overtreding van AC-10 f). */
function metDerdeRef(): Wereld {
  const w = wereld();
  start(w.a, REVIEWER);
  expect(blok(stopAgent(w.a, REVIEWER))).toBe('');
  git(w.a, 'update-ref', 'refs/heads/derde', 'HEAD');
  return w;
}

describe('rolhek-effect/AC-10: de scenariotest uit de spec (hooks als proces, twee worktrees)', () => {
  test(
    'na een reviewer in A tellen een branch en commit in B, een fetch en het anker niet: Stop en pr:verify geven niets',
    () => {
      const { a, b, bare } = wereld();
      start(a, REVIEWER);
      expect(blok(bash(a, REVIEWER, { command: 'git status', doe: () => git(a, 'status') }))).toBe('');
      expect(blok(stopAgent(a, REVIEWER))).toBe('');

      // De hoofdsessie in B: een branch en een commit, met het venster van de echte hook (pre en post).
      bash(b, HOOFD, {
        command: 'git switch -q -c x && mkdir -p docs && printf n > docs/n.md && git add -A && git commit -qm n',
        doe: () => {
          git(b, 'switch', '-q', '-c', 'x');
          commit(b, { 'docs/n.md': 'n' });
        },
      });

      // Een fetch zonder hook verschuift refs/remotes/origin/main.
      const oud = git(a, 'rev-parse', 'origin/main');
      duwNaRemote(bare);
      git(a, 'fetch', '-q', 'origin');
      expect(git(a, 'rev-parse', 'origin/main')).not.toBe(oud);

      // Het anker (en de cache) ververst de stub-lader vóór de rails-code; session-start legt daarna het venster van `hook`.
      schrijf(a, '.claude/hooks/.cache/anker', 'v2\n');
      sessionStart(a);

      expect(blok(stopHoofd(a, 'S1'))).toBe('');
      expect(prVerify(a)).toStrictEqual([]);
    },
    MIN,
  );
});

describe('rolhek-effect/AC-10: wat wel een overtreding blijft (AC-4)', () => {
  const gevallen: [string, string, (a: string) => void][] = [
    [
      'een proces zonder hook zet een derde ref',
      '.git/refs/heads/derde',
      (a) => git(a, 'update-ref', 'refs/heads/derde', 'HEAD'),
    ],
    [
      'een achtergrondproces van de subagent schrijft ná SubagentStop een werkmappad en commit',
      'rails/x.mjs',
      (a) => {
        commit(a, { 'rails/x.mjs': 'bg' });
      },
    ],
  ];

  test.each(gevallen)(
    '%s: Stop en pr:verify noemen de subagent',
    (_naam, rel, doe) => {
      const { a } = wereld();
      start(a, REVIEWER);
      expect(blok(stopAgent(a, REVIEWER))).toBe('');
      doe(a);
      expect(blok(stopHoofd(a, 'S1'))).toContain(rel);
      expect(prVerify(a)).toContainEqual(expect.objectContaining({ rel, actor: agentId(REVIEWER) }));
    },
    MIN,
  );
});

describe('rolhek-effect/AC-10 (f): alleen de eigen sessie blokkeert, pr:verify toetst alle sessies', () => {
  test(
    'een Stop in een tweede sessie blokkeert niet op een subagent van S1, pr:verify noemt hem wel',
    () => {
      const { a } = metDerdeRef();
      expect(blok(stopHoofd(a, 'S1'))).toContain('derde');
      expect(blok(stopHoofd(a, 'S2'))).toBe('');
      expect(prVerify(a)).toContainEqual(
        expect.objectContaining({ rel: '.git/refs/heads/derde', actor: agentId(REVIEWER) }),
      );
    },
    MIN,
  );

  test(
    'een nieuwe overtreding krijgt het veld `sessie` van de sessie die de subagent startte',
    () => {
      const { a } = metDerdeRef();
      stopHoofd(a, 'S1');
      expect(overtredingen(repoVan(a))).toContainEqual(
        expect.objectContaining({ rel: '.git/refs/heads/derde', sessie: 'S1' }),
      );
    },
    MIN,
  );

  test(
    'de context bij elke tool-aanroep van de hoofdsessie noemt dezelfde selectie: S1 wel, S2 niet',
    () => {
      const { a } = metDerdeRef();
      stopHoofd(a, 'S1');
      expect(preContext(a, 'S1')).toContain('derde');
      expect(preContext(a, 'S2')).not.toContain('derde');
    },
    MIN,
  );

  test(
    'een oude overtreding zonder `sessie`-veld telt voor elke sessie: Stop en context',
    () => {
      const { a } = wereld();
      zetOvertreding(a, OUD);
      expect(blok(stopHoofd(a, 'S2'))).toContain('rails/oud.mjs');
      expect(blok(stopHoofd(a, 'S1'))).toContain('rails/oud.mjs');
      expect(preContext(a, 'S2')).toContain('rails/oud.mjs');
    },
    MIN,
  );

  test(
    'een overtreding van de hoofdsessie zelf blokkeert in haar sessie, niet in een andere',
    () => {
      const { a } = wereld();
      zetOvertreding(a, { ...OUD, rel: 'rails/hoofd.mjs', actor: 'hoofd:S2', rol: 'hoofdsessie', sessie: 'S2' });
      expect(blok(stopHoofd(a, 'S1'))).toBe('');
      expect(blok(stopHoofd(a, 'S2'))).toContain('rails/hoofd.mjs');
    },
    MIN,
  );
});

describe('rolhek-effect/AC-10 (a): SubagentStop vervangt de opname door de staat van dat moment', () => {
  /** SubagentStart, een bestand van de hoofdsessie mét venster, SubagentStop; geeft het moment vlak vóór SubagentStop. */
  function levensloop(a: string): number {
    start(a, REVIEWER);
    bash(a, HOOFD, {
      command: 'printf h > src/h.ts',
      doe: () => {
        schrijf(a, 'src/h.ts', 'h');
      },
    });
    const voor = Date.now();
    expect(blok(stopAgent(a, REVIEWER))).toBe('');
    return voor;
  }

  test(
    'de bewaarde opname heeft `tijd` van SubagentStop en een `snap` van dat moment',
    () => {
      const { a } = wereld();
      const voor = levensloop(a);
      const opname = opnameVan(a, REVIEWER);
      expect(getal(opname, 'tijd')).toBeGreaterThanOrEqual(voor);
      expect(opname).toMatchObject({ sessie: 'S1', agentType: 'reviewer' });
      expect(snapPaden(opname)).toContain('src/h.ts');
    },
    MIN,
  );

  test(
    'de nacontrole vergelijkt met die staat: een pad van vóór SubagentStop telt niet alsnog zonder zijn venster',
    () => {
      const { a } = wereld();
      levensloop(a);
      rmSync(vensterBestand(a), { force: true });
      expect(prVerify(a)).toStrictEqual([]);
    },
    MIN,
  );

  test(
    'een pad dat een proces zonder venster ná SubagentStop schrijft, blijft een overtreding',
    () => {
      const { a } = wereld();
      levensloop(a);
      schrijf(a, 'src/h2.ts', 'na\n');
      expect(prVerify(a)).toContainEqual(expect.objectContaining({ rel: 'src/h2.ts', actor: agentId(REVIEWER) }));
    },
    MIN,
  );

  test(
    'een overtreding van vóór SubagentStop blijft op de lijst',
    () => {
      const { a } = wereld();
      start(a, REVIEWER);
      const schrijver = {
        command: 'printf z > src/a.ts',
        doe: () => {
          schrijf(a, 'src/a.ts', 'z');
        },
      };
      expect(blok(bash(a, REVIEWER, schrijver))).toContain('src/a.ts');
      expect(blok(stopAgent(a, REVIEWER))).toContain('src/a.ts');
      expect(prVerify(a)).toContainEqual(expect.objectContaining({ rel: 'src/a.ts', actor: agentId(REVIEWER) }));
    },
    MIN,
  );
});

describe('rolhek-effect/AC-10 (b): de vensters van alle worktrees op dezelfde git-common-dir', () => {
  const richtingen: [string, 'a' | 'b', 'a' | 'b'][] = [
    ['een venster in de opslag van B verklaart een pad in de nacontrole vanuit A', 'b', 'a'],
    ['een venster in de basisopslag (A) verklaart een pad in de nacontrole vanuit B', 'a', 'b'],
  ];

  test.each(richtingen)(
    '%s',
    (_naam, vensterIn, toetsIn) => {
      const w = wereld();
      start(w[toetsIn], REVIEWER);
      schrijf(w[vensterIn], 'src/a.ts', 'gelijk\n');
      const nu = Date.now();
      legVensterVast(repoVan(w[vensterIn]), { actor: 'hoofd:S1', start: nu, eind: nu, paden: ['src/a.ts'] });
      schrijf(w[toetsIn], 'src/a.ts', 'gelijk\n');
      expect(prVerify(w[toetsIn])).toStrictEqual([]);
    },
    MIN,
  );

  test(
    'het venster verklaart alleen de staat die het achterliet',
    () => {
      const w = wereld();
      start(w.a, REVIEWER);
      schrijf(w.b, 'src/a.ts', 'gelijk\n');
      const nu = Date.now();
      legVensterVast(repoVan(w.b), { actor: 'hoofd:S1', start: nu, eind: nu, paden: ['src/a.ts'] });
      schrijf(w.a, 'src/a.ts', 'anders\n');
      expect(prVerify(w.a)).toContainEqual(expect.objectContaining({ rel: 'src/a.ts', actor: agentId(REVIEWER) }));
    },
    MIN,
  );
});

describe('rolhek-effect/AC-10 (c): de schrijfacties van de hooks zijn een venster van de actor `hook`', () => {
  const CACHE = '.claude/hooks/.cache/';

  test(
    'werkstraat session-start legt vóór de rest een venster `hook` vast met elk pad onder .claude/hooks/.cache/',
    () => {
      const { a } = wereld();
      schrijf(a, `${CACHE}anker`, 'v1\n');
      schrijf(a, `${CACHE}diep/geneste`, 'g\n');
      sessionStart(a);
      const hookVensters = vensters(vensterBestand(a)).filter((venster) => venster.actor === 'hook');
      expect(hookVensters).toHaveLength(1);
      const paden = hookVensters.flatMap((venster) => venster.paden);
      expect(paden).toEqual(expect.arrayContaining([`${CACHE}anker`, `${CACHE}diep/geneste`]));
      expect(paden.every((pad) => pad.startsWith(CACHE))).toBe(true);
      // De doctor draait na de eerste stap: het venster stond er toen al.
      const gezien = vensters(path.join(a, '.git', 'doctor-zag'));
      expect(gezien.some((venster) => venster.actor === 'hook')).toBe(true);
    },
    MIN,
  );

  test.each([
    ['een bestaand cachebestand', `${CACHE}anker`, 'printf x > .claude/hooks/.cache/anker'],
    ['een nieuw cachebestand', `${CACHE}x`, 'mkdir -p .claude/hooks/.cache && printf x > .claude/hooks/.cache/x'],
  ])(
    'een subagent die %s zelf schrijft, krijgt nog steeds deny (AC-1)',
    (_naam, rel, command) => {
      const { a } = wereld();
      schrijf(a, `${CACHE}anker`, 'v1\n');
      sessionStart(a);
      const tester: Wie = { sessie: 'S1', rol: 'tester' };
      start(a, tester);
      expect(
        blok(
          bash(a, tester, {
            command,
            doe: () => {
              schrijf(a, rel, 'x');
            },
          }),
        ),
      ).toContain(rel);
    },
    MIN,
  );
});

describe('rolhek-effect/AC-10 (d): pnpm rolhek:overnemen --alles wist ook de opnamen en vensters', () => {
  test(
    'na --alles zijn agent/ en vensters.jsonl leeg en is de lijst leeg',
    () => {
      const { a } = wereld();
      start(a, REVIEWER);
      bash(a, HOOFD, {
        command: 'printf h > src/h.ts',
        doe: () => {
          schrijf(a, 'src/h.ts', 'h');
        },
      });
      git(a, 'update-ref', 'refs/heads/derde', 'HEAD');
      expect(nacontrole(repoVan(a), null)).not.toStrictEqual([]);
      expect(bestanden(agentMap(a))).not.toStrictEqual([]);
      expect(vensters(vensterBestand(a))).not.toStrictEqual([]);

      neemOver(['--alles'], repoVan(a));

      expect(bestanden(agentMap(a))).toStrictEqual([]);
      expect(vensters(vensterBestand(a))).toStrictEqual([]);
      expect(overtredingen(repoVan(a))).toStrictEqual([]);
      expect(nacontrole(repoVan(a), null)).toStrictEqual([]);
    },
    MIN,
  );
});

describe('rolhek-effect/AC-10 (e): SessionEnd wist de opnamen van de sessie', () => {
  const S2: Wie = { sessie: 'S2', rol: 'reviewer' };
  const TESTER: Wie = { sessie: 'S1', rol: 'tester' };
  const sessionEnd = (root: string, input: Record<string, unknown>): string =>
    hook(root, 'session-end', { cwd: root, ...input });

  function metOpnamen(): string {
    const { a } = wereld();
    start(a, REVIEWER);
    start(a, TESTER);
    start(a, S2);
    expect(bestanden(agentMap(a))).toHaveLength(3);
    return a;
  }

  test(
    'session-end met session_id S1 wist alleen de opnamen met sessie S1',
    () => {
      const a = metOpnamen();
      expect(blok(sessionEnd(a, { session_id: 'S1' }))).toBe('');
      expect(bestanden(agentMap(a))).toStrictEqual([`${agentId(S2)}.json`]);
    },
    MIN,
  );

  test(
    'zonder session_id wist session-end niets',
    () => {
      const a = metOpnamen();
      sessionEnd(a, {});
      expect(bestanden(agentMap(a))).toHaveLength(3);
    },
    MIN,
  );

  test(
    'zonder opslag geeft session-end geen fout',
    () => {
      const { a } = wereld();
      expect(blok(sessionEnd(a, { session_id: 'S1' }))).toBe('');
      expect(bestanden(agentMap(a))).toStrictEqual([]);
    },
    MIN,
  );

  test(
    'een opname zonder SessionEnd vervalt na 24 uur, niet eerder',
    () => {
      const { a } = wereld();
      start(a, REVIEWER);
      const uur = 60 * 60 * 1000;
      const later = (uren: number) => ({ ...repoVan(a), now: () => Date.now() + uren * uur });
      expect(agentOpnamen(later(23), null)).toHaveLength(1);
      expect(agentOpnamen(later(25), null)).toStrictEqual([]);
    },
    MIN,
  );

  test('.claude/settings.json heeft onder SessionEnd een regel voor effect.mjs session-end (naast de meting)', () => {
    const settings: unknown = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
    const commands = hookCommands(settings, 'SessionEnd');
    expect(commands.some((command) => command.includes('effect.mjs" session-end'))).toBe(true);
    expect(commands.some((command) => command.includes('meting.mjs'))).toBe(true);
  });
});

describe('rolhek-effect/AC-10 (g): na SubagentStop telt een remote-tracking ref niet, elke andere ref en HEAD wel', () => {
  /** Een reviewer van S1 eindigt in `a`. */
  function gestopt(): Wereld {
    const w = wereld();
    start(w.a, REVIEWER);
    expect(blok(stopAgent(w.a, REVIEWER))).toBe('');
    return w;
  }

  test(
    'een fetch zonder hook die alleen refs/remotes/origin/main verschuift, geeft geen overtreding',
    () => {
      const { a, bare } = gestopt();
      duwNaRemote(bare);
      git(a, 'fetch', '-q', 'origin');
      expect(blok(stopHoofd(a, 'S1'))).toBe('');
      expect(prVerify(a)).toStrictEqual([]);
    },
    MIN,
  );

  test(
    'een git update-ref refs/heads/anders is wel een overtreding',
    () => {
      const { a } = gestopt();
      git(a, 'update-ref', 'refs/heads/anders', 'HEAD');
      expect(prVerify(a)).toContainEqual(
        expect.objectContaining({ rel: '.git/refs/heads/anders', actor: agentId(REVIEWER) }),
      );
    },
    MIN,
  );

  test(
    'een verschoven HEAD door een commit zonder venster geeft de paden uit de diff als overtreding',
    () => {
      const { a } = gestopt();
      commit(a, { 'rails/x.mjs': 'een', 'src/a.ts': 'twee' });
      const rels = prVerify(a).map((overtreding) => overtreding.rel);
      expect(rels).toContain('rails/x.mjs');
      expect(rels).toContain('src/a.ts');
    },
    MIN,
  );
});

describe('rolhek-effect/AC-10 (review): dicht en open vallen', () => {
  test(
    'AC-7 bij SubagentStop: een te grote na-opname wordt snap null en de volgende Stop blijft dicht',
    () => {
      const { a } = wereld();
      const tester: Wie = { sessie: 'S1', rol: 'tester' };
      start(a, tester);
      for (let nummer = 1; nummer <= 5001; nummer += 1) schrijf(a, `test/veel/${String(nummer)}`, '');
      stopAgent(a, tester);
      expect(veld(opnameVan(a, tester), 'snap')).toBeNull();
      rmSync(path.join(a, 'test/veel'), { recursive: true, force: true });
      expect(blok(stopHoofd(a, 'S1'))).toContain('hele werkmap');
      expect(blok(stopHoofd(a, 'S1'))).toContain('hele werkmap');
    },
    MIN,
  );

  function sessionStartUit(root: string) {
    return spawnSync(process.execPath, [WERKSTRAAT, 'session-start'], {
      cwd: root,
      input: JSON.stringify({ cwd: root, session_id: 'S1' }),
      encoding: 'utf8',
      env: procEnv(),
      timeout: 30_000,
    });
  }

  const hookPaden = (root: string): string[] =>
    vensters(vensterBestand(root))
      .filter((venster) => venster.actor === 'hook')
      .flatMap((venster) => venster.paden);

  test(
    'hookVenster valt open: zonder .claude/hooks/.cache/ geen venster hook, exit 0 en de melding',
    () => {
      const { a } = wereld();
      const result = sessionStartUit(a);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Branch:');
      expect(hookPaden(a)).toStrictEqual([]);
    },
    MIN,
  );

  test(
    'hookVenster valt open: met een cache maar zonder .claude/gates.json toch een venster hook en exit 0',
    () => {
      const { a } = wereld();
      rmSync(path.join(a, '.claude/gates.json'));
      schrijf(a, '.claude/hooks/.cache/anker', 'v1\n');
      const result = sessionStartUit(a);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Branch:');
      expect(hookPaden(a)).toContain('.claude/hooks/.cache/anker');
    },
    MIN,
  );
});
