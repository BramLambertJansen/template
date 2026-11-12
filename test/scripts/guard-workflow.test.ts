import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';

// guard.yml heeft alleen nog de job `check-core` (ADR 0040). Hij draait met pull_request_target en behandelt de PR als
// git-data: geen checkout van de PR, `persist-credentials: false`, geen install.
// GEWIJZIGD (templateregime AC-7, ADR 0089 punt 5): de job `document-status` is weg; daarna ook `diff-guard` en `agent-merge`.
// Hun rijen, de vergelijking "gelijk aan diff-guard" en de describe over de job agent-merge zijn vervangen door de test dat
// de jobs en hun scripts ontbreken; de eisen aan een guard-job gelden nu voor `check-core` alleen.
const WORKFLOW = readFileSync(path.join(import.meta.dirname, '../../.github/workflows/guard.yml'), 'utf8');

function job(name: string): string {
  const start = WORKFLOW.search(new RegExp(`^ {2}${name}:$`, 'm'));
  if (start < 0) throw new Error(`job ${name} ontbreekt in guard.yml`);
  const rest = WORKFLOW.slice(start + 1);
  const next = rest.search(/^ {2}[a-z][a-z-]*:$/m);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('guard.yml job check-core', () => {
  const tekst = job('check-core');

  test('heeft zijn eigen jobnaam, zodat de checklijst de oorzaak toont', () => {
    expect(tekst).toMatch(/^ {4}name: check-core$/m);
  });

  test('draait zijn script uit de checkout van de base-SHA', () => {
    expect(tekst).toContain('node scripts/kit/check-core.mjs');
    expect(tekst).toContain('ref: ${{ github.event.pull_request.base.sha }}');
  });

  test('checkt de PR niet uit en bewaart geen credentials', () => {
    expect(tekst).toContain('persist-credentials: false');
    expect(tekst).not.toMatch(/ref: \$\{\{ github\.event\.pull_request\.head/);
    expect(tekst).not.toContain('github.head_ref');
  });

  test('installeert niets uit de PR', () => {
    expect(tekst).not.toMatch(/\b(?:pnpm|npm|yarn) (?:i|install|ci|add)\b/);
  });

  test("controleert base-repo en SHA's", () => {
    expect(tekst).toContain('Base-repo en SHA');
    expect(tekst).toMatch(/\[0-9a-f\]\{40\}/);
  });

  test('precies één checkout, één node-aanroep en alleen zijn eigen script', () => {
    expect(tekst.match(/uses: actions\/checkout@/g)).toHaveLength(1);
    expect(tekst.match(/node scripts\/kit\//g)).toHaveLength(1);
    expect(tekst).not.toMatch(/\bgit (?:checkout|switch|merge(?!-base)|cherry-pick|worktree|reset)\b/);
  });

  test('de laatste stap is de controle zelf, daarvoor geen run met PR-code', () => {
    const laatste = tekst.split(/\n(?= {6}- )/).at(-1) ?? '';
    expect(laatste).toMatch(/run: node scripts\/kit\/check-core\.mjs\s*$/);
  });
});

test('templateregime/AC-7 guard.yml heeft alleen de job check-core en roept geen verdwenen script aan', () => {
  expect(WORKFLOW.match(/^ {2}[a-z][a-z-]*:$/gm)).toStrictEqual(['  check-core:']);
  expectAbsent(WORKFLOW, /document-status|diff-guard|agent-merge/, {
    recognizes: [
      '  document-status:',
      'node scripts/kit/check-document-status.mjs',
      '  diff-guard:',
      'node scripts/kit/diff-guard.mjs',
      '  agent-merge:',
      'needs: diff-guard',
    ],
    allows: ['  check-core:', 'node scripts/kit/check-core.mjs'],
  });
});

test('de workflow draait alleen op pull_request_target', () => {
  expect(WORKFLOW).toMatch(/^on:\n {2}pull_request_target:/m);
  expect(WORKFLOW).not.toMatch(/^ {2}pull_request:/m);
});
