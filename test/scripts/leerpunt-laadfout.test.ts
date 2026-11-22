// Leerpunten #814 en #892: laadfouten in de bewijsjob (typeUitslag en runOordeel in scripts/kit/leerpunt.mjs).
import { describe, expect, test } from 'vitest';
import { runOordeel, TYPE_LAADFOUT, typeUitslag } from '../../scripts/kit/leerpunt.mjs';

const LAADFOUT = { status: 'laadfout', assertieFouten: 0, laadFout: true };

describe('typeUitslag: laadfout of rood (#814)', () => {
  test('de bestaande laadcodes blijven een laadfout', () => {
    expect(TYPE_LAADFOUT.test("a.ts(1,1): error TS2307: Cannot find module './x'.")).toBe(true);
  });

  test('status null (compiler startte niet) is een laadfout', () => {
    expect(typeUitslag(null, '')).toEqual(LAADFOUT);
  });

  test('status 1 zonder enige error TS-diagnose is een laadfout', () => {
    expect(typeUitslag(1, '')).toEqual(LAADFOUT);
    expect(typeUitslag(1, 'Segmentation fault')).toEqual(LAADFOUT);
  });

  test('TS5058 (pad bestaat niet) is een laadfout', () => {
    const uitvoer = "error TS5058: The specified path does not exist: '.leerpunt-tsconfig.json'.";
    expect(typeUitslag(1, uitvoer)).toEqual(LAADFOUT);
  });

  test('TS5083 (bestand niet leesbaar) is een laadfout', () => {
    expect(typeUitslag(1, "error TS5083: Cannot read file '/repo/.leerpunt-tsconfig.json'.")).toEqual(LAADFOUT);
  });

  test('TS18003 (geen invoer in de config) is een laadfout', () => {
    const uitvoer = "error TS18003: No inputs were found in config file '/repo/.leerpunt-tsconfig.json'.";
    expect(typeUitslag(1, uitvoer)).toEqual(LAADFOUT);
  });

  test('controle: een echte typefout (TS2322) blijft rood', () => {
    const uitvoer = "a.test-d.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.";
    expect(typeUitslag(1, uitvoer)).toEqual({ status: 'rood', assertieFouten: 1, laadFout: false });
  });

  test('een echte typefout naast een configfout blijft rood', () => {
    const uitvoer =
      "error TS5083: Cannot read file 'x'.\na.ts(1,1): error TS2322: Type 'a' is not assignable to type 'b'.";
    expect(typeUitslag(1, uitvoer).status).toBe('rood');
  });
});

describe('runOordeel: basis met laadfout (#814, #892)', () => {
  test('een basis uit typeUitslag(null, "") met groene head is geen bewijs', () => {
    const fout = runOordeel(
      { pad: 'test/a.test-d.ts', soort: 'type' },
      { basis: typeUitslag(null, ''), head: typeUitslag(0, '') },
    );
    expect(fout).not.toBeNull();
    expect(fout).toContain('op laden');
  });

  test('de laadfoutmelding behoudt het begin en wijst op wat op de basis staat', () => {
    const fout = runOordeel(
      { pad: 'test/a.test.ts', soort: 'unit' },
      { basis: LAADFOUT, head: { status: 'groen', assertieFouten: 0, laadFout: false } },
    );
    expect(fout).toMatch(
      /^test\/a\.test\.ts: faalt op de basis op laden, niet op een assertie \(basis laadfout, head groen\)/,
    );
    expect(fout).toContain('op de basis staat');
  });

  test('de hint noemt dat een nieuwe helper in het testbestand zelf hoort', () => {
    const fout = runOordeel(
      { pad: 'test/a.test.ts', soort: 'unit' },
      { basis: LAADFOUT, head: { status: 'groen', assertieFouten: 0, laadFout: false } },
    );
    expect(fout).toContain('testbestand zelf');
  });
});
