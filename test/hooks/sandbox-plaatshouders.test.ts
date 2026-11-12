import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { isNulApparaat, SANDBOX_LEEG } from '../../rails/hooks/lib/sandbox-plaatshouders.mjs';
import { verifyWorktree } from '../../scripts/kit/pr-verify.mjs';
import { expectNegativeTable } from '../support/negative-table';

// docs/specs/rolhek-effect.md AC-11 (d) en (e), AC-12 (ADR 0084 punt 2, ADR 0091 punt 2): een plaatshouder van de vaste lijst
// SANDBOX_LEEG die niet in HEAD en niet in de index staat (een leeg gewoon bestand zonder uitvoerbit of een tekenapparaat 1,3)
// blokkeert `pnpm pr:verify` (`verifyWorktree`) niet. De effecttoets zelf is vervallen; de lijst en `verifyWorktree` blijven.
//
// Een tekenapparaat kan een test niet maken (geen `mknod`): `isNulApparaat` krijgt hier daarom een stat-vorm met de velden
// `rdev` en `isCharacterDevice`, zoals `lstatSync` ze levert.
const MIN = 90_000;
const GATES = readFileSync(path.resolve(import.meta.dirname, '../../.claude/gates.json'), 'utf8');

const LIJST = [
  '.bash_profile',
  '.bashrc',
  '.profile',
  '.zshrc',
  '.zprofile',
  '.gitconfig',
  '.gitmodules',
  '.ripgreprc',
  '.mcp.json',
  '.idea',
  '.claude/commands',
  '.claude/launch.json',
  '.claude/loop.md',
  '.claude/output-styles',
  '.claude/routines',
  '.claude/scheduled_tasks.json',
  '.claude/workflows',
  '.env',
  '.env.local',
];
const LEEG_VAN_STAT = ['.bashrc', '.mcp.json', '.gitmodules', '.claude/commands', '.claude/workflows'];
const TEMPLATE_IGNORE = 'node_modules/\n.env\n.env.*\n!.env.example\n';

// ---- hulp: echte tijdelijke git-repository's met een lokale bare `origin` --------------------------------------------------

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
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), `sandbox-${naam}-`)));
  dirs.push(dir);
  return dir;
}

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

function commit(root: string, bestanden: Record<string, string>): void {
  for (const [rel, text] of Object.entries(bestanden)) schrijf(root, rel, text);
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'zonder hook');
}

/** Eén repository (werkmap, tak main) met een lokale bare `origin`; `.env` is genegeerd. */
function wereld(objectFormat: 'sha1' | 'sha256' = 'sha1'): string {
  const bare = nieuweDir('bare');
  git(bare, 'init', '-q', '--bare', `--object-format=${objectFormat}`, '-b', 'main');
  const a = nieuweDir('a');
  git(a, 'init', '-q', `--object-format=${objectFormat}`, '-b', 'main');
  schrijf(a, 'src/a.ts', 'a\nb\n');
  schrijf(a, 'rails/x.mjs', 'x\n');
  schrijf(a, 'test/a.test.ts', "test('een', () => {});\n");
  schrijf(a, '.gitignore', 'node_modules/\n.env\n');
  schrijf(a, '.claude/gates.json', GATES);
  git(a, 'add', '-A');
  git(a, 'commit', '-qm', 'start');
  git(a, 'remote', 'add', 'origin', bare);
  git(a, 'push', '-q', '-u', 'origin', 'main');
  return a;
}

/** Een werkmap met de `.gitignore`-regels van de template voor `.env` en een getrackt bestand in `config/`. */
function templateWereld(): string {
  const a = wereld();
  commit(a, { '.gitignore': TEMPLATE_IGNORE, 'config/app.ts': 'export {};\n', '.env.example': 'A=\n' });
  git(a, 'push', '-q', 'origin', 'main');
  return a;
}

const leeg = (a: string, rel: string, mode = 0o644): void => {
  schrijf(a, rel, '');
  chmodSync(path.join(a, rel), mode);
};
const werkmap = (a: string) => ({ root: a, base: 'origin/main' });
const controle = (a: string): void => {
  verifyWorktree(werkmap(a));
};

// ---- de lijst en het tekenapparaat -----------------------------------------------------------------------------------------

describe('rolhek-effect/AC-11 (d): de vaste lijst SANDBOX_LEEG', () => {
  test('SANDBOX_LEEG staat letterlijk in sandbox-plaatshouders.mjs en bevat precies de 19 paden uit de spec', () => {
    expect([...SANDBOX_LEEG].toSorted()).toStrictEqual(LIJST.toSorted());
  });
});

describe('rolhek-effect/AC-11 (d): isNulApparaat herkent alleen een tekenapparaat met major 1 en minor 3', () => {
  type Apparaat = { tekenapparaat: boolean; major: number; minor: number };
  const BASIS: Apparaat = { tekenapparaat: true, major: 1, minor: 3 };
  /** De velden van `lstatSync` die `isNulApparaat` gebruikt; `rdev` heeft de Linux-codering major*256+minor. */
  const nulApparaat = (a: Apparaat): boolean =>
    isNulApparaat({ rdev: a.major * 256 + a.minor, isCharacterDevice: () => a.tekenapparaat });

  test('tekenapparaat 1,3 (/dev/null) is een nul-apparaat', () => {
    expect(nulApparaat(BASIS)).toBe(true);
  });

  test('elke afwijking van tekenapparaat 1,3 is geen nul-apparaat', () => {
    expectNegativeTable<Apparaat>({
      base: BASIS,
      check: nulApparaat,
      cases: [
        { name: 'een ander apparaat, tekenapparaat 1,5', change: (b) => ({ ...b, minor: 5 }) },
        { name: 'een tekenapparaat met major 5, minor 3', change: (b) => ({ ...b, major: 5 }) },
        { name: 'rdev 1,3 maar geen tekenapparaat', change: (b) => ({ ...b, tekenapparaat: false }) },
      ],
    });
  });
});

describe('rolhek-effect/AC-11 (a): pr:verify neemt geen set afgeschermde paden aan uit een CLI-vlag', () => {
  test(
    'een extra CLI-vlag is een gebruiksfout (argumentsFor kent alleen <nummer> [--watch])',
    () => {
      const a = wereld();
      const result = spawnSync(
        process.execPath,
        [path.resolve(import.meta.dirname, '../../scripts/kit/pr-verify.mjs'), '1', '--afgeschermd=.env'],
        { cwd: a, encoding: 'utf8', env: procEnv(), timeout: 30_000 },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Gebruik: pnpm pr:verify');
    },
    MIN,
  );
});

// ---- AC-11 (e): verifyWorktree ---------------------------------------------------------------------------------------------

describe('rolhek-effect/AC-11 (e): verifyWorktree blokkeert niet op een ongetrackt leeg SANDBOX_LEEG-pad', () => {
  test.each([
    ['.bashrc (100644)', '.bashrc', 0o644],
    ['.bashrc (100664)', '.bashrc', 0o664],
    ['.mcp.json', '.mcp.json', 0o644],
    ['.gitmodules (ongetrackt)', '.gitmodules', 0o644],
    ['.claude/commands', '.claude/commands', 0o644],
    ['.claude/output-styles als leeg bestand (de map staat al in werkmapNegeer)', '.claude/output-styles', 0o644],
  ])(
    'een ongetrackt leeg %s blokkeert niet',
    (_naam, rel, mode) => {
      const a = wereld();
      leeg(a, rel, mode);
      expect(() => {
        controle(a);
      }).not.toThrow();
    },
    MIN,
  );

  test(
    'alle paden uit de voorbeeldlijst tegelijk, leeg, blokkeren niet',
    () => {
      const a = wereld();
      for (const rel of LEEG_VAN_STAT) leeg(a, rel);
      expect(() => {
        controle(a);
      }).not.toThrow();
    },
    MIN,
  );

  test(
    'in een repository met objectformaat sha256 blokkeert een ongetrackt leeg .bashrc ook niet',
    () => {
      const a = wereld('sha256');
      leeg(a, '.bashrc');
      expect(() => {
        controle(a);
      }).not.toThrow();
    },
    MIN,
  );

  const blokkades: [string, string, (a: string) => void][] = [
    [
      '.bashrc met inhoud',
      '.bashrc',
      (a) => {
        schrijf(a, '.bashrc', 'export X=1\n');
      },
    ],
    [
      'een leeg rails/leeg.mjs (buiten de lijst)',
      'rails/leeg.mjs',
      (a) => {
        leeg(a, 'rails/leeg.mjs');
      },
    ],
    [
      'een leeg bestand .claude/output-styles met uitvoerbit',
      '.claude/output-styles',
      (a) => {
        leeg(a, '.claude/output-styles', 0o755);
      },
    ],
    [
      'een leeg .bashrc met uitvoerbit',
      '.bashrc',
      (a) => {
        leeg(a, '.bashrc', 0o755);
      },
    ],
    [
      'een gestagede wijziging: een leeg .bashrc dat met git add is gestaged',
      '.bashrc',
      (a) => {
        leeg(a, '.bashrc');
        git(a, 'add', '.bashrc');
      },
    ],
    [
      'een getrackt .gitmodules dat leeg wordt',
      '.gitmodules',
      (a) => {
        commit(a, { '.gitmodules': '[submodule "x"]\n' });
        schrijf(a, '.gitmodules', '');
      },
    ],
    [
      'een symlink op de plaats van .bashrc',
      '.bashrc',
      (a) => {
        symlinkSync('doel', path.join(a, '.bashrc'));
      },
    ],
  ];

  test.each(blokkades)(
    '%s: blokkeert wel',
    (_naam, rel, maak) => {
      const a = wereld();
      maak(a);
      expect(() => {
        controle(a);
      }).toThrow(rel);
    },
    MIN,
  );

  test(
    'een leeg .bashrc naast een echte wijziging: de fout noemt de wijziging en niet het .bashrc',
    () => {
      const a = wereld();
      leeg(a, '.bashrc');
      schrijf(a, 'src/nieuw.ts', 'x\n');
      let melding = '';
      try {
        controle(a);
      } catch (error) {
        melding = error instanceof Error ? error.message : String(error);
      }
      expect(melding).toContain('src/nieuw.ts');
      expect(melding).not.toContain('.bashrc');
    },
    MIN,
  );
});

// ---- AC-12: .env en .env.local ---------------------------------------------------------------------------------------------

describe('rolhek-effect/AC-12: werkmapcontrole (verifyWorktree)', () => {
  /** Een repository die `.env` niet negeert. */
  function zonderEnvRegels(): string {
    const a = wereld();
    commit(a, { '.gitignore': 'node_modules/\n' });
    git(a, 'push', '-q', 'origin', 'main');
    return a;
  }

  test.each(['.env', '.env.local'])(
    'zonder .env-regels in .gitignore: een ongetrackt leeg %s blokkeert niet',
    (rel) => {
      const a = zonderEnvRegels();
      leeg(a, rel);
      expect(() => {
        controle(a);
      }).not.toThrow();
    },
    MIN,
  );

  test(
    'zonder .env-regels in .gitignore: een .env met inhoud blokkeert wel',
    () => {
      const a = zonderEnvRegels();
      schrijf(a, '.env', 'A=1\n');
      expect(() => {
        controle(a);
      }).toThrow('.env');
    },
    MIN,
  );

  test(
    'met de regels van de template ziet verifyWorktree een leeg of gevuld .env en .env.local niet',
    () => {
      const a = templateWereld();
      leeg(a, '.env');
      schrijf(a, '.env.local', 'A=1\n');
      expect(() => {
        controle(a);
      }).not.toThrow();
    },
    MIN,
  );
});
