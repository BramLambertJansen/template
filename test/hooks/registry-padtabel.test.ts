import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { readRegistry } from '../../rails/hooks/lib/task-authority.mjs';
import { OUDE_DECISIONS_TEKST, REPO, object } from '../rails/padtabel-kit';

// padtabel/AC-14 (ADR 0079 punt 8, spec Werking 8): .claude/decisions.json zonder dode records; readRegistry leest de nieuwe
// vorm en het oude register van 30cc352.
const OUD = object(JSON.parse(OUDE_DECISIONS_TEKST));
const TEKST = readFileSync(path.join(REPO, '.claude/decisions.json'), 'utf8');

describe('padtabel/AC-14 decisions.json met alleen version en requiredChecks', () => {
  test('precies version en requiredChecks, met de waarden van 30cc352 (padtabel/AC-14)', () => {
    const ruw = object(JSON.parse(TEKST));
    expect(Object.keys(ruw).sort()).toEqual(['requiredChecks', 'version']);
    expect(ruw).toEqual({ version: OUD['version'], requiredChecks: OUD['requiredChecks'] });
  });

  test('readRegistry leest het huidige register, decisions leeg (padtabel/AC-14)', () => {
    expect(readRegistry(TEKST)).toEqual({ version: 1, requiredChecks: OUD['requiredChecks'], decisions: [] });
  });

  test('readRegistry leest ook het register van 30cc352 met zijn 26 records (padtabel/AC-14)', () => {
    const registry = readRegistry(OUDE_DECISIONS_TEKST);
    expect(registry.decisions).toHaveLength(26);
    expect(registry.requiredChecks).toEqual(OUD['requiredChecks']);
  });

  test('een andere sleutel blijft een fout (padtabel/AC-14)', () => {
    const tekst = JSON.stringify({ version: 1, requiredChecks: ['gate:fast'], extra: [] });
    expect(() => readRegistry(tekst)).toThrow();
  });
});
