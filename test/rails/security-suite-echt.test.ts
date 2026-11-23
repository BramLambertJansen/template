import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';

// security/AC-14 (spec security-suite, ADR 0103 punt 2): de suite in test/security/ draait tegen de echte lokale stack,
// zonder gemockte API of database en zonder `skip` of `todo`. Dat de suite onder gate:slow draait, is procesbewijs en geen
// criterium meer. Alleen een spy op console (stille logregels) blijft toegestaan: die is geen mock van API of database.
const MAP = 'test/security';

function bestanden(map: string): string[] {
  return readdirSync(map, { withFileTypes: true }).flatMap((entry) => {
    const pad = path.join(map, entry.name);
    if (entry.isDirectory()) return bestanden(pad);
    return /\.tsx?$/.test(entry.name) ? [pad] : [];
  });
}

const OVERSLAAN =
  /\b\w*(?:test|it|describe|Test)(?:\.(?:concurrent|sequential|each\([^)]*\)))*\.(?:skip|todo|skipIf|runIf)\b|\bx(?:it|test|describe)\(|\{\s*skip:\s*true|\b(?:ctx|context|t)\.skip\(/;
const MOCK = /\bvi\.(?:mock|doMock|stubGlobal)\(|\bvi\.spyOn\((?!console\b)|\bmsw\b|\bnock\(/;

describe('security/AC-14: de securitysuite is echt', () => {
  const lijst = bestanden(MAP);

  test('de suite bestaat uit testbestanden', () => {
    expect(lijst.some((pad) => pad.endsWith('.int.test.ts'))).toBe(true);
  });

  test.each(lijst)('%s: geen skip of todo', (pad) => {
    expectAbsent(readFileSync(pad, 'utf8'), OVERSLAAN, {
      recognizes: [
        "test.skip('x', () => {})",
        "it.todo('x')",
        "describe.skip('x', () => {})",
        "test.skipIf(true)('x', () => {})",
        "test.each([1]).skip('x', () => {})",
        "test.concurrent.skip('x', () => {})",
        "dbTest.skip('x', () => {})",
        "test('x', { skip: true }, () => {})",
        'ctx.skip()',
        "xit('x', () => {})",
      ],
      allows: ["test('overslaan als tekst', () => {})", 'const skip = 1;', "test('x', { timeout: 5 }, () => {})"],
    });
  });

  test.each(lijst)('%s: geen gemockte API of database', (pad) => {
    expectAbsent(readFileSync(pad, 'utf8'), MOCK, {
      recognizes: [
        "vi.mock('../../src/core/api/db/index.ts')",
        "vi.doMock('pg')",
        "vi.stubGlobal('fetch', f)",
        "vi.spyOn(db, 'withUser')",
      ],
      allows: ["vi.spyOn(console, 'error').mockImplementation(() => undefined)"],
    });
  });
});
