import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { meldingen } from '../../scripts/kit/ratchet.mjs';

// Leerpunt #966: ratchet en `feiten specs` lezen alleen getrackte bestanden. Ongetrackte spec, ADR of testbestand
// worden gemeld (nooit rood, niet meegeteld); andere ongetrackte bestanden worden niet genoemd.
const FEITEN = path.join(import.meta.dirname, '../../scripts/kit/feiten.mjs');
const TELT = ['docs/template/specs/x.md', 'docs/template/adr/9999-nieuw.md', 'test/scripts/nieuw.test.ts'];
const TELT_NIET = ['notities.txt', 'src/hulp.ts'];

function git(dir: string, ...args: string[]) {
  execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { cwd: dir, stdio: 'pipe' });
}

function schrijf(dir: string, pad: string, inhoud: string) {
  mkdirSync(path.dirname(path.join(dir, pad)), { recursive: true });
  writeFileSync(path.join(dir, pad), inhoud);
}

function maakRepo(metOngetrackt: boolean) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ongetrackt-'));
  git(dir, 'init', '-q');
  schrijf(dir, 'README.md', 'basis\n');
  git(dir, 'add', 'README.md');
  git(dir, 'commit', '-q', '-m', 'init');
  if (metOngetrackt) {
    schrijf(dir, TELT[0] ?? '', '# Spec x\n\n## Acceptatiecriteria\n\n- AC-1: iets.\n');
    schrijf(dir, TELT[1] ?? '', '# ADR 9999\n');
    schrijf(dir, TELT[2] ?? '', "import { test } from 'vitest';\ntest('x', () => {});\n");
    for (const pad of TELT_NIET) schrijf(dir, pad, 'niets\n');
  }
  return dir;
}

describe('ongetrackt-melding', () => {
  const origineel = process.cwd();
  let dir = '';

  beforeEach(() => {
    dir = '';
  });

  afterEach(() => {
    process.chdir(origineel);
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test('ratchet meldingen heeft de sleutel ongetrackt', () => {
    expect(Object.keys(meldingen)).toContain('ongetrackt');
  });

  test('ratchet: één melding met ongetrackt, elk telend pad en git add; niet-tellende bestanden niet', async () => {
    dir = maakRepo(true);
    process.chdir(dir);
    expect(Object.keys(meldingen)).toContain('ongetrackt');
    const run = Object.entries(meldingen).find(([naam]) => naam === 'ongetrackt')?.[1];
    expect(run).toBeTypeOf('function');

    const regels = (await run?.()) ?? [];

    expect(regels).toHaveLength(1);
    const melding = regels[0] ?? '';
    expect(melding).toContain('ongetrackt');
    expect(melding).toContain('git add');
    for (const pad of TELT) expect(melding).toContain(pad);
    for (const pad of TELT_NIET) expect(melding).not.toContain(pad);
  });

  test('ratchet: zonder ongetrackte telbestanden een lege lijst', async () => {
    dir = maakRepo(false);
    process.chdir(dir);
    expect(Object.keys(meldingen)).toContain('ongetrackt');
    const run = Object.entries(meldingen).find(([naam]) => naam === 'ongetrackt')?.[1];
    expect(run).toBeTypeOf('function');

    expect(await run?.()).toStrictEqual([]);
  });

  test('feiten specs: een regel met ongetrackt, de paden en git add; niet-tellende bestanden niet', () => {
    dir = maakRepo(true);

    const r = spawnSync('node', [FEITEN, 'specs'], { cwd: dir, encoding: 'utf8' });

    expect(r.status).toBe(0);
    const regels = r.stdout.split('\n').filter((regel) => regel.includes('ongetrackt'));
    expect(regels).toHaveLength(1);
    const regel = regels[0] ?? '';
    expect(regel).toContain('git add');
    for (const pad of TELT) expect(regel).toContain(pad);
    for (const pad of TELT_NIET) expect(r.stdout).not.toContain(pad);
  });

  test('ratchet: genegeerde bestanden niet, paden met een spatie wel; na tien paden ingekort', async () => {
    dir = maakRepo(false);
    schrijf(dir, '.gitignore', 'genegeerd/\n');
    schrijf(dir, 'genegeerd/x.test.ts', 'x\n');
    schrijf(dir, 'test/scripts/met spatie.test.ts', 'x\n');
    for (let i = 0; i < 11; i += 1) schrijf(dir, `test/scripts/n${String(i).padStart(2, '0')}.test.ts`, 'x\n');
    process.chdir(dir);
    const run = Object.entries(meldingen).find(([naam]) => naam === 'ongetrackt')?.[1];

    const melding = (await run?.())?.[0] ?? '';

    expect(melding).toContain('12 bestand(en)');
    expect(melding).toContain('test/scripts/met spatie.test.ts');
    expect(melding).not.toContain('genegeerd/');
    expect(melding).toContain('… en 2 meer');
  });

  test('feiten specs --json: stdout blijft JSON, de melding staat op stderr', () => {
    dir = maakRepo(true);

    const r = spawnSync('node', [FEITEN, 'specs', '--json'], { cwd: dir, encoding: 'utf8' });

    expect(r.status).toBe(0);
    expect(() => {
      JSON.parse(r.stdout);
    }).not.toThrow();
    expect(r.stderr).toContain('ongetrackt');
  });

  test('feiten specs: zonder ongetrackte telbestanden geen regel met ongetrackt', () => {
    dir = maakRepo(false);

    const r = spawnSync('node', [FEITEN, 'specs'], { cwd: dir, encoding: 'utf8' });

    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('ongetrackt');
  });
});
