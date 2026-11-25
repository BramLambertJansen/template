import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

// renovate.json volgt het toolchainbeleid (R-PROV-04, ADR 0111): niet-majors in drie groepen, geen major in een groep,
// lefthook 2.2.2 overgeslagen (trustPolicy) en geen verborgen major van de toolchain.
const raw: unknown = JSON.parse(readFileSync(path.join(import.meta.dirname, '../../renovate.json'), 'utf8'));

interface Regel {
  groupName?: unknown;
  matchUpdateTypes?: unknown;
  matchPackageNames?: unknown;
  allowedVersions?: unknown;
}

function regels(): Regel[] {
  if (typeof raw !== 'object' || raw === null || !('packageRules' in raw) || !Array.isArray(raw.packageRules))
    throw new Error('renovate.json mist packageRules');
  return raw.packageRules.filter((r): r is Regel => typeof r === 'object' && r !== null);
}

function lijst(waarde: unknown): string[] {
  return Array.isArray(waarde) ? waarde.filter((w): w is string => typeof w === 'string') : [];
}

test.each(['runtime', 'dev-tools', 'ci-images'])('groep %s bestaat en bundelt alleen niet-majors', (groep) => {
  const inGroep = regels().filter((r) => r.groupName === groep);
  expect(inGroep.length).toBeGreaterThan(0);
  for (const r of inGroep) {
    const types = lijst(r.matchUpdateTypes);
    expect(types.length).toBeGreaterThan(0);
    expect(types).not.toContain('major');
  }
});

test('lefthook 2.2.2 wordt overgeslagen, een andere versie niet', () => {
  const regel = regels().find((r) => lijst(r.matchPackageNames).includes('lefthook'));
  expect(regel?.allowedVersions).toBe('!/^2\\.2\\.2$/');
  const patroon = /^2\.2\.2$/;
  expect(patroon.test('2.2.2')).toBe(true);
  expect(patroon.test('2.2.3')).toBe(false);
  expect(patroon.test('2.2.20')).toBe(false);
});

test('geen major van de toolchain wordt verborgen met allowedVersions', () => {
  for (const pakket of ['node', 'pnpm', 'typescript']) {
    const verbergend = regels().filter(
      (r) => lijst(r.matchPackageNames).includes(pakket) && typeof r.allowedVersions === 'string',
    );
    expect(verbergend, pakket).toStrictEqual([]);
  }
});
