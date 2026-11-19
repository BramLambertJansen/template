import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// nieuwe-app-script/AC-15 (docs/template/specs/nieuwe-app-script.md, werking 10, OV-5): `pnpm leespad` meet het playbook
// `docs/nieuwe-app.md` als soort `playbook` tegen 35 KB. Een meting, nooit rood (ADR 0065 punt 2): alleen dat de soort bestaat,
// zijn streefwaarde en eenheid heeft en een melding geeft bij overschrijding, met exitcode 0. Geen test eist de grens zelf: de
// gemeten omvang van het playbook staat als bewijs in de PR. Naast test/rails/leesbudget.test.ts, dat ongewijzigd blijft.
const root = path.join(import.meta.dirname, '../..');
const KB = 1024;
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
}

function schrijf(dir: string, bestanden: Record<string, string>) {
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(dir, pad)), { recursive: true });
    writeFileSync(path.join(dir, pad), inhoud);
  }
}

/** Een repo met `basis` gecommit als origin/main en `nu` daarna in de werkmap (toegevoegd, niet gecommit). */
function repo(basis: Record<string, string>, nu: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'leesbudget-playbook-'));
  dirs.push(dir);
  git(dir, 'init', '-q');
  schrijf(dir, { 'package.json': '{}\n', ...basis });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'basis');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  schrijf(dir, nu);
  git(dir, 'add', '-A');
  return dir;
}

function leespad(cwd: string, args: string[] = []) {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/kit/leespad.mjs'), ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function veld(x: unknown, ...namen: string[]): unknown {
  for (const n of namen) x = typeof x === 'object' && x !== null ? new Map(Object.entries(x)).get(n) : undefined;
  return x;
}

const bytes = (n: number) => 'x'.repeat(n);

describe(
  'nieuwe-app-script/AC-15 de soort playbook in pnpm leespad: een meting, nooit rood',
  { timeout: 60_000 },
  () => {
    test('nieuwe-app-script/AC-15: --json geeft de soort playbook met streefwaarde 35 KB, eenheid bytes en het playbook als grootste', () => {
      const r = leespad(repo({}, { 'docs/nieuwe-app.md': bytes(40 * KB) }), ['--json']);
      expect(r.status, r.stderr).toBe(0);
      const data: unknown = JSON.parse(r.stdout);
      expect(veld(data, 'metingen', 'playbook')).toStrictEqual({
        streefwaarde: 35 * KB,
        eenheid: 'bytes',
        aantal: 1,
        boven: 1,
        grootste: [{ naam: 'docs/nieuwe-app.md', waarde: 40 * KB }],
      });
    });

    test('nieuwe-app-script/AC-15: de tekstuitvoer toont playbook met zijn streefwaarde, ook onder de grens, zonder melding', () => {
      const r = leespad(repo({ 'docs/nieuwe-app.md': bytes(30 * KB) }));
      expect(r.status, r.stderr).toBe(0);
      const regels = r.stdout.split('\n');
      expect(regels).toContain('playbook: 1, streefwaarde 35 KB');
      expect(regels.filter((regel) => regel.startsWith('let op: playbook'))).toStrictEqual([]);
    });

    test('nieuwe-app-script/AC-15: boven 35 KB nieuw geeft een melding en exitcode 0, nooit rood', () => {
      const r = leespad(repo({ 'docs/nieuwe-app.md': bytes(30 * KB) }, { 'docs/nieuwe-app.md': bytes(40 * KB) }));
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout.split('\n')).toContain(
        'let op: playbook: docs/nieuwe-app.md 40 KB, nieuw boven de streefwaarde 35 KB',
      );
    });

    test('nieuwe-app-script/AC-15: alleen docs/nieuwe-app.md telt als playbook, geen ander bestand', () => {
      const r = leespad(
        repo({}, { 'docs/app-naslag.md': bytes(40 * KB), 'docs/operations/nieuwe-app.md': bytes(40 * KB) }),
        ['--json'],
      );
      expect(r.status, r.stderr).toBe(0);
      expect(veld(JSON.parse(r.stdout), 'metingen', 'playbook', 'aantal')).toBe(0);
    });
  },
);
