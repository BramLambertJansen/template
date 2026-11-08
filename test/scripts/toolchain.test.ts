import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { toolchainProbleem, toolchainProbleemIn } from '../../scripts/kit/toolchain.mjs';
import { afterEach, describe, expect, test, vi } from 'vitest';

// scripts/kit/toolchain.mjs en de voorcontrole in scripts/kit/feiten.mjs: één leesbare regel i.p.v. een stacktrace.
const REPO = path.join(import.meta.dirname, '../..');
const MISE = '[tools]\nnode = "26.11.1"\npnpm = "11"\n';
const dirs: string[] = [];
const segmenten = (regel: string | null) => (regel ?? '').split('; ');

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('toolchainProbleem', () => {
  test('juiste versie en node_modules aanwezig: null', () => {
    expect(toolchainProbleem({ node: 'v26.11.1', miseToml: MISE, nodeModules: true })).toBeNull();
  });

  test.each(['v26.12.0', 'v26.11.2'])('%s valt binnen de engines-range met node_modules: null', (node) => {
    expect(toolchainProbleem({ node, miseToml: MISE, nodeModules: true })).toBeNull();
  });

  test.each(['v26.10.9', 'v27.0.0'])('%s valt buiten de engines-range: één regel die de versie noemt', (node) => {
    const regel = toolchainProbleem({ node, miseToml: MISE, nodeModules: true });

    expect(regel).not.toBeNull();
    expect(regel).not.toContain('\n');
    expect(regel).toMatch(/^✗ toolchain ontbreekt:/);
    expect(regel).toContain(node);
  });

  test.each([
    {
      naam: 'andere versie',
      node: 'v22.22.0',
      toml: MISE,
      nm: true,
      bevat: ['v22.22.0', '26.11.1'],
      mist: ['node_modules ontbreekt'],
    },
    {
      naam: 'geen node_modules',
      node: 'v26.11.1',
      toml: MISE,
      nm: false,
      bevat: ['node_modules ontbreekt'],
      mist: ['v22.22.0'],
    },
    {
      naam: 'beide',
      node: 'v22.22.0',
      toml: MISE,
      nm: false,
      bevat: ['v22.22.0', '26.11.1', 'node_modules ontbreekt'],
      mist: [],
    },
    {
      naam: 'geen node-regel, wel node_modules',
      node: 'v22.22.0',
      toml: '[tools]\npnpm = "11"\n',
      nm: true,
      bevat: [],
      mist: [],
      nul: true,
    },
    {
      naam: 'geen node-regel, geen node_modules',
      node: 'v22.22.0',
      toml: '[tools]\npnpm = "11"\n',
      nm: false,
      bevat: ['node_modules ontbreekt'],
      mist: ['v22.22.0'],
    },
  ])('$naam', ({ node, toml, nm, bevat, mist, nul }) => {
    const regel = toolchainProbleem({ node, miseToml: toml, nodeModules: nm });

    if (nul) {
      expect(regel).toBeNull();
      return;
    }
    expect(regel).not.toBeNull();
    expect(regel).not.toContain('\n');
    expect(regel).toMatch(/^✗ toolchain ontbreekt:/);
    expect(regel).toContain('bash scripts/cloud-setup.sh');
    expect(regel).toContain('docs/ENVIRONMENT.md');
    for (const tekst of bevat) expect(regel).toContain(tekst);
    for (const tekst of mist) expect(regel).not.toContain(tekst);
  });
});

// claude-sandbox-werkstraat/AC-12: per probleem apart het herstel. Nieuw optioneel feit `worktree` (boolean, standaard
// false = hoofdcheckout), zodat de bestaande asserties hierboven ongewijzigd blijven gelden. Segmenten staan gescheiden
// door '; ' en elk segment is "<probleem> → <herstel>".
describe('toolchainProbleem per probleem het herstel (AC-12)', () => {
  const WORKTREE_HERSTEL = 'node scripts/kit/worktree-install.mjs';
  // Het feit gaat via een variabele, zodat de typecheck ook vóór de implementatie op de assertie faalt.
  const metWorktree = (basis: { node: string; miseToml: string; nodeModules: boolean }, worktree: boolean) => {
    const feiten = { ...basis, worktree };
    return toolchainProbleem(feiten);
  };

  test('worktree zonder node_modules: herstel is letterlijk het worktree-script, niet bootstrap', () => {
    const regel = metWorktree({ node: 'v26.11.1', miseToml: MISE, nodeModules: false }, true);

    expect(regel).not.toBeNull();
    expect(regel).not.toContain('\n');
    expect(regel).toMatch(/^✗ toolchain ontbreekt:/);
    expect(regel).toContain(WORKTREE_HERSTEL);
    expect(regel).not.toContain('bootstrap.sh');
    expect(regel).not.toContain('cloud-setup.sh');
  });

  test('worktree met afwijkende Node en node_modules aanwezig: nog steeds bootstrap, geen worktree-script', () => {
    const regel = metWorktree({ node: 'v22.22.0', miseToml: MISE, nodeModules: true }, true);

    expect(regel).toContain('scripts/bootstrap.sh');
    expect(regel).not.toContain(WORKTREE_HERSTEL);
  });

  test('worktree met afwijkende Node en ontbrekende node_modules: beide, elk met eigen herstel', () => {
    const regel = metWorktree({ node: 'v22.22.0', miseToml: MISE, nodeModules: false }, true);
    const delen = segmenten(regel);
    const nodeDeel = delen.find((d) => d.includes('v22.22.0'));
    const modulesDeel = delen.find((d) => d.includes('node_modules ontbreekt'));

    expect(regel).not.toContain('\n');
    expect(nodeDeel).toContain('scripts/bootstrap.sh');
    expect(nodeDeel).not.toContain(WORKTREE_HERSTEL);
    expect(modulesDeel).toContain(WORKTREE_HERSTEL);
    expect(modulesDeel).not.toContain('bootstrap.sh');
  });

  test.each([
    { naam: 'alleen node_modules weg', node: 'v26.11.1', nm: false },
    { naam: 'afwijkende Node en node_modules weg', node: 'v22.22.0', nm: false },
    { naam: 'afwijkende Node', node: 'v22.22.0', nm: true },
  ])('hoofdcheckout ($naam): elk herstel blijft bootstrap/cloud-setup, nooit het worktree-script', ({ node, nm }) => {
    const regel = metWorktree({ node, miseToml: MISE, nodeModules: nm }, false);

    expect(regel).toContain('scripts/bootstrap.sh');
    expect(regel).toContain('bash scripts/cloud-setup.sh');
    expect(regel).not.toContain(WORKTREE_HERSTEL);
    for (const deel of segmenten(regel)) expect(deel).toContain('scripts/bootstrap.sh');
  });

  test('geen worktree-feit opgegeven telt als hoofdcheckout', () => {
    const regel = toolchainProbleem({ node: 'v26.11.1', miseToml: MISE, nodeModules: false });

    expect(regel).not.toContain(WORKTREE_HERSTEL);
    expect(regel).toContain('scripts/bootstrap.sh');
  });

  test('worktree met alles in orde: null', () => {
    expect(metWorktree({ node: 'v26.11.1', miseToml: MISE, nodeModules: true }, true)).toBeNull();
  });

  // Review: ook de pnpm-versie hoort bij de meldingen; toolchainProbleemIn meldt hem samen met een ontbrekende
  // node_modules, elk met eigen herstel (pnpm → bootstrap, node_modules → worktree-script in een worktree).
  test('worktree met pnpm-mismatch en zonder node_modules: beide, elk met eigen herstel', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'toolchain-wt-'));
    dirs.push(root);
    mkdirSync(path.join(root, 'bin'));
    writeFileSync(path.join(root, '.git'), 'gitdir: /nergens/.git/worktrees/wt\n');
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.28.2' }));
    writeFileSync(path.join(root, 'mise.toml'), MISE.replace('26.11.1', process.version.replace(/^v/, '')));
    writeFileSync(path.join(root, 'bin/pnpm'), "#!/bin/sh\nprintf '%s\\n' '11.28.5'\n");
    chmodSync(path.join(root, 'bin/pnpm'), 0o755);
    vi.stubEnv('PATH', path.join(root, 'bin'));

    const regel = toolchainProbleemIn(root);
    const delen = segmenten(regel);
    const pnpmDeel = delen.find((d) => d.includes('11.28.5'));
    const modulesDeel = delen.find((d) => d.includes('node_modules ontbreekt'));

    expect(regel).not.toContain('\n');
    expect(pnpmDeel).toContain('scripts/bootstrap.sh');
    expect(pnpmDeel).not.toContain(WORKTREE_HERSTEL);
    expect(modulesDeel).toContain(WORKTREE_HERSTEL);
    expect(modulesDeel).not.toContain('bootstrap.sh');
  });

  // I4: een ontbrekende of ongeldige packageManager-pin wordt altijd gemeld, ook naast een ander probleem,
  // met herstel scripts/bootstrap.sh (de eigenaar beheert pnpm, niet het worktree-script).
  test.each([
    { naam: 'gekoppelde worktree', git: 'bestand' },
    { naam: 'hoofdcheckout', git: 'map' },
  ])('pin ontbreekt naast ontbrekende node_modules ($naam): beide gemeld, pin met bootstrap', ({ git }) => {
    const root = mkdtempSync(path.join(tmpdir(), 'toolchain-pin-'));
    dirs.push(root);
    if (git === 'bestand') writeFileSync(path.join(root, '.git'), 'gitdir: /nergens/.git/worktrees/wt\n');
    else mkdirSync(path.join(root, '.git'));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x' }));
    writeFileSync(path.join(root, 'mise.toml'), MISE.replace('26.11.1', process.version.replace(/^v/, '')));
    vi.stubEnv('PATH', path.join(root, 'bin'));

    const regel = toolchainProbleemIn(root);
    const delen = segmenten(regel);
    const pinDeel = delen.find((d) => d.includes('packageManager'));
    const modulesDeel = delen.find((d) => d.includes('node_modules ontbreekt'));

    expect(regel).not.toContain('\n');
    expect(pinDeel).toContain('scripts/bootstrap.sh');
    expect(pinDeel).not.toContain(WORKTREE_HERSTEL);
    expect(modulesDeel).toBeDefined();
    expect(modulesDeel).toContain(git === 'bestand' ? WORKTREE_HERSTEL : 'scripts/bootstrap.sh');
  });
});

describe('scripts/kit/feiten.mjs voorcontrole', () => {
  test.each([
    { naam: 'gekoppelde worktree (.git is een bestand)', gitIsBestand: true },
    { naam: 'hoofdcheckout (.git is een map)', gitIsBestand: false },
  ])('zonder node_modules in $naam: het herstel past bij de checkout (AC-12)', ({ gitIsBestand }) => {
    const root = mkdtempSync(path.join(tmpdir(), 'feiten-'));
    dirs.push(root);
    const kit = path.join(root, 'scripts/kit');
    mkdirSync(kit, { recursive: true });
    for (const naam of readdirSync(path.join(REPO, 'scripts/kit')))
      if (/^(feiten|toolchain|gates|catalogus)\.mjs$|^catalogus-.*\.ts$/.test(naam))
        copyFileSync(path.join(REPO, 'scripts/kit', naam), path.join(kit, naam));
    copyFileSync(path.join(REPO, 'mise.toml'), path.join(root, 'mise.toml'));
    // Geldige pin plus een nep-pnpm met die versie: de pnpm-controle meldt dan niets en alleen node_modules blijft over.
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.28.2' }));
    mkdirSync(path.join(root, 'bin'));
    writeFileSync(path.join(root, 'bin/pnpm'), "#!/bin/sh\nprintf '%s\\n' '11.28.2'\n");
    chmodSync(path.join(root, 'bin/pnpm'), 0o755);
    if (gitIsBestand) writeFileSync(path.join(root, '.git'), 'gitdir: /nergens/.git/worktrees/wt\n');
    else mkdirSync(path.join(root, '.git'));

    const r = spawnSync('node', ['scripts/kit/feiten.mjs', 'specs'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PATH: [path.join(root, 'bin'), process.env['PATH'] ?? ''].join(path.delimiter) },
    });
    const regel = r.stderr.split('\n').find((l) => l.startsWith('✗ toolchain')) ?? '';
    const modulesDeel = segmenten(regel).find((d) => d.includes('node_modules ontbreekt'));

    expect(r.status).toBe(1);
    expect(modulesDeel).toBeDefined();
    if (gitIsBestand) {
      expect(modulesDeel).toContain('node scripts/kit/worktree-install.mjs');
      expect(modulesDeel).not.toContain('bootstrap.sh');
    } else {
      expect(modulesDeel).toContain('scripts/bootstrap.sh');
      expect(regel).not.toContain('worktree-install.mjs');
    }
  });

  test('zonder node_modules: status 1, leesbare regel op stderr, geen stacktrace', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'feiten-'));
    dirs.push(root);
    const kit = path.join(root, 'scripts/kit');
    mkdirSync(kit, { recursive: true });
    for (const naam of readdirSync(path.join(REPO, 'scripts/kit')))
      if (/^(feiten|toolchain|gates|catalogus)\.mjs$|^catalogus-.*\.ts$/.test(naam))
        copyFileSync(path.join(REPO, 'scripts/kit', naam), path.join(kit, naam));
    copyFileSync(path.join(REPO, 'mise.toml'), path.join(root, 'mise.toml'));

    const r = spawnSync('node', ['scripts/kit/feiten.mjs', 'specs'], { cwd: root, encoding: 'utf8' });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('node_modules ontbreekt');
    expect(r.stdout + r.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(r.stdout + r.stderr).not.toContain('    at ');
  });

  test.each([
    { naam: 'lege map node_modules', bestanden: [] },
    { naam: 'node_modules met alleen .modules.yaml, zonder typescript', bestanden: ['.modules.yaml'] },
    { naam: 'node_modules met typescript maar zonder .modules.yaml', bestanden: ['typescript/package.json'] },
  ])('onvolledige installatie ($naam): status 1, leesbare regel, geen stacktrace', ({ bestanden }) => {
    const root = mkdtempSync(path.join(tmpdir(), 'feiten-'));
    dirs.push(root);
    const kit = path.join(root, 'scripts/kit');
    mkdirSync(kit, { recursive: true });
    for (const naam of readdirSync(path.join(REPO, 'scripts/kit')))
      if (/^(feiten|toolchain|gates|catalogus)\.mjs$|^catalogus-.*\.ts$/.test(naam))
        copyFileSync(path.join(REPO, 'scripts/kit', naam), path.join(kit, naam));
    copyFileSync(path.join(REPO, 'mise.toml'), path.join(root, 'mise.toml'));
    mkdirSync(path.join(root, 'node_modules'));
    for (const naam of bestanden) {
      const doel = path.join(root, 'node_modules', naam);
      mkdirSync(path.dirname(doel), { recursive: true });
      writeFileSync(doel, '{}');
    }

    const r = spawnSync('node', ['scripts/kit/feiten.mjs', 'specs'], { cwd: root, encoding: 'utf8' });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('node_modules ontbreekt of is onvolledig');
    expect(r.stdout + r.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(r.stdout + r.stderr).not.toContain('    at ');
  });

  test('in de echte repo: status 0 en geen ✗ toolchain', () => {
    expect(existsSync(path.join(REPO, 'node_modules'))).toBe(true);

    const r = spawnSync('node', ['scripts/kit/feiten.mjs', 'specs'], { cwd: REPO, encoding: 'utf8' });

    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).not.toContain('✗ toolchain');
  });
});
