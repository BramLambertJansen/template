import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence';

// claude-sandbox-werkstraat/AC-13 en AC-14 (leerpunt #658): de runner-melding bij een onleesbare remote noemt de kale
// vorm van het runnercommando, en de runner zet zelf geen git-config via de omgeving. Opzet als runner-trusted-base-bypass.
const SCRIPT_PATH = path.join(import.meta.dirname, '../../scripts/runner.sh');
const SCRIPT = readFileSync(SCRIPT_PATH, 'utf8');
const BESTAANDE_REGEL =
  '✗ main bij de remote is niet te lezen, dus de host-bestanden zijn niet te vergelijken: draai git fetch origin main.';
const KALE_VORM =
  '  → Agent in Claude Code: draai het runnercommando kaal, als enige commando in de aanroep, vanuit de wortel, zonder cd, &&, pipe, omleiding of omhulsel; anders blijft het in de sandbox.';
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
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function commitFile(repo: string, rel: string, text: string): void {
  mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  writeFileSync(path.join(repo, rel), text);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', rel);
}

interface Omgeving {
  repo: string;
  stubs: string;
  bare: string;
}

function maakRepo(): Omgeving {
  const repo = tmp('runner-rm-');
  const stubs = tmp('runner-rm-stubs-');
  const bare = tmp('runner-rm-bare-');
  git(repo, 'init', '-q', '-b', 'main');
  commitFile(repo, 'scripts/runner.sh', SCRIPT);
  commitFile(repo, 'compose.yaml', 'services: {}\n');
  commitFile(repo, 'package.json', '{}\n');
  writeFileSync(path.join(stubs, 'docker'), '#!/usr/bin/env bash\necho "docker $*" >> "$STUB_DIR/log"\n');
  chmodSync(path.join(stubs, 'docker'), 0o755);
  writeFileSync(path.join(stubs, 'log'), '');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  git(repo, 'remote', 'add', 'origin', bare);
  git(repo, 'push', '-q', 'origin', 'main');
  git(repo, 'fetch', '-q', 'origin');
  git(repo, 'checkout', '-q', '-b', 'feat/x');
  return { repo, stubs, bare };
}

function run(omgeving: Omgeving, env: Record<string, string> = {}, pad?: string) {
  const result = spawnSync('bash', ['scripts/runner.sh', 'ui'], {
    cwd: omgeving.repo,
    encoding: 'utf8',
    env: {
      HOME: omgeving.stubs,
      PATH: pad ?? `${omgeving.stubs}:/usr/bin:/bin`,
      STUB_DIR: omgeving.stubs,
      TMPDIR: tmpdir(),
      ...GIT_ENV,
      ...env,
    },
  });
  const reachedDocker = readFileSync(path.join(omgeving.stubs, 'log'), 'utf8').length > 0;
  return { status: result.status, stderr: result.stderr, reachedDocker };
}

/** Een poort van 127.0.0.1 die net nog gebonden was en nu dicht is: verbinden geeft direct 'connection refused'. */
async function geslotenPoort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const adres = server.address();
  if (adres === null || typeof adres === 'string') throw new Error('geen poort');
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  return adres.port;
}

function expectMelding(stderr: string): void {
  const regels = stderr.split('\n');
  const index = regels.indexOf(BESTAANDE_REGEL);
  expect(index, `bestaande regel ontbreekt in:\n${stderr}`).toBeGreaterThanOrEqual(0);
  expect(regels[index + 1]).toBe(KALE_VORM);
}

describe('claude-sandbox-werkstraat/AC-13: runnermelding bij een onleesbare remote', () => {
  test('AC-13 toets 1: origin op een gesloten poort van 127.0.0.1: exit 1, bestaande regel en direct de kale-vormregel', async () => {
    const omgeving = maakRepo();
    const poort = await geslotenPoort();
    git(omgeving.repo, 'remote', 'set-url', 'origin', `https://127.0.0.1:${String(poort)}/repo.git`);

    const resultaat = run(omgeving);

    expect(resultaat.status).toBe(1);
    expect(resultaat.reachedDocker).toBe(false);
    expectMelding(resultaat.stderr);
  });

  test('AC-13 toets 2: een timeout-stub die direct met exit 124 stopt geeft dezelfde twee regels', () => {
    const omgeving = maakRepo();
    writeFileSync(path.join(omgeving.stubs, 'timeout'), '#!/usr/bin/env bash\nexit 124\n');
    chmodSync(path.join(omgeving.stubs, 'timeout'), 0o755);

    const resultaat = run(omgeving);

    expect(resultaat.status).toBe(1);
    expect(resultaat.reachedDocker).toBe(false);
    expectMelding(resultaat.stderr);
  });
});

describe('claude-sandbox-werkstraat/AC-14: runner zet geen git-config via de omgeving', () => {
  test('AC-14 GIT_CONFIG_PARAMETERS van de aanroeper met een andere remote.origin.url verandert exitcode en basis niet', () => {
    const omgeving = maakRepo();
    const nep = tmp('runner-rm-nep-');
    git(nep, 'init', '-q', '--bare', '-b', 'main');
    commitFile(omgeving.repo, 'compose.yaml', 'services:\n  evil: {}\n');
    git(omgeving.repo, 'push', '-q', nep, 'HEAD:refs/heads/main');

    const zonder = run(omgeving);
    const met = run(omgeving, { GIT_CONFIG_PARAMETERS: `'remote.origin.url=${nep}'` });

    // De echte main bij origin is de vorige commit; de gewijzigde compose.yaml moet zichtbaar blijven (geweigerd), met en zonder.
    expect({ status: met.status, reachedDocker: met.reachedDocker }).toStrictEqual({
      status: zonder.status,
      reachedDocker: zonder.reachedDocker,
    });
    expect(zonder.status).toBe(1);
    expect(zonder.reachedDocker).toBe(false);
  });

  test('AC-14 GIT_CONFIG_PARAMETERS bij HEAD gelijk aan main bij origin: zelfde geaccepteerde uitkomst als zonder', () => {
    const omgeving = maakRepo();
    const nep = tmp('runner-rm-nep-');
    git(nep, 'init', '-q', '--bare', '-b', 'main');
    git(omgeving.repo, 'push', '-q', nep, 'HEAD:refs/heads/main');

    const zonder = run(omgeving);
    const met = run(omgeving, { GIT_CONFIG_PARAMETERS: `'remote.origin.url=${nep}'` });

    // Zonder wordt de run geaccepteerd. Haalt de runner de GIT_*-variabelen niet weg, dan telt check_origin_url twee
    // waarden voor remote.origin.url en stopt met exit 1: deze toets wordt dan rood.
    expect({ status: zonder.status, reachedDocker: zonder.reachedDocker }).toStrictEqual({
      status: 0,
      reachedDocker: true,
    });
    expect({ status: met.status, reachedDocker: met.reachedDocker }).toStrictEqual({ status: 0, reachedDocker: true });
  });

  test('AC-14 scripts/runner.sh bevat geen toewijzing aan GIT_CONFIG_*, geen git -c en geen --config-env', () => {
    const code = SCRIPT.split('\n')
      .filter((regel) => !regel.trimStart().startsWith('#'))
      .join('\n');

    const vormen = (...voorbeelden: [string, ...string[]]) => ({ recognizes: voorbeelden });
    expectAbsent(
      code,
      /\bGIT_CONFIG_PARAMETERS\s*=/,
      vormen('GIT_CONFIG_PARAMETERS=x', 'export GIT_CONFIG_PARAMETERS="x"', 'GIT_CONFIG_PARAMETERS=x git status'),
    );
    expectAbsent(
      code,
      /\bGIT_CONFIG_COUNT\s*=/,
      vormen('GIT_CONFIG_COUNT=1', 'export GIT_CONFIG_COUNT=1', 'env GIT_CONFIG_COUNT=1 git fetch'),
    );
    expectAbsent(code, /\bGIT_CONFIG_KEY_\w*\s*=/, vormen('GIT_CONFIG_KEY_0=a.b', 'export GIT_CONFIG_KEY_12=a.b'));
    expectAbsent(code, /\bGIT_CONFIG_VALUE_\w*\s*=/, vormen('GIT_CONFIG_VALUE_0=x', 'export GIT_CONFIG_VALUE_3=x'));
    expectAbsent(code, /\bgit\b[^\n]*\s-c\b/, {
      recognizes: ['git -c a.b=c fetch', 'git -C /x -c a.b=c fetch'],
      allows: ['git ls-remote origin', 'git status --porcelain --cached'],
    });
    expectAbsent(code, /--config-env/, vormen('git --config-env=a.b=VAR fetch'));
    expect(code).toMatch(/GIT_CONFIG_NOSYSTEM=1/);
  });
});
