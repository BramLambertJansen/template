import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { toolchainProbleemIn } from '../../scripts/kit/toolchain.mjs';

// Spec cloud-toolchain-zelfherstel (ADR 0112): de SessionStart-hook `werkstraat toolchain-herstel`.
//
// Verwachte signaturen (de module bestaat nog niet; de developer bouwt ze exact zo):
//   rails/hooks/lib/toolchain-herstel.mjs
//     export const INVOER: readonly string[]       pathspecs, elk met `:(glob)` vanaf de root (ontwerp punt 5)
//     export const DEADLINE_MS: number             540_000 (< 600 s van de settings-entry)
//     export const KILL_GRACE_MS: number           5_000 (tussen SIGTERM en SIGKILL)
//     export async function toolchainHerstel(payload: unknown, deps: HerstelDeps): Promise<{ stdout?: string; exit?: number }>
//   HerstelDeps = {
//     root: string;                                projectroot (git-root); cwd van `bash scripts/cloud-setup.sh`
//     env: Record<string, string | undefined>;     omgeving van de hook: CLAUDE_CODE_REMOTE, HOME, PATH, RAILS_ANKER (anker-SHA)
//     deadlineMs?: number;                         standaard DEADLINE_MS
//     killGraceMs?: number;                        standaard KILL_GRACE_MS
//     pnpmTimeoutMs?: number;                      standaard 20_000 (PNPM_TIMEOUT_MS)
//   }
//   - payload.source moet 'startup' zijn en env.CLAUDE_CODE_REMOTE 'true', anders geen proces, geen uitvoer, exit 0.
//   - leest `process.version` (op het moment van de aanroep, niet bij het laden van de module) voor de Node-controle.
//   - start commando's via PATH van `deps.env` (pnpm, git, bash); pnpm met cwd = deps.env.HOME.
//   - stdout is één regel (eindigend op \n) of afwezig/leeg; exit is altijd 0.
//   - logbestand: `<env.HOME>/.cache/werkstraat/toolchain-herstel.log` (stdout+stderr van het script).
//   rails/hooks/werkstraat.mjs: subcommando `toolchain-herstel` (draait toolchainHerstel met deps.root = projectroot,
//   deps.env = process.env); bij een onverwachte fout schrijft het `✗ toolchain-herstel faalde: <melding> (meld dit; de sessie start gewoon)`
//   op stdout en eindigt met exit 0.
const REPO = path.join(import.meta.dirname, '../..');
const LEEG_RESULTAAT = { stdout: undefined, exit: 0 };

interface HerstelDeps {
  root: string;
  env: Record<string, string | undefined>;
  deadlineMs?: number;
  killGraceMs?: number;
  pnpmTimeoutMs?: number;
}
interface Uitslag {
  stdout?: string;
  exit?: number;
}
interface HerstelModule {
  INVOER: readonly string[];
  DEADLINE_MS: number;
  KILL_GRACE_MS: number;
  toolchainHerstel: (payload: unknown, deps: HerstelDeps) => Promise<Uitslag>;
}

function isModule(mod: unknown): mod is HerstelModule {
  return (
    typeof mod === 'object' &&
    mod !== null &&
    'INVOER' in mod &&
    Array.isArray(mod.INVOER) &&
    'DEADLINE_MS' in mod &&
    typeof mod.DEADLINE_MS === 'number' &&
    'KILL_GRACE_MS' in mod &&
    typeof mod.KILL_GRACE_MS === 'number' &&
    'toolchainHerstel' in mod &&
    typeof mod.toolchainHerstel === 'function'
  );
}

// Dynamisch en via een variabele: de module bestaat nog niet, en een statische import zou de typecheck breken.
const MODULE_PAD = pathToFileURL(path.join(REPO, 'rails/hooks/lib/toolchain-herstel.mjs')).href;
async function laad(): Promise<HerstelModule> {
  const mod: unknown = await import(/* @vite-ignore */ MODULE_PAD);
  if (!isModule(mod))
    throw new Error(
      'rails/hooks/lib/toolchain-herstel.mjs exporteert niet INVOER, DEADLINE_MS, KILL_GRACE_MS en toolchainHerstel',
    );
  return mod;
}

const dirs: string[] = [];
const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function pad(commando: string): string {
  const gevonden = (process.env['PATH'] ?? '')
    .split(path.delimiter)
    .map((dir) => path.join(dir, commando))
    .find((kandidaat) => existsSync(kandidaat));
  return gevonden ?? commando;
}
const ECHT = { git: pad('git'), bash: pad('bash') };

const PIN = { node: '26.13.0', pnpm: '12.21.0' };
const STANDAARD_SCRIPT = '#!/bin/bash\necho SCRIPT-STDOUT\necho SCRIPT-STDERR >&2\nexit "${SCRIPT_EXIT:-0}"\n';

type Markeringen = 'beide' | 'typescript-mist';
interface Opties {
  nodePin?: string | null;
  packageManager?: string | null;
  markeringen?: Markeringen;
  script?: string;
  bestanden?: Record<string, string>;
  pnpmVersie?: string;
}
interface Werkmap {
  root: string;
  home: string;
  log: string;
  anker: string;
  env: Record<string, string | undefined>;
  logbestand: string;
}

/** Een logstub: schrijft `naam<TAB>arg…<TAB>@cwd` naar STUB_LOG en voert dan `uitvoer` uit. */
function logStub(dir: string, naam: string, uitvoer: string): void {
  const bestand = path.join(dir, naam);
  const lijn = `printf '%s' ${naam}; for a in "$@"; do printf '\\t%s' "$a"; done; printf '\\t@%s\\n' "$PWD" >> "$STUB_LOG"`;
  writeFileSync(bestand, `#!/bin/sh\n{ ${lijn.replace(' >> "$STUB_LOG"', '')}; } >> "$STUB_LOG"\n${uitvoer}\n`);
  chmodSync(bestand, 0o755);
}

/**
 * Een tijdelijke git-repo met de invoer van de installatie, ingecheckt; het anker is die commit. De pins staan in de
 * commit; het afwijken van de geïnstalleerde versie komt van `process.version` en de pnpm-stub.
 */
function maakWerkmap(o: Opties = {}): Werkmap {
  const root = tmp('th-root-');
  const home = tmp('th-home-');
  const stubs = tmp('th-stubs-');
  const log = path.join(tmp('th-log-'), 'stub.log');
  writeFileSync(log, '');
  git(root, 'init', '-q', '-b', 'main');
  const nodePin = o.nodePin === undefined ? PIN.node : o.nodePin;
  const pm = o.packageManager === undefined ? `pnpm@${PIN.pnpm}` : o.packageManager;
  const bestanden: Record<string, string> = {
    'package.json': JSON.stringify(pm === null ? { name: 'x' } : { name: 'x', packageManager: pm }),
    'mise.toml': nodePin === null ? '[tools]\npnpm = "12"\n' : `[tools]\nnode = "${nodePin}"\n`,
    'scripts/cloud-setup.sh': o.script ?? STANDAARD_SCRIPT,
    'scripts/kit/toolchain.mjs': '// kit\n',
    'src/x.ts': 'export const x = 1;\n',
    '.gitignore': 'node_modules/\nmise.local.toml\n',
    ...o.bestanden,
  };
  for (const [rel, inhoud] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), inhoud);
  }
  chmodSync(path.join(root, 'scripts/cloud-setup.sh'), 0o755);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'anker');
  const anker = git(root, 'rev-parse', 'HEAD');
  mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  writeFileSync(path.join(root, 'node_modules/.modules.yaml'), '{}');
  if (o.markeringen !== 'typescript-mist') {
    mkdirSync(path.join(root, 'node_modules/typescript'), { recursive: true });
    writeFileSync(path.join(root, 'node_modules/typescript/package.json'), '{}');
  }
  logStub(stubs, 'pnpm', 'if [ -n "$PNPM_HANG" ]; then exec sleep 30; fi\nprintf "%s\\n" "$PNPM_VERSIE"');
  logStub(stubs, 'mise', 'exit 0');
  logStub(stubs, 'git', `exec ${ECHT.git} "$@"`);
  logStub(stubs, 'bash', `exec ${ECHT.bash} "$@"`);
  const env = {
    PATH: `${stubs}${path.delimiter}${process.env['PATH'] ?? ''}`,
    HOME: home,
    STUB_LOG: log,
    PNPM_VERSIE: o.pnpmVersie ?? '11.28.2',
    RAILS_ANKER: anker,
    CLAUDE_CODE_REMOTE: 'true',
    ...GIT_ENV,
  };
  return { root, home, log, anker, env, logbestand: path.join(home, '.cache/werkstraat/toolchain-herstel.log') };
}

/** De aanroepen die de stubs vastlegden: `{ naam, args, cwd }`. */
function aanroepen(w: Werkmap): { naam: string; args: string[]; cwd: string }[] {
  return readFileSync(w.log, 'utf8')
    .split('\n')
    .filter((regel) => regel !== '')
    .map((regel) => {
      const delen = regel.split('\t');
      const cwd = (delen.pop() ?? '').slice(1);
      return { naam: delen[0] ?? '', args: delen.slice(1), cwd };
    });
}
const scriptGestart = (w: Werkmap) => aanroepen(w).some((a) => a.naam === 'bash');

const regels = (stdout: string | undefined) => (stdout ?? '').split('\n').filter((r) => r !== '');

/** Draait de hook met `process.version` ingespoten als `node`. */
async function draai(
  w: Werkmap,
  { node = 'v26.11.1', payload, extra = {} }: { node?: string; payload?: unknown; extra?: Partial<HerstelDeps> } = {},
): Promise<Uitslag> {
  const { toolchainHerstel } = await laad();
  const origineel = Object.getOwnPropertyDescriptor(process, 'version');
  Object.defineProperty(process, 'version', { value: node, configurable: true });
  try {
    return await toolchainHerstel(payload ?? { source: 'startup', cwd: w.root }, {
      root: w.root,
      env: w.env,
      ...extra,
    });
  } finally {
    if (origineel !== undefined) Object.defineProperty(process, 'version', origineel);
  }
}

describe('cloud-toolchain-zelfherstel/AC-1 alleen cloud en startup', () => {
  const NIET: { naam: string; remote: string | undefined; payload: unknown }[] = [
    { naam: 'geen cloud (variabele ontbreekt)', remote: undefined, payload: { source: 'startup' } },
    { naam: 'CLAUDE_CODE_REMOTE=false', remote: 'false', payload: { source: 'startup' } },
    { naam: 'CLAUDE_CODE_REMOTE leeg', remote: '', payload: { source: 'startup' } },
    { naam: 'resume', remote: 'true', payload: { source: 'resume' } },
    { naam: 'clear', remote: 'true', payload: { source: 'clear' } },
    { naam: 'compact', remote: 'true', payload: { source: 'compact' } },
    { naam: 'fork', remote: 'true', payload: { source: 'fork' } },
    { naam: 'geen source', remote: 'true', payload: {} },
  ];

  test('cloud-toolchain-zelfherstel/AC-1 basis: cloud en startup met afwijkende pins starten het script', async () => {
    const w = maakWerkmap();

    await draai(w);

    expect(scriptGestart(w)).toBe(true);
  });

  test('cloud-toolchain-zelfherstel/AC-1 geen cloud of een andere source: geen proces, geen uitvoer, exit 0, ook bij afwijkende pins', async () => {
    const overtredingen: string[] = [];
    for (const { naam, remote, payload } of NIET) {
      const w = maakWerkmap();

      const uitslag = await draai({ ...w, env: { ...w.env, CLAUDE_CODE_REMOTE: remote } }, { payload });

      const schoon =
        regels(uitslag.stdout).length === 0 &&
        (uitslag.exit ?? 0) === 0 &&
        aanroepen(w).length === 0 &&
        !existsSync(w.logbestand);
      if (!schoon) overtredingen.push(naam);
    }

    expect(overtredingen).toStrictEqual([]);
  }, 60_000);
});

describe('cloud-toolchain-zelfherstel/AC-2 klopt alles: alleen pnpm --version', () => {
  test('cloud-toolchain-zelfherstel/AC-2 enige opdracht is pnpm --version met cwd $HOME; geen uitvoer, geen logbestand', async () => {
    const w = maakWerkmap({ pnpmVersie: PIN.pnpm });

    const uitslag = await draai(w, { node: `v${PIN.node}` });

    expect(aanroepen(w)).toStrictEqual([{ naam: 'pnpm', args: ['--version'], cwd: w.home }]);
    expect(regels(uitslag.stdout)).toStrictEqual([]);
    expect(uitslag.exit ?? 0).toBe(0);
    expect(existsSync(w.logbestand)).toBe(false);
  });
});

describe('cloud-toolchain-zelfherstel/AC-3 detectie gelijk aan toolchainProbleemIn', () => {
  const NODES = ['v26.13.0', 'v26.14.0', 'v26.11.1', 'v27.0.0'];
  const NODE_PINS: (string | null)[] = [PIN.node, null];
  const PMS: (string | null)[] = [`pnpm@${PIN.pnpm}`, 'pnpm@12.22.0', null, 'pnpm@12'];
  const MARKERINGEN: Markeringen[] = ['beide', 'typescript-mist'];

  const COMBOS = NODES.flatMap((node) =>
    NODE_PINS.flatMap((nodePin) =>
      PMS.flatMap((packageManager) =>
        MARKERINGEN.map((markeringen) => ({ node, nodePin, packageManager, markeringen })),
      ),
    ),
  );

  /** `toolchainProbleemIn` is null? Met dezelfde ingespoten Node-versie en dezelfde pnpm-stub als de hook. */
  function probleemIsNull(w: Werkmap, node: string): boolean {
    const origineel = Object.getOwnPropertyDescriptor(process, 'version');
    Object.defineProperty(process, 'version', { value: node, configurable: true });
    vi.stubEnv('PATH', w.env['PATH'] ?? '');
    vi.stubEnv('PNPM_VERSIE', PIN.pnpm);
    vi.stubEnv('STUB_LOG', w.log);
    try {
      return toolchainProbleemIn(w.root) === null;
    } finally {
      if (origineel !== undefined) Object.defineProperty(process, 'version', origineel);
    }
  }

  test('cloud-toolchain-zelfherstel/AC-3 voor elke combinatie geeft de hook "klopt" precies als toolchainProbleemIn null geeft', async () => {
    const afwijkingen: string[] = [];
    let klopt = 0;
    for (const { node, nodePin, packageManager, markeringen } of COMBOS) {
      const w = maakWerkmap({ nodePin, packageManager, markeringen, pnpmVersie: PIN.pnpm });
      const verwacht = probleemIsNull(w, node);
      const uitslag = await draai(w, { node });
      const hookKlopt = regels(uitslag.stdout).length === 0 && !scriptGestart(w);
      if (verwacht) klopt++;
      if (hookKlopt !== verwacht)
        afwijkingen.push(`${node} nodePin=${String(nodePin)} pm=${String(packageManager)} ${markeringen}`);
    }

    expect(afwijkingen).toStrictEqual([]);
    expect(klopt).toBeGreaterThan(0);
    expect(klopt).toBeLessThan(COMBOS.length);
  }, 180_000);

  test('cloud-toolchain-zelfherstel/AC-3 een pnpm die niet antwoordt binnen de timeout: !-regel en geen installatie', async () => {
    const w = maakWerkmap({ pnpmVersie: PIN.pnpm });
    w.env['PNPM_HANG'] = '1';

    const uitslag = await draai(w, { node: `v${PIN.node}`, extra: { pnpmTimeoutMs: 300 } });

    expect(regels(uitslag.stdout)).toHaveLength(1);
    expect(uitslag.stdout).toMatch(/^! toolchain niet hersteld: pnpm --version gaf binnen /);
    expect(scriptGestart(w)).toBe(false);
    expect(uitslag.exit ?? 0).toBe(0);
  }, 30_000);

  test('cloud-toolchain-zelfherstel/AC-3 ontbrekende of ongeldige packageManager: !-regel, geen installatie', async () => {
    for (const packageManager of [null, 'pnpm@12']) {
      const w = maakWerkmap({ packageManager });

      const uitslag = await draai(w);

      expect(regels(uitslag.stdout)).toStrictEqual([
        '! toolchain niet hersteld: packageManager moet een exacte pnpm@x.y.z-versie bevatten',
      ]);
      expect(scriptGestart(w)).toBe(false);
    }
  });
});

/** Alle modulespecifiers van een bronbestand, zonder commentaar: statische, `export … from` en `import('…')`. */
function specifiers(bron: string): string[] {
  const schoon = bron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const gevonden: string[] = [];
  const patroon =
    /^[ \t]*(?:import|export)\s[^'"`;()]*?\bfrom\s*['"]([^'"]+)['"]|^[ \t]*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm;
  for (const m of schoon.matchAll(patroon)) gevonden.push(m[1] ?? m[2] ?? m[3] ?? '');
  return gevonden;
}

describe('cloud-toolchain-zelfherstel/AC-4 importboom van rails/hooks/werkstraat.mjs', () => {
  test('cloud-toolchain-zelfherstel/AC-4 elke module importeert alleen node:-modules en modules onder rails/hooks/', () => {
    const hooks = path.join(REPO, 'rails/hooks');
    const bezocht = new Set<string>();
    const overtredingen: string[] = [];
    const wacht = [path.join(hooks, 'werkstraat.mjs')];
    for (let bestand = wacht.pop(); bestand !== undefined; bestand = wacht.pop()) {
      if (bezocht.has(bestand)) continue;
      bezocht.add(bestand);
      for (const spec of specifiers(readFileSync(bestand, 'utf8'))) {
        if (spec.startsWith('node:')) continue;
        const doel = spec.startsWith('.') ? path.resolve(path.dirname(bestand), spec) : null;
        if (doel === null || !doel.startsWith(`${hooks}${path.sep}`)) {
          overtredingen.push(`${path.relative(REPO, bestand)} importeert ${spec}`);
          continue;
        }
        wacht.push(doel);
      }
    }

    expect(overtredingen).toStrictEqual([]);
    expect([...bezocht].map((b) => path.relative(REPO, b))).toContain('rails/hooks/lib/toolchain-herstel.mjs');
    expect(bezocht.size).toBeGreaterThan(3);
  });
});

/** De bron van de tabel: de bestandsnamen met de bron die ze noemt (spec AC-5). */
const LEFTHOOK =
  'lefthook.dev, Configuration, "Config file", en de README van het npm-pakket (versie uit package.json)';
const MISE = 'mise.jdx.dev, Configuration, "mise.toml" en "Idiomatic version files" (v2026.9.18)';
const PNPM = 'pnpm-documentatie van de gepinde versie, en wat scripts/cloud-setup.sh aanroept';
const EXTENSIES = ['yml', 'yaml', 'json', 'jsonc', 'toml'];
const LEFTHOOK_NAMEN = EXTENSIES.flatMap((ext) =>
  ['lefthook', 'lefthook-local'].flatMap((basis) => [`${basis}.${ext}`, `.${basis}.${ext}`, `.config/${basis}.${ext}`]),
);
const TABEL: { naam: string; pad: string; bron: string }[] = [
  ...LEFTHOOK_NAMEN.map((naam) => ({ naam, pad: naam, bron: LEFTHOOK })),
  { naam: '.lefthook/', pad: '.lefthook/pre-commit.sh', bron: LEFTHOOK },
  { naam: '.lefthook-local/', pad: '.lefthook-local/pre-commit.sh', bron: LEFTHOOK },
  ...[
    'mise.toml',
    'mise.local.toml',
    'mise.production.toml',
    'mise.production.local.toml',
    '.mise.toml',
    '.mise.local.toml',
    '.mise.production.toml',
    '.mise.production.local.toml',
    'mise/config.toml',
    '.mise/config.toml',
    '.config/mise.toml',
    '.config/mise/config.toml',
    '.config/mise/conf.d/extra.toml',
    '.tool-versions',
    '.nvmrc',
    '.node-version',
    'mise.lock',
    'mise.production.lock',
    '.mise.lock',
    '.miserc.toml',
    'miserc.toml',
    '.config/miserc.toml',
  ].map((naam) => ({ naam, pad: naam, bron: MISE })),
  ...['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.pnpmfile.cjs', '.pnpmfile.mjs'].map(
    (naam) => ({
      naam,
      pad: naam,
      bron: PNPM,
    }),
  ),
  { naam: 'patches/', pad: 'patches/pakket@1.0.0.patch', bron: PNPM },
  { naam: 'scripts/cloud-setup.sh', pad: 'scripts/cloud-setup.sh', bron: 'het script zelf' },
  { naam: 'scripts/kit/', pad: 'scripts/kit/pnpm-installeer.mjs', bron: 'cloud-setup.sh draait dit' },
];

/** Welke van `paden` matcht een pathspec uit `invoer`? Echte git, in een tijdelijke repo met die paden als ongetrackte bestanden. */
function gematcht(invoer: readonly string[], paden: readonly string[]): Set<string> {
  const dir = tmp('th-invoer-');
  git(dir, 'init', '-q');
  for (const rel of paden) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), 'x\n');
  }
  const r = spawnSync('git', ['ls-files', '--others', '-z', '--', ...invoer], { cwd: dir, encoding: 'utf8' });
  return new Set(r.stdout.split('\0').filter((p) => p !== ''));
}

/** Repo-relatieve paden van de relatieve imports van `bestand`, recursief. */
function importboomPaden(start: string): string[] {
  const bezocht = new Set<string>();
  const wacht = [path.join(REPO, start)];
  for (let bestand = wacht.pop(); bestand !== undefined; bestand = wacht.pop()) {
    if (bezocht.has(bestand)) continue;
    bezocht.add(bestand);
    for (const spec of specifiers(readFileSync(bestand, 'utf8')))
      if (spec.startsWith('.')) wacht.push(path.resolve(path.dirname(bestand), spec));
  }
  return [...bezocht].map((b) => path.relative(REPO, b));
}

describe('cloud-toolchain-zelfherstel/AC-5 INVOER dekt wat het script leest of uitvoert', () => {
  test('cloud-toolchain-zelfherstel/AC-5 elke pathspec staat in :(glob)-vorm', async () => {
    const { INVOER } = await laad();

    expect(INVOER.length).toBeGreaterThan(0);
    for (const spec of INVOER) expect(spec.startsWith(':(glob)')).toBe(true);
  });

  test('cloud-toolchain-zelfherstel/AC-5 elke naam uit de tabel (per naam met bron) wordt door een pathspec gematcht', async () => {
    const { INVOER } = await laad();

    const gevonden = gematcht(
      INVOER,
      TABEL.map((r) => r.pad),
    );
    const mist = TABEL.filter((r) => !gevonden.has(r.pad)).map((r) => `${r.naam} (bron: ${r.bron})`);

    expect(mist).toStrictEqual([]);
  });

  test('cloud-toolchain-zelfherstel/AC-5 de importboom van pnpm-installeer.mjs en toolchain.mjs, en elk script- of kitpad in cloud-setup.sh, valt onder INVOER', async () => {
    const { INVOER } = await laad();
    const script = readFileSync(path.join(REPO, 'scripts/cloud-setup.sh'), 'utf8');
    const code = script
      .split('\n')
      .filter((regel) => !/^\s*#/.test(regel))
      .join('\n');
    const genoemd = [...code.matchAll(/(?:\.\/)?(scripts\/[\w./-]*\w)/g)]
      .map((m) => m[1] ?? '')
      .filter((rel) => existsSync(path.join(REPO, rel)));
    const nodig = [
      ...new Set([
        ...genoemd,
        ...importboomPaden('scripts/kit/pnpm-installeer.mjs'),
        ...importboomPaden('scripts/kit/toolchain.mjs'),
        'scripts/cloud-setup.sh',
        'mise.toml',
        'package.json',
      ]),
    ];

    const gevonden = gematcht(INVOER, nodig);

    expect(genoemd).toContain('scripts/kit/pnpm-installeer.mjs');
    expect(nodig.filter((rel) => !gevonden.has(rel))).toStrictEqual([]);
  });

  test('cloud-toolchain-zelfherstel/AC-5 een bestand buiten de invoer (src/, docs/) valt er niet onder', async () => {
    const { INVOER } = await laad();

    const gevonden = gematcht(INVOER, ['src/x.ts', 'docs/ENVIRONMENT.md', 'README.md']);

    expect([...gevonden]).toStrictEqual([]);
  });
});

describe('cloud-toolchain-zelfherstel/AC-6 invoer wijkt af van het anker', () => {
  const AFWIJKINGEN: { naam: string; pad: string; maak: (root: string) => void }[] = [
    {
      naam: 'gewijzigd pnpm-workspace.yaml',
      pad: 'pnpm-workspace.yaml',
      maak: (root) => {
        writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n# gewijzigd\n');
      },
    },
    {
      naam: 'gewijzigd bestand onder scripts/kit/',
      pad: 'scripts/kit/toolchain.mjs',
      maak: (root) => {
        writeFileSync(path.join(root, 'scripts/kit/toolchain.mjs'), '// gewijzigd\n');
      },
    },
    {
      naam: 'ongetrackte .npmrc',
      pad: '.npmrc',
      maak: (root) => {
        writeFileSync(path.join(root, '.npmrc'), 'registry=https://elders.example\n');
      },
    },
    {
      naam: 'genegeerde mise.local.toml',
      pad: 'mise.local.toml',
      maak: (root) => {
        writeFileSync(path.join(root, 'mise.local.toml'), '[tools]\nnode = "1"\n');
      },
    },
  ];

  test('cloud-toolchain-zelfherstel/AC-6 elke afwijking: geen installatie en één !-regel met het pad', async () => {
    const fouten: string[] = [];
    for (const { naam, pad: afwijkendPad, maak } of AFWIJKINGEN) {
      const w = maakWerkmap({ bestanden: { 'pnpm-workspace.yaml': 'packages: []\n' } });
      maak(w.root);

      const uitslag = await draai(w);

      const lijst = regels(uitslag.stdout);
      const regel = lijst[0] ?? '';
      const goed =
        !scriptGestart(w) &&
        lijst.length === 1 &&
        regel.startsWith('! toolchain niet hersteld: ') &&
        regel.includes(afwijkendPad) &&
        regel.includes(w.anker.slice(0, 12)) &&
        regel.includes('wijzig het veld "Setup script" van de omgeving') &&
        !/`|\bbash\b|\bpnpm(?![\w.-])|\bsudo\b/.test(regel) &&
        (uitslag.exit ?? 0) === 0;
      if (!goed) fouten.push(`${naam}: ${regel}`);
    }

    expect(fouten).toStrictEqual([]);
  }, 60_000);

  test('cloud-toolchain-zelfherstel/AC-6 meer dan drie afwijkende paden: hooguit drie genoemd, daarna "en <n> meer"', async () => {
    const kit = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`scripts/kit/f${String(n)}.mjs`, `// ${String(n)}\n`]));
    const w = maakWerkmap({ bestanden: kit });
    for (const rel of Object.keys(kit)) writeFileSync(path.join(w.root, rel), '// gewijzigd\n');

    const uitslag = await draai(w);

    const lijst = regels(uitslag.stdout);
    expect(lijst).toHaveLength(1);
    expect(lijst[0]?.match(/scripts\/kit\/f\d\.mjs/g)).toHaveLength(3);
    expect(lijst[0]).toContain('en 2 meer');
    expect(scriptGestart(w)).toBe(false);
  });

  test('cloud-toolchain-zelfherstel/AC-6 een gewijzigd bestand buiten INVOER (src/) houdt het herstel niet tegen', async () => {
    const w = maakWerkmap();
    writeFileSync(path.join(w.root, 'src/x.ts'), 'export const x = 2;\n');

    const uitslag = await draai(w);

    expect(scriptGestart(w)).toBe(true);
    expect(uitslag.stdout).toMatch(/^✓ toolchain hersteld in /);
  });

  test('cloud-toolchain-zelfherstel/AC-6 elke git-aanroep sluit fsmonitor en externe diff uit; een fsmonitor uit de werkmap draait niet mee', async () => {
    const w = maakWerkmap();
    const marker = path.join(tmp('th-fsm-'), 'gedraaid');
    const hook = path.join(w.root, 'fsmonitor.sh');
    writeFileSync(hook, `#!/bin/sh\ntouch "${marker}"\n`);
    chmodSync(hook, 0o755);
    git(w.root, 'config', 'core.fsmonitor', hook);
    writeFileSync(path.join(w.root, 'scripts/kit/toolchain.mjs'), '// gewijzigd\n');
    writeFileSync(path.join(w.root, '.npmrc'), 'x=1\n');

    await draai(w);

    const gitCalls = aanroepen(w).filter((a) => a.naam === 'git');
    expect(gitCalls.length).toBeGreaterThan(0);
    for (const call of gitCalls) {
      expect(call.args.join(' ')).toContain('-c core.fsmonitor=');
      expect(call.args.join(' ')).toContain('-c diff.external=');
    }
    expect(gitCalls.filter((a) => a.args.includes('diff'))).toStrictEqual([]);
    expect(existsSync(marker)).toBe(false);
  });
});

describe('cloud-toolchain-zelfherstel/AC-6 vergelijking op inhoud (B1) en geneste repo (K5)', () => {
  /** Een uitvoerbaar script dat een markeerbestand schrijft en stdin ongewijzigd doorgeeft (een clean-filter). */
  function markeerFilter(markering: string): string {
    const bestand = path.join(tmp('th-filter-'), 'filter.sh');
    writeFileSync(bestand, `#!/bin/sh\ntouch "${markering}"\ncat\n`);
    chmodSync(bestand, 0o755);
    return bestand;
  }

  /** Eén `!`-regel met het pad en zonder installatie, of de reden waarom niet. */
  function stopFout(w: Werkmap, uitslag: Uitslag, pad: string): string | null {
    const lijst = regels(uitslag.stdout);
    if (scriptGestart(w)) return 'het script is toch gestart';
    if (lijst.length !== 1) return `${String(lijst.length)} regels`;
    if (!(lijst[0] ?? '').startsWith('! toolchain niet hersteld: ')) return `geen !-regel: ${lijst[0] ?? ''}`;
    if (!(lijst[0] ?? '').includes(pad)) return `pad ontbreekt: ${lijst[0] ?? ''}`;
    return null;
  }

  test('cloud-toolchain-zelfherstel/AC-6 B1a een clean-filter uit .git/config draait niet mee bij alleen een stat-wijziging; gelijke inhoud telt als gelijk', async () => {
    const fouten: string[] = [];
    for (const soort of ['clean', 'process']) {
      const w = maakWerkmap();
      const markering = path.join(tmp('th-markering-'), 'gedraaid');
      git(w.root, 'config', `filter.x.${soort}`, markeerFilter(markering));
      writeFileSync(path.join(w.root, '.git/info/attributes'), '* filter=x\n');
      const nu = new Date(Date.now() + 5000);
      utimesSync(path.join(w.root, 'scripts/kit/toolchain.mjs'), nu, nu);

      const uitslag = await draai(w);

      if (existsSync(markering)) fouten.push(`${soort}: het filter draaide mee`);
      if (!scriptGestart(w))
        fouten.push(`${soort}: gelijke inhoud werd niet als gelijk gezien (${uitslag.stdout ?? ''})`);
    }

    expect(fouten).toStrictEqual([]);
  });

  test('cloud-toolchain-zelfherstel/AC-6 B1b een assume-unchanged of skip-worktree bestand dat inhoudelijk wijzigde: !-regel met het pad, geen installatie', async () => {
    const fouten: string[] = [];
    for (const vlag of ['--assume-unchanged', '--skip-worktree']) {
      const w = maakWerkmap();
      git(w.root, 'update-index', vlag, 'scripts/kit/toolchain.mjs');
      writeFileSync(path.join(w.root, 'scripts/kit/toolchain.mjs'), '// inhoudelijk gewijzigd\n');

      const fout = stopFout(w, await draai(w), 'scripts/kit/toolchain.mjs');

      if (fout !== null) fouten.push(`${vlag}: ${fout}`);
    }

    expect(fouten).toStrictEqual([]);
  });

  test('cloud-toolchain-zelfherstel/AC-6 B1c een INVOER-pad dat een symlink is, ook naar een bestand met dezelfde inhoud: afwijking', async () => {
    const w = maakWerkmap();
    writeFileSync(path.join(w.root, 'src/doel.txt'), '// kit\n');
    rmSync(path.join(w.root, 'scripts/kit/toolchain.mjs'));
    symlinkSync('../../src/doel.txt', path.join(w.root, 'scripts/kit/toolchain.mjs'));

    const uitslag = await draai(w);

    expect(stopFout(w, uitslag, 'scripts/kit/toolchain.mjs')).toBeNull();
  });

  test('cloud-toolchain-zelfherstel/AC-6 K5 een geneste git-repo onder .mise/ of .lefthook/: afwijking, geen installatie', async () => {
    const fouten: string[] = [];
    for (const map of ['.mise', '.lefthook']) {
      const w = maakWerkmap();
      const geneste = path.join(w.root, map, 'geneste');
      mkdirSync(geneste, { recursive: true });
      git(geneste, 'init', '-q', '-b', 'main');
      writeFileSync(path.join(geneste, 'config.toml'), 'x = 1\n');

      const fout = stopFout(w, await draai(w), map);

      if (fout !== null) fouten.push(`${map}: ${fout}`);
    }

    expect(fouten).toStrictEqual([]);
  });
});

describe('cloud-toolchain-zelfherstel/AC-7 herstel', () => {
  test('cloud-toolchain-zelfherstel/AC-7 exit 0 van het script: bash scripts/cloud-setup.sh in de projectroot, uitvoer in het log, één ✓-regel', async () => {
    const w = maakWerkmap();

    const uitslag = await draai(w);

    const start = aanroepen(w).filter((a) => a.naam === 'bash');
    expect(start).toStrictEqual([{ naam: 'bash', args: ['scripts/cloud-setup.sh'], cwd: w.root }]);
    const lijst = regels(uitslag.stdout);
    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toMatch(/^✓ toolchain hersteld in /);
    expect(lijst[0]).toContain('Node v26.11.1 → 26.13.0');
    expect(lijst[0]).toContain('pnpm 11.28.2 → 12.21.0');
    expect(uitslag.stdout).not.toContain('SCRIPT-');
    const log = readFileSync(w.logbestand, 'utf8');
    expect(log).toContain('SCRIPT-STDOUT');
    expect(log).toContain('SCRIPT-STDERR');
    expect(uitslag.exit ?? 0).toBe(0);
  });

  test('cloud-toolchain-zelfherstel/AC-7 een tool die al klopte staat niet in de opsomming', async () => {
    const w = maakWerkmap({ pnpmVersie: PIN.pnpm });

    const uitslag = await draai(w);

    expect(uitslag.stdout).toContain('Node v26.11.1 → 26.13.0');
    expect(uitslag.stdout).not.toContain('pnpm ');
  });

  test('cloud-toolchain-zelfherstel/AC-7 ontbrekende node_modules: "node_modules → geïnstalleerd" in de opsomming', async () => {
    const w = maakWerkmap({ pnpmVersie: PIN.pnpm });
    rmSync(path.join(w.root, 'node_modules'), { recursive: true });

    const uitslag = await draai(w, { node: `v${PIN.node}` });

    expect(regels(uitslag.stdout)).toHaveLength(1);
    expect(uitslag.stdout).toContain('node_modules → geïnstalleerd');
  });

  test('cloud-toolchain-zelfherstel/AC-7 exit 3 van het script: één ✗-regel met exitcode en logpad, exit 0 van de hook', async () => {
    const w = maakWerkmap();
    w.env['SCRIPT_EXIT'] = '3';

    const uitslag = await draai(w);

    const lijst = regels(uitslag.stdout);
    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toMatch(/^✗ toolchain niet hersteld \(scripts\/cloud-setup\.sh exit 3,/);
    expect(lijst[0]).toContain(w.logbestand);
    expect(uitslag.exit ?? 0).toBe(0);
  });
});

/** Leeft het proces nog? Een zombie telt als dood. */
function leeft(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8');
    return /\) (\w)/.exec(stat)?.[1] !== 'Z';
  } catch {
    return false;
  }
}

describe('cloud-toolchain-zelfherstel/AC-8 deadline stopt de hele procesgroep', () => {
  const HANGEND = [
    '#!/bin/bash',
    '[ -z "$NEGEER_TERM" ] || trap "" TERM',
    'echo $$ > "$PIDS/script"',
    'bash -c \'sleep 300 & echo $! > "$PIDS/kleinkind"; wait\' &',
    'echo $! > "$PIDS/kind"',
    'wait',
    '',
  ].join('\n');

  test.each([
    { naam: 'SIGTERM volstaat', negeerTerm: '' },
    { naam: 'het script negeert SIGTERM: SIGKILL na de gunsttermijn', negeerTerm: '1' },
  ])(
    'cloud-toolchain-zelfherstel/AC-8 $naam: geen proces uit de groep blijft leven, één ✗-regel',
    async ({ negeerTerm }) => {
      const w = maakWerkmap({ script: HANGEND });
      const pids = tmp('th-pids-');
      w.env['PIDS'] = pids;
      w.env['NEGEER_TERM'] = negeerTerm;

      const uitslag = await draai(w, { extra: { deadlineMs: 1500, killGraceMs: 500 } });

      const lijst = regels(uitslag.stdout);
      expect(lijst).toHaveLength(1);
      expect(lijst[0]).toMatch(/^✗ toolchain niet hersteld: na /);
      expect(uitslag.exit ?? 0).toBe(0);
      const gestart = ['script', 'kind', 'kleinkind'].map((naam) =>
        Number(readFileSync(path.join(pids, naam), 'utf8').trim()),
      );
      expect(gestart.every((pid) => pid > 0)).toBe(true);
      await vi.waitFor(
        () => {
          expect(gestart.filter(leeft)).toStrictEqual([]);
        },
        { timeout: 3000 },
      );
    },
    30_000,
  );
});

describe('cloud-toolchain-zelfherstel/AC-9 settings en deadline', () => {
  function sessionStart(): { matcher: unknown; command: unknown; timeout: unknown }[] {
    const settings: unknown = JSON.parse(readFileSync(path.join(REPO, '.claude/settings.json'), 'utf8'));
    const lees = (waarde: unknown, sleutel: string): unknown =>
      typeof waarde === 'object' && waarde !== null
        ? Object.entries(waarde).find(([k]) => k === sleutel)?.[1]
        : undefined;
    const entries = lees(lees(settings, 'hooks'), 'SessionStart');
    const lijst: unknown[] = Array.isArray(entries) ? entries : [];
    return lijst.flatMap((entry) => {
      const hooks = lees(entry, 'hooks');
      const handlers: unknown[] = Array.isArray(hooks) ? hooks : [];
      return handlers.map((h) => ({
        matcher: lees(entry, 'matcher'),
        command: lees(h, 'command'),
        timeout: lees(h, 'timeout'),
      }));
    });
  }

  test('cloud-toolchain-zelfherstel/AC-9 een entry met matcher startup, timeout 600 en het toolchain-herstel-commando', () => {
    expect(sessionStart()).toContainEqual({
      matcher: 'startup',
      command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/werkstraat.mjs" toolchain-herstel',
      timeout: 600,
    });
  });

  test('cloud-toolchain-zelfherstel/AC-9 de entry voor session-start is ongewijzigd', () => {
    expect(sessionStart()).toContainEqual({
      matcher: 'startup|resume|clear|compact|fork',
      command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/werkstraat.mjs" session-start',
      timeout: 30,
    });
  });

  test('cloud-toolchain-zelfherstel/AC-9 de deadline in de hookcode (met gunsttermijn) is kleiner dan 600 s', async () => {
    const { DEADLINE_MS, KILL_GRACE_MS } = await laad();

    expect(DEADLINE_MS).toBeGreaterThan(0);
    expect(DEADLINE_MS + KILL_GRACE_MS).toBeLessThan(600_000);
  });
});

describe('cloud-toolchain-zelfherstel/AC-13 onverwachte fout in de hook', () => {
  function entry(invoer: string, env: Record<string, string>) {
    const cwd = tmp('th-entry-');
    const omgeving: Record<string, string | undefined> = { ...process.env, ...env, HOME: cwd };
    if (!('CLAUDE_CODE_REMOTE' in env)) delete omgeving['CLAUDE_CODE_REMOTE'];
    return spawnSync(process.execPath, [path.join(REPO, 'rails/hooks/werkstraat.mjs'), 'toolchain-herstel'], {
      cwd,
      input: invoer,
      encoding: 'utf8',
      env: omgeving,
    });
  }

  test('cloud-toolchain-zelfherstel/AC-13 een ongeldige payload: één ✗ toolchain-herstel faalde-regel op stdout, exit 0', () => {
    const r = entry('dit is geen json{', { CLAUDE_CODE_REMOTE: 'true' });

    expect(r.status).toBe(0);
    expect(regels(r.stdout)).toHaveLength(1);
    expect(r.stdout).toMatch(/^✗ toolchain-herstel faalde: /);
  });

  test('cloud-toolchain-zelfherstel/AC-1 K1 buiten de cloud geeft ook een ongeldige payload geen uitvoer en exit 0', () => {
    const fouten: string[] = [];
    for (const remote of ['false', '', undefined]) {
      const r = entry('{niet-json', remote === undefined ? {} : { CLAUDE_CODE_REMOTE: remote });
      if (r.status !== 0 || r.stdout !== '')
        fouten.push(`${String(remote)}: exit ${String(r.status)}, stdout ${r.stdout}`);
    }

    expect(fouten).toStrictEqual([]);
  });

  test('cloud-toolchain-zelfherstel/AC-13 een geldige payload buiten de cloud: geen uitvoer, exit 0', () => {
    const r = entry(JSON.stringify({ source: 'startup' }), { CLAUDE_CODE_REMOTE: 'false' });

    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(LEEG_RESULTAAT.exit).toBe(0);
  });
});
