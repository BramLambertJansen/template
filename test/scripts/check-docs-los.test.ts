import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from 'vitest';

const root = path.join(import.meta.dirname, '../..');

// Leerpunt #693: los gedraaid gaf check-docs geen uitvoer en exit 0, terwijl alleen de ratchet met de baseline vergelijkt.
test('check-docs los gedraaid geeft geen groen maar verwijst naar pnpm ratchet', () => {
  const result = spawnSync(process.execPath, ['scripts/kit/check-docs.mjs'], { cwd: root, encoding: 'utf8' });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('pnpm ratchet');
});
