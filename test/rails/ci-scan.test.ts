import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { inKooi } from '../../scripts/kit/kooi.mjs';
import { vermogen } from '../setup/vermogen.ts';

// De job `secrets` leest op een PR alleen de commits van die PR (`origin/main..HEAD`) en daarbuiten alleen de geschiedenis van HEAD
// (`--log-opts HEAD`, ci-bewijs/AC-4, besluit eigenaar #758). Alle refs scannen liet één valse melding op één branch elke open PR
// of main rood maken (#97, #99, #758); op main is HEAD main zelf. De test draait het `run`-blok uit ci.yml echt, met een betterleaks-stub die zijn
// argumenten teruggeeft: omdraaien of weghalen van een tak laat hem falen.
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const job = workflow.slice(workflow.indexOf('\n  secrets:'), workflow.indexOf('\n  image:'));

function runBlock(): string {
  const lines = job.split('\n');
  const start = lines.findIndex((line) => line.trim() === '- run: |');
  const end = lines.findIndex((line, index) => index > start && line.trim() === 'env:');
  if (start < 0 || end < 0) throw new Error('de job secrets heeft geen `run: |`-blok met een `env:` erna');
  const body = lines.slice(start + 1, end);
  const indent = (body[0] ?? '').length - (body[0] ?? '').trimStart().length;
  return body.map((line) => line.slice(indent)).join('\n');
}

function scan(event: string): string {
  const bin = mkdtempSync(path.join(tmpdir(), 'ci-scan-'));
  writeFileSync(path.join(bin, 'betterleaks'), '#!/bin/sh\necho "ARGS: $*"\n');
  chmodSync(path.join(bin, 'betterleaks'), 0o755);
  try {
    // Een fragment uit ci.yml: in de kooi (ADR 0072).
    const result = inKooi(`set -eu\n${runBlock()}`, {
      werkmap: bin,
      env: { PATH: `${bin}:${process.env['PATH'] ?? ''}`, EVENT: event },
    });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout;
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

test('op een PR alleen de commits van die PR, met eigen config en zonder inline allows', (ctx) => {
  ctx.skip(vermogen('kooi').ontbreekt, vermogen('kooi').melding);
  const args = scan('pull_request');

  expect(args).toContain('--log-opts origin/main..HEAD');
  expect(args).toContain('-c scripts/kit/betterleaks.toml');
  expect(args).toContain('--ignore-gitleaks-allow');
});

// test.each geeft geen testcontext mee: hier de vorm met skipIf (tests-naar-vermogen AC-3, terugval).
test.skipIf(vermogen('kooi').ontbreekt).each(['push', 'merge_group', 'workflow_dispatch'])(
  'ci-bewijs/AC-4: bij %s alleen de geschiedenis van HEAD',
  (event) => {
    const args = scan(event);

    expect(args).toContain('--log-opts HEAD');
    expect(args).not.toContain('--log-opts origin/main');
    expect(args).toContain('-c scripts/kit/betterleaks.toml');
    expect(args).toContain('--ignore-gitleaks-allow');
  },
);

test('ci-bewijs/AC-4: elke regel met betterleaks git in de job heeft --log-opts', () => {
  const regels = job.split('\n').filter((regel) => regel.includes('betterleaks git'));

  expect(regels.length).toBeGreaterThanOrEqual(2);
  expect(regels.filter((regel) => !regel.includes('--log-opts'))).toStrictEqual([]);
});

test('EVENT komt uit het event van de workflow, niet uit iets anders', () => {
  expect(job).toMatch(/env:\n\s+EVENT: \$\{\{ github\.event_name \}\}/);
});

test('de checkout haalt de hele geschiedenis op, zodat origin/main bestaat', () => {
  expect(job).toMatch(/fetch-depth: 0/);
  expect(job).toContain('name: secrets');
});
