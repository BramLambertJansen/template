import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';

// Spec dependency-achterstand AC-8: de wekelijkse check leest alleen, draait niet op PR of push, en het token staat alleen
// in de stap die het script draait.
const WORKFLOW = readFileSync('.github/workflows/dependency-achterstand.yml', 'utf8');
const SCRIPT = readFileSync('scripts/kit/dependency-achterstand.mjs', 'utf8');

/** De stappen van de enige job, elk als tekstblok. */
const stappen = (tekst: string) => tekst.split(/\n(?= {6}- )/).slice(1);

describe('dependency-achterstand/AC-8 workflow', () => {
  test('dependency-achterstand/AC-8: alleen schedule (dinsdag 06:23 UTC) en workflow_dispatch', () => {
    const on = /\non:\n((?: {2}.*\n| {4}.*\n)*)/.exec(WORKFLOW)?.[1] ?? '';
    expect(on).toBe('  schedule:\n    - cron: "23 6 * * 2"\n  workflow_dispatch:\n');
    expectAbsent(WORKFLOW, /^ {2}(pull_request|pull_request_target|push):/m, {
      recognizes: ['  pull_request:', '  push:', '  pull_request_target:'],
    });
  });

  test('dependency-achterstand/AC-8: permissions read-all, geen rechten per job', () => {
    expect(WORKFLOW).toMatch(/^permissions: read-all$/m);
    expectAbsent(WORKFLOW, /^ +permissions:/m, { recognizes: ['    permissions:'], allows: ['permissions: read-all'] });
  });

  test('dependency-achterstand/AC-8: checkout zonder credentials; token alleen in de scriptstap', () => {
    const checkout = stappen(WORKFLOW).find((s) => s.includes('actions/checkout@')) ?? '';
    expect(checkout).toContain('persist-credentials: false');
    const metToken = stappen(WORKFLOW).filter((s) => /TOKEN|secrets\./.test(s));
    expect(metToken).toHaveLength(1);
    expect(metToken[0]).toContain('run: node scripts/kit/dependency-achterstand.mjs');
    expectAbsent(WORKFLOW, /^( {4})?env:/m, { recognizes: ['env:', '    env:'], allows: ['        env:'] });
  });

  test('dependency-achterstand/AC-8: het script vraagt alleen GET', () => {
    expect([...SCRIPT.matchAll(/method: '([A-Z]+)'/g)].map((m) => m[1])).toStrictEqual(['GET']);
    expectAbsent(SCRIPT, /method: '(POST|PATCH|PUT|DELETE)'/, {
      recognizes: ["method: 'POST'", "method: 'DELETE'"],
    });
  });
});
