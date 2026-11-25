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
  const waarde = typeof regel?.allowedVersions === 'string' ? regel.allowedVersions : '';
  // Renovate-notatie "!/<regex>/": de versies die de regex treft, zijn uitgesloten.
  const delen = /^!\/(.+)\/$/.exec(waarde);
  expect(delen, waarde).not.toBeNull();
  const uitgesloten = new RegExp(delen?.[1] ?? '$^');
  expect(uitgesloten.test('2.2.2')).toBe(true);
  expect(uitgesloten.test('2.2.1')).toBe(false);
  expect(uitgesloten.test('2.2.3')).toBe(false);
  expect(uitgesloten.test('2.2.20')).toBe(false);
});

// De Node uit mise.toml en het Node-image horen in één PR: test/scripts/dockerfile.test.ts eist dat ze gelijk zijn.
test('de Node uit mise.toml en het Node-image komen in dezelfde groep', () => {
  const laatsteGroep = regels()
    .filter((r) => lijst(r.matchPackageNames).includes('node') && typeof r.groupName === 'string')
    .at(-1);
  expect(laatsteGroep?.groupName).toBe('node');
  const naNode = regels().slice(regels().findIndex((r) => r === laatsteGroep) + 1);
  // Geen latere regel met een groep die op managers of depTypes matcht, want die zou node weer opsplitsen.
  const latereBrede = naNode.filter((r) => typeof r.groupName === 'string' && lijst(r.matchPackageNames).length === 0);
  expect(latereBrede).toStrictEqual([]);
});

test('geen major van de toolchain wordt verborgen met allowedVersions', () => {
  for (const pakket of ['node', 'pnpm', 'typescript']) {
    const verbergend = regels().filter(
      (r) => lijst(r.matchPackageNames).includes(pakket) && typeof r.allowedVersions === 'string',
    );
    expect(verbergend, pakket).toStrictEqual([]);
  }
});
