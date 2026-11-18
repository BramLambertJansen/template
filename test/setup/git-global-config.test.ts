import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';

// Leerpunt #755: unit-tests met git-fixtures erven de globale gitconfig van de machine (bv. verplichte commit-ondertekening
// in een cloudcontainer: 444 rode tests). test/setup/git-env.ts isoleert git daarom van de globale en systeemconfig
// (GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1), zodat geen fixture van de machine afhangt.
const setupUrl = pathToFileURL(path.join(import.meta.dirname, 'git-env.ts')).href;

// De setup werkt op process.env van zijn eigen proces: een kindproces met een eigen, schone omgeving (eigen HOME, eigen
// globale config) importeert hem wel of niet en draait daarna een fixture: `git init` en een commit zonder eigen identiteit.
const FIXTURE = `
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const setup = process.argv[1];
if (setup !== 'geen') await import(setup);
const dir = mkdtempSync(path.join(tmpdir(), 'fixture-'));
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
git('init', '--quiet');
git('commit', '--quiet', '--allow-empty', '-m', 'fixture');
process.stdout.write(git('log', '--format=%an|%ae|%G?', '-1').trim());
`;

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'git-global-config-'));
}

// Een machine zoals de cloudcontainer: elke commit moet ondertekend worden met een programma dat niet bestaat.
function ondertekenendeConfig(dir: string): string {
  const file = path.join(dir, 'gitconfig');
  writeFileSync(
    file,
    '[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = /nonexistent/signeerprogramma\n[user]\n\tname = Machine Gebruiker\n\temail = machine@example.invalid\n',
  );
  return file;
}

function runFixture(options: { setup: boolean; globalConfig: string }) {
  const home = tempDir();
  const env: Record<string, string> = {
    PATH: process.env['PATH'] ?? '',
    HOME: home,
    TMPDIR: tmpdir(),
    GIT_CONFIG_GLOBAL: options.globalConfig,
  };
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', FIXTURE, options.setup ? setupUrl : 'geen'],
    { env, encoding: 'utf8' },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('regressie: zonder de setup breekt een ondertekenende globale config de fixture-commit (de simulatie is echt)', () => {
  const result = runFixture({ setup: false, globalConfig: ondertekenendeConfig(tempDir()) });

  expect(result.status, result.stderr).not.toBe(0);
  expect(result.stderr).toContain('signeerprogramma');
});

test('met de setup slaagt een fixture-commit ondanks commit.gpgsign=true en een niet-bestaand signeerprogramma', () => {
  const result = runFixture({ setup: true, globalConfig: ondertekenendeConfig(tempDir()) });

  expect(result.status, result.stderr).toBe(0);
});

test('de commit van de fixture komt niet van de globale identiteit en is niet ondertekend', () => {
  const result = runFixture({ setup: true, globalConfig: ondertekenendeConfig(tempDir()) });

  expect(result.status, result.stderr).toBe(0);
  const [name, email, signature] = result.stdout.split('|');
  expect(name).not.toBe('Machine Gebruiker');
  expect(email).not.toBe('machine@example.invalid');
  // Een vaste, niet-lege testidentiteit uit de setup, zodat fixtures niet zelf user.name/user.email hoeven te zetten.
  expect(name).not.toBe('');
  expect(email).not.toBe('');
  expect(signature).toBe('N');
});

test('na de setup wijst GIT_CONFIG_GLOBAL naar /dev/null en negeert git de systeemconfig', () => {
  expect(process.env['GIT_CONFIG_GLOBAL']).toBe('/dev/null');
  expect(process.env['GIT_CONFIG_NOSYSTEM']).toBe('1');
});

test('een test die zelf GIT_CONFIG_GLOBAL zet na de setup, krijgt die config nog steeds', () => {
  const dir = tempDir();
  const eigen = path.join(dir, 'eigen-gitconfig');
  writeFileSync(eigen, '[user]\n\tname = Eigen Config\n');
  const script = `
    import { execFileSync } from 'node:child_process';
    await import(process.argv[1]);
    process.env.GIT_CONFIG_GLOBAL = process.argv[2];
    process.stdout.write(execFileSync('git', ['config', '--global', 'user.name'], { encoding: 'utf8' }).trim());
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, setupUrl, eigen], {
    env: { PATH: process.env['PATH'] ?? '', HOME: dir, TMPDIR: tmpdir(), GIT_CONFIG_GLOBAL: ondertekenendeConfig(dir) },
    encoding: 'utf8',
  });

  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe('Eigen Config');
});
