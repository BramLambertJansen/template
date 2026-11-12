import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import * as rolhek from '../../rails/hooks/lib/rolhek.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import * as prVerify from '../../scripts/kit/pr-verify.mjs';
import * as prSamenvoegen from '../../scripts/kit/pr-merge.mjs';
import { expectAbsent } from '../support/absence';
import { expectNegativeTable } from '../support/negative-table';

// Besluit van de eigenaar (2026-11-12): de toets ACHTERAF op effect ("rolhek-effect") verdwijnt. Wat blijft: de toets VOORAF
// (`decide`, PreToolUse), het schrijfrecht per rol en de Stop-checks van de werkstraat. De ingangen `rails/hooks/effect.mjs` en
// `.claude/hooks/effect.mjs` blijven als lege huls bestaan, want `.claude/settings.json` roept ze nog aan en de lader valt anders
// dicht. Deze tests komen vóór de code: ze mogen rood zijn tot de effecttoets is weggehaald.
const ROOT = path.resolve(import.meta.dirname, '../..');
const lees = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');
const MIN = 90_000;

const VERWIJDERD = [
  'rails/hooks/lib/effect.mjs',
  'rails/hooks/lib/effect-hooks.mjs',
  'rails/hooks/lib/effect-compare.mjs',
  'rails/hooks/lib/effect-meting.mjs',
  'rails/hooks/lib/effect-snapshot.mjs',
  'scripts/kit/rolhek-overnemen.mjs',
] as const;
const BLIJFT = [
  'rails/hooks/effect.mjs',
  '.claude/hooks/effect.mjs',
  '.claude/hooks/laden.mjs',
  'rails/hooks/lib/rolhek.mjs',
  'rails/hooks/werkstraat.mjs',
] as const;

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
};
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function nieuweDir(naam: string): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), `effecttoets-weg-${naam}-`)));
  dirs.push(dir);
  return dir;
}

function procEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const basis = Object.entries(process.env).filter(([naam]) => !naam.startsWith('GIT_') && naam !== 'RAILS_ANKER');
  return { ...Object.fromEntries(basis), ...GIT_ENV, ...extra };
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: procEnv() });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function schrijf(root: string, rel: string, tekst: string): void {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), tekst);
}

/** Alle bestanden onder `map` (relatief aan de root), zonder node_modules, .git en .cache. */
function bestanden(map: string): string[] {
  const volledig = path.join(ROOT, map);
  if (!existsSync(volledig)) return [];
  return readdirSync(volledig).flatMap((naam) => {
    if (['node_modules', '.git', '.cache'].includes(naam)) return [];
    const rel = path.posix.join(map, naam);
    return statSync(path.join(ROOT, rel)).isDirectory() ? bestanden(rel) : [rel];
  });
}

/** Alle namen onder `root` (ook in .git), gesorteerd; `buiten` zijn voorvoegsels die niet meetellen. */
function namenOnder(root: string, buiten: string[] = []): string[] {
  return readdirSync(root, { recursive: true })
    .map((naam) => String(naam).split(path.sep).join('/'))
    .filter((naam) => !buiten.some((voor) => naam === voor || naam.startsWith(`${voor}/`)))
    .toSorted();
}

/** Een repository met een lokale bare `origin`, een gecommitte `.claude/gates.json` en `origin/main` (de basis van `verifyWorktree`). */
function repoMetOrigin(): string {
  const bare = nieuweDir('bare');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const a = nieuweDir('a');
  git(a, 'init', '-q', '-b', 'main');
  schrijf(a, 'src/a.ts', 'a\n');
  schrijf(a, '.gitignore', 'node_modules/\n.env\n');
  schrijf(a, '.claude/gates.json', lees('.claude/gates.json'));
  git(a, 'add', '-A');
  git(a, 'commit', '-qm', 'start');
  git(a, 'remote', 'add', 'origin', bare);
  git(a, 'push', '-q', '-u', 'origin', 'main');
  return a;
}

// ---- 1. de bestanden --------------------------------------------------------------------------------------------------

describe('effecttoets-weg: de bestanden', () => {
  test('effecttoets-weg: de modules van de toets achteraf en het overnamescript bestaan niet meer', () => {
    // Controle dat de toets bestaande bestanden ziet: wat blijft, bestaat.
    expect(BLIJFT.filter((rel) => existsSync(path.join(ROOT, rel)))).toStrictEqual([...BLIJFT]);
    expect(VERWIJDERD.filter((rel) => existsSync(path.join(ROOT, rel)))).toStrictEqual([]);
  });

  test('effecttoets-weg: de ingang rails/hooks/effect.mjs en de stub .claude/hooks/effect.mjs blijven als lege huls bestaan', () => {
    expect(existsSync(path.join(ROOT, 'rails/hooks/effect.mjs'))).toBe(true);
    expect(existsSync(path.join(ROOT, '.claude/hooks/effect.mjs'))).toBe(true);
    expect(lees('.claude/hooks/effect.mjs')).toContain("draai('effect'");
  });
});

// ---- 2. de lege huls ---------------------------------------------------------------------------------------------------

/** Alle `command`-teksten onder een JSON-waarde. */
function commandos(waarde: unknown): string[] {
  if (Array.isArray(waarde)) return waarde.flatMap(commandos);
  if (typeof waarde !== 'object' || waarde === null) return [];
  return Object.entries(waarde).flatMap(([sleutel, deel]) =>
    sleutel === 'command' && typeof deel === 'string' ? [deel] : commandos(deel),
  );
}

/** De events die `.claude/settings.json` aan de effect-hook geeft (`...hooks/effect.mjs" <event>`), uit het echte bestand. */
function effectEvents(): string[] {
  const settings: unknown = JSON.parse(lees('.claude/settings.json'));
  const events = commandos(settings)
    .map((command) => /\.claude\/hooks\/effect\.mjs"\s+([\w-]+)/.exec(command)?.[1])
    .filter((event): event is string => event !== undefined);
  return [...new Set(events)].toSorted();
}

const EVENTS = effectEvents();

/** De payload die Claude Code bij dit event stuurt (voor de hoofdsessie of een subagent). */
function payloadVoor(root: string, event: string, agent: 'hoofd' | 'developer' | 'reviewer'): Record<string, unknown> {
  const wie = agent === 'hoofd' ? {} : { agent_type: agent, agent_id: `agent-${agent}-S1` };
  const basis = { cwd: root, session_id: 'S1', ...wie };
  if (event === 'edit-post')
    return {
      ...basis,
      tool_name: 'Write',
      tool_input: { file_path: path.join(root, 'src/a.ts'), content: 'veranderd\n' },
      tool_use_id: 't2',
    };
  if (['pre', 'post', 'post-failure'].includes(event))
    return { ...basis, tool_name: 'Bash', tool_input: { command: 'echo veranderd > src/a.ts' }, tool_use_id: 't1' };
  return basis;
}

/** Een git-repository met de echte `gates.json`, zodat de oude hook zijn volle pad zou nemen. */
function hulsRepo(): string {
  const root = nieuweDir('huls');
  git(root, 'init', '-q', '-b', 'main');
  schrijf(root, 'src/a.ts', 'a\nb\n');
  schrijf(root, '.claude/gates.json', lees('.claude/gates.json'));
  schrijf(root, '.gitignore', '.claude/hooks/.cache/\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'start');
  return root;
}

describe('effecttoets-weg: de lege huls (rails/hooks/effect.mjs)', () => {
  test('effecttoets-weg: settings.json registreert de effect-hook nog voor alle events die de lader nodig heeft', () => {
    // De huls moet elk event aankunnen dat settings.json nog aanroept; dit bewaakt dat de lijst uit het echte bestand komt.
    expect(EVENTS).toEqual(
      expect.arrayContaining([
        'pre',
        'post',
        'post-failure',
        'edit-post',
        'stop',
        'session-end',
        'subagent-start',
        'subagent-stop',
      ]),
    );
  });

  const gevallen = EVENTS.flatMap((event) =>
    (['hoofd', 'developer', 'reviewer'] as const).map((agent) => ({ event, agent })),
  );

  test.each(gevallen)(
    'effecttoets-weg: effect.mjs $event ($agent): exit 0, geen uitvoer, niets op schijf',
    ({ event, agent }) => {
      const root = hulsRepo();
      const voor = namenOnder(root);
      const result = spawnSync(process.execPath, [path.join(ROOT, 'rails/hooks/effect.mjs'), event], {
        cwd: root,
        input: JSON.stringify(payloadVoor(root, event, agent)),
        encoding: 'utf8',
        env: procEnv(),
        timeout: 30_000,
      });
      expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
        status: 0,
        stdout: '',
        stderr: '',
      });
      expect(readdirSync(path.join(root, '.git'))).not.toContain('rolhek-effect');
      expect(namenOnder(root)).toStrictEqual(voor);
    },
    MIN,
  );

  test.each(['subagent-start', 'subagent-stop', 'stop', 'post'])(
    'effecttoets-weg: effect.mjs %s met lege stdin of kapotte JSON: exit 0, geen uitvoer',
    (event) => {
      const root = hulsRepo();
      for (const input of ['', 'geen json']) {
        const result = spawnSync(process.execPath, [path.join(ROOT, 'rails/hooks/effect.mjs'), event], {
          cwd: root,
          input,
          encoding: 'utf8',
          env: procEnv(),
          timeout: 30_000,
        });
        expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
          status: 0,
          stdout: '',
          stderr: '',
        });
      }
    },
    MIN,
  );

  test('effecttoets-weg: een onbekend event is ook een no-op (de huls kijkt niet meer naar de events)', () => {
    const root = hulsRepo();
    const result = spawnSync(process.execPath, [path.join(ROOT, 'rails/hooks/effect.mjs'), 'bestaat-niet'], {
      cwd: root,
      input: JSON.stringify({ cwd: root }),
      encoding: 'utf8',
      env: procEnv(),
      timeout: 30_000,
    });
    expect([result.status, result.stdout, result.stderr]).toStrictEqual([0, '', '']);
  });
});

/**
 * Een repository waarin de stubs staan en waarvan het anker (`.claude/hooks/.cache/main`) naar een commit wijst met de échte
 * `rails/hooks/`: de lader pakt daar `effect.mjs` uit en draait hem, zoals `settings.json` dat doet.
 */
function laderRepo(): string {
  const root = hulsRepo();
  mkdirSync(path.join(root, 'rails'), { recursive: true });
  cpSync(path.join(ROOT, 'rails/hooks'), path.join(root, 'rails/hooks'), {
    recursive: true,
    filter: (bron) => !bron.includes('.cache'),
  });
  mkdirSync(path.join(root, '.claude/hooks'), { recursive: true });
  for (const naam of ['laden.mjs', 'effect.mjs'])
    cpSync(path.join(ROOT, '.claude/hooks', naam), path.join(root, '.claude/hooks', naam));
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'hooks');
  mkdirSync(path.join(root, '.claude/hooks/.cache'), { recursive: true });
  writeFileSync(path.join(root, '.claude/hooks/.cache/main'), `${git(root, 'rev-parse', 'HEAD')}\n`);
  return root;
}

describe('effecttoets-weg: de huls via de stub en de lader, zoals settings.json hem aanroept', () => {
  test.each(EVENTS)(
    'effecttoets-weg: .claude/hooks/effect.mjs %s: exit 0, geen uitvoer, niets in de git-map',
    (event) => {
      const root = laderRepo();
      const voor = namenOnder(root, ['.claude/hooks/.cache']);
      const result = spawnSync(process.execPath, [path.join(root, '.claude/hooks/effect.mjs'), event], {
        cwd: root,
        input: JSON.stringify(payloadVoor(root, event, 'developer')),
        encoding: 'utf8',
        env: procEnv(),
        timeout: 60_000,
      });
      expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
        status: 0,
        stdout: '',
        stderr: '',
      });
      expect(readdirSync(path.join(root, '.git'))).not.toContain('rolhek-effect');
      expect(namenOnder(root, ['.claude/hooks/.cache'])).toStrictEqual(voor);
    },
    MIN,
  );
});

// ---- 3. geen verwijzingen meer -----------------------------------------------------------------------------------------

const TEKSTBESTANDEN = [...bestanden('rails'), ...bestanden('scripts'), ...bestanden('.claude/hooks')].filter((rel) =>
  /\.(mjs|cjs|js|ts|json)$/.test(rel),
);

/** `expectAbsent` per bestand, met de bestandsnaam in de fout. */
function nergensIn(
  patroon: RegExp,
  voorbeelden: Parameters<typeof expectAbsent>[2],
  bestandenLijst: readonly string[] = TEKSTBESTANDEN,
): void {
  for (const rel of bestandenLijst) {
    try {
      expectAbsent(lees(rel), patroon, voorbeelden);
    } catch (error) {
      throw new Error(`${rel}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
}

describe('effecttoets-weg: niets importeert of start een verwijderde module', () => {
  test('effecttoets-weg: de scan ziet bestanden uit rails/, scripts/ en .claude/hooks/', () => {
    expect(TEKSTBESTANDEN).toEqual(
      expect.arrayContaining(['rails/hooks/effect.mjs', 'rails/hooks/werkstraat.mjs', 'scripts/kit/pr-verify.mjs']),
    );
    expect(TEKSTBESTANDEN.filter((rel) => rel.startsWith('.claude/hooks/.cache'))).toStrictEqual([]);
  });

  test('effecttoets-weg: geen bestand noemt effect-hooks, effect-compare, effect-meting of effect-snapshot', () => {
    nergensIn(/effect-(?:hooks|compare|meting|snapshot)/, {
      recognizes: [
        "import { nacontrole } from './lib/effect-hooks.mjs';",
        "from '../../rails/hooks/lib/effect-snapshot.mjs'",
        "import('./effect-compare.mjs')",
        'effect-meting.mjs',
      ],
      allows: ["draai('effect', true);", 'rails/hooks/effect.mjs', 'rolhek-vooraf'],
    });
  });

  // Het rolhek (rolhek.mjs) noemt het vervallen script nog wel: het weigert elk commando dat het start (sectie 7), want
  // `.claude/settings.json` heeft `pnpm rolhek:overnemen *` nog in `excludedCommands` (buiten de sandbox). Elders mag de naam
  // niet meer voorkomen: geen import, geen start, geen script.
  test('effecttoets-weg: buiten rolhek.mjs noemt geen bestand rolhek-overnemen of rolhek:overnemen', () => {
    nergensIn(
      /rolhek-overnemen|rolhek:overnemen/,
      {
        recognizes: ['node scripts/kit/rolhek-overnemen.mjs', 'pnpm rolhek:overnemen'],
        allows: ["draai('effect', true);", 'rails/hooks/effect.mjs', 'rolhek-vooraf'],
      },
      TEKSTBESTANDEN.filter((rel) => rel !== 'rails/hooks/lib/rolhek.mjs'),
    );
  });

  test('effecttoets-weg: geen bestand importeert nog lib/effect.mjs (de opslag en het venster van de toets achteraf)', () => {
    nergensIn(/lib\/effect\.mjs|from\s+['"]\.\/effect\.mjs['"]/, {
      recognizes: [
        "import { legVensterVast } from './lib/effect.mjs';",
        "import { opslag } from '../../rails/hooks/lib/effect.mjs';",
        "import { opslag } from './effect.mjs';",
      ],
      allows: ["draai('effect', true);", '.claude/hooks/effect.mjs', "import { x } from './effect-pad.mjs';"],
    });
  });

  test('effecttoets-weg: de namen van de toets achteraf komen niet meer voor (verifyEffect, hookVenster, decideChange, overnemenVrij, schaduw)', () => {
    nergensIn(
      /\b(?:verifyEffect|afgeschermdNu|afgeschermdePaden|legVensterVast|hookVenster|decideChange|overnemenVrij|PNPM_SCHADUW|zonderOmhulselOfSchaduw|rolhekEffectHoofdsessie|effectModus|generatoren|EffectBlokkade|schaduwAnders)\b/,
      {
        recognizes: [
          'export function verifyEffect(root) {}',
          'afgeschermdNu()',
          'afgeschermdePaden(root)',
          'legVensterVast(repo, venster)',
          'hookVenster(root)',
          'export function decideChange(input, ctx) {}',
          'overnemenVrij(command)',
          'const PNPM_SCHADUW = []',
          'zonderOmhulselOfSchaduw(tekst)',
          'config.rolhekEffectHoofdsessie',
          'effectModus: "uit"',
          'generatoren: string[]',
          "r.e === 'EffectBlokkade'",
          't.effect.schaduwAnders += 1',
        ],
        allows: ['verifyWorktree({ root, base })', 'decide(payload, ctx)', 'hookVensterbank', 'effect.mjs'],
      },
    );
  });

  test('effecttoets-weg: package.json heeft geen script rolhek:overnemen', () => {
    const pakket: unknown = JSON.parse(lees('package.json'));
    const scripts =
      typeof pakket === 'object' && pakket !== null && 'scripts' in pakket && typeof pakket.scripts === 'object'
        ? Object.keys(pakket.scripts ?? {})
        : [];
    expect(scripts).toContain('lint');
    expect(scripts).not.toContain('rolhek:overnemen');
  });

  test('effecttoets-weg: gates.json heeft generatoren en rolhekEffectHoofdsessie niet meer en loadConfig leest het bestand', () => {
    const gates: unknown = JSON.parse(lees('.claude/gates.json'));
    const sleutels = typeof gates === 'object' && gates !== null ? Object.keys(gates) : [];
    expect(sleutels).toContain('testpaden');
    expect(sleutels).not.toContain('generatoren');
    expect(sleutels).not.toContain('rolhekEffectHoofdsessie');
    const config = loadConfig(lees('.claude/gates.json'));
    expect(config.testpaden.length).toBeGreaterThan(0);
    expect(Object.keys(config)).not.toContain('generatoren');
    expect(Object.keys(config)).not.toContain('rolhekEffectHoofdsessie');
    expect(Object.keys(config)).not.toContain('effectModus');
  });

  test('effecttoets-weg: rolhek.mjs exporteert decideChange niet meer; decide blijft', () => {
    const namen = Object.keys(rolhek);
    expect(namen).toEqual(expect.arrayContaining(['decide', 'loadConfig', 'globMatch']));
    expect(namen).not.toContain('decideChange');
  });
});

// ---- 4. pr:verify en pr:merge ------------------------------------------------------------------------------------------

describe('effecttoets-weg: pr:verify en pr:merge', () => {
  test('effecttoets-weg: geen van beide exporteert nog verifyEffect of afgeschermdNu; verifyWorktree blijft', () => {
    expect(Object.keys(prVerify)).toEqual(expect.arrayContaining(['verifyWorktree', 'checkProgress', 'werkmapNegeer']));
    expect(Object.keys(prVerify)).not.toContain('verifyEffect');
    expect(Object.keys(prVerify)).not.toContain('afgeschermdNu');
    expect(Object.keys(prSamenvoegen)).not.toContain('verifyEffect');
    expect(Object.keys(prSamenvoegen)).not.toContain('afgeschermdNu');
  });

  test('effecttoets-weg: de broncode van beide roept verifyEffect niet aan en leest de opslag van de toets achteraf niet', () => {
    nergensIn(
      /verifyEffect|afgeschermdNu|rolhek-effect|overtredingen\.json|nacontrole|lijstTekst/,
      {
        recognizes: [
          'verifyEffect(root, afgeschermd);',
          'const afgeschermd = afgeschermdNu(root);',
          "path.join(gitDir, 'rolhek-effect')",
          'overtredingen.json',
          "import { nacontrole } from './x.mjs'",
          'lijstTekst(lijst)',
        ],
        allows: ['verifyWorktree(context);', 'checkProgress(checks, required)'],
      },
      ['scripts/kit/pr-verify.mjs', 'scripts/kit/pr-merge.mjs'],
    );
  });

  const werkmap = (a: string) => ({ root: a, base: 'origin/main' });
  const leeg = (a: string, rel: string): void => {
    schrijf(a, rel, '');
    chmodSync(path.join(a, rel), 0o644);
  };

  test('effecttoets-weg: verifyWorktree laat een ongetrackt leeg .bashrc (sandbox-plaatshouder) door en blokkeert op een .bashrc met inhoud', () => {
    const a = repoMetOrigin();
    leeg(a, '.bashrc');
    leeg(a, '.mcp.json');
    expect(() => {
      prVerify.verifyWorktree(werkmap(a));
    }).not.toThrow();
    schrijf(a, '.bashrc', 'export X=1\n');
    expect(() => {
      prVerify.verifyWorktree(werkmap(a));
    }).toThrow('.bashrc');
  });

  test('effecttoets-weg: verifyWorktree noemt een echte wijziging en niet de plaatshouder naast haar', () => {
    const a = repoMetOrigin();
    leeg(a, '.bashrc');
    schrijf(a, 'src/nieuw.ts', 'x\n');
    let melding = '';
    try {
      prVerify.verifyWorktree(werkmap(a));
    } catch (error) {
      melding = error instanceof Error ? error.message : String(error);
    }
    expect(melding).toContain('src/nieuw.ts');
    expect(melding).not.toContain('.bashrc');
  });

  test('effecttoets-weg: een oude map <git-dir>/rolhek-effect met een open overtreding blokkeert pr:verify niet meer', () => {
    const a = repoMetOrigin();
    const map = path.join(a, '.git', 'rolhek-effect');
    mkdirSync(map, { recursive: true });
    const open = {
      rel: 'src/a.ts',
      actor: 'agent-oud',
      rol: 'reviewer',
      commando: 'echo x > src/a.ts',
      reden: 'buiten je rol',
      voor: { wt: 'weg', idx: '' },
    };
    writeFileSync(path.join(map, 'overtredingen.json'), `${JSON.stringify([open])}\n`);
    leeg(a, '.bashrc');
    expect(() => {
      prVerify.verifyWorktree(werkmap(a));
    }).not.toThrow();
  });
});

// ---- 5. de werkstraat --------------------------------------------------------------------------------------------------

function werkstraat(event: string, input: string, projectDir: string) {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'rails/hooks/werkstraat.mjs'), event], {
    cwd: ROOT,
    input,
    encoding: 'utf8',
    env: { ...procEnv(), CLAUDE_PROJECT_DIR: projectDir },
    timeout: 120_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('effecttoets-weg: de werkstraat laadt en toetst nog', () => {
  test('effecttoets-weg: werkstraat.mjs laadt zonder importfout (stop met stop_hook_active is direct door)', () => {
    expect(werkstraat('stop', JSON.stringify({ stop_hook_active: true }), ROOT)).toStrictEqual({
      status: 0,
      stdout: '',
      stderr: '',
    });
  });

  test('effecttoets-weg: de Stop-checks van de werkstraat blokkeren nog (reviewer zonder rapport, kapotte invoer)', () => {
    // Hetzelfde geval als `werkstraat-script.test.ts` (TS2322 in een tijdelijke repo); dat vraagt `pnpm`, dus hier de
    // checks die zonder pnpm blokkeren: een reviewer zonder rapport en een Stop met kapotte invoer.
    const reviewer = werkstraat(
      'subagent-stop',
      JSON.stringify({ agent_type: 'reviewer', last_assistant_message: 'ok' }),
      ROOT,
    );
    expect(reviewer.status).toBe(0);
    expect(JSON.parse(reviewer.stdout)).toMatchObject({ decision: 'block' });
    const kapot = werkstraat('stop', 'geen json', ROOT);
    expect(JSON.parse(kapot.stdout)).toMatchObject({ decision: 'block' });
    expect(kapot.stdout).toContain('werkstraat-hook stop');
  });

  test('effecttoets-weg: session-start legt geen venster van de hook meer vast (geen rolhek-effect in de git-map)', () => {
    const dir = hulsRepo();
    schrijf(dir, '.claude/hooks/.cache/main', 'a'.repeat(40));
    const result = werkstraat('session-start', JSON.stringify({ cwd: dir }), dir);
    expect(result.stdout).toContain('Branch: main');
    expect(readdirSync(path.join(dir, '.git'))).not.toContain('rolhek-effect');
  });
});

// ---- 6. het rolhek vooraf blijft ---------------------------------------------------------------------------------------

const FILES: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'x', scripts: { lint: 'eslint .' } }, null, 2),
  'src/api/routes/a.test.ts': "test('a', () => {});\n",
  'src/core/web/ui/button.tsx': 'export {}',
};
const config = loadConfig(lees('.claude/gates.json'));
const ctx = {
  root: '/repo',
  cwd: '/repo',
  config,
  read: (rel: string) => FILES[rel] ?? null,
  committed: (rel: string) => rel in FILES,
  isDir: (rel: string) => ['src/core', 'src/core/web', 'scripts'].includes(rel),
  branch: 'feat/x',
};
const bash = (command: string, agent?: string) => ({
  tool_name: 'Bash',
  tool_input: { command },
  ...(agent === undefined ? {} : { agent_type: agent }),
});
const uitslag = (payload: unknown): 'deny' | 'ask' | 'allow' => {
  const besluit = decide(payload, ctx);
  if (besluit.deny.length > 0) return 'deny';
  return besluit.ask.length > 0 ? 'ask' : 'allow';
};

describe('effecttoets-weg: het rolhek vooraf (decide) is voor de kern ongewijzigd', () => {
  const write = (rel: string, content: string, agent?: string) => ({
    tool_name: 'Write',
    tool_input: { file_path: `/repo/${rel}`, content },
    ...(agent === undefined ? {} : { agent_type: agent }),
  });

  test.each([
    ['developer schrijft met een redirect naar een beschermd pad', bash('echo x > scripts/x.ts', 'developer'), 'deny'],
    ['developer schrijft met Write naar een beschermd pad', write('scripts/kit/x.mjs', 'x', 'developer'), 'deny'],
    ['reviewer schrijft een bestand met Write', write('src/web/features/a/page.tsx', 'x', 'reviewer'), 'deny'],
    ['reviewer draait een willekeurig commando', bash('node -e 1', 'reviewer'), 'deny'],
    ['reviewer ketent een schrijfcommando aan een leescommando', bash('git status && touch a', 'reviewer'), 'deny'],
    ['reviewer leest met git diff (toegestaan)', bash('git diff main...HEAD', 'reviewer'), 'allow'],
    ['developer draait een gewone check (toegestaan)', bash('pnpm lint', 'developer'), 'allow'],
    ['hoofdsessie schrijft gewone code (toegestaan)', write('src/web/features/a/page.tsx', 'x'), 'allow'],
  ] as const)('effecttoets-weg: %s -> %s', (_naam, payload, verwacht) => {
    expect(uitslag(payload)).toBe(verwacht);
  });
});

// ---- 7. het rolhek weigert het vervallen overnamescript ----------------------------------------------------------------

// ADR 0091: `rolhek:overnemen` bestaat niet meer, maar `.claude/settings.json` (door een agent niet te wijzigen) heeft
// `pnpm rolhek:overnemen *` nog in `excludedCommands`: zo'n commando draait BUITEN de sandbox. Tot de eigenaar het patroon
// weghaalt, weigert het rolhek vooraf elk commando dat het start, voor elke rol inclusief de hoofdsessie (deny, geen ask).
const ROLLEN = [
  { naam: 'hoofdsessie', agent: undefined },
  { naam: 'developer', agent: 'developer' },
  { naam: 'tester', agent: 'tester' },
  { naam: 'reviewer', agent: 'reviewer' },
  { naam: 'architect', agent: 'architect' },
  { naam: 'docs', agent: 'docs' },
] as const;

const VERVALLEN = /vervallen/;
/** De meldingen die zeggen dat het script vervallen is. */
const vervallenMeldingen = (lijst: readonly string[]): string[] => lijst.filter((melding) => VERVALLEN.test(melding));
const weigertVervallen = (command: string, agent?: string): boolean =>
  vervallenMeldingen(decide(bash(command, agent), ctx).deny).length > 0;

const DIRECT = [
  'pnpm rolhek:overnemen x',
  'pnpm rolhek:overnemen --alles',
  'pnpm rolhek:overnemen',
  'pnpm run rolhek:overnemen x',
  'pnpm exec rolhek:overnemen x',
  'pnpm --silent rolhek:overnemen x',
  'npx rolhek:overnemen x',
  'node scripts/kit/rolhek-overnemen.mjs x',
  'node ./scripts/kit/rolhek-overnemen.mjs x',
  'node /repo/scripts/kit/rolhek-overnemen.mjs x',
];
const OMHULSEL = [
  'env X=1 pnpm rolhek:overnemen x',
  'X=1 pnpm rolhek:overnemen x',
  'timeout 5 pnpm rolhek:overnemen x',
  'sudo pnpm rolhek:overnemen x',
  'nohup pnpm rolhek:overnemen x',
  'nice pnpm rolhek:overnemen x',
  'time pnpm rolhek:overnemen x',
  'command pnpm rolhek:overnemen x',
  'exec pnpm rolhek:overnemen x',
  'env X=1 node scripts/kit/rolhek-overnemen.mjs x',
];
const SAMENGESTELD = [
  'true && pnpm rolhek:overnemen x',
  'echo a; pnpm rolhek:overnemen x',
  'false || pnpm rolhek:overnemen x',
  'echo a | pnpm rolhek:overnemen x',
  'cd src && pnpm rolhek:overnemen x',
  '(pnpm rolhek:overnemen x)',
  'echo $(pnpm rolhek:overnemen x)',
  'echo a\npnpm rolhek:overnemen x',
  'true && node scripts/kit/rolhek-overnemen.mjs x',
];
const INDIRECT = [
  'bash -c "pnpm rolhek:overnemen x"',
  "sh -c 'pnpm rolhek:overnemen x'",
  'eval "pnpm rolhek:overnemen x"',
];

describe.each(ROLLEN)('effecttoets-weg: rolhek:overnemen is voor $naam deny', ({ agent }) => {
  const gevallen = [
    ...DIRECT.map((command) => ({ soort: 'direct', command })),
    ...OMHULSEL.map((command) => ({ soort: 'achter een omhulsel', command })),
    ...SAMENGESTELD.map((command) => ({ soort: 'samengesteld', command })),
    ...INDIRECT.map((command) => ({ soort: 'via shell of eval', command })),
  ];

  test.each(gevallen)('$soort: $command', ({ command }) => {
    const besluit = decide(bash(command, agent), ctx);
    // Een deny met de vervallen-melding; geen ask in de plaats ervan (ook niet voor de hoofdsessie).
    expect(vervallenMeldingen(besluit.deny).length).toBeGreaterThan(0);
    expect(vervallenMeldingen(besluit.ask)).toStrictEqual([]);
  });

  test('de melding zegt dat het script vervallen is en noemt ADR 0091', () => {
    const meldingen = vervallenMeldingen(decide(bash('pnpm rolhek:overnemen x', agent), ctx).deny);
    expect(meldingen.length).toBeGreaterThan(0);
    for (const melding of meldingen) {
      expect(melding).toMatch(/rolhek:overnemen/);
      expect(melding).toContain('ADR 0091');
    }
  });
});

// Wat NIET om deze reden geweigerd mag worden. De uitkomst is die van `decide` op main (voor de wijziging): de nieuwe regel
// verandert ze niet. `reviewer` weigert van zichzelf elk commando buiten de leeslijst (framework §8), dus daar blijven
// `pnpm pr:verify 1`, `pnpm ratchet` en `echo` een deny, met die ene reviewer-melding.
const ANDERS = [
  { command: 'pnpm pr:verify 1', reviewerDeny: 1 },
  { command: 'pnpm ratchet', reviewerDeny: 1 },
  { command: 'git grep rolhek:overnemen docs', reviewerDeny: 0 },
  { command: 'echo "pnpm rolhek:overnemen"', reviewerDeny: 1 },
] as const;

describe.each(ROLLEN)("effecttoets-weg: andere commando's blijven voor $naam zoals op main", ({ naam, agent }) => {
  test.each(ANDERS)('$command: uitkomst als op main', ({ command, reviewerDeny }) => {
    const besluit = decide(bash(command, agent), ctx);
    expect({ deny: besluit.deny.length, ask: besluit.ask.length }).toStrictEqual({
      deny: naam === 'reviewer' ? reviewerDeny : 0,
      ask: 0,
    });
  });

  test('alleen een commando dat het script start, geeft de vervallen-melding (negatieve tabel)', () => {
    expectNegativeTable<{ command: string }>({
      base: { command: 'pnpm rolhek:overnemen x' },
      check: (invoer) => weigertVervallen(invoer.command, agent),
      cases: ANDERS.map(({ command }) => ({
        name: `${command} start het script niet`,
        change: (basis) => ({ ...basis, command }),
      })),
    });
  });
});
