import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import type { Antwoord } from './fixtures.ts';

// suitecontract/AC-11 (docs/template/specs/suite-volgt-contract.md, ontwerp 5): het oordeel over het antwoord van `adminMfa` op een
// admin-GET is één functie, `mfaDoorgangProbleem(antwoord)` in test/security/fixtures.ts. Een allowlist: goed is alleen 200, of 404
// met code NOT_FOUND; elk ander antwoord geeft een melding met status en code (400 en 429 komen vóór de MFA-controle en bewijzen
// niets). Unittest zonder database: fixtures.ts leest APP_ORIGIN bij het laden, dus eerst stubben en dan dynamisch importeren.
// De functie wordt via een schema gelezen, zodat dit bestand compileert voordat hij bestaat en dan op een assertie faalt.
type Oordeel = (antwoord: Antwoord) => string | undefined;
const fixturesModule = z.object({ mfaDoorgangProbleem: z.custom<Oordeel>((waarde) => typeof waarde === 'function') });
let functie: Oordeel | undefined;
beforeAll(async () => {
  vi.stubEnv('APP_ORIGIN', 'http://localhost:5173');
  const gelezen = fixturesModule.safeParse(await import('./fixtures.ts'));
  functie = gelezen.success ? gelezen.data.mfaDoorgangProbleem : undefined;
});
afterAll(() => {
  vi.unstubAllEnvs();
});

// Het oordeel; een ontbrekende export is een gefaalde assertie, geen importfout.
function oordeel(gekregen: Antwoord): string | undefined {
  expect(typeof functie, 'test/security/fixtures.ts exporteert mfaDoorgangProbleem(antwoord)').toBe('function');
  return functie?.(gekregen);
}

function antwoord(status: number, json?: unknown): Antwoord {
  return { status, tekst: json === undefined ? '' : JSON.stringify(json), json, requestId: 'req-1' };
}

const fout = (status: number, code: string): Antwoord => antwoord(status, { code, requestId: 'req-1' });

describe('suitecontract/AC-11: mfaDoorgangProbleem, de goede antwoorden', () => {
  test('suitecontract/AC-11: 200 is goed (geen melding)', () => {
    expect(oordeel(antwoord(200, { items: [], nextCursor: null }))).toBeUndefined();
  });

  test('suitecontract/AC-11: 200 zonder leesbare body is ook goed', () => {
    expect(oordeel(antwoord(200))).toBeUndefined();
  });

  test('suitecontract/AC-11: 404 met code NOT_FOUND is goed (onbekend sample-id; de MFA-controle is gepasseerd)', () => {
    expect(oordeel(fout(404, 'NOT_FOUND'))).toBeUndefined();
  });
});

describe('suitecontract/AC-11: mfaDoorgangProbleem, elk ander antwoord is een melding met status en code', () => {
  test.each([
    { naam: '400 VALIDATION', status: 400, code: 'VALIDATION' },
    { naam: '401 UNAUTHENTICATED', status: 401, code: 'UNAUTHENTICATED' },
    { naam: '403 FORBIDDEN', status: 403, code: 'FORBIDDEN' },
    { naam: '403 MFA_REQUIRED', status: 403, code: 'MFA_REQUIRED' },
    { naam: '429 RATE_LIMITED', status: 429, code: 'RATE_LIMITED' },
    { naam: '500 INTERNAL_ERROR', status: 500, code: 'INTERNAL_ERROR' },
    { naam: '501 NOT_IMPLEMENTED', status: 501, code: 'NOT_IMPLEMENTED' },
    { naam: '404 met een andere code dan NOT_FOUND', status: 404, code: 'FORBIDDEN' },
  ])('suitecontract/AC-11: $naam geeft een melding met "$status" en "$code"', ({ status, code }) => {
    const melding = oordeel(fout(status, code));

    expect(melding).toStrictEqual(expect.any(String));
    expect(melding).toContain(String(status));
    expect(melding).toContain(code);
  });

  test('suitecontract/AC-11: 404 zonder code (kapotte of lege body) is geen NOT_FOUND en geeft een melding met de status', () => {
    expect(oordeel(antwoord(404))).toContain('404');
    expect(oordeel(antwoord(404, {}))).toContain('404');
    expect(oordeel(antwoord(404, { code: 7 }))).toContain('404');
  });

  test.each([201, 204, 302, 502, 503])(
    'suitecontract/AC-11: status %i zonder code geeft een melding met de status (allowlist, geen denylist)',
    (status) => {
      expect(oordeel(antwoord(status))).toContain(String(status));
    },
  );

  test('suitecontract/AC-11: een 5xx met een onbekende code noemt die code', () => {
    expect(oordeel(fout(503, 'IETS_ANDERS'))).toContain('IETS_ANDERS');
  });
});
