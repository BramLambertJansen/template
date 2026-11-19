import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import * as trendModule from '../../scripts/kit/meting-trend.mjs';
import { expectAbsent } from '../support/absence.ts';
import { branch, cli, fixture, veld, type Fixture } from './meting-semantiek-kit';

// agent-samenvoegen/AC-11: de meting telt geen bevindingen van een externe reviewdienst meer, niet in `--pr-tabel`
// en niet in `--trend`; de overige maten blijven. Het zoekwoord wordt samengesteld, zodat dit bestand zelf geen treffer is
// voor test/docs/geen-externe-review-docs.test.ts.
const NAAM = ['co', 'dex'].join('');
const WOORD = new RegExp(NAAM, 'i');
// De vormen waarin het woord in de uitvoer of de bron stond: de tabelrij, het JSON-veld, de sleutel en de constante.
const VORMEN = {
  recognizes: [`${NAAM}-bevindingen`, `${NAAM}Bevindingen`, `"${NAAM}":`, `${NAAM.toUpperCase()}_LOGIN`],
} as const;
const BRANCH = 'feat/kern';
const root = process.cwd();
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tijdelijk(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/** Nep-gh die bij elke aanroep `uitvoer` (JavaScript-expressie over `a`, de argumenten) schrijft en de aanroep logt. */
function nepGh(uitvoer: string): { gh: string; log: string } {
  const dir = tijdelijk('meting-zonder-gh-');
  const log = path.join(dir, 'log');
  const gh = path.join(dir, 'gh');
  const body = `const a = process.argv.slice(2); require('node:fs').appendFileSync(${JSON.stringify(log)}, a.join(' ') + '\\n');
process.stdout.write(${uitvoer});`;
  writeFileSync(gh, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(gh, 0o755);
  return { gh, log };
}

const events = [
  { e: 'PreToolUse', t: '2026-10-15T10:00:00.000Z', tool: 'Bash', id: 'a', k: 'pnpm lint' },
  { e: 'PostToolUse', t: '2026-10-15T10:00:01.000Z', tool: 'Bash', id: 'a', k: 'pnpm lint' },
  { e: 'PreToolUse', t: '2026-10-15T10:10:00.000Z', tool: 'Agent', id: 'r1', k: 'agent reviewer' },
  { e: 'PreToolUse', t: '2026-10-15T10:20:00.000Z', tool: 'Agent', id: 'r2', k: 'agent reviewer' },
  { e: 'PreToolUse', t: '2026-10-15T10:25:30.000Z', tool: 'Bash', id: 'w', k: 'git' },
  { e: 'PermissionDenied', t: '2026-10-15T10:25:30.000Z', tool: 'Bash', id: 'w', k: 'git' },
];

function prTabel(extra: string[]) {
  const runs = [{ databaseId: 1, createdAt: '2026-10-15T10:05:00.000Z', conclusion: 'failure' }];
  const f: Fixture = { ...fixture(), gh: nepGh(JSON.stringify(JSON.stringify(runs))).gh };
  const lijnen = events.map((r) => JSON.stringify({ s: 'sessie', b: BRANCH, a: 'hoofdsessie', ...r }));
  writeFileSync(path.join(f.opslag, 'sessie.jsonl'), lijnen.join('\n') + '\n');
  branch(f, BRANCH);
  const result = cli(f, ['--pr-tabel', ...extra, '--branch', BRANCH]);
  expect(result.status).toBe(0);
  return result.stdout;
}

describe('meting zonder externe review: --pr-tabel', () => {
  test('de tabel heeft precies de vijf overige kerncijfers en geen rij voor de externe reviewdienst', () => {
    const uit = prTabel([]);
    expectAbsent(uit, WOORD, VORMEN);
    expect(uit).toBe(
      [
        '| Kerncijfer | Waarde |',
        '|---|---|',
        '| Leespad (bytes) | zie pnpm leespad |',
        '| Doorlooptijd | 25:30 |',
        '| Reviewrondes | 2 |',
        '| CI-rood | 1 |',
        '| Weigeringen (bovengrens) | 1 |',
        '',
      ].join('\n'),
    );
  });

  test('--json heeft onder prTabel precies de vijf overige velden', () => {
    const data: unknown = JSON.parse(prTabel(['--json']));
    expect(veld(data, 'prTabel')).toStrictEqual({
      leespad: 'zie pnpm leespad',
      doorlooptijd: 1530,
      reviewrondes: 2,
      ciRood: 1,
      weigeringen: 1,
    });
  });

  test('--help noemt de externe reviewdienst niet en nog wel de overige maten', () => {
    const result = cli(fixture(), ['--help']);
    expect(result.status).toBe(0);
    expectAbsent(result.stdout, WOORD, VORMEN);
    for (const maat of ['doorlooptijd', 'reviewrondes', 'CI-rood', 'weigeringen', 'eigenaarberichten', '--trend'])
      expect(result.stdout, maat).toContain(maat);
  });
});

/** Twintig PR's, nieuwste eerst; de nieuwste tien met twee rode runs en drie reviewrondes, de rest met nul en één. */
const prs = Array.from({ length: 20 }, (_x, i) => ({
  nummer: 500 - i,
  ciRood: i < 10 ? 2 : 0,
  reviewrondes: i < 10 ? 3 : 1,
}));

describe('meting zonder externe review: de trend als functie', () => {
  test('meting-trend.mjs exporteert niets meer voor de externe reviewdienst', () => {
    expect(Object.keys(trendModule).filter((naam) => WOORD.test(naam))).toStrictEqual([]);
    expect(Object.keys(trendModule).sort()).toStrictEqual(['echteStap', 'prsUitGh', 'trend', 'trendTekst']);
  });

  test('trend() geeft precies de maten ciRood en reviewrondes, elk met een eigen melding', () => {
    const uit = trendModule.trend(prs);
    expect(uit.maten).toStrictEqual({
      ciRood: { laatste: 2, vorige: 0, steeg: true },
      reviewrondes: { laatste: 3, vorige: 1, steeg: true },
    });
    expect(uit.meldingen).toHaveLength(2);
    expect(uit.meldingen[0]).toMatch(/^let op: CI-rood steeg/);
    expect(uit.meldingen[1]).toMatch(/^let op: reviewrondes steeg/);
  });

  test('trendTekst() heeft een regel per overige maat en geen regel voor de externe reviewdienst', () => {
    const tekst = trendModule.trendTekst(trendModule.trend(prs));
    expectAbsent(tekst, WOORD, VORMEN);
    expect(tekst.split('\n').slice(0, 3)).toStrictEqual([
      "Trend over 20 gemergde PR's (gemiddelde per PR):",
      'CI-rood: laatste tien 2, tien daarvoor 0',
      'reviewrondes: laatste tien 3, tien daarvoor 1',
    ]);
  });
});

describe('meting zonder externe review: pnpm meting --trend als proces', { timeout: 60_000 }, () => {
  function trendCli(extra: string[]) {
    const lijst = Array.from({ length: 20 }, (_x, i) => ({
      number: 500 - i,
      head: { ref: `b${String(500 - i)}` },
      merged_at: '2026-10-20T10:00:00Z',
    }));
    const nieuw = JSON.stringify(lijst.slice(0, 10).map((p) => `--branch=${p.head.ref}`));
    const rood = JSON.stringify(JSON.stringify([{ conclusion: 'failure' }, { conclusion: 'failure' }]));
    const { gh, log } = nepGh(
      `a[0] === 'api' && a[1].includes('/pulls?') ? ${JSON.stringify(JSON.stringify(lijst))} : a[0] === 'run' && ${nieuw}.includes(a[2]) ? ${rood} : '[]'`,
    );
    const r = spawnSync(process.execPath, [path.join(root, 'scripts/kit/meting.mjs'), '--trend', ...extra], {
      cwd: root,
      env: { ...process.env, METING_GH: gh, METING_DIR: tijdelijk('meting-zonder-dir-') },
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    return {
      stdout: r.stdout,
      aanroepen: existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [],
    };
  }

  test('de uitvoer noemt CI-rood en reviewrondes, niet de externe reviewdienst', () => {
    const { stdout } = trendCli([]);
    expectAbsent(stdout, WOORD, VORMEN);
    expect(stdout).toMatch(/^CI-rood: laatste tien 2, tien daarvoor 0$/m);
    expect(stdout).toMatch(/^reviewrondes: laatste tien onbekend, tien daarvoor onbekend$/m);
    expect(stdout).toMatch(/^let op: CI-rood steeg/m);
  });

  test('--json heeft onder trend.maten precies ciRood en reviewrondes', () => {
    const data: unknown = JSON.parse(trendCli(['--json']).stdout);
    const maten = veld(data, 'trend', 'maten');
    expect(typeof maten === 'object' && maten !== null ? Object.keys(maten) : []).toStrictEqual([
      'ciRood',
      'reviewrondes',
    ]);
  });

  test('gh wordt niet meer naar reviewreacties gevraagd: één PR-lijst en een run list per PR', () => {
    const { aanroepen } = trendCli([]);
    expect(aanroepen.filter((a) => a.includes('/comments'))).toStrictEqual([]);
    expect(aanroepen.filter((a) => a.startsWith('api '))).toHaveLength(1);
    expect(aanroepen.filter((a) => a.startsWith('run list'))).toHaveLength(20);
  });
});
