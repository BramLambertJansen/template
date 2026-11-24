import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';

// cloud-werkmap-herstel (docs/template/specs/cloud-werkmap-herstel.md): in een cloudsessie (CLAUDE_CODE_REMOTE=true)
// installeert worktree-install ook in de hoofdcheckout, met `--config.confirm-modules-purge=false`, en haalt
// `pnpm pr:verify <nr> --zonder-werkmap` CI-bewijs op een PR-head zonder werkmap. De modules worden dynamisch geladen,
// zodat een ontbrekende export een falende assertie is en geen importfout.
const REPO = path.join(import.meta.dirname, '../..');
const INSTALL_MODULE = '../../scripts/kit/worktree-install.mjs';
const VERIFY_MODULE = '../../scripts/kit/pr-verify.mjs';
const installMod: unknown = await import(INSTALL_MODULE);
const verifyMod: unknown = await import(VERIFY_MODULE);

const PURGE_VLAG = '--config.confirm-modules-purge=false';
const HOOFDCHECKOUT_MELDING =
  '✗ worktree-install geweigerd: dit is de hoofdcheckout; die richt de eigenaar in met scripts/bootstrap.sh (docs/ENVIRONMENT.md)';
const GEBRUIK = 'Gebruik: pnpm pr:verify <nummer> [--watch] [--zonder-werkmap]';
const CLOUD_MELDING = '--zonder-werkmap werkt alleen in een cloudsessie (CLAUDE_CODE_REMOTE=true)';

type Besluit = { actie: 'installeren' } | { actie: 'weigeren'; melding: string };
type Commando = { command: string; args: string[]; env: Record<string, string> };
type Feiten = { worktree: boolean; nodeModules: string; gewijzigd: string[] };
type Uitkomst<T> = { ok: true; waarde: T } | { ok: false; fout: string };

function veld(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) throw new Error('object verwacht');
  return Object.fromEntries(Object.entries(raw));
}

function strings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
}

function exportFn(mod: unknown, naam: string): (...args: unknown[]) => unknown {
  const f: unknown = typeof mod === 'object' && mod !== null ? Reflect.get(mod, naam) : undefined;
  // Een assertie (geen throw): een ontbrekende export is een falende test, geen import- of typefout.
  expect(typeof f, `export ${naam}`).toBe('function');
  if (typeof f !== 'function') return () => undefined;
  return (...args) => {
    const uit: unknown = Reflect.apply(f, mod, args);
    return uit;
  };
}

function besluit(feiten: Record<string, unknown>): Besluit {
  const raw = veld(exportFn(installMod, 'worktreeInstallBesluit')(feiten));
  if (raw['actie'] === 'installeren') return { actie: 'installeren' };
  return { actie: 'weigeren', melding: typeof raw['melding'] === 'string' ? raw['melding'] : '' };
}

function melding(b: Besluit): string {
  return b.actie === 'weigeren' ? b.melding : '';
}

function commando(basis: string, ...cloud: boolean[]): Commando {
  const raw = veld(exportFn(installMod, 'worktreeInstallCommando')(basis, ...cloud));
  const env = Object.fromEntries(
    Object.entries(veld(raw['env'])).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])),
  );
  return { command: String(raw['command']), args: strings(raw['args']), env };
}

function feiten(root: string, ...cloud: boolean[]): Feiten {
  const raw = veld(exportFn(installMod, 'worktreeInstallFeiten')(root, ...cloud));
  return {
    worktree: raw['worktree'] === true,
    nodeModules: String(raw['nodeModules']),
    gewijzigd: strings(raw['gewijzigd']),
  };
}

function probeer<T>(f: () => T): Uitkomst<T> {
  try {
    return { ok: true, waarde: f() };
  } catch (fout) {
    return { ok: false, fout: fout instanceof Error ? fout.message : String(fout) };
  }
}

function argumentsFor(args: string[], cloud: boolean): Uitkomst<Record<string, unknown>> {
  const f = exportFn(verifyMod, 'argumentsFor');
  return probeer(() => veld(f(args, cloud)));
}

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};
const INHOUD: Record<string, string> = {
  'package.json': '{"name":"x","packageManager":"pnpm@11.0.0"}\n',
  'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
  'pnpm-workspace.yaml': 'packages: []\n',
  '.npmrc': 'strict-peer-dependencies=true\n',
};

function gitUit(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

// Hoofdcheckout (geen gekoppelde worktree) met de beheerde bestanden gecommit en het installatiescript erin.
function hoofdcheckout(): string {
  const main = tmp('cwh-main-');
  gitUit(main, 'init', '-q', '-b', 'main');
  for (const [naam, inhoud] of Object.entries(INHOUD)) writeFileSync(path.join(main, naam), inhoud);
  gitUit(main, 'add', '.');
  gitUit(main, 'commit', '-q', '-m', 'init');
  const kit = path.join(main, 'scripts/kit');
  mkdirSync(kit, { recursive: true });
  for (const naam of readdirSync(path.join(REPO, 'scripts/kit')))
    if (naam.endsWith('.mjs')) copyFileSync(path.join(REPO, 'scripts/kit', naam), path.join(kit, naam));
  return main;
}

// Nep-pnpm: legt de argumenten vast en weigert een onbekende optie zoals de echte pnpm. Alleen de opties van het script
// plus de eigen vlag `config.confirm-modules-purge` zijn toegestaan.
const TOEGESTAAN = [
  'frozen-lockfile',
  'package-import-method',
  'store-dir',
  'cache-dir',
  'config.confirm-modules-purge',
];

function nepPnpm(): { bin: string; log: string } {
  const bin = tmp('cwh-bin-');
  const log = path.join(bin, 'aanroep.json');
  const regels = [
    `#!${process.execPath}`,
    `const toegestaan = ${JSON.stringify(TOEGESTAAN)};`,
    'const args = process.argv.slice(2);',
    `require('node:fs').writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args }));`,
    "const onbekend = args.filter((a) => a.startsWith('-')).map((a) => a.replace(/^-+/, '').split('=')[0]).find((n) => !toegestaan.includes(n));",
    "if (onbekend !== undefined) { process.stderr.write('[ERROR] Unknown option: \\'' + onbekend + '\\'\\n'); process.exitCode = 1; }",
    '',
  ];
  writeFileSync(path.join(bin, 'pnpm'), regels.join('\n'));
  chmodSync(path.join(bin, 'pnpm'), 0o755);
  return { bin, log };
}

function pnpmArgs(log: string): string[] | null {
  try {
    return strings(veld(JSON.parse(readFileSync(log, 'utf8')))['args']);
  } catch {
    return null;
  }
}

// De omgeving van de runner zonder CLAUDE_CODE_REMOTE (in een cloudsessie staat die wel): de test bepaalt hem zelf.
function draaiScript(cwd: string, bin: string, cloud: boolean) {
  const basis = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k, v]) =>
        v !== undefined && !/^(XDG_|MISE_|npm_config_|pnpm_config_|CLAUDE_CODE_REMOTE$|NODE_OPTIONS$)/i.test(k),
    ),
  );
  return spawnSync(process.execPath, ['scripts/kit/worktree-install.mjs'], {
    cwd,
    encoding: 'utf8',
    env: {
      ...basis,
      ...GIT_ENV,
      TMPDIR: tmp('cwh-tmpdir-'),
      PATH: [bin, process.env['PATH'] ?? ''].join(path.delimiter),
      ...(cloud ? { CLAUDE_CODE_REMOTE: 'true' } : {}),
    },
  });
}

describe('cloud-werkmap-herstel: worktreeInstallBesluit', () => {
  const hoofd = { worktree: false, nodeModules: 'afwezig', gewijzigd: [] };

  test.each(['afwezig', 'map'])(
    'cloud-werkmap-herstel/AC-1: hoofdcheckout in de cloud met node_modules %s: installeren',
    (nodeModules) => {
      expect(besluit({ ...hoofd, nodeModules, cloud: true })).toStrictEqual({ actie: 'installeren' });
    },
  );

  test.each(['afwezig', 'map'])(
    'cloud-werkmap-herstel/AC-1: hoofdcheckout met cloud false of zonder cloud (node_modules %s): bestaande weigering',
    (nodeModules) => {
      const verwacht = { actie: 'weigeren', melding: HOOFDCHECKOUT_MELDING };

      expect(besluit({ ...hoofd, nodeModules, cloud: false })).toStrictEqual(verwacht);
      expect(besluit({ ...hoofd, nodeModules })).toStrictEqual(verwacht);
    },
  );

  test('cloud-werkmap-herstel/AC-2: hoofdcheckout in de cloud met symlink als node_modules: dezelfde weigering als in een worktree', () => {
    const inCloud = besluit({ ...hoofd, nodeModules: 'symlink', cloud: true });
    const inWorktree = besluit({ worktree: true, nodeModules: 'symlink', gewijzigd: [] });

    expect(inCloud.actie).toBe('weigeren');
    expect(melding(inCloud)).toMatch(/symlink/i);
    expect(melding(inCloud)).toBe(melding(inWorktree));
    expectAbsent(melding(inCloud), /hoofdcheckout/i, {
      recognizes: [HOOFDCHECKOUT_MELDING, 'Hoofdcheckout'],
      allows: ['node_modules is een symlink'],
    });
  });

  test('cloud-werkmap-herstel/AC-2: hoofdcheckout in de cloud met gewijzigd package.json: dezelfde weigering als in een worktree', () => {
    const gewijzigd = ['package.json'];
    const inCloud = besluit({ ...hoofd, gewijzigd, cloud: true });
    const inWorktree = besluit({ worktree: true, nodeModules: 'afwezig', gewijzigd });

    expect(inCloud.actie).toBe('weigeren');
    expect(melding(inCloud)).toContain('package.json');
    expect(melding(inCloud)).toBe(melding(inWorktree));
    expectAbsent(melding(inCloud), /hoofdcheckout/i, {
      recognizes: [HOOFDCHECKOUT_MELDING, 'Hoofdcheckout'],
      allows: ['node_modules is een symlink'],
    });
  });
});

describe('cloud-werkmap-herstel: worktreeInstallCommando', () => {
  const basis = path.join(tmpdir(), 'pnpm-wt');

  test('cloud-werkmap-herstel/AC-3: cloud true: --config.confirm-modules-purge=false is het laatste argument, de rest blijft gelijk', () => {
    const inCloud = commando(basis, true);
    const gewoon = commando(basis);

    expect(inCloud.args.at(-1)).toBe(PURGE_VLAG);
    expect(inCloud.args.filter((a) => a === PURGE_VLAG)).toHaveLength(1);
    expect(inCloud.args.slice(0, -1)).toStrictEqual(gewoon.args);
    expect(inCloud.args.slice(0, 2)).toStrictEqual(['install', '--frozen-lockfile']);
  });

  test('cloud-werkmap-herstel/AC-3: zonder cloud of met cloud false: geen purge-vlag en de argumenten van nu', () => {
    const gewoon = commando(basis);
    const expliciet = commando(basis, false);

    expect(gewoon.args.some((a) => a.includes('confirm-modules-purge'))).toBe(false);
    expect(expliciet).toStrictEqual(gewoon);
    expect(gewoon.args).toStrictEqual([
      'install',
      '--frozen-lockfile',
      '--package-import-method=copy',
      expect.stringMatching(/^--store-dir=/),
      expect.stringMatching(/^--cache-dir=/),
    ]);
  });
});

describe('cloud-werkmap-herstel: worktreeInstallFeiten (git-fixture)', () => {
  test('cloud-werkmap-herstel/AC-4: hoofdcheckout met afwijkend package.json: met cloud true staat het in gewijzigd, zonder cloud is de lijst leeg', () => {
    const main = hoofdcheckout();
    writeFileSync(path.join(main, 'package.json'), '{"name":"x","packageManager":"pnpm@11.0.0","private":true}\n');

    const inCloud = feiten(main, true);

    expect(inCloud.worktree).toBe(false);
    expect(inCloud.gewijzigd).toStrictEqual(['package.json']);
    expect(feiten(main).gewijzigd).toStrictEqual([]);
    expect(feiten(main, false).gewijzigd).toStrictEqual([]);
  });

  test('cloud-werkmap-herstel/AC-4: schone hoofdcheckout in de cloud: gewijzigd is leeg', () => {
    const main = hoofdcheckout();

    expect(feiten(main, true).gewijzigd).toStrictEqual([]);
  });
});

describe('cloud-werkmap-herstel: worktreeInstallFeiten tijdens een lopende merge (git-fixture)', () => {
  const MERGE_PKG = '{"name":"x","packageManager":"pnpm@11.0.0","dependencies":{"a":"1"}}\n';
  const MERGE_LOCK = "lockfileVersion: '9.0'\n# nieuwe lockfile uit main\n";

  // Hoofdcheckout met een niet-gecommitte merge: package.json en pnpm-lock.yaml staan op de versie van MERGE_HEAD.
  function metLopendeMerge(): string {
    const main = hoofdcheckout();
    gitUit(main, 'switch', '-q', '-c', 'zijtak');
    writeFileSync(path.join(main, 'package.json'), MERGE_PKG);
    writeFileSync(path.join(main, 'pnpm-lock.yaml'), MERGE_LOCK);
    gitUit(main, 'commit', '-q', '-am', 'zijtak');
    gitUit(main, 'switch', '-q', 'main');
    gitUit(main, 'merge', '--no-commit', '--no-ff', 'zijtak');
    expect(gitUit(main, 'rev-parse', '-q', '--verify', 'MERGE_HEAD')).toMatch(/^[0-9a-f]{40}$/);
    return main;
  }

  test('cloud-werkmap-herstel/AC-9: werkmap gelijk aan MERGE_HEAD maar anders dan HEAD: gewijzigd is leeg', () => {
    const main = metLopendeMerge();

    expect(feiten(main, true).gewijzigd).toStrictEqual([]);
  });

  test('cloud-werkmap-herstel/AC-9: beheerd bestand dat van HEAD en MERGE_HEAD afwijkt: staat in gewijzigd', () => {
    const main = metLopendeMerge();
    writeFileSync(path.join(main, 'package.json'), `${MERGE_PKG}# lokaal\n`);

    expect(feiten(main, true).gewijzigd).toStrictEqual(['package.json']);
  });

  test('cloud-werkmap-herstel/AC-9: dezelfde merge zonder cloud: gewijzigd is leeg', () => {
    const main = metLopendeMerge();

    expect(feiten(main).gewijzigd).toStrictEqual([]);
    expect(feiten(main, false).gewijzigd).toStrictEqual([]);
  });
});

describe('cloud-werkmap-herstel: node scripts/kit/worktree-install.mjs (nep-pnpm)', () => {
  test('cloud-werkmap-herstel/AC-5: CLAUDE_CODE_REMOTE=true in de hoofdcheckout: pnpm install met de purge-vlag als laatste argument', () => {
    const main = hoofdcheckout();
    const { bin, log } = nepPnpm();

    const r = draaiScript(main, bin, true);

    expect(r.status, r.stderr).toBe(0);
    const args = pnpmArgs(log);
    expect(args?.slice(0, 2)).toStrictEqual(['install', '--frozen-lockfile']);
    expect(args?.at(-1)).toBe(PURGE_VLAG);
  });

  test('cloud-werkmap-herstel/AC-5: zonder CLAUDE_CODE_REMOTE in de hoofdcheckout: status 1, hoofdcheckout-melding en pnpm niet aangeroepen', () => {
    const main = hoofdcheckout();
    const { bin, log } = nepPnpm();

    const r = draaiScript(main, bin, false);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain(HOOFDCHECKOUT_MELDING);
    expect(pnpmArgs(log)).toBeNull();
  });
});

describe('cloud-werkmap-herstel: argumentsFor', () => {
  test.each([
    { args: ['12'], watch: false, zonderWerkmap: false },
    { args: ['12', '--watch'], watch: true, zonderWerkmap: false },
    { args: ['12', '--zonder-werkmap'], watch: false, zonderWerkmap: true },
    { args: ['12', '--watch', '--zonder-werkmap'], watch: true, zonderWerkmap: true },
    { args: ['12', '--zonder-werkmap', '--watch'], watch: true, zonderWerkmap: true },
  ])('cloud-werkmap-herstel/AC-6: in de cloud geldig: $args', ({ args, watch, zonderWerkmap }) => {
    expect(argumentsFor(args, true)).toStrictEqual({ ok: true, waarde: { number: 12, watch, zonderWerkmap } });
  });

  test.each([
    { naam: 'geen argumenten', args: [] },
    { naam: 'nummer ontbreekt, alleen een vlag', args: ['--watch'] },
    { naam: 'nummer na een vlag', args: ['--watch', '12'] },
    { naam: 'ongeldig nummer', args: ['0'] },
    { naam: 'onbekende vlag', args: ['12', '--onbekend'] },
    { naam: 'dubbele --watch', args: ['12', '--watch', '--watch'] },
    { naam: 'dubbele --zonder-werkmap', args: ['12', '--zonder-werkmap', '--zonder-werkmap'] },
    { naam: 'tweede nummer', args: ['12', '13'] },
    { naam: 'meer dan drie argumenten', args: ['12', '--watch', '--zonder-werkmap', '--watch'] },
    { naam: 'onbekende vlag als derde', args: ['12', '--watch', '--onbekend'] },
  ])('cloud-werkmap-herstel/AC-6: de gebruiksmelding bij $naam', ({ args }) => {
    expect(argumentsFor(args, true)).toStrictEqual({ ok: false, fout: GEBRUIK });
    expect(argumentsFor(args, false)).toStrictEqual({ ok: false, fout: GEBRUIK });
  });

  test.each([
    { naam: 'alleen --zonder-werkmap', args: ['12', '--zonder-werkmap'] },
    { naam: '--watch en --zonder-werkmap', args: ['12', '--watch', '--zonder-werkmap'] },
  ])('cloud-werkmap-herstel/AC-6: buiten de cloud geeft $naam de cloudmelding', ({ args }) => {
    expect(argumentsFor(args, false)).toStrictEqual({ ok: false, fout: CLOUD_MELDING });
  });

  test('cloud-werkmap-herstel/AC-6: buiten de cloud blijven nummer en --watch werken', () => {
    expect(argumentsFor(['12', '--watch'], false)).toStrictEqual({
      ok: true,
      waarde: { number: 12, watch: true, zonderWerkmap: false },
    });
  });
});

describe('cloud-werkmap-herstel: prHeadKlopt', () => {
  const SHA = 'a'.repeat(40);
  const ANDERE_SHA = 'b'.repeat(40);
  const pr = { state: 'open', branch: 'feat/x', headSha: SHA };
  const klopt = (p: Record<string, string>, verwacht: { branch: string; head: string }): unknown =>
    exportFn(verifyMod, 'prHeadKlopt')(p, verwacht);

  test('cloud-werkmap-herstel/AC-7: open PR, gelijke branch en gelijke head-SHA: true', () => {
    expect(klopt(pr, { branch: 'feat/x', head: SHA })).toBe(true);
  });

  test('cloud-werkmap-herstel/AC-7: de head verandert tussen twee lezingen: false', () => {
    const vastgelegd = { branch: 'feat/x', head: SHA };

    expect(klopt(pr, vastgelegd)).toBe(true);
    expect(klopt({ ...pr, headSha: ANDERE_SHA }, vastgelegd)).toBe(false);
  });

  test('cloud-werkmap-herstel/AC-7: een PR die niet open is of een andere branch heeft: false', () => {
    const verwacht = { branch: 'feat/x', head: SHA };
    const uitkomsten = [
      klopt({ ...pr, state: 'closed' }, verwacht),
      klopt({ ...pr, state: 'merged' }, verwacht),
      klopt({ ...pr, state: '' }, verwacht),
      klopt({ ...pr, branch: 'feat/y' }, verwacht),
    ];

    expect(uitkomsten).toStrictEqual([false, false, false, false]);
  });
});
