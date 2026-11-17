import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { SCENARIOS } from '../../scripts/kit/leespad.mjs';

// app-agentregels/AC-5 (docs/template/specs/app-agentregels.md): `CLAUDE.md` importeert `docs/app.md`, `pnpm leespad` telt
// het bestand mee in elk scenario met `CLAUDE.md` ("nieuwe-feature" en "lichte-fix", niet "review") en meet het als soort
// `app` tegen 60 regels: een melding, nooit rood.
const root = path.join(import.meta.dirname, '../..');
const LET_OP = 'let op: app: docs/app.md 61 regels, nieuw boven de streefwaarde 60 regels';
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
  const dir = mkdtempSync(path.join(tmpdir(), 'app-agentregels-leespad-'));
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

const regels = (n: number) => 'r\n'.repeat(n);

function veld(x: unknown, ...namen: string[]): unknown {
  for (const n of namen) x = typeof x === 'object' && x !== null ? new Map(Object.entries(x)).get(n) : undefined;
  return x;
}

/** De bytes aan bestanden per scenario, uit `pnpm leespad --json` in `dir`. */
function bytes(dir: string): Record<string, unknown> {
  const r = leespad(dir, ['--json']);
  expect(r.status, r.stderr).toBe(0);
  const data: unknown = JSON.parse(r.stdout);
  return Object.fromEntries(
    ['nieuwe-feature', 'lichte-fix', 'review'].map((naam) => [naam, veld(data, 'scenarios', naam, 'bytes')]),
  );
}

/** De regels van een Markdown-tekst buiten een codeblok (``` of ~~~). */
function buitenCodeblok(tekst: string): string[] {
  let hek = '';
  return tekst.split('\n').filter((regel) => {
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(regel)?.[1] ?? '';
    if (hek === '') {
      hek = open;
      return open === '';
    }
    if (open.startsWith(hek) && open[0] === hek[0]) hek = '';
    return false;
  });
}

describe('app-agentregels/AC-5 CLAUDE.md importeert docs/app.md', () => {
  test('app-agentregels/AC-5: CLAUDE.md heeft de regel @docs/app.md buiten een codeblok, direct onder @AGENTS.md', () => {
    const buiten = buitenCodeblok(readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'));

    expect(buiten).toContain('@docs/app.md');
    expect(buiten[buiten.indexOf('@AGENTS.md') + 1]).toBe('@docs/app.md');
  });
});

describe('app-agentregels/AC-5 leespad telt docs/app.md mee', { timeout: 60_000 }, () => {
  test('app-agentregels/AC-5: SCENARIOS noemt docs/app.md in elk scenario met CLAUDE.md en in geen ander', () => {
    const metClaude = Object.entries(SCENARIOS).filter(([, paden]) => paden.includes('CLAUDE.md'));
    const metApp = Object.entries(SCENARIOS).filter(([, paden]) => paden.includes('docs/app.md'));

    expect(metClaude.map(([naam]) => naam)).toStrictEqual(['nieuwe-feature', 'lichte-fix']);
    expect(metApp.map(([naam]) => naam)).toStrictEqual(['nieuwe-feature', 'lichte-fix']);
  });

  test('app-agentregels/AC-5: de CLI telt de bytes van docs/app.md in nieuwe-feature en lichte-fix en niet in review', () => {
    const basis = { 'AGENTS.md': 'a'.repeat(100), 'CLAUDE.md': 'c'.repeat(10), 'docs/dod.md': 'd'.repeat(30) };
    // é telt twee bytes: 1 + 2 + 1 = 4 tekens, 5 bytes per regel.
    const app = 'aé\n\n'.repeat(7);

    const zonder = bytes(repo(basis));
    const met = bytes(repo({ ...basis, 'docs/app.md': app }));

    expect(zonder).toStrictEqual({ 'nieuwe-feature': 140, 'lichte-fix': 110, review: 30 });
    expect(met).toStrictEqual({ 'nieuwe-feature': 140 + 35, 'lichte-fix': 110 + 35, review: 30 });
  });

  test("app-agentregels/AC-5: zonder docs/app.md staat het in ontbreekt van de twee scenario's, niet van review", () => {
    const r = leespad(repo({ 'AGENTS.md': 'a' }), ['--json']);
    expect(r.status, r.stderr).toBe(0);
    const data: unknown = JSON.parse(r.stdout);

    expect(veld(data, 'scenarios', 'nieuwe-feature', 'ontbreekt')).toContain('docs/app.md');
    expect(veld(data, 'scenarios', 'lichte-fix', 'ontbreekt')).toContain('docs/app.md');
    expect(veld(data, 'scenarios', 'review', 'ontbreekt')).not.toContain('docs/app.md');
  });
});

describe('app-agentregels/AC-5 de soort app: 60 regels, alleen een melding', { timeout: 60_000 }, () => {
  test.each([
    ['een basis van 60 regels', { 'docs/app.md': regels(60) }],
    ['een basis van 3 regels (de stub)', { 'docs/app.md': regels(3) }],
    ['een basis zonder het bestand', {}],
  ])('app-agentregels/AC-5: 61 regels tegenover %s geeft de melding en exit 0', (_naam, basis) => {
    const r = leespad(repo(basis, { 'docs/app.md': regels(61) }));

    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.split('\n')).toContain(LET_OP);
  });

  test('app-agentregels/AC-5: 60 regels geeft de melding niet', () => {
    const r = leespad(repo({ 'docs/app.md': regels(3) }, { 'docs/app.md': regels(60) }));

    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.split('\n').filter((regel) => regel.startsWith('let op: app'))).toStrictEqual([]);
    // De meting zelf staat er wel: de soort bestaat, met zijn streefwaarde.
    expect(r.stdout.split('\n')).toContain('app: 1, streefwaarde 60 regels');
  });

  test('app-agentregels/AC-5: --json geeft de soort app met streefwaarde 60 regels en het aantal erboven', () => {
    const r = leespad(repo({}, { 'docs/app.md': regels(61) }), ['--json']);
    expect(r.status, r.stderr).toBe(0);
    const data: unknown = JSON.parse(r.stdout);

    expect(veld(data, 'metingen', 'app')).toStrictEqual({
      streefwaarde: 60,
      eenheid: 'regels',
      aantal: 1,
      boven: 1,
      grootste: [{ naam: 'docs/app.md', waarde: 61 }],
    });
    expect(veld(data, 'letOp')).toStrictEqual([LET_OP]);
  });

  test('app-agentregels/AC-5: alleen docs/app.md telt als soort app, geen ander bestand met die naam', () => {
    const r = leespad(repo({}, { 'docs/operations/app.md': regels(61), 'docs/app.md.bak': regels(61) }), ['--json']);
    expect(r.status, r.stderr).toBe(0);

    expect(veld(JSON.parse(r.stdout), 'metingen', 'app', 'aantal')).toBe(0);
  });
});
