import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';
import { defineRoute } from '../../src/api/kit.ts';
import { defineContract } from '../../src/shared/contracts/kit.ts';
import type { AppRoute, RouteSample } from './fixtures.ts';

// sampleFor leidt geldige voorbeeldinput af uit het zod-schema (spec security-suite, "uuid" inbegrepen). Unittest zonder
// database: fixtures.ts en harness.ts lezen APP_ORIGIN bij het laden, dus eerst stubben en dan dynamisch importeren.
let fixtures: typeof import('./fixtures.ts');
beforeAll(async () => {
  vi.stubEnv('APP_ORIGIN', 'http://localhost:5173');
  fixtures = await import('./fixtures.ts');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const uitkomst = z.null();

// sampleFor gebruikt alleen route.contract; de handler is hier irrelevant.
function routeMet(method: 'GET' | 'PATCH', path: `/${string}`, input: z.ZodObject): AppRoute {
  const route = defineRoute(
    defineContract({ method, path, input, output: uitkomst, permission: 'app.use' }),
    () => null,
  );
  return unsafeCast<AppRoute>(
    route,
    'sampleFor leest alleen route.contract; een testroute hoeft niet in het register te staan',
  );
}

// Een gooiende sampleFor wordt een gefaalde assertie (not.toThrow), geen losse uitzondering in de testbody.
function sampleVan(route: AppRoute): RouteSample {
  let sample: RouteSample | undefined;
  expect(() => {
    sample = fixtures.sampleFor(route);
  }).not.toThrow();
  return sample ?? { params: {}, invoer: {} };
}

const uuidRoute = (): AppRoute =>
  routeMet('PATCH', '/voorbeelden/:id', z.object({ id: z.uuid(), eigenaarId: z.uuid() }).strict());

test('sampleFor gooit niet op een route met een verplicht z.uuid()-veld', () => {
  expect(() => fixtures.sampleFor(uuidRoute())).not.toThrow();
});

test('sampleFor levert een geldige uuid voor de padparameter :id', () => {
  const sample = sampleVan(uuidRoute());
  expect(z.safeParse(z.uuid(), sample.params['id']).success).toBe(true);
});

test('sampleFor levert een geldige uuid voor een uuid-bodyveld, niet in params', () => {
  const sample = sampleVan(uuidRoute());
  expect(z.safeParse(z.uuid(), sample.invoer['eigenaarId']).success).toBe(true);
  expect('eigenaarId' in sample.params).toBe(false);
  expect('id' in sample.invoer).toBe(false);
});

test('sampleFor levert een uuid voor een verplicht uuid-queryveld op een GET zonder body', () => {
  const route = routeMet('GET', '/voorbeelden', z.object({ eigenaarId: z.uuid() }).strict());
  const sample = sampleVan(route);
  expect(z.safeParse(z.uuid(), sample.invoer['eigenaarId']).success).toBe(true);
});

test('een optioneel uuid-veld blijft weg uit het voorbeeld', () => {
  const route = routeMet(
    'PATCH',
    '/voorbeelden/:id',
    z.object({ id: z.uuid(), ouderId: z.uuid().optional() }).strict(),
  );
  const sample = sampleVan(route);
  expect(z.safeParse(z.uuid(), sample.params['id']).success).toBe(true);
  expect('ouderId' in sample.invoer).toBe(false);
});

test.each([
  ['url', z.url()],
  ['ipv4', z.ipv4()],
])('een onbekend stringformaat (%s) gooit nog steeds met de sample-boodschap', (format, schema) => {
  const route = routeMet('GET', '/voorbeelden', z.object({ bron: schema }).strict());
  expect(() => fixtures.sampleFor(route)).toThrow(
    `voeg sample toe aan test/security/resources.ts (stringformaat '${format}')`,
  );
});
