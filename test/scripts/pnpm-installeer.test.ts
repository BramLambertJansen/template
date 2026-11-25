import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { inKooi } from '../../scripts/kit/kooi.mjs';
import { pnpmInstallCommando } from '../../scripts/kit/pnpm-installeer.mjs';
import { vermogen } from '../setup/vermogen.ts';
import { expectAbsent } from '../support/absence.ts';

// Spec pnpm-sandbox-installatie: één installatiepad voor pnpm (scripts/kit/pnpm-installeer.mjs), getoetst in de strenge kooi.
// AC-1 staat in test/scripts/kooi.test.ts. De kooitests (AC-2, AC-3) worden zonder werkende bubblewrap overgeslagen; in CI is
// overslaan rood (ADR 0088).
const REPO = path.resolve(import.meta.dirname, '../..');
const CLI = path.join(REPO, 'scripts/kit/pnpm-installeer.mjs');
const LOCK_TIMEOUT = 120_000;
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  dirs.push(dir);
  return dir;
}

describe('pnpm-sandbox/AC-4: de pure kern pnpmInstallCommando', () => {
  const basis = '/basis';
  const xdg = {
    XDG_DATA_HOME: '/basis/data',
    XDG_CACHE_HOME: '/basis/xdg-cache',
    XDG_STATE_HOME: '/basis/xdg-state',
    XDG_RUNTIME_DIR: '/basis/xdg-run',
  };
  const werkmapArgs = [
    'install',
    '--frozen-lockfile',
    '--package-import-method=copy',
    '--store-dir=/basis/store',
    '--cache-dir=/basis/cache',
  ];
  const purge = '--config.confirm-modules-purge=false';

  test('pnpm-sandbox/AC-4: werkmap geeft de argumenten en omgeving van worktree-install', () => {
    expect(pnpmInstallCommando(basis, { modus: 'werkmap' })).toStrictEqual({
      command: 'pnpm',
      args: werkmapArgs,
      env: xdg,
    });
  });

  test('pnpm-sandbox/AC-4: setup installeert met de gewone store en zet alleen XDG_RUNTIME_DIR', () => {
    expect(pnpmInstallCommando(basis, { modus: 'setup' })).toStrictEqual({
      command: 'pnpm',
      args: ['install', '--frozen-lockfile'],
      env: { XDG_RUNTIME_DIR: '/basis/xdg-run' },
    });
  });

  test('pnpm-sandbox/AC-4: cloud voegt als laatste argument --config.confirm-modules-purge=false toe, in beide modi', () => {
    expect(pnpmInstallCommando(basis, { modus: 'werkmap', cloud: true })).toStrictEqual({
      command: 'pnpm',
      args: [...werkmapArgs, purge],
      env: xdg,
    });
    expect(pnpmInstallCommando(basis, { modus: 'setup', cloud: true })).toStrictEqual({
      command: 'pnpm',
      args: ['install', '--frozen-lockfile', purge],
      env: { XDG_RUNTIME_DIR: '/basis/xdg-run' },
    });
  });
});

// De regel van AC-5. Tekst tussen aanhalingstekens en commentaar (`#` aan het begin van een woord, tot regeleinde) gaan eerst
// weg; een commentaar met een apostrof valt zo onder het commentaar, want dat begint eerder.
const SH_TEKST = /'[^']*'|"(?:\\.|[^"\\])*"|^#[^\n]*|(?<=\s)#[^\n]*/gm;
const SH_AANROEP = /(?:^|[;&|]|\b(?:then|do)\b|\bmise\s+exec\s+--)\s*pnpm\s+install\b/m;
const JS_AANROEP = /(['"])pnpm\1[\s\S]{0,200}(['"])install\2/;

function startPnpmInstall(bestand: string, tekst: string): boolean {
  if (bestand.endsWith('.sh')) return SH_AANROEP.test(tekst.replace(SH_TEKST, (m) => (m.startsWith('#') ? '' : 'Q')));
  return JS_AANROEP.test(tekst);
}

function scriptBestanden(): string[] {
  return readdirSync(path.join(REPO, 'scripts'), { recursive: true })
    .map(String)
    .filter((p) => !p.split(path.sep).includes('node_modules') && /\.(sh|mjs|ts)$/.test(p))
    .sort();
}

describe('pnpm-sandbox/AC-5: alleen scripts/kit/pnpm-installeer.mjs start een pnpm-installatie', () => {
  test('pnpm-sandbox/AC-5: de regel herkent de aanroepen uit de spec', () => {
    const herkend: [string, string][] = [
      ['a.sh', 'mise exec -- pnpm install --frozen-lockfile'],
      ['a.sh', 'cd x && pnpm install'],
      ['a.sh', 'pnpm install'],
      ['a.sh', 'bouw; pnpm install'],
      ['a.sh', 'bouw || pnpm install'],
      ['a.sh', 'bouw | pnpm install'],
      ['a.sh', 'if x; then pnpm install; fi'],
      ['a.sh', 'for x in y; do pnpm install; done'],
      ['a.mjs', "{ command: 'pnpm', args: ['install'] }"],
      ['a.ts', 'spawnSync("pnpm", ["install", "--frozen-lockfile"])'],
    ];
    for (const [bestand, tekst] of herkend) expect(startPnpmInstall(bestand, tekst), tekst).toBe(true);
  });

  test('pnpm-sandbox/AC-5: de regel laat commentaar, meldingen en stapnamen met rust', () => {
    const toegestaan: [string, string][] = [
      ['a.sh', '# pnpm install'],
      ['a.sh', 'bouw # pnpm install'],
      ['a.sh', "printf '✗ pnpm install mislukt'"],
      ['a.sh', "'pnpm install --frozen-lockfile'"],
      ['a.sh', 'fail "draai eerst pnpm install"'],
      ['a.sh', 'mise exec -- pnpm exec lefthook install'],
      ['a.mjs', "'pnpm install --frozen-lockfile'"],
      ['a.mjs', "console.error('draai eerst pnpm install')"],
    ];
    expect(toegestaan.filter(([bestand, tekst]) => startPnpmInstall(bestand, tekst))).toStrictEqual([]);
  });

  test('pnpm-sandbox/AC-5: in de huidige scripts/ is scripts/kit/pnpm-installeer.mjs de enige treffer', () => {
    const treffers = scriptBestanden().filter((p) =>
      startPnpmInstall(p, readFileSync(path.join(REPO, 'scripts', p), 'utf8')),
    );

    expect(treffers).toStrictEqual(['kit/pnpm-installeer.mjs']);
  });

  test('pnpm-sandbox/AC-5: worktree-install.mjs importeert installeer uit de module', () => {
    const bron = readFileSync(path.join(REPO, 'scripts/kit/worktree-install.mjs'), 'utf8');

    expect(bron).toMatch(/import\s*\{[^}]*\binstalleer\b[^}]*\}\s*from\s*['"]\.\/pnpm-installeer\.mjs['"]/);
  });

  test('pnpm-sandbox/AC-5: de module importeert worktree-install.mjs nooit (de richting is eenzijdig)', () => {
    const bron = readFileSync(CLI, 'utf8');

    expectAbsent(bron, /from\s+['"][^'"]*worktree-install/, {
      recognizes: ["import { x } from './worktree-install.mjs';", 'import y from "../kit/worktree-install"'],
      allows: ['// worktree-install.mjs roept deze module aan', "import path from 'node:path';"],
    });
  });
});

// Een pnpm-stub op PATH. De CLI start de stub als `pnpm`; het logbestand krijgt de argumenten, het markerbestand bewijst een start.
function pnpmStub(body: string): { bin: string; log: string; marker: string } {
  const bin = tmp('pnpm-stub-');
  const log = path.join(bin, 'args.log');
  const marker = path.join(bin, 'gestart');
  writeFileSync(path.join(bin, 'pnpm'), `#!/bin/sh\necho "$@" >> "${log}"\n: > "${marker}"\n${body}\n`);
  chmodSync(path.join(bin, 'pnpm'), 0o755);
  return { bin, log, marker };
}

function draaiCli(modus: 'werkmap' | 'setup', bin: string, extra: { cloud?: boolean; tmpdir?: string } = {}) {
  return spawnSync(process.execPath, [CLI, '--modus', modus, ...(extra.cloud === true ? ['--cloud'] : [])], {
    cwd: tmp('pnpm-project-'),
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: tmp('pnpm-home-'),
      TMPDIR: extra.tmpdir ?? tmp('pnpm-tmpdir-'),
    },
  });
}

const MODI = ['werkmap', 'setup'] as const;
const LOCK_FOUT = "echo 'ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK' >&2; exit 1";
const NETWERK_REGEL = '✗ pnpm install mislukt (exit 1): waarschijnlijk geen netwerk → docs/ENVIRONMENT.md, Problemen.';
const TRUSTED_REGEL = '  → staat netwerktoegang van de omgeving op Trusted (claude.ai/code)? Is de proxy bereikbaar?';

describe('pnpm-sandbox/AC-6: de melding bij een mislukte installatie', () => {
  test.each(MODI)(
    'pnpm-sandbox/AC-6: vergrendelfout (%s): exit 1, "zie de pnpm-fout hierboven", niet "geen netwerk"',
    (modus) => {
      const { bin } = pnpmStub(LOCK_FOUT);

      const r = draaiCli(modus, bin);

      expect(r.status, r.stderr).toBe(1);
      expect(r.stderr).toContain('ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK');
      expect(r.stderr).toContain(
        '✗ pnpm install mislukt (exit 1): zie de pnpm-fout hierboven → docs/ENVIRONMENT.md, Problemen.',
      );
      expectAbsent(r.stderr, /waarschijnlijk geen netwerk/, {
        recognizes: [NETWERK_REGEL],
        allows: ['✗ pnpm install mislukt (exit 1): zie de pnpm-fout hierboven → docs/ENVIRONMENT.md, Problemen.'],
      });
    },
  );

  test.each(['ERR_PNPM_FETCH_404', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'])(
    'pnpm-sandbox/AC-6: %s is een netwerkfout; zonder --cloud geen tweede regel',
    (code) => {
      const { bin } = pnpmStub(`echo '${code}' >&2; exit 1`);

      const r = draaiCli('werkmap', bin);

      expect(r.status, r.stderr).toBe(1);
      expect(r.stderr).toContain(NETWERK_REGEL);
      expectAbsent(r.stderr, /Trusted/, {
        recognizes: [TRUSTED_REGEL],
        allows: [NETWERK_REGEL],
      });
    },
  );

  test('pnpm-sandbox/AC-6: met --cloud volgt na de netwerkmelding een ingesprongen tweede regel over Trusted en de proxy', () => {
    const { bin } = pnpmStub("echo 'ERR_PNPM_FETCH_404' >&2; exit 1");

    const r = draaiCli('setup', bin, { cloud: true });

    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain(`${NETWERK_REGEL}\n${TRUSTED_REGEL}\n`);
  });

  test('pnpm-sandbox/AC-6: de exitcode van pnpm komt terug in de melding en als exitcode van de CLI', () => {
    const { bin } = pnpmStub("echo 'iets anders' >&2; exit 3");

    const r = draaiCli('werkmap', bin);

    expect(r.status, r.stderr).toBe(3);
    expect(r.stderr).toContain('✗ pnpm install mislukt (exit 3): zie de pnpm-fout hierboven');
  });

  test('pnpm-sandbox/AC-6: een geslaagde installatie geeft exit 0 en geen melding; --cloud sluit de argumenten af met het purge-vlagje', () => {
    const { bin, log } = pnpmStub('exit 0');

    const r = draaiCli('setup', bin, { cloud: true });

    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).not.toContain('✗');
    expect(readFileSync(log, 'utf8').trim()).toBe('install --frozen-lockfile --config.confirm-modules-purge=false');
  });
});

describe('pnpm-sandbox/AC-7: de basismap is niet aan te maken', () => {
  test.each(MODI)(
    'pnpm-sandbox/AC-7: TMPDIR onder /proc/nee (%s): exit 1, basismapmelding, pnpm niet gestart',
    (modus) => {
      const { bin, marker } = pnpmStub('exit 0');

      const r = draaiCli(modus, bin, { tmpdir: '/proc/nee' });

      expect(r.status, r.stderr).toBe(1);
      expect(r.stderr).toMatch(/^✗ pnpm-installeer: \/proc\/nee\S* niet aan te maken \(.+\); controleer TMPDIR$/m);
      // De stub schrijft bij elke start een logbestand en een markerbestand naast zichzelf: dan staat er alleen `pnpm`.
      expect(readdirSync(path.dirname(marker)), 'pnpm is gestart').toStrictEqual(['pnpm']);
    },
  );
});

// De kooitests (AC-2, AC-3): een fixtureproject in een werkmap onder os.tmpdir(), geïnstalleerd met de echte pnpm in de
// strenge kooi. Het lockbestand is een geldig bestand voor nul dependencies: het eerste document van het lockbestand van de
// repo (de pnpm-pin) plus een leeg projectdocument.
const pakket: unknown = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const manager: unknown =
  typeof pakket === 'object' && pakket !== null ? Reflect.get(pakket, 'packageManager') : undefined;
const PACKAGE_MANAGER = typeof manager === 'string' ? manager : '';
const PIN = /^pnpm@([^+]+)/.exec(PACKAGE_MANAGER)?.[1] ?? '';

function fixtureLock(): string {
  const [, env] = readFileSync(path.join(REPO, 'pnpm-lock.yaml'), 'utf8').split(/^---\n/m);
  const project =
    "lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n\nimporters:\n\n  .: {}\n";
  return `---\n${env ?? ''}---\n${project}`;
}

// Buiten de kooi: de echte pnpm-binary (`mise which pnpm`, anders `which pnpm` na realpath).
function echtePnpm(): string {
  for (const [command, args] of [
    ['mise', ['which', 'pnpm']],
    ['which', ['pnpm']],
  ] as const) {
    const r = spawnSync(command, args, { cwd: REPO, encoding: 'utf8' });
    const pad = r.stdout.trim();
    if (r.status === 0 && pad !== '') return realpathSync(pad);
  }
  throw new Error('✗ geen pnpm gevonden: noch `mise which pnpm` noch `which pnpm` geeft een pad');
}

function kooiFixture(): { werkmap: string; pad: string } {
  const bin = path.dirname(echtePnpm());
  const versie = spawnSync(path.join(bin, 'pnpm'), ['--version'], {
    cwd: tmpdir(),
    encoding: 'utf8',
    timeout: 30_000,
  }).stdout.trim();
  // Rood, niet overgeslagen: in de kooi zou pnpm zonder netwerk een andere versie willen ophalen.
  expect(versie, `pnpm in ${bin} is ${versie}, de pin in package.json is ${PIN}`).toBe(PIN);
  const werkmap = tmp('pnpm-kooi-');
  writeFileSync(
    path.join(werkmap, 'package.json'),
    `${JSON.stringify({ name: 'fixture', version: '0.0.0', private: true, packageManager: PACKAGE_MANAGER })}\n`,
  );
  writeFileSync(path.join(werkmap, 'pnpm-lock.yaml'), fixtureLock());
  // De repo staat in CI onder de thuismap en is in de kooi onzichtbaar: de module reist mee in de werkmap.
  copyFileSync(CLI, path.join(werkmap, 'pnpm-installeer.mjs'));
  return { werkmap, pad: `${bin}:${path.dirname(process.execPath)}:${process.env['PATH'] ?? '/usr/bin:/bin'}` };
}

describe('pnpm-sandbox/AC-2 en AC-3: installeren in de strenge kooi', () => {
  test(
    'pnpm-sandbox/AC-2: pnpm-installeer.mjs --modus werkmap installeert het fixtureproject: status 0 en node_modules/.modules.yaml',
    (ctx) => {
      ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding);
      const { werkmap, pad } = kooiFixture();

      const r = inKooi('node pnpm-installeer.mjs --modus werkmap', {
        werkmap,
        env: { PATH: pad },
        timeout: LOCK_TIMEOUT,
        streng: true,
      });

      expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
      expect(existsSync(path.join(werkmap, 'node_modules/.modules.yaml'))).toBe(true);
    },
    LOCK_TIMEOUT + 30_000,
  );

  test(
    'pnpm-sandbox/AC-3: pnpm install met de omgeving van werkmap maar zonder XDG_RUNTIME_DIR faalt in de kooi (ADR 0110)',
    (ctx) => {
      ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding);
      const { werkmap, pad } = kooiFixture();
      const basis = path.join(werkmap, 'basis');
      const { args, env } = pnpmInstallCommando(basis, { modus: 'werkmap' });
      const zonderRuntime = Object.fromEntries(Object.entries(env).filter(([naam]) => naam !== 'XDG_RUNTIME_DIR'));

      const r = inKooi(`mkdir -p '${basis}' && pnpm ${args.join(' ')}`, {
        werkmap,
        env: { PATH: pad, ...zonderRuntime },
        timeout: LOCK_TIMEOUT,
        streng: true,
      });

      expect(r.status, `${r.stdout}${r.stderr}`).not.toBe(0);
      // Niet elke fout telt: het moet de vergrendeling buiten de werkmap zijn die de kooi tegenhoudt.
      expect(`${r.stdout}${r.stderr}`).toMatch(/ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK|Read-only file system|EROFS/);
    },
    LOCK_TIMEOUT + 30_000,
  );
});
