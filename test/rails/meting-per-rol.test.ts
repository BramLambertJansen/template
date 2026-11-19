import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

// Weigeringen en subagents per rol in `pnpm meting` (spec agents-leveren, PR-1), met METING_DIR op een tijdelijke map.
const root = process.cwd();
const BRANCH = 'feat/x';

type Regel = { e: string; a?: string; id?: string; tool?: string; k?: string; tc?: unknown };

// Zonder standaardrol: een regel zonder `a` is een oude meetregel (rol onbekend).
function map(bestanden: Record<string, (Regel | string)[]>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'meting-per-rol-'));
  for (const [naam, regels] of Object.entries(bestanden))
    writeFileSync(
      path.join(dir, `${naam}.jsonl`),
      regels
        .map((r) =>
          typeof r === 'string' ? r : JSON.stringify({ t: '2026-11-19T10:00:00.000Z', s: naam, b: BRANCH, ...r }),
        )
        .join('\n') + '\n',
    );
  return dir;
}

const ghLeeg = (() => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'meting-per-rol-gh-')), 'gh');
  writeFileSync(file, '#!/usr/bin/env node\nprocess.stdout.write("[]");\n');
  chmodSync(file, 0o755);
  return file;
})();

function meting(dir: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/kit/meting.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, METING_DIR: dir, METING_GH: ghLeeg },
  });
  expect(result.status).toBe(0);
  return result.stdout;
}

function veld(waarde: unknown, ...pad: string[]): unknown {
  let huidig = waarde;
  for (const naam of pad)
    huidig =
      typeof huidig === 'object' && huidig !== null ? Object.entries(huidig).find(([k]) => k === naam)?.[1] : undefined;
  return huidig;
}

const weigeringenAc2: Regel[] = [
  { e: 'PermissionDenied', a: 'reviewer', id: 'r-d', tool: 'Bash', k: 'docker' },
  { e: 'PreToolUse', a: 'reviewer', id: 'r-p', tool: 'Bash', k: 'curl' },
  { e: 'PreToolUse', a: 'hoofdsessie', id: 'h', tool: 'Bash', k: 'git' },
  { e: 'PermissionDenied', a: 'hoofdsessie', id: 'h', tool: 'Bash', k: 'git' },
  { e: 'PermissionDenied', id: 'o', tool: 'Bash', k: 'rm' },
];

const runsAc3: Regel[] = [
  { e: 'PostToolUse', a: 'hoofdsessie', id: 'r1', tool: 'Agent', k: 'agent reviewer', tc: 20 },
  { e: 'PostToolUse', a: 'hoofdsessie', id: 'r2', tool: 'Agent', k: 'agent reviewer', tc: 28 },
  { e: 'PostToolUseFailure', a: 'hoofdsessie', id: 'r3', tool: 'Agent', k: 'agent reviewer' },
  { e: 'PostToolUse', a: 'hoofdsessie', id: 'd1', tool: 'Agent', k: 'agent developer', tc: 30 },
  { e: 'PreToolUse', a: 'hoofdsessie', id: 'd2', tool: 'Agent', k: 'agent developer' },
];

const zonderIets: Regel[] = [
  { e: 'PreToolUse', a: 'hoofdsessie', id: 'x', tool: 'Bash', k: 'pnpm lint' },
  { e: 'PostToolUse', a: 'hoofdsessie', id: 'x', tool: 'Bash', k: 'pnpm lint' },
];

test('agents-leveren/AC-2: weigeringenPerRol per sessie en per branch, met onbekend voor een regel zonder a', () => {
  const data: unknown = JSON.parse(meting(map({ sessie: weigeringenAc2 }), '--json'));
  const verwacht = { reviewer: 2, hoofdsessie: 1, onbekend: 1 };
  expect(veld(data, 'sessies', 'sessie', 'weigeringenPerRol')).toEqual(verwacht);
  expect(veld(data, 'sessies', 'sessie', 'branches', BRANCH, 'weigeringenPerRol')).toEqual(verwacht);
});

test('agents-leveren/AC-2: de tekstregel per rol, aflopend op aantal en daarna op naam', () => {
  const uit = meting(map({ sessie: weigeringenAc2 }));
  expect(uit).toContain('  weigeringen per rol: reviewer 2, hoofdsessie 1, onbekend 1\n');
});

test('agents-leveren/AC-2: zonder weigeringen ontbreekt de regel en is de waarde {}', () => {
  const dir = map({ sessie: zonderIets });
  expect(meting(dir)).not.toContain('weigeringen per rol');
  const data: unknown = JSON.parse(meting(dir, '--json'));
  expect(veld(data, 'sessies', 'sessie', 'weigeringenPerRol')).toEqual({});
  expect(veld(data, 'sessies', 'sessie', 'branches', BRANCH, 'weigeringenPerRol')).toEqual({});
});

test('agents-leveren/AC-3: subagentsPerRol per sessie en per branch; een PreToolUse is geen run', () => {
  const data: unknown = JSON.parse(meting(map({ sessie: runsAc3 }), '--json'));
  const verwacht = {
    reviewer: { runs: 3, toolcalls: 48, zonderTelling: 1 },
    developer: { runs: 1, toolcalls: 30, zonderTelling: 0 },
  };
  expect(veld(data, 'sessies', 'sessie', 'subagentsPerRol')).toEqual(verwacht);
  expect(veld(data, 'sessies', 'sessie', 'branches', BRANCH, 'subagentsPerRol')).toEqual(verwacht);
});

test('agents-leveren/AC-3: de tekstregel met runs, toolcalls en zonder telling', () => {
  const uit = meting(map({ sessie: runsAc3 }));
  expect(uit).toContain(
    '  subagents: reviewer 3 runs, 48 toolcalls (1 zonder telling); developer 1 runs, 30 toolcalls\n',
  );
});

test('agents-leveren/AC-3: zonder runs ontbreekt de regel en is de waarde {}', () => {
  const dir = map({ sessie: zonderIets });
  expect(meting(dir)).not.toContain('subagents:');
  const data: unknown = JSON.parse(meting(dir, '--json'));
  expect(veld(data, 'sessies', 'sessie', 'subagentsPerRol')).toEqual({});
});

test('agents-leveren/AC-3: een run zonder subagenttype telt als onbekend; een ongeldige tc als zonder telling', () => {
  const dir = map({
    sessie: [
      { e: 'PostToolUse', a: 'hoofdsessie', id: 'o1', tool: 'Task', k: 'agent', tc: 4 },
      { e: 'PostToolUse', a: 'hoofdsessie', id: 'o2', tool: 'Agent', k: 'agent tester', tc: -1 },
      { e: 'PostToolUse', a: 'hoofdsessie', id: 'o3', tool: 'Agent', k: 'agent tester', tc: '5' },
      { e: 'PostToolUse', a: 'hoofdsessie', id: 'o4', tool: 'Agent', k: 'agent tester', tc: 2.5 },
      { e: 'PostToolUse', a: 'hoofdsessie', id: 'o5', tool: 'Bash', k: 'agent tester', tc: 9 },
    ],
  });
  const data: unknown = JSON.parse(meting(dir, '--json'));
  expect(veld(data, 'sessies', 'sessie', 'subagentsPerRol')).toEqual({
    tester: { runs: 3, toolcalls: 0, zonderTelling: 3 },
    onbekend: { runs: 1, toolcalls: 4, zonderTelling: 0 },
  });
});

test('agents-leveren/AC-4: --pr-tabel heeft na Weigeringen (bovengrens) de rijen per rol', () => {
  const dir = map({ sessie: [...weigeringenAc2, ...runsAc3] });
  const lijnen = meting(dir, '--pr-tabel', '--branch', BRANCH).split('\n');
  const i = lijnen.findIndex((l) => l.startsWith('| Weigeringen (bovengrens) |'));
  expect(i).toBeGreaterThan(-1);
  expect(lijnen.slice(i + 1, i + 3)).toStrictEqual([
    '| Weigeringen per rol | reviewer 2 · hoofdsessie 1 · onbekend 1 |',
    '| Subagents per rol | reviewer 3 runs, 48 toolcalls · developer 1 runs, 30 toolcalls |',
  ]);
});

test('agents-leveren/AC-4: --pr-tabel --json heeft weigeringenPerRol en subagentsPerRol onder prTabel, over sessies', () => {
  const dir = map({ een: weigeringenAc2, twee: runsAc3 });
  const data: unknown = JSON.parse(meting(dir, '--pr-tabel', '--json', '--branch', BRANCH));
  expect(veld(data, 'prTabel', 'weigeringenPerRol')).toEqual({ reviewer: 2, hoofdsessie: 1, onbekend: 1 });
  expect(veld(data, 'prTabel', 'subagentsPerRol')).toEqual({
    reviewer: { runs: 3, toolcalls: 48, zonderTelling: 1 },
    developer: { runs: 1, toolcalls: 30, zonderTelling: 0 },
  });
});

test('agents-leveren/AC-4: zonder weigeringen of runs is de waarde van beide rijen 0 en in JSON {}', () => {
  const dir = map({ sessie: zonderIets });
  const uit = meting(dir, '--pr-tabel', '--branch', BRANCH);
  expect(uit).toContain('| Weigeringen per rol | 0 |\n');
  expect(uit).toContain('| Subagents per rol | 0 |\n');
  const data: unknown = JSON.parse(meting(dir, '--pr-tabel', '--json', '--branch', BRANCH));
  expect(veld(data, 'prTabel', 'weigeringenPerRol')).toEqual({});
  expect(veld(data, 'prTabel', 'subagentsPerRol')).toEqual({});
});

test('agents-leveren/AC-2 en AC-3: --help noemt beide teldefinities letterlijk', () => {
  const uit = meting(map({}), '--help');
  expect(uit).toContain(
    'weigeringen per rol: dezelfde weigeringen, naar de rol (a) van het geweigerde event; zonder rol: onbekend.',
  );
  expect(uit).toContain(
    'subagents per rol: PostToolUse en PostToolUseFailure van Agent (of Task), naar het subagenttype; toolcalls uit totalToolUseCount van de tool_response; ontbreekt die (een run op de achtergrond, een fout), dan zonder telling, geen nul.',
  );
});
