import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// app-agentregels/AC-6 (docs/template/specs/app-agentregels.md): `docs/app.md` valt onder `docs/**` in de padtabel, dus elke
// rol schrijft het en de hoofdsessie merget een PR die alleen zulke paden raakt (R-REPO-01). Op de echte .claude/gates.json.
const REPO = path.join(import.meta.dirname, '../..');

describe('app-agentregels/AC-6 feiten.mjs pad docs/app.md', () => {
  test('app-agentregels/AC-6: schrijven vrij en besluit agent', () => {
    const uit = spawnSync(process.execPath, ['scripts/kit/feiten.mjs', 'pad', 'docs/app.md'], {
      cwd: REPO,
      encoding: 'utf8',
    });

    expect(uit.status, uit.stderr).toBe(0);
    expect(uit.stdout).toContain('docs/app.md: ');
    expect(uit.stdout).toContain('schrijven vrij');
    expect(uit.stdout).toContain('besluit agent');
  });
});
