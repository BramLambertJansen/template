import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { defineRoute } from '../../src/api/kit.ts';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';
import { defineContract } from '../../src/shared/contracts/kit.ts';
import type { AppRoute, RouteSample } from './fixtures.ts';

// suitecontract/AC-12 (docs/template/specs/suite-volgt-contract.md, ontwerp 5): `sampleVoor(route, samples = routeSamples)` krijgt een
// optionele samples-map; met een regel voor de route geeft hij die regel, anders de afgeleide sample (sampleFor).
// test/security/routes.int.test.ts importeert sampleFor niet meer en haalt elke sample via sampleVoor, zodat een gedeclareerde
// routeSamples-regel ook voor AC-2 t/m AC-7 van spec security-suite geldt (vormtoets onderaan).
//
// Unittest zonder database: fixtures.ts en resources.ts lezen APP_ORIGIN bij het laden (via harness.ts), dus eerst stubben en
// dan dynamisch importeren. De nieuwe tweede parameter wordt via een schema gelezen, zodat dit bestand compileert voordat hij
// bestaat en dan op een assertie faalt.
type Samples = Readonly<Record<string, RouteSample>>;
type SampleVoor = (route: AppRoute, samples?: Samples) => RouteSample;

const isFunctie = (waarde: unknown): boolean => typeof waarde === 'function';
const resourcesModule = z.object({
  sampleVoor: z.custom<SampleVoor>(isFunctie),
  routeSamples: z.custom<Samples>((waarde) => typeof waarde === 'object' && waarde !== null),
});
const fixturesModule = z.object({
  sampleFor: z.custom<(route: AppRoute) => RouteSample>(isFunctie),
  routeLabel: z.custom<(route: AppRoute) => string>(isFunctie),
});
const appModule = z.object({ routes: z.array(z.custom<AppRoute>((waarde) => typeof waarde === 'object')) });

let sampleVoor: SampleVoor | undefined;
let routeSamples: Samples = {};
let sampleFor: ((route: AppRoute) => RouteSample) | undefined;
let routeLabel: ((route: AppRoute) => string) | undefined;
let routes: AppRoute[] = [];

beforeAll(async () => {
  vi.stubEnv('APP_ORIGIN', 'http://localhost:5173');
  const resources = resourcesModule.safeParse(await import('./resources.ts'));
  const fixtures = fixturesModule.safeParse(await import('./fixtures.ts'));
  const app = appModule.safeParse(await import('../../src/api/app.ts'));
  sampleVoor = resources.data?.sampleVoor;
  routeSamples = resources.data?.routeSamples ?? {};
  sampleFor = fixtures.data?.sampleFor;
  routeLabel = fixtures.data?.routeLabel;
  routes = app.data?.routes ?? [];
});
afterAll(() => {
  vi.unstubAllEnvs();
});

function route(label: string): AppRoute {
  const gevonden = routes.find((kandidaat) => routeLabel?.(kandidaat) === label);
  expect(gevonden, `route '${label}' staat in het register`).toBeDefined();
  if (gevonden === undefined) throw new Error(`route '${label}' ontbreekt`);
  return gevonden;
}

const voor = (kandidaat: AppRoute, samples?: Samples): RouteSample => {
  expect(typeof sampleVoor, 'test/security/resources.ts exporteert sampleVoor(route, samples)').toBe('function');
  return sampleVoor?.(kandidaat, ...(samples === undefined ? [] : [samples])) ?? { params: {}, invoer: {} };
};

const afgeleid = (kandidaat: AppRoute): RouteSample => sampleFor?.(kandidaat) ?? { params: {}, invoer: {} };

// Een route met een stringformaat dat sampleFor niet kan afleiden: zonder regel gooit hij.
function onafleidbaar(): AppRoute {
  return unsafeCast<AppRoute>(
    defineRoute(
      defineContract({
        method: 'GET',
        path: '/voorbeelden',
        input: z.object({ bron: z.url() }).strict(),
        output: z.null(),
        permission: 'app.use',
      }),
      () => null,
    ),
    'sampleVoor leest alleen route.contract; een testroute hoeft niet in het register te staan',
  );
}

const LABEL_MET_ID = 'POST /accounts/:id/block';
const LABEL_ZONDER_ID = 'GET /accounts';
const GEDECLAREERD: RouteSample = { params: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, invoer: { reden: 'test' } };

describe('suitecontract/AC-12: sampleVoor met een samples-map', () => {
  test('suitecontract/AC-12: met een regel voor de route geeft hij die regel, niet de afgeleide sample', () => {
    const kandidaat = route(LABEL_MET_ID);

    const sample = voor(kandidaat, { [LABEL_MET_ID]: GEDECLAREERD });

    expect(sample).toStrictEqual(GEDECLAREERD);
    expect(sample).not.toStrictEqual(afgeleid(kandidaat));
  });

  test('suitecontract/AC-12: zonder regel voor de route geeft hij de afgeleide sample (ook als de map een regel voor een andere route heeft)', () => {
    const kandidaat = route(LABEL_MET_ID);

    expect(voor(kandidaat, { [LABEL_ZONDER_ID]: GEDECLAREERD })).toStrictEqual(afgeleid(kandidaat));
    expect(voor(kandidaat, {})).toStrictEqual(afgeleid(kandidaat));
  });

  test('suitecontract/AC-12: een regel voor een route zonder afleidbare sample voorkomt de fout van sampleFor', () => {
    const kandidaat = onafleidbaar();
    const label = 'GET /voorbeelden';

    const regel: RouteSample = { params: {}, invoer: { bron: 'https://voorbeeld.test' } };
    // Een fout van sampleFor is hier een gefaalde assertie (de regel is genegeerd), geen gegooide fout.
    let sample: RouteSample | undefined;
    let fout: unknown;
    try {
      sample = voor(kandidaat, { [label]: regel });
    } catch (error) {
      fout = error;
    }

    expect(fout, 'sampleVoor negeert de regel in de samples-map en leidt de sample af').toBeUndefined();
    expect(sample).toStrictEqual(regel);
  });

  test('suitecontract/AC-12: zonder regel gooit een onafleidbare route nog steeds met de sample-boodschap', () => {
    expect(() => voor(onafleidbaar(), {})).toThrow('voeg sample toe aan test/security/resources.ts');
  });

  test('suitecontract/AC-12: zonder samples-map geldt routeSamples (de standaard): zelfde uitkomst als met routeSamples zelf', () => {
    for (const kandidaat of routes) {
      expect(voor(kandidaat), routeLabel?.(kandidaat)).toStrictEqual(voor(kandidaat, routeSamples));
    }
    expect(routes.length).toBeGreaterThan(0);
  });

  test('suitecontract/AC-12: elke route van het register is afleidbaar of gedeclareerd (zoals security/AC-11)', () => {
    for (const kandidaat of routes) {
      expect(() => voor(kandidaat), routeLabel?.(kandidaat)).not.toThrow();
    }
  });
});

// De vormtoets: routes.int.test.ts draait alleen in de runner (pnpm test:db); hier is de bron te lezen zonder database.
describe('suitecontract/AC-12: routes.int.test.ts haalt elke sample via sampleVoor', () => {
  const pad = path.join(import.meta.dirname, 'routes.int.test.ts');
  const bron = ts.createSourceFile(pad, readFileSync(pad, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  function vind<Node extends ts.Node>(is: (node: ts.Node) => node is Node): Node[] {
    const gevonden: Node[] = [];
    const bezoek = (node: ts.Node) => {
      if (is(node)) gevonden.push(node);
      ts.forEachChild(node, bezoek);
    };
    bezoek(bron);
    return gevonden;
  }

  const aanroepenVan = (naam: string): ts.CallExpression[] =>
    vind(ts.isCallExpression).filter((aanroep) => aanroep.expression.getText() === naam);

  const geimporteerd = (): string[] =>
    vind(ts.isImportSpecifier).map((specifier) => (specifier.propertyName ?? specifier.name).text);

  test('suitecontract/AC-12: sampleFor wordt niet meer geïmporteerd', () => {
    expect(geimporteerd()).not.toContain('sampleFor');
    expect(geimporteerd()).toContain('sampleVoor');
  });

  test('suitecontract/AC-12: sampleVoor komt uit ./resources.ts', () => {
    const uitResources = vind(ts.isImportDeclaration).filter(
      (declaratie) => declaratie.moduleSpecifier.getText() === "'./resources.ts'",
    );

    expect(uitResources.map((declaratie) => declaratie.importClause?.getText() ?? '').join(' ')).toContain(
      'sampleVoor',
    );
  });

  test('suitecontract/AC-12: er is geen enkele aanroep van sampleFor meer; elke sample komt van sampleVoor', () => {
    expect(aanroepenVan('sampleFor')).toHaveLength(0);
    // De zeven plaatsen van nu: AC-2, AC-3, AC-4, AC-5 (zonder en met MFA), de ongeldige gevallen van AC-6 en de te grote body.
    expect(aanroepenVan('sampleVoor').length).toBeGreaterThanOrEqual(7);
  });
});
