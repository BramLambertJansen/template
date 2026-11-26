import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import { vermogen } from '../setup/vermogen.ts';
import { expectAbsent } from '../support/absence.ts';
import {
  MELDING_GEEN_BWRAP,
  MELDING_PROEF,
  beoordeelProef,
  bwrapArgs,
  proef,
  controleerWerkmap,
  inKooi,
} from '../../scripts/kit/kooi.mjs';

// docs/specs/kooi.md (ADR 0072): een commando in de kooi kan buiten zijn werkmap niets veranderen of bereiken. Geen
// verwijdercommando's: elke poging is afkappen (`: >`) of hernoemen (`mv`) van een kanariebestand, dat na afloop byte-gelijk
// en op zijn plek moet staan.
const KOOI = path.resolve('scripts/kit/kooi.mjs');
const INHOUD = 'kanarie\n';
const mappen: string[] = [];

function map(basis: string, prefix: string): string {
  const pad = realpathSync(mkdtempSync(path.join(basis, prefix)));
  mappen.push(pad);
  return pad;
}

function kanarie(basis: string): string {
  const pad = path.join(map(basis, '.kooi-kanarie-'), 'k.txt');
  writeFileSync(pad, INHOUD);
  return pad;
}

function processenMet(merk: string): string[] {
  return readdirSync('/proc')
    .filter((p) => /^\d+$/.test(p))
    .filter((p) => {
      try {
        return readFileSync(`/proc/${p}/cmdline`, 'utf8').includes(merk);
      } catch {
        return false;
      }
    });
}

afterEach(() => {
  for (const pad of mappen.splice(0)) rmSync(pad, { recursive: true, force: true });
});

describe('kooi/AC-2: de werkmap', () => {
  test.each([
    ['de tijdelijke map zelf', () => tmpdir()],
    ['de repository', () => process.cwd()],
    ['de thuismap', () => homedir()],
    ['/', () => '/'],
    [
      'een link naar de repository',
      () => {
        const link = path.join(map(tmpdir(), 'kooi-link-'), 'repo');
        symlinkSync(process.cwd(), link);
        return link;
      },
    ],
  ])('weigert %s', (_naam, werkmap) => {
    expect(() => controleerWerkmap(werkmap())).toThrow(/✗ kooi: werkmap/);
  });

  test('een submap van de tijdelijke map mag', () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    expect(controleerWerkmap(werkmap)).toBe(werkmap);
  });
});

describe('kooi/AC-3: dicht vallen', () => {
  test('zonder bubblewrap draait niets en noemt de melding de oplossing', () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    const r = spawnSync(process.execPath, [KOOI, '--werkmap', werkmap, '--', ': > gedraaid'], {
      encoding: 'utf8',
      // TMPDIR mee: zonder schrijft het kindproces in /tmp, dat niet overal schrijfbaar is (tests-naar-vermogen AC-4).
      env: { PATH: '/nergens', TMPDIR: tmpdir() },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(MELDING_GEEN_BWRAP);
    expect(readdirSync(werkmap)).toStrictEqual([]);
  });

  test('een proef zonder alleen-lezen bestandssysteem keurt de kooi af', () => {
    expect(beoordeelProef({ stdout: '', stderr: '' }, true)).toBe(MELDING_PROEF);
    expect(beoordeelProef({ stdout: 'Permission denied', stderr: '' }, true)).toBe(MELDING_PROEF);
    expect(beoordeelProef({ stdout: 'x: Read-only file system', stderr: '' }, false)).toContain('start niet');
    expect(beoordeelProef({ stdout: 'x: Read-only file system', stderr: '' }, true)).toBe('goed');
  });

  test('de proef keurt een echte kooi af die een systeemmap schrijfbaar laat (R-PRINC-04)', (ctx) => {
    ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding);
    // Kapot: een lege, schrijfbare /usr/share in de kooi. Schrijven lukt daar zonder de echte map te raken.
    const kapot = (werkmap: string) => [...bwrapArgs(werkmap), '--tmpfs', '/usr/share'];
    expect(proef(kapot, '/usr/share/.kooi-proef')).toBe(MELDING_PROEF);
    expect(proef()).toBe('goed');
  });

  test('de proef van de CLI slaagt hier', (ctx) => {
    ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding);
    const r = spawnSync(process.execPath, [KOOI, '--proef'], { encoding: 'utf8' });
    expect(r.stdout).toContain('✓ kooi');
    expect(r.status).toBe(0);
  });
});

describe('kooi/AC-1: het commando draait in de werkmap', () => {
  test('schrijven en lezen in de werkmap, met de toolchain en zonder tokens uit de omgeving', (ctx) => {
    ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding);
    const werkmap = map(tmpdir(), 'kooi-werk-');
    process.env['KOOI_GEHEIM'] = 'lekt';
    const r = inKooi(
      'printf binnen > a && cat a && node -e "process.stdout.write(String(process.env.KOOI_GEHEIM))" && git --version',
      {
        werkmap,
        env: { EIGEN: 'x' },
      },
    );
    Reflect.deleteProperty(process.env, 'KOOI_GEHEIM');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^binnenundefinedgit version/);
    expect(readFileSync(path.join(werkmap, 'a'), 'utf8')).toBe('binnen');
  });
});

// pnpm-sandbox/AC-1: `streng` maakt /tmp, /run, /var/run, de thuismap en XDG_RUNTIME_DIR leeg én alleen-lezen; schrijfbaar
// blijven alleen de werkmap en het vluchtige /dev, en TMPDIR is <werkmap>/tmp. XDG_RUNTIME_DIR leest `bwrapArgs` uit de omgeving van het proces zelf.
describe('pnpm-sandbox/AC-1: inKooi met streng', () => {
  const sockets: Server[] = [];
  beforeEach((ctx) => {
    ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding);
  });
  afterAll(() => {
    for (const s of sockets) s.close();
  });
  const poging = (pad: string) => `{ : > ${pad}; } 2>&1 && echo 'GESCHREVEN ${pad}'; true`;

  test('pnpm-sandbox/AC-1: schrijven in /tmp, /run, /var/run en de thuismap faalt op een alleen-lezen bestandssysteem', () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    const r = inKooi(['/tmp/x', '/run/x', '/var/run/x', '"$KOOI_HOME/x"'].map(poging).join('\n'), {
      werkmap,
      env: { KOOI_HOME: homedir() },
      streng: true,
    });
    expect(r.stdout.match(/Read-only file system/g)).toHaveLength(4);
    expectAbsent(r.stdout, /GESCHREVEN/, {
      recognizes: ['GESCHREVEN /tmp/x'],
      allows: [': /tmp/x: Read-only file system'],
    });
  });

  test('pnpm-sandbox/AC-1: een bestand dat vooraf in de echte thuismap staat, is niet leesbaar', () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    const geheim = kanarie(homedir());
    const r = inKooi(
      `{ cat '${geheim}' && echo home-gelezen; } 2>/dev/null; test -e '${geheim}' || echo onzichtbaar-home`,
      {
        werkmap,
        streng: true,
      },
    );
    expect(r.stdout).toContain('onzichtbaar-home');
    expectAbsent(r.stdout, /home-gelezen|kanarie/, {
      recognizes: ['home-gelezen', INHOUD],
      allows: ['onzichtbaar-home'],
    });
  });

  test('pnpm-sandbox/AC-1: een unix-socket in een eigen map buiten de werkmap, als XDG_RUNTIME_DIR gezet, is niet bereikbaar', async () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    const runtime = map('/var/tmp', 'kooi-runtime-');
    const pad = path.join(runtime, 's');
    const server = createServer((c) => c.end('verbonden'));
    sockets.push(server);
    await new Promise<void>((klaar) => server.listen(pad, klaar));
    const oud = process.env['XDG_RUNTIME_DIR'];
    process.env['XDG_RUNTIME_DIR'] = runtime;
    try {
      const r = inKooi(
        `node -e "require('net').connect('${pad}').on('data', (d) => console.log(String(d))).on('error', (e) => console.log(e.code))"`,
        { werkmap, streng: true },
      );
      expect(r.stdout.trim()).toBe('ENOENT');
    } finally {
      if (oud === undefined) Reflect.deleteProperty(process.env, 'XDG_RUNTIME_DIR');
      else process.env['XDG_RUNTIME_DIR'] = oud;
    }
  });

  test('pnpm-sandbox/AC-1: schrijven in de werkmap slaagt en $TMPDIR is <werkmap>/tmp, aangemaakt en schrijfbaar', () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    const r = inKooi('printf binnen > a && printf %s "$TMPDIR" && printf x > "$TMPDIR/y"', { werkmap, streng: true });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe(path.join(werkmap, 'tmp'));
    expect(readFileSync(path.join(werkmap, 'a'), 'utf8')).toBe('binnen');
    expect(readFileSync(path.join(werkmap, 'tmp', 'y'), 'utf8')).toBe('x');
  });

  test('pnpm-sandbox/AC-1: zonder streng slaagt `: > /tmp/x` zoals nu', () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    const r = inKooi(': > /tmp/x && echo geschreven', { werkmap });
    expect(r.stdout.trim()).toBe('geschreven');
  });
});

describe.each([false, true])('kooi/AC-4: de kooi schermt af (streng: %s)', (streng) => {
  const sockets: Server[] = [];
  beforeEach((ctx) => {
    ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding);
  });
  afterAll(() => {
    for (const s of sockets) s.close();
  });

  test('afkappen en hernoemen buiten de werkmap laten elk kanariebestand heel', () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    // /var/tmp is in de kooi zichtbaar en alleen-lezen; /tmp en de thuismap zijn leeg; de repository staat lokaal en in CI
    // meestal onder de thuismap en is dan ook onzichtbaar.
    const zichtbaar = kanarie('/var/tmp');
    const kanaries = [kanarie(tmpdir()), kanarie(homedir()), kanarie(path.resolve('node_modules')), zichtbaar];
    symlinkSync(path.dirname(zichtbaar), path.join(werkmap, 'naar-buiten'));
    const pogingen = kanaries.flatMap((k) => {
      const relatief = path.relative(werkmap, k);
      const inHome = path.relative(homedir(), k);
      return [
        `: > '${k}'`,
        `mv '${k}' '${k}.weg'`,
        `: > '${relatief}'`,
        `cd / && : > '.${k}'`,
        `: > "$KOOI_HOME/${inHome}"`,
      ];
    });
    pogingen.push(
      `: > naar-buiten/k.txt`,
      `mv naar-buiten/k.txt naar-buiten/weg.txt`,
      `test -e '${kanaries[0] ?? ''}' || echo onzichtbaar-tmp`,
      `test -e '${kanaries[1] ?? ''}' || echo onzichtbaar-home`,
    );
    const r = inKooi(`${pogingen.map((p) => `{ ${p}; } 2>&1`).join('; ')}; true`, {
      werkmap,
      env: { KOOI_HOME: homedir() },
      streng,
    });
    for (const k of kanaries) expect(readFileSync(k, 'utf8')).toBe(INHOUD);
    expect(r.stdout).toContain(`${zichtbaar}: Read-only file system`);
    expect(r.stdout).toContain('onzichtbaar-tmp');
    expect(r.stdout).toContain('onzichtbaar-home');
  });

  test('geen capabilities, geen sysctl of /sys, geen netwerk, geen thuismap', () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    const geheim = kanarie(homedir());
    const r = inKooi(
      [
        'grep -E "^Cap(Eff|Bnd):" /proc/self/status',
        // Geen echte waarde: lukt het toch, dan verandert de kernelinstelling zo min mogelijk.
        '{ printf core > /proc/sys/kernel/core_pattern && echo core-geschreven; } 2>/dev/null',
        '{ printf 0 > /proc/sys/vm/drop_caches && echo sysctl-geschreven; } 2>/dev/null',
        '{ : > /sys/kernel/kooi && echo sys-geschreven; } 2>/dev/null',
        '{ exec 3<>/dev/tcp/1.1.1.1/80 && echo net-open; } 2>/dev/null',
        `{ cat '${geheim}' && echo home-gelezen; } 2>/dev/null`,
        'true',
      ].join('; '),
      { werkmap, streng },
    );
    expect(r.stdout).toContain('CapEff:\t0000000000000000');
    expect(r.stdout).toContain('CapBnd:\t0000000000000000');
    expectAbsent(r.stdout, /geschreven|net-open|home-gelezen|kanarie/, {
      recognizes: ['core-geschreven', 'sysctl-geschreven', 'sys-geschreven', 'net-open', 'home-gelezen', INHOUD],
      allows: ['CapEff:\t0000000000000000'],
    });
  });

  test('een socket in de thuismap is in de kooi niet bereikbaar', async () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    const pad = path.join(map(homedir(), '.kooi-socket-'), 's');
    const server = createServer((c) => c.end('verbonden'));
    sockets.push(server);
    await new Promise<void>((klaar) => server.listen(pad, klaar));
    const r = inKooi(
      `node -e "require('net').connect('${pad}').on('data', (d) => console.log(String(d))).on('error', (e) => console.log(e.code))"`,
      { werkmap, streng },
    );
    expect(r.stdout.trim()).toBe('ENOENT');
  });

  test('de timeout stopt het commando met zijn kindprocessen', async () => {
    const werkmap = map(tmpdir(), 'kooi-werk-');
    const merk = `600.${String(process.pid)}`;
    const start = Date.now();
    expect(() => inKooi(`sleep ${merk} & sleep ${merk}`, { werkmap, timeout: 1000, streng })).toThrow();
    expect(Date.now() - start).toBeLessThan(10_000);
    // De kernel stopt de processen in de namespace asynchroon nadat bubblewrap is gestopt; wacht daar kort op.
    await expect.poll(() => processenMet(merk), { timeout: 5000 }).toStrictEqual([]);
  });
});

// Cloudsessie: `scripts/cloud-setup.sh` (TERUGVAL) installeert tools in `~/.local/share/mise-terugval/<tool>-<versie>` en
// registreert ze met `mise link` (docs/ENVIRONMENT.md, "Voor mise onzichtbaar"). De installs onder `~/.local/share/mise` zijn dan
// symlinks naar die map; zonder eigen alleen-lezen bind wijzen ze in de strenge kooi naar een lege plek. `os.homedir()` volgt
// `HOME`, dus de thuismap is hier te injecteren zonder wijziging van `bwrapArgs`.
describe('kooi: mise-terugval', () => {
  const MISE = path.join('.local', 'share', 'mise');
  const TERUGVAL = path.join('.local', 'share', 'mise-terugval');

  function argsMetHome(home: string): string[] {
    const oud = process.env['HOME'];
    process.env['HOME'] = home;
    try {
      return bwrapArgs(map(tmpdir(), 'kooi-werk-'), { streng: true });
    } finally {
      if (oud === undefined) Reflect.deleteProperty(process.env, 'HOME');
      else process.env['HOME'] = oud;
    }
  }

  function thuis(metTerugval: boolean): { home: string; mise: string; terugval: string } {
    const home = map(tmpdir(), 'kooi-home-');
    const mise = path.join(home, MISE, 'installs', 'pnpm');
    const terugval = path.join(home, TERUGVAL);
    mkdirSync(mise, { recursive: true });
    if (metTerugval) mkdirSync(path.join(terugval, 'pnpm-12.21.0'), { recursive: true });
    return { home, mise: path.join(home, MISE), terugval };
  }

  function roBinds(args: string[]): string[] {
    return args.flatMap((a, i) => (a === '--ro-bind' && args[i + 1] === args[i + 2] ? [args[i + 1] ?? ''] : []));
  }

  test('koppelt ~/.local/share/mise-terugval alleen-lezen terug, na de tmpfs van de thuismap', () => {
    const { home, mise, terugval } = thuis(true);
    const args = argsMetHome(home);
    expect(roBinds(args)).toContain(mise);
    const bind = args.findIndex((a, i) => a === '--ro-bind' && args[i + 1] === terugval && args[i + 2] === terugval);
    expect(bind).toBeGreaterThan(args.findIndex((a, i) => a === '--tmpfs' && args[i + 1] === home));
  });

  test('zonder die map blijven de argumenten ongewijzigd en ontbreekt hij', () => {
    const { home, mise } = thuis(false);
    const args = argsMetHome(home);
    expect(roBinds(args)).toContain(mise);
    expectAbsent(args.join(' '), /mise-terugval/, {
      recognizes: ['--ro-bind /h/.local/share/mise-terugval /h/.local/share/mise-terugval'],
      allows: [`--ro-bind /h/${MISE} /h/${MISE}`],
    });
  });

  test('de map wordt nooit schrijfbaar gebonden', () => {
    const { home, terugval } = thuis(true);
    const args = argsMetHome(home);
    expect(roBinds(args)).toContain(terugval);
    const schrijfbaar = args.filter(
      (a, i) => ['--bind', '--bind-try'].includes(args[i - 1] ?? '') && a.includes('mise'),
    );
    expect(schrijfbaar).toStrictEqual([]);
  });
});
