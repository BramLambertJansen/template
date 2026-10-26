import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// Spec docs/specs/specplicht.md, AC-19 t/m AC-21: de verplichte job `specplicht` in guard.yml, de verplichte check in
// decisions.json en github-ruleset.sh, en een onbekend argument voor diff-guard.mjs.
const ROOT = path.join(import.meta.dirname, '../..');
const WORKFLOW = readFileSync(path.join(ROOT, '.github/workflows/guard.yml'), 'utf8');

function job(name: string): string {
  const start = WORKFLOW.search(new RegExp(`^ {2}${name}:$`, 'm'));
  expect(start, `job ${name} ontbreekt in guard.yml`).toBeGreaterThanOrEqual(0);
  const rest = WORKFLOW.slice(start + 1);
  const next = rest.search(/^ {2}[a-z][a-z-]*:$/m);
  return next < 0 ? rest : rest.slice(0, next);
}

const zonderLaatsteStap = (tekst: string, naam: string) =>
  tekst.slice(0, tekst.lastIndexOf('\n      - name:')).replaceAll(naam, '<job>');
const envSleutels = (tekst: string) =>
  (/^ {4}env:\n((?: {6}.+\n)+)/m.exec(tekst)?.[1] ?? '').split('\n').filter(Boolean);
const uses = (tekst: string) => [...tekst.matchAll(/uses: (\S+@[0-9a-f]{40}.*)$/gm)].map((m) => m[1]);

describe('AC-19: guard.yml job specplicht', () => {
  test('heeft zijn eigen jobnaam en draait diff-guard.mjs --specplicht', () => {
    const tekst = job('specplicht');

    expect(tekst).toMatch(/^ {4}name: specplicht$/m);
    expect(tekst).toContain('node scripts/kit/diff-guard.mjs --specplicht');
    expect(tekst.match(/node scripts\/kit\//g)).toHaveLength(1);
  });

  test('de job diff-guard zelf draait nog zonder vlag', () => {
    expect(job('diff-guard')).toMatch(/run: node scripts\/kit\/diff-guard\.mjs\s*$/);
  });

  test('gelijk aan diff-guard tot en met de laatste stap: env, controles, checkout, fetch en ancestor-controle', () => {
    expect(zonderLaatsteStap(job('specplicht'), 'specplicht')).toBe(zonderLaatsteStap(job('diff-guard'), 'diff-guard'));
  });

  test('dezelfde env-sleutels, checkout-instellingen en gepinde actions als diff-guard', () => {
    const tekst = job('specplicht');

    expect(envSleutels(tekst)).toStrictEqual(envSleutels(job('diff-guard')));
    expect(envSleutels(tekst).length).toBeGreaterThanOrEqual(8);
    expect(tekst).toContain('ref: ${{ github.event.pull_request.base.sha }}');
    expect(tekst).toContain('persist-credentials: false');
    expect(tekst).toContain('fetch-depth: 0');
    expect(tekst).toContain('git merge-base --is-ancestor "$BASE_SHA" refs/guard/base');
    expect(uses(tekst)).toStrictEqual(uses(job('diff-guard')));
    expect(uses(tekst)).toHaveLength(2);
    expect(tekst).toMatch(/^ {4}timeout-minutes: 5$/m);
  });

  test('de laatste stap geeft GITHUB_TOKEN en REPO mee', () => {
    const laatste =
      job('specplicht')
        .split(/\n(?= {6}- )/)
        .at(-1) ?? '';

    expect(laatste).toContain('GITHUB_TOKEN: ${{ github.token }}');
    expect(laatste).toContain('REPO: ${{ github.repository }}');
  });

  test('types bevat edited en de PR-body staat nergens in het bestand', () => {
    expect(/^ {4}types: \[([^\]]+)\]$/m.exec(WORKFLOW)?.[1]?.split(', ')).toContain('edited');
    expect(WORKFLOW).not.toContain('github.event.pull_request.body');
  });
});

// gh-stub zoals in github-ruleset.test.ts: er gaat niets naar GitHub, de payload wordt bewaard.
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function rulesetContexten(): string[] {
  const dir = mkdtempSync(path.join(tmpdir(), 'specplicht-ruleset-'));
  dirs.push(dir);
  writeFileSync(
    path.join(dir, 'gh'),
    '#!/usr/bin/env bash\nif [[ " $* " == *" --input - "* ]]; then cat > "$STUB_DIR/payload.json"; echo \'{"id":42}\'; fi\n',
  );
  chmodSync(path.join(dir, 'gh'), 0o755);
  spawnSync('bash', [path.join(ROOT, 'scripts/github-ruleset.sh'), 'eigenaar/app'], {
    encoding: 'utf8',
    env: { HOME: dir, PATH: `${dir}:/usr/bin:/bin`, STUB_DIR: dir },
  });
  const payload: unknown = JSON.parse(readFileSync(path.join(dir, 'payload.json'), 'utf8'));
  return [...JSON.stringify(payload).matchAll(/"context":"([^"]+)"/g)].map((m) => m[1] ?? '');
}

describe('AC-20: specplicht is een verplichte check, diff-guard niet', () => {
  test('requiredChecks in .claude/decisions.json', () => {
    const ruw: unknown = JSON.parse(readFileSync(path.join(ROOT, '.claude/decisions.json'), 'utf8'));
    const lijst: unknown = Reflect.get(Object(ruw), 'requiredChecks');

    expect(lijst).toContain('specplicht');
    expect(lijst).not.toContain('diff-guard');
  });

  test('de payload van scripts/github-ruleset.sh', () => {
    const contexten = rulesetContexten();

    expect(contexten).toContain('specplicht');
    expect(contexten).not.toContain('diff-guard');
  });

  test('github-ruleset.test.ts: OPDRACHT noemt specplicht en NIET_VERPLICHT blijft ongewijzigd', () => {
    const tekst = readFileSync(path.join(ROOT, 'test/scripts/github-ruleset.test.ts'), 'utf8');
    const opdracht = /const OPDRACHT = \[([^\]]+)\]/.exec(tekst)?.[1] ?? '';

    expect(tekst).toContain("const NIET_VERPLICHT = ['diff-guard', 'document-status'];");
    expect(opdracht).toContain("'specplicht'");
  });
});

describe('AC-21: diff-guard.mjs met een onbekend argument', () => {
  test('eindigt met een exitcode ongelijk aan 0 en geeft geen uitslag', () => {
    const uitvoer = spawnSync('node', [path.join(ROOT, 'scripts/kit/diff-guard.mjs'), '--onbekend'], {
      encoding: 'utf8',
      env: { PATH: process.env['PATH'] ?? '' },
    });

    expect(uitvoer.status).not.toBe(0);
    expect(uitvoer.status).not.toBeNull();
    expect(uitvoer.stdout).not.toContain('## diff-guard: groen');
    expect(uitvoer.stdout).not.toContain('## specplicht: groen');
  });
});
