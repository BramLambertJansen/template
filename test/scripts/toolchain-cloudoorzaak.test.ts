import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { toolchainProbleem, toolchainProbleemIn } from '../../scripts/kit/toolchain.mjs';

// Spec cloud-toolchain-zelfherstel, AC-11. Verwacht (nog te bouwen): `toolchainProbleem(feiten)` krijgt het optionele feit
// `cloud: boolean` (standaard false) en `toolchainProbleemIn(root, { pnpmTimeoutMs?, cloud? })` de optie `cloud`.
// `scripts/kit/feiten.mjs` geeft `cloud: true` alleen mee als `CLAUDE_CODE_REMOTE=true`.
const REPO = path.join(import.meta.dirname, '../..');
const MISE = '[tools]\nnode = "26.11.1"\npnpm = "11"\n';
const CLOUD_STAART =
  '→ in de cloud waarschijnlijk een omgevingscache van vóór een pin-bump: start een nieuwe sessie (de startup-hook herstelt het), of de eigenaar wijzigt het veld "Setup script", zie docs/ENVIRONMENT.md';
const NODE_REDEN = 'Node v22.22.0, verwacht 26.11.1 of nieuwer binnen dezelfde major (mise.toml)';
const MODULES_REDEN = 'node_modules ontbreekt of is onvolledig';
const OUD = (...redenen: string[]) =>
  `✗ toolchain ontbreekt: ${redenen.map((reden) => `${reden} → draai \`scripts/bootstrap.sh\``).join('; ')}, in de cloud \`bash scripts/cloud-setup.sh\`, zie docs/ENVIRONMENT.md`;
const dirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

const feiten = (node: string, nodeModules: boolean, cloud?: boolean) => ({
  node,
  miseToml: MISE,
  nodeModules,
  ...(cloud === undefined ? {} : { cloud }),
});

/** Een projectmap met pin pnpm@11.28.2, een pnpm-stub die `versie` geeft en (optioneel) de markeerbestanden van node_modules. */
function projectmap(pnpmVersie: string, metModules: boolean): string {
  const root = tmp('cloudoorzaak-');
  mkdirSync(path.join(root, '.git'));
  mkdirSync(path.join(root, 'bin'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.28.2' }));
  writeFileSync(path.join(root, 'mise.toml'), `[tools]\nnode = "${process.version.replace(/^v/, '')}"\n`);
  writeFileSync(path.join(root, 'bin/pnpm'), `#!/bin/sh\nprintf '%s\\n' '${pnpmVersie}'\n`);
  chmodSync(path.join(root, 'bin/pnpm'), 0o755);
  if (metModules) {
    mkdirSync(path.join(root, 'node_modules/typescript'), { recursive: true });
    writeFileSync(path.join(root, 'node_modules/.modules.yaml'), '{}');
    writeFileSync(path.join(root, 'node_modules/typescript/package.json'), '{}');
  }
  vi.stubEnv('PATH', path.join(root, 'bin'));
  return root;
}

describe('cloud-toolchain-zelfherstel/AC-11 toolchainProbleem', () => {
  test.each([
    { naam: 'afwijkende Node', node: 'v22.22.0', nm: true, tekst: OUD(NODE_REDEN) },
    { naam: 'alleen node_modules weg', node: 'v26.11.1', nm: false, tekst: OUD(MODULES_REDEN) },
    { naam: 'beide', node: 'v22.22.0', nm: false, tekst: OUD(NODE_REDEN, MODULES_REDEN) },
  ])('cloud-toolchain-zelfherstel/AC-11 zonder (of met cloud: false) de tekst van vóór de spec: $naam', (g) => {
    expect(toolchainProbleem(feiten(g.node, g.nm))).toBe(g.tekst);
    expect(toolchainProbleem(feiten(g.node, g.nm, false))).toBe(g.tekst);
  });

  test('cloud-toolchain-zelfherstel/AC-11 cloud: true met afwijkende Node eindigt op de cloudoorzaak, zonder andere herstelroute', () => {
    const regel = toolchainProbleem(feiten('v22.22.0', true, true));

    expect(regel).toBe(`✗ toolchain ontbreekt: ${NODE_REDEN} ${CLOUD_STAART}`);
    expect(regel).not.toContain('scripts/bootstrap.sh');
    expect(regel).not.toContain('bash scripts/cloud-setup.sh');
  });

  test('cloud-toolchain-zelfherstel/AC-11 cloud: true met Node én node_modules: beide redenen, één herstelroute', () => {
    const regel = toolchainProbleem(feiten('v22.22.0', false, true)) ?? '';

    expect(regel).toBe(`✗ toolchain ontbreekt: ${NODE_REDEN}; ${MODULES_REDEN} ${CLOUD_STAART}`);
    expect(regel.split('→')).toHaveLength(2);
  });

  test('cloud-toolchain-zelfherstel/AC-11 cloud: true en alleen node_modules ontbreekt: gelijk aan de tekst zonder cloud', () => {
    expect(toolchainProbleem(feiten('v26.11.1', false, true))).toBe(toolchainProbleem(feiten('v26.11.1', false)));
    expect(toolchainProbleem(feiten('v26.11.1', false, true))).toBe(OUD(MODULES_REDEN));
  });
});

describe('cloud-toolchain-zelfherstel/AC-11 toolchainProbleemIn', () => {
  test('cloud-toolchain-zelfherstel/AC-11 afwijkende pnpm met cloud: true: oorzaak van de cache en geen andere route', () => {
    const root = projectmap('11.28.5', true);
    const opties = { cloud: true, pnpmTimeoutMs: 20_000 };

    const regel = toolchainProbleemIn(root, opties);

    expect(regel).toBe(`✗ toolchain ontbreekt: pnpm 11.28.5, verwacht exact 11.28.2 (packageManager) ${CLOUD_STAART}`);
  });

  test('cloud-toolchain-zelfherstel/AC-11 zonder de optie blijft de oude herstelroute staan', () => {
    const root = projectmap('11.28.5', true);

    const regel = toolchainProbleemIn(root);

    expect(regel).toContain('scripts/bootstrap.sh');
    expect(regel).toContain('bash scripts/cloud-setup.sh');
    expect(regel).not.toContain('pin-bump');
  });

  test('cloud-toolchain-zelfherstel/AC-11 cloud: true en alleen node_modules ontbreekt: gelijk aan de tekst zonder cloud', () => {
    const root = projectmap('11.28.2', false);
    const opties = { cloud: true, pnpmTimeoutMs: 20_000 };

    expect(toolchainProbleemIn(root, opties)).toBe(toolchainProbleemIn(root));
  });
});

describe('cloud-toolchain-zelfherstel/AC-11 feiten.mjs geeft cloud mee uit CLAUDE_CODE_REMOTE', () => {
  /** De ✗-regel die feiten.mjs in een map met Node-pin 99.0.0 geeft, met `remote` als CLAUDE_CODE_REMOTE (undefined: niet gezet). */
  function feitenRegel(remote: string | undefined): string {
    const root = tmp('feiten-cloud-');
    const kit = path.join(root, 'scripts/kit');
    mkdirSync(kit, { recursive: true });
    for (const naam of readdirSync(path.join(REPO, 'scripts/kit')))
      if (/^(feiten|toolchain|gates|catalogus)\.mjs$|^catalogus-.*\.ts$/.test(naam))
        copyFileSync(path.join(REPO, 'scripts/kit', naam), path.join(kit, naam));
    writeFileSync(path.join(root, 'mise.toml'), '[tools]\nnode = "99.0.0"\n');
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.28.2' }));
    mkdirSync(path.join(root, 'bin'));
    writeFileSync(path.join(root, 'bin/pnpm'), "#!/bin/sh\nprintf '%s\\n' '11.28.2'\n");
    chmodSync(path.join(root, 'bin/pnpm'), 0o755);
    mkdirSync(path.join(root, 'node_modules/typescript'), { recursive: true });
    writeFileSync(path.join(root, 'node_modules/.modules.yaml'), '{}');
    writeFileSync(path.join(root, 'node_modules/typescript/package.json'), '{}');
    const env: Record<string, string | undefined> = {
      ...process.env,
      PATH: [path.join(root, 'bin'), process.env['PATH'] ?? ''].join(path.delimiter),
    };
    if (remote === undefined) delete env['CLAUDE_CODE_REMOTE'];
    else env['CLAUDE_CODE_REMOTE'] = remote;
    const r = spawnSync('node', ['scripts/kit/feiten.mjs', 'specs'], { cwd: root, encoding: 'utf8', env });
    return r.stderr.split('\n').find((l) => l.startsWith('✗ toolchain')) ?? '';
  }

  test('cloud-toolchain-zelfherstel/AC-11 CLAUDE_CODE_REMOTE=true: de cloudoorzaak', () => {
    const regel = feitenRegel('true');

    expect(regel).toContain('Node ');
    expect(regel.endsWith(CLOUD_STAART)).toBe(true);
    expect(regel).not.toContain('bash scripts/cloud-setup.sh');
  });

  test.each([undefined, 'false', '', '1'])(
    'cloud-toolchain-zelfherstel/AC-11 CLAUDE_CODE_REMOTE=%s: de oude tekst',
    (remote) => {
      const regel = feitenRegel(remote);

      expect(regel).toContain('bash scripts/cloud-setup.sh');
      expect(regel).not.toContain('pin-bump');
    },
  );
});
