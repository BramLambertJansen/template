import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// Spec cloud-zelfinstallatie, AC-1 tot en met AC-5: de drie routes naar PATH in scripts/cloud-setup.sh, de slotcontrole
// en de niet-fatale apt-get. Eigen opstelling naast test/scripts/cloud-setup.test.ts: PATH bevat alleen stubs, een
// systeem-node (v22.0.0) en koppelingen naar de echte hulpprogramma's, zodat geen node of bwrap van de machine meedoet.
// `mise which <tool>` geeft MISE_WHICH_<TOOL>; die wijst naar een node-stub met de versie van `mise current` (9.9.9).
const SCRIPT = path.join(import.meta.dirname, '../../scripts/cloud-setup.sh');
const dirs: string[] = [];

const MISE = [
  'echo "mise $*" >> "$STUB_LOG"',
  '[[ " $* " != *" ${MISE_FAIL:-__nooit__} "* ]] || exit 3',
  'case "$1" in',
  '  current) echo 9.9.9 ;;',
  '  which) [[ -z "${MISE_WHICH_FAIL:-}" ]] || exit 4; v="MISE_WHICH_${2^^}"; printf \'%s\\n\' "${!v:-}" ;;',
  'esac',
].join('\n');

type Opstelling = {
  root: string;
  home: string;
  stubs: string;
  systeem: string;
  bin: string;
  log: string;
  installs: string;
};

function stub(dir: string, name: string, body: string) {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(file, 0o755);
}

function opstelling({ metSandbox = true }: { metSandbox?: boolean } = {}): Opstelling {
  const root = mkdtempSync(path.join(tmpdir(), 'cloud-zelf-'));
  dirs.push(root);
  const o: Opstelling = {
    root,
    home: path.join(root, 'home'),
    stubs: path.join(root, 'stubs'),
    systeem: path.join(root, 'systeem'),
    bin: path.join(root, 'bin'),
    log: path.join(root, 'log'),
    installs: path.join(root, 'installs'),
  };
  mkdirSync(o.home);
  mkdirSync(o.bin);
  writeFileSync(o.log, '');
  stub(o.stubs, 'mise', MISE);
  stub(o.stubs, 'apt-get', 'echo "apt-get $*" >> "$STUB_LOG"; [[ "$1" != "${APT_FAIL:-}" ]] || exit 100');
  stub(o.stubs, 'sudo', 'exec "$@"');
  if (metSandbox) {
    stub(o.stubs, 'bwrap', 'true');
    stub(o.stubs, 'socat', 'true');
  }
  // De voorgeïnstalleerde Node van de VM (D7) en twee installaties van mise met de gepinde versie.
  stub(o.systeem, 'node', 'echo v22.0.0');
  for (const versie of ['a', 'b']) {
    stub(path.join(o.installs, versie), 'node', 'echo v9.9.9');
    stub(path.join(o.installs, versie), 'pnpm', 'echo 9.9.9');
  }
  for (const tool of ['bash', 'uname', 'id', 'mkdir', 'grep', 'dirname', 'rm', 'ln', 'readlink', 'mktemp'])
    symlinkSync(execFileSync('which', [tool], { encoding: 'utf8' }).trim(), path.join(o.bin, tool));
  return o;
}

// .bashrc als koppeling naar een pad in een map die niet bestaat: niet te schrijven, ook niet als root (F3).
function bashrcOnschrijfbaar(o: Opstelling) {
  symlinkSync(path.join(o.root, 'bestaat-niet', 'bashrc'), path.join(o.home, '.bashrc'));
}

type Run = { localBinVoorop?: boolean; env?: Record<string, string> };

function run(o: Opstelling, { localBinVoorop = true, env = {} }: Run = {}) {
  const basis = `${o.stubs}:${o.systeem}:${o.bin}`;
  const result = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      HOME: o.home,
      TMPDIR: tmpdir(),
      PATH: localBinVoorop ? `${path.join(o.home, '.local/bin')}:${basis}` : basis,
      STUB_LOG: o.log,
      MISE_WHICH_NODE: path.join(o.installs, 'a', 'node'),
      MISE_WHICH_PNPM: path.join(o.installs, 'a', 'pnpm'),
      ...env,
    },
  });
  return {
    status: result.status,
    uitvoer: `${result.stdout}${result.stderr}`,
    aanroepen: readFileSync(o.log, 'utf8').trim().split('\n').filter(Boolean),
  };
}

const koppeling = (o: Opstelling, tool: string) => path.join(o.home, '.local/bin', tool);
// pnpm-sandbox/AC-5: de installatie loopt via scripts/kit/pnpm-installeer.mjs (modus setup, cloud).
const NA_INSTALLEREN = [
  'mise exec -- node scripts/kit/pnpm-installeer.mjs --modus setup --cloud',
  'mise exec -- pnpm exec lefthook install',
];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('scripts/cloud-setup.sh: routes naar PATH (spec cloud-zelfinstallatie)', () => {
  test('cloud-zelfinstallatie/AC-1: ~/.bashrc niet te schrijven en ~/.local/bin vooraan → exit 0 met de route die werkt', () => {
    const o = opstelling();
    bashrcOnschrijfbaar(o);

    const { status, uitvoer, aanroepen } = run(o);

    expect(status, uitvoer).toBe(0);
    expect(uitvoer).toContain('! ~/.bashrc niet te schrijven; PATH loopt via ~/.local/bin');
    expect(aanroepen).toEqual(expect.arrayContaining(NA_INSTALLEREN));
  });

  test('cloud-zelfinstallatie/AC-1: zonder route 1 maar met CLAUDE_ENV_FILE noemt de regel CLAUDE_ENV_FILE', () => {
    const o = opstelling();
    bashrcOnschrijfbaar(o);

    const { status, uitvoer } = run(o, {
      localBinVoorop: false,
      env: { CLAUDE_ENV_FILE: path.join(o.root, 'env') },
    });

    expect(status, uitvoer).toBe(0);
    expect(uitvoer).toContain('! ~/.bashrc niet te schrijven; PATH loopt via CLAUDE_ENV_FILE');
  });

  test('cloud-zelfinstallatie/AC-2: koppelingen naar precies het pad van mise which, niet naar een shim', () => {
    const o = opstelling();

    const { status, uitvoer } = run(o);

    expect(status, uitvoer).toBe(0);
    for (const tool of ['node', 'pnpm']) {
      expect(lstatSync(koppeling(o, tool)).isSymbolicLink()).toBe(true);
      expect(readlinkSync(koppeling(o, tool))).toBe(path.join(o.installs, 'a', tool));
      expect(readlinkSync(koppeling(o, tool))).not.toContain('mise/shims');
    }
  });

  test('cloud-zelfinstallatie/AC-2: een tweede run laat de koppelingen ongemoeid; een ander pad zet ze om', () => {
    const o = opstelling();
    run(o);
    const voor = lstatSync(koppeling(o, 'node')).ino;

    run(o);
    expect(lstatSync(koppeling(o, 'node')).ino).toBe(voor);

    const { status } = run(o, {
      env: { MISE_WHICH_NODE: path.join(o.installs, 'b', 'node'), MISE_WHICH_PNPM: path.join(o.installs, 'b', 'pnpm') },
    });
    expect(status).toBe(0);
    expect(readlinkSync(koppeling(o, 'node'))).toBe(path.join(o.installs, 'b', 'node'));
    expect(readlinkSync(koppeling(o, 'pnpm'))).toBe(path.join(o.installs, 'b', 'pnpm'));
  });

  test('cloud-zelfinstallatie/AC-2: een bestaand gewoon bestand blijft staan; de route telt als niet geschreven', () => {
    const o = opstelling();
    mkdirSync(path.join(o.home, '.local/bin'), { recursive: true });
    writeFileSync(koppeling(o, 'pnpm'), 'eigen bestand\n');

    const { status, uitvoer } = run(o);

    expect(readFileSync(koppeling(o, 'pnpm'), 'utf8')).toBe('eigen bestand\n');
    expect(uitvoer).toMatch(/^! .*~\/\.local\/bin\/pnpm/m);
    // Route 3 (~/.bashrc) is geschreven, route 1 niet: exit 0 met de waarschuwing voor hooks.
    expect(status, uitvoer).toBe(0);
    expect(uitvoer).toContain('! ~/.local/bin staat niet vóór de systeem-node');
  });

  test('cloud-zelfinstallatie/AC-2: lege of mislukte mise which → geen koppeling, !-regel, route niet geschreven', () => {
    for (const env of [{ MISE_WHICH_NODE: '' }, { MISE_WHICH_FAIL: '1' }]) {
      const o = opstelling();
      bashrcOnschrijfbaar(o);

      const { status, uitvoer } = run(o, { env });

      expect(existsSync(koppeling(o, 'node'))).toBe(false);
      expect(uitvoer).toMatch(/^! .*~\/\.local\/bin\/node/m);
      expect(status, uitvoer).toBe(1);
    }
  });

  test('cloud-zelfinstallatie/AC-3: CLAUDE_ENV_FILE krijgt precies één PATH-regel, ~/.local/bin vóór de shims', () => {
    const o = opstelling();
    const envFile = path.join(o.root, 'env');
    writeFileSync(envFile, 'export ANDERS=1\n');

    run(o, { env: { CLAUDE_ENV_FILE: envFile } });
    const { status } = run(o, { env: { CLAUDE_ENV_FILE: envFile } });

    expect(status).toBe(0);
    const regels = readFileSync(envFile, 'utf8').split('\n');
    expect(regels).toContain('export ANDERS=1');
    const pathRegels = regels.filter((regel) => regel.startsWith('export PATH='));
    expect(pathRegels).toHaveLength(1);
    const [regel = ''] = pathRegels;
    expect(regel.indexOf('$HOME/.local/bin')).toBeGreaterThan(-1);
    expect(regel.indexOf('$HOME/.local/bin')).toBeLessThan(regel.indexOf('mise/shims'));
    // ~/.bashrc krijgt dezelfde regel.
    expect(readFileSync(path.join(o.home, '.bashrc'), 'utf8').split('\n')).toContain(regel);
  });

  test('cloud-zelfinstallatie/AC-3: zonder CLAUDE_ENV_FILE maakt het script geen omgevingsbestand aan', () => {
    const o = opstelling();
    const voor = readdirSync(o.root, { recursive: true }).map(String).sort();

    const { status } = run(o);

    // Alleen onder home (koppelingen, ~/.bashrc) en het log mag iets bijkomen.
    const na = readdirSync(o.root, { recursive: true })
      .map(String)
      .filter((pad) => !pad.startsWith('home'))
      .sort();
    expect(status).toBe(0);
    expect(na).toStrictEqual(voor.filter((pad) => !pad.startsWith('home')));
  });

  test('cloud-zelfinstallatie/AC-3: CLAUDE_ENV_FILE niet te schrijven → !-regel, route 3 draagt', () => {
    const o = opstelling();

    const { status, uitvoer } = run(o, {
      localBinVoorop: false,
      env: { CLAUDE_ENV_FILE: path.join(o.root, 'bestaat-niet', 'env') },
    });

    expect(uitvoer).toMatch(/^! CLAUDE_ENV_FILE .* niet te schrijven$/m);
    expect(status, uitvoer).toBe(0);
    expect(uitvoer).toContain('! ~/.local/bin staat niet vóór de systeem-node');
  });

  test('cloud-zelfinstallatie/AC-4: geen enkele route → exit 1 na het installeren, met gevonden en verwachte versie', () => {
    const o = opstelling();
    bashrcOnschrijfbaar(o);

    const { status, uitvoer, aanroepen } = run(o, { localBinVoorop: false });

    expect(status).toBe(1);
    expect(uitvoer).toContain('✗ node op PATH is v22.0.0, verwacht 9.9.9');
    expect(uitvoer).toContain('docs/ENVIRONMENT.md, Problemen');
    expect(aanroepen).toEqual(expect.arrayContaining(NA_INSTALLEREN));
  });

  test('cloud-zelfinstallatie/AC-4: zonder route 1 maar met schrijfbare ~/.bashrc → exit 0 met waarschuwing voor hooks', () => {
    const o = opstelling();

    const { status, uitvoer } = run(o, { localBinVoorop: false });

    expect(status, uitvoer).toBe(0);
    expect(uitvoer).toContain('! ~/.local/bin staat niet vóór de systeem-node: hooks en git-hooks blijven op v22.0.0');
  });

  test('cloud-zelfinstallatie/AC-5: apt-get update of install faalt → !-regel, de latere stappen draaien en bepalen de exitcode', () => {
    for (const stap of ['update', 'install']) {
      const o = opstelling({ metSandbox: false });

      const { status, uitvoer, aanroepen } = run(o, { env: { APT_FAIL: stap } });

      expect(uitvoer).toContain(
        '! bubblewrap en socat niet geïnstalleerd (apt-get exit 100); de kooi kan niet starten',
      );
      expect(aanroepen).toEqual(expect.arrayContaining(NA_INSTALLEREN));
      expect(status, uitvoer).toBe(0);
    }

    const o = opstelling({ metSandbox: false });
    const { status } = run(o, { env: { APT_FAIL: 'update', MISE_FAIL: 'lefthook' } });
    expect(status).toBe(3);
  });
});
