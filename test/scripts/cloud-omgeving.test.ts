import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';

// Spec cloud-zelfinstallatie, AC-6: scripts/cloud-omgeving.sh is de tekst voor het veld "Setup script" van een
// cloudomgeving. Het draait in de map boven de clone(s) (F1) en zoekt daar scripts/cloud-setup.sh. De gevonden scripts
// zijn hier stubs die hun naam loggen en met SETUP_EXIT_<naam> eindigen.
const SCRIPT = path.join(import.meta.dirname, '../../scripts/cloud-omgeving.sh');
const dirs: string[] = [];

function map(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'cloud-omgeving-'));
  dirs.push(root);
  return root;
}

function setupScript(dir: string, naam: string) {
  const scripts = path.join(dir, 'scripts');
  mkdirSync(scripts, { recursive: true });
  const file = path.join(scripts, 'cloud-setup.sh');
  writeFileSync(file, `#!/usr/bin/env bash\necho "setup ${naam}"\nexit "\${SETUP_EXIT_${naam}:-0}"\n`);
  chmodSync(file, 0o755);
}

function run(cwd: string, env: Record<string, string> = {}) {
  const result = spawnSync('bash', [SCRIPT], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('scripts/cloud-omgeving.sh (spec cloud-zelfinstallatie)', () => {
  test('cloud-zelfinstallatie/AC-6: draait elk <naam>/scripts/cloud-setup.sh, gesorteerd met LC_ALL=C, met → <pad> ervoor', () => {
    const root = map();
    // LC_ALL=C: hoofdletters vóór kleine letters.
    setupScript(path.join(root, 'b'), 'b');
    setupScript(path.join(root, 'A'), 'A');
    // Telt niet: in node_modules en dieper dan <naam>/scripts/.
    setupScript(path.join(root, 'node_modules'), 'nm');
    setupScript(path.join(root, 'b', 'node_modules', 'x'), 'nmdiep');
    setupScript(path.join(root, 'b', 'sub'), 'diep');

    const { status, stdout } = run(root);

    expect(status).toBe(0);
    expect(stdout.trim().split('\n')).toStrictEqual([
      `→ ${root}/A/scripts/cloud-setup.sh`,
      'setup A',
      `→ ${root}/b/scripts/cloud-setup.sh`,
      'setup b',
    ]);
  });

  test('cloud-zelfinstallatie/AC-6: exitcode van het eerste script dat faalt; de rest draait wel', () => {
    const root = map();
    for (const naam of ['a', 'b', 'c']) setupScript(path.join(root, naam), naam);

    const { status, stdout } = run(root, { SETUP_EXIT_b: '5', SETUP_EXIT_c: '7' });

    expect(status).toBe(5);
    expect(stdout).toContain('setup c');
  });

  test('cloud-zelfinstallatie/AC-6: in de root van een repo draait het ./scripts/cloud-setup.sh van die repo', () => {
    const root = map();
    setupScript(root, 'repo');

    const { status, stdout } = run(root);

    expect(status).toBe(0);
    expect(stdout.trim().split('\n')).toStrictEqual([`→ ${root}/scripts/cloud-setup.sh`, 'setup repo']);
  });

  test('cloud-zelfinstallatie/AC-6: niets gevonden → exit 1 met de map', () => {
    const root = map();
    setupScript(path.join(root, 'node_modules'), 'nm');

    const { status, stderr } = run(root);

    expect(status).toBe(1);
    expect(stderr).toContain(`✗ scripts/cloud-setup.sh niet gevonden onder ${root}`);
  });

  test('cloud-zelfinstallatie/AC-6: geen repo-naam in het bestand en kleiner dan 64 KB (veld "Setup script")', () => {
    const bron = readFileSync(SCRIPT, 'utf8');

    expect(statSync(SCRIPT).size).toBeLessThan(64 * 1024);
    // Een vaste repo of eigenaar zou het bestand aan één repo binden; de map komt alleen uit $PWD.
    expectAbsent(bron, /template|BramLambertJansen|github\.com\/|\/home\/|\/root\//i, {
      recognizes: ['template', 'Template', 'BramLambertJansen/template', 'https://github.com/x', '/home/u', '/root/x'],
      allows: ['scripts/cloud-setup.sh', '$PWD', 'node_modules'],
    });
  });
});
