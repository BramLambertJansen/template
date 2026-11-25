import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';

// Spec toolchain-bewaking AC-10: de wekelijkse toolchaincheck draait niet op PR of push, krijgt alleen `contents: read` en
// `issues: write`, en het token staat alleen in de stap die het script draait.
const WORKFLOW = readFileSync('.github/workflows/toolchain.yml', 'utf8');
const ACHTERSTAND = readFileSync('.github/workflows/dependency-achterstand.yml', 'utf8');

/** De stappen van de enige job, elk als tekstblok. */
const stappen = (tekst: string) => tekst.split(/\n(?= {6}- )/).slice(1);

describe('toolchain-bewaking/AC-10 workflow', () => {
  test('toolchain-bewaking/AC-10: alleen schedule (cron 41 6 * * 2) en workflow_dispatch', () => {
    const on = /\non:\n((?: {2}.*\n| {4}.*\n)*)/.exec(WORKFLOW)?.[1] ?? '';
    expect(on).toBe('  schedule:\n    - cron: "41 6 * * 2"\n  workflow_dispatch:\n');
    expectAbsent(WORKFLOW, /^ {2}(pull_request|pull_request_target|push):/m, {
      recognizes: ['  pull_request:', '  push:', '  pull_request_target:'],
    });
  });

  test('toolchain-bewaking/AC-10: concurrency met groep toolchain zonder cancel-in-progress', () => {
    expect(WORKFLOW).toContain('\nconcurrency:\n  group: toolchain\n  cancel-in-progress: false\n');
  });

  test('toolchain-bewaking/AC-10: permissions read-all op workflowniveau; de job precies contents: read en issues: write', () => {
    expect(WORKFLOW).toMatch(/^permissions: read-all$/m);
    const job = /\n {4}permissions:\n((?: {6}\S.*\n)*)/.exec(WORKFLOW)?.[1] ?? '';
    expect(job).toBe('      contents: read\n      issues: write\n');
    expect([...WORKFLOW.matchAll(/^ *permissions:/gm)]).toHaveLength(2);
  });

  test('toolchain-bewaking/AC-10: checkout zonder credentials; token alleen in de scriptstap', () => {
    const checkout = stappen(WORKFLOW).find((s) => s.includes('actions/checkout@')) ?? '';
    expect(checkout).toContain('persist-credentials: false');
    const metToken = stappen(WORKFLOW).filter((s) => /token|secrets\./i.test(s));
    expect(metToken).toHaveLength(1);
    expect(metToken[0]).toContain('GITHUB_TOKEN: ${{ github.token }}');
    expect(metToken[0]).toContain('run: node scripts/kit/check-toolchain.mjs --issue');
    expectAbsent(WORKFLOW, /^( {4})?env:/m, { recognizes: ['env:', '    env:'], allows: ['        env:'] });
  });

  test('toolchain-bewaking/AC-10: het script draait zonder voorwaarde op de repo', () => {
    expectAbsent(WORKFLOW, /^\s*if:/m, { recognizes: ['    if: github.repository == x', '        if: x'] });
    expect(WORKFLOW).toMatch(/^ {8}run: node scripts\/kit\/check-toolchain\.mjs --issue$/m);
  });

  test('toolchain-bewaking/AC-10: runner, actions-pins en mise zoals in dependency-achterstand', () => {
    const regels = (tekst: string) =>
      tekst.split('\n').filter((regel) => /runs-on:|uses: |version: |install_args:|timeout-minutes:/.test(regel));
    expect(regels(WORKFLOW)).toStrictEqual(regels(ACHTERSTAND));
  });
});
