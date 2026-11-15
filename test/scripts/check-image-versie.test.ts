import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { TEMPLATE_VERSION } from '../../src/core/shared/template-version.ts';

// Spec release-versie (docs/template/specs/release-versie.md), AC-9: scripts/check-image.sh vergelijkt `version` uit
// GET /api/health met TEMPLATE_VERSION uit het bronbestand; met EXPECT_BUILD_SHA eist het die `build`, zonder eist het dat
// `build` ontbreekt. Met een nagebootste docker en curl (de vorm van check-image-inputs.test.ts): er start geen container.
const ROOT = path.join(import.meta.dirname, '../..');
const VERSION_FILE = 'src/core/shared/template-version.ts';
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function stub(dir: string, name: string, content: string) {
  const file = path.join(dir, 'stubs', name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `#!/bin/bash\nset -euo pipefail\n${content}\n`);
  chmodSync(file, 0o755);
}

function fixture(options: { versionFile?: string | null } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-image-versie-'));
  dirs.push(dir);
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  cpSync(path.join(ROOT, 'scripts/check-image.sh'), path.join(dir, 'scripts/check-image.sh'));
  if (options.versionFile !== null) {
    mkdirSync(path.dirname(path.join(dir, VERSION_FILE)), { recursive: true });
    writeFileSync(
      path.join(dir, VERSION_FILE),
      options.versionFile ?? readFileSync(path.join(ROOT, VERSION_FILE), 'utf8'),
    );
  }
  stub(
    dir,
    'docker',
    `if [[ "$1" == run && "$*" == *"--entrypoint id"* ]]; then echo 1000; exit 0; fi
if [[ "$1" == inspect ]]; then
  if [[ "$*" == *State.ExitCode* ]]; then echo 0; else echo PATH=/usr/bin; fi
fi
exit 0`,
  );
  stub(
    dir,
    'curl',
    `case "\${!#}" in
  */api/health) printf '%s' "$STUB_HEALTH" ;;
  */api/ready) printf 503 ;;
  */admin/accounts) printf "content-security-policy: default-src 'self'\\ncache-control: no-cache\\n" ;;
  */assets/*) printf 'cache-control: public, max-age=31536000, immutable\\n' ;;
  */api/bestaat-niet) printf '{"code":"NOT_FOUND","requestId":"fixture"}' ;;
  */) printf '<script src="/assets/fixture.js"></script>' ;;
  *) echo 'onverwachte curl-aanroep' >&2; exit 97 ;;
esac`,
  );
  return dir;
}

function run(dir: string, health: string, expectBuildSha?: string) {
  return spawnSync('bash', ['scripts/check-image.sh', 'app:fixture'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      HOME: dir,
      TMPDIR: tmpdir(),
      PATH: `${dir}/stubs:/usr/bin:/bin`,
      STUB_HEALTH: health,
      ...(expectBuildSha === undefined ? {} : { EXPECT_BUILD_SHA: expectBuildSha }),
    },
  });
}

const body = (fields: Record<string, unknown>) => JSON.stringify(fields);
const OK = body({ ok: true, version: TEMPLATE_VERSION });
const OK_BUILD = body({ ok: true, version: TEMPLATE_VERSION, build: 'abc1234' });

test('release-versie/AC-9: slaagt bij ok en de versie uit het bronbestand, zonder EXPECT_BUILD_SHA', () => {
  const result = run(fixture(), OK);

  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(`version ${TEMPLATE_VERSION}`);
  expect(result.stdout).toContain('✓ na SIGTERM netjes gestopt');
});

test('release-versie/AC-9: een lege EXPECT_BUILD_SHA telt als niet gezet', () => {
  expect(run(fixture(), OK, '').status).toBe(0);
  expect(run(fixture(), OK_BUILD, '').status).toBe(1);
});

test.each([
  ['een andere version', body({ ok: true, version: '9.9.9' })],
  ['een ontbrekende version', body({ ok: true })],
  ['een version met een voorvoegsel', body({ ok: true, version: `v${TEMPLATE_VERSION}` })],
  ['ok onwaar', body({ ok: false, version: TEMPLATE_VERSION })],
  ['een leeg antwoord', ''],
])('release-versie/AC-9: faalt bij %s', (_case, health) => {
  const result = run(fixture(), health);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('GET /api/health');
  expect(result.stdout).not.toContain('✓ liveness');
});

test('release-versie/AC-9: faalt als build aanwezig is zonder EXPECT_BUILD_SHA', () => {
  const result = run(fixture(), OK_BUILD);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('build');
  expect(result.stdout).not.toContain('✓ liveness');
});

test('release-versie/AC-9: met EXPECT_BUILD_SHA=abc1234 slaagt het bij build abc1234', () => {
  const result = run(fixture(), OK_BUILD, 'abc1234');

  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('build abc1234');
});

test.each([
  ['zonder build', OK],
  ['met een andere build', body({ ok: true, version: TEMPLATE_VERSION, build: 'def5678' })],
  ['met een langere build', body({ ok: true, version: TEMPLATE_VERSION, build: 'abc12345' })],
  ['met de juiste build en een andere version', body({ ok: true, version: '9.9.9', build: 'abc1234' })],
])('release-versie/AC-9: met EXPECT_BUILD_SHA=abc1234 faalt het %s', (_case, health) => {
  const result = run(fixture(), health, 'abc1234');

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('GET /api/health');
  expect(result.stdout).not.toContain('✓ liveness');
});

test('release-versie/AC-9: de verwachte versie komt uit het bronbestand, niet uit het script', () => {
  const dir = fixture({ versionFile: "export const TEMPLATE_VERSION = '7.8.9';\n" });

  expect(run(dir, body({ ok: true, version: '7.8.9' })).status).toBe(0);
  expect(run(dir, OK).status).toBe(1);
});

test('release-versie/AC-9: zonder het bronbestand stopt het script met een melding die het bestand noemt', () => {
  const result = run(fixture({ versionFile: null }), OK);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain(VERSION_FILE);
});
