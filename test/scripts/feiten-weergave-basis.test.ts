import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from 'vitest';

// Spec ui-weergave-basis AC-16: `feiten.mjs componenten` noemt Avatar, Image en StatTile als publiek met hun bron en
// eindige varianten. De e2e toetst de Componentenindex; deze test de feitenuitvoer zelf.
const ROOT = path.join(import.meta.dirname, '../..');

function componentLine(stdout: string, name: string): string {
  const lines = stdout.split('\n').filter((line) => line.startsWith(`- ${name} · `));
  expect(lines, `precies één regel voor ${name}`).toHaveLength(1);
  return lines[0] ?? '';
}

test('ui-weergave-basis/AC-16: feiten componenten toont Avatar, Image en StatTile met varianten', () => {
  const result = spawnSync(process.execPath, ['scripts/kit/feiten.mjs', 'componenten'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  expect(componentLine(result.stdout, 'Avatar')).toBe(
    '- Avatar · publiek · src/core/web/ui/avatar.tsx · size=lg|md|sm',
  );
  expect(componentLine(result.stdout, 'Image')).toBe(
    '- Image · publiek · src/core/web/ui/image.tsx · ratio=portrait|square|video',
  );
  expect(componentLine(result.stdout, 'StatTile')).toBe('- StatTile · publiek · src/core/web/ui/stat-tile.tsx');
});
