import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { defineRoles, type Roles } from '../../src/core/shared/roles.ts';
import { roles } from '../../src/shared/roles.ts';
import type { AppRoute, Uitkomst } from './fixtures.ts';

// suitecontract/AC-13 t/m AC-16 (docs/template/specs/suite-volgt-contract.md, ontwerp 7, leerpunt #719): de actorsoorten van de
// generieke securitysuite komen uit het rollenregister; de permissie-oracle en `MFA_ROLLEN` blijven met de hand. Alles hier is
// puur (geen database): een nep-bron met `defineRoles({ planner: { beheer: false }, eigenaar: { beheer: true } })`, een nep-oracle
// en nep-routes bewijst dat een extra rol de suite niet raakt; het echte register blijft `user` en `admin`.
//
// Verwachte interface in test/security/fixtures.ts (door de developer te bouwen; hier dynamisch gelezen, zodat dit bestand
// compileert voordat ze bestaan en dan op een assertie faalt):
//   type Bron = { register: Roles; oracle: Readonly<Record<string, readonly string[]>>; mfaRollen: readonly string[] }
//   MFA_ROLLEN: readonly Role[]                           // ['admin'] in de template
//   actorSoorten(bron?): { soort: string; rol: string | null; mfa: boolean }[]
//   verwachteUitkomst(soort: string, permissie: string, bron?): Uitkomst
//   beheerrollenMet(permissie: string, bron?): string[]
//   ac4Gevallen(routes, bron?): { soort: string; route: R }[]      (ook een tuple [soort, route] is goed)
//   ac5Gevallen(routes, bron?): { soort: string; route: R }[]
//   appUseVerschil(bron?): string[]    beheerVerschil(bron?): string[]
// Unittest: fixtures.ts leest APP_ORIGIN bij het laden (via harness.ts), dus eerst stubben en dan dynamisch importeren.

interface Bron {
  readonly register: Roles;
  readonly oracle: Readonly<Record<string, readonly string[]>>;
  readonly mfaRollen: readonly string[];
}
interface Soort {
  readonly soort: string;
  readonly rol: string | null;
  readonly mfa: boolean;
}
interface NepRoute {
  readonly contract: { readonly method: string; readonly path: string; readonly permission: string };
}
type Gevallen = (routes: readonly NepRoute[], bron?: Bron) => unknown[];

let uitvoer: Record<string, unknown> = {};
let echteRoutes: AppRoute[] = [];

const appModule = z.object({ routes: z.array(z.custom<AppRoute>((waarde) => typeof waarde === 'object')) });

beforeAll(async () => {
  vi.stubEnv('APP_ORIGIN', 'http://localhost:5173');
  uitvoer = Object.fromEntries(Object.entries(await import('./fixtures.ts')));
  echteRoutes = appModule.parse(await import('../../src/api/app.ts')).routes;
});
afterAll(() => {
  vi.unstubAllEnvs();
});

// Een ontbrekende export is een gefaalde assertie, geen importfout.
const isFunctie = (waarde: unknown): boolean => typeof waarde === 'function';
type SoortenFn = (bron?: Bron) => Soort[];
type UitkomstFn = (soort: string, permissie: string, bron?: Bron) => Uitkomst;
type BeheerrollenFn = (permissie: string, bron?: Bron) => string[];
type VerschilFn = (bron?: Bron) => string[];
const soortenSchema = z.custom<SoortenFn>(isFunctie);
const uitkomstSchema = z.custom<UitkomstFn>(isFunctie);
const beheerrollenSchema = z.custom<BeheerrollenFn>(isFunctie);
const verschilSchema = z.custom<VerschilFn>(isFunctie);
const gevallenSchema = z.custom<Gevallen>(isFunctie);

function nodig<S extends z.ZodType>(naam: string, schema: S): z.output<S> {
  const gelezen = schema.safeParse(uitvoer[naam]);
  expect(gelezen.success, `test/security/fixtures.ts exporteert ${naam}`).toBe(true);
  if (!gelezen.success) throw new Error(`test/security/fixtures.ts exporteert ${naam} niet`);
  return gelezen.data;
}

const soortenVan = (bron?: Bron): Soort[] => {
  const functie = nodig('actorSoorten', soortenSchema);
  return bron === undefined ? functie() : functie(bron);
};
const uitkomst = (soort: string, permissie: string, bron?: Bron): Uitkomst => {
  const functie = nodig('verwachteUitkomst', uitkomstSchema);
  return bron === undefined ? functie(soort, permissie) : functie(soort, permissie, bron);
};
const beheerrollenMet = (permissie: string, bron?: Bron): string[] => {
  const functie = nodig('beheerrollenMet', beheerrollenSchema);
  return bron === undefined ? functie(permissie) : functie(permissie, bron);
};
const appUseVerschil = (bron?: Bron): string[] => {
  const functie = nodig('appUseVerschil', verschilSchema);
  return bron === undefined ? functie() : functie(bron);
};
const beheerVerschil = (bron?: Bron): string[] => {
  const functie = nodig('beheerVerschil', verschilSchema);
  return bron === undefined ? functie() : functie(bron);
};
const gevallen = (naam: 'ac4Gevallen' | 'ac5Gevallen', routes: readonly NepRoute[], bron?: Bron): Paar[] => {
  const functie = nodig(naam, gevallenSchema);
  return (bron === undefined ? functie(routes) : functie(routes, bron)).map((geval) => paarSchema.parse(geval));
};

// Een geval is `{ soort, route }` (of een tuple `[soort, route]`); de route is dezelfde als die erin ging.
const paarSchema = z.union([
  z.object({ soort: z.string(), route: z.unknown() }),
  z.tuple([z.string(), z.unknown()]).transform(([soort, route]) => ({ soort, route })),
]);
type Paar = z.infer<typeof paarSchema>;

const label = (route: NepRoute): string => `${route.contract.method} ${route.contract.path}`;

// De bron van de template: het echte register, de oracle en MFA_ROLLEN uit fixtures.ts. Een ontbrekende MFA_ROLLEN is een
// gefaalde assertie, geen ZodError.
function echteBron(): Bron {
  const mfaRollen = z.array(z.string()).safeParse(uitvoer.MFA_ROLLEN);
  expect(mfaRollen.success, 'test/security/fixtures.ts exporteert MFA_ROLLEN').toBe(true);
  return {
    register: roles,
    oracle: z.record(z.string(), z.array(z.string())).parse(uitvoer.PERMISSIE_ORACLE),
    mfaRollen: mfaRollen.data ?? [],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// De nep-bron van de spec: register met planner (geen beheer) en eigenaar (beheer), MFA voor admin en eigenaar.
// ---------------------------------------------------------------------------------------------------------------------
const NEP_REGISTER = defineRoles({ planner: { beheer: false }, eigenaar: { beheer: true } });
const NEP_ORACLE: Readonly<Record<string, readonly string[]>> = {
  'app.use': ['user', 'admin', 'planner', 'eigenaar'],
  'plan:read': ['planner'],
  'eigen:beheer': ['eigenaar'],
};
const nepBron = (extra: Partial<Bron> = {}): Bron => ({
  register: NEP_REGISTER,
  oracle: NEP_ORACLE,
  mfaRollen: ['admin', 'eigenaar'],
  ...extra,
});

const GEEN_SESSIE: Soort = { soort: 'geenSessie', rol: null, mfa: false };
const ZONDER_ROL: Soort = { soort: 'zonderRol', rol: null, mfa: false };

const NEP_SOORTEN: Soort[] = [
  GEEN_SESSIE,
  ZONDER_ROL,
  { soort: 'user', rol: 'user', mfa: false },
  { soort: 'adminMfa', rol: 'admin', mfa: true },
  { soort: 'adminZonderMfa', rol: 'admin', mfa: false },
  { soort: 'planner', rol: 'planner', mfa: false },
  { soort: 'eigenaarMfa', rol: 'eigenaar', mfa: true },
  { soort: 'eigenaarZonderMfa', rol: 'eigenaar', mfa: false },
];

const ECHTE_SOORTEN: Soort[] = [
  GEEN_SESSIE,
  ZONDER_ROL,
  { soort: 'user', rol: 'user', mfa: false },
  { soort: 'adminMfa', rol: 'admin', mfa: true },
  { soort: 'adminZonderMfa', rol: 'admin', mfa: false },
];

const FORBIDDEN: Uitkomst = { toegestaan: false, status: 403, code: 'FORBIDDEN' };
const MFA_REQUIRED: Uitkomst = { toegestaan: false, status: 403, code: 'MFA_REQUIRED' };
const ONGEAUTHENTICEERD: Uitkomst = { toegestaan: false, status: 401, code: 'UNAUTHENTICATED' };
const TOEGESTAAN: Uitkomst = { toegestaan: true };

// ---------------------------------------------------------------------------------------------------------------------
// AC-13: actorSoorten
// ---------------------------------------------------------------------------------------------------------------------
describe('suitecontract/AC-13: actorSoorten leest de soorten uit het rollenregister', () => {
  test('suitecontract/AC-13: het nep-register met mfaRollen [admin, eigenaar] geeft precies deze soorten, in deze volgorde', () => {
    expect(soortenVan(nepBron())).toStrictEqual(NEP_SOORTEN);
  });

  test('suitecontract/AC-13: de bron van de template (roles, MFA_ROLLEN) geeft precies geenSessie, zonderRol, user, adminMfa, adminZonderMfa', () => {
    expect(soortenVan()).toStrictEqual(ECHTE_SOORTEN);
    expect(soortenVan(echteBron())).toStrictEqual(ECHTE_SOORTEN);
  });

  test('suitecontract/AC-13: MFA_ROLLEN noemt in de template alleen admin (met de hand, niet uit het register)', () => {
    expect(echteBron().mfaRollen).toStrictEqual(['admin']);
  });

  test('suitecontract/AC-13: de MFA-eis volgt mfaRollen, niet de beheervlag: een beheerrol buiten mfaRollen is één gewone soort', () => {
    const soorten = soortenVan(nepBron({ mfaRollen: ['admin'] }));

    expect(soorten.filter((soort) => soort.rol === 'eigenaar')).toStrictEqual([
      { soort: 'eigenaar', rol: 'eigenaar', mfa: false },
    ]);
    expect(soorten.map((soort) => soort.soort)).not.toContain('eigenaarMfa');
  });

  test('suitecontract/AC-13: een rol zonder beheervlag in mfaRollen krijgt toch <rol>Mfa en <rol>ZonderMfa', () => {
    const soorten = soortenVan(nepBron({ mfaRollen: ['admin', 'planner'] }));

    expect(soorten.filter((soort) => soort.rol === 'planner')).toStrictEqual([
      { soort: 'plannerMfa', rol: 'planner', mfa: true },
      { soort: 'plannerZonderMfa', rol: 'planner', mfa: false },
    ]);
  });

  test('suitecontract/AC-13: zonder mfaRollen heeft elke rol één soort met de rolnaam; geenSessie en zonderRol blijven vooraan', () => {
    expect(soortenVan(nepBron({ mfaRollen: [] })).map((soort) => soort.soort)).toStrictEqual([
      'geenSessie',
      'zonderRol',
      'user',
      'admin',
      'planner',
      'eigenaar',
    ]);
  });

  test('suitecontract/AC-13: de volgorde volgt register.names, niet de volgorde van mfaRollen; soortnamen zijn uniek', () => {
    const soorten = soortenVan(nepBron({ mfaRollen: ['eigenaar', 'admin'] })).map((soort) => soort.soort);

    expect(soorten).toStrictEqual(NEP_SOORTEN.map((soort) => soort.soort));
    expect(new Set(soorten).size).toBe(soorten.length);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// AC-14: verwachteUitkomst
// ---------------------------------------------------------------------------------------------------------------------
describe('suitecontract/AC-14: verwachteUitkomst volgt can() met de bron', () => {
  const bron = nepBron();

  test.each([
    { soort: 'planner', permissie: 'plan:read', verwacht: TOEGESTAAN },
    { soort: 'user', permissie: 'plan:read', verwacht: FORBIDDEN },
    { soort: 'eigenaarZonderMfa', permissie: 'eigen:beheer', verwacht: MFA_REQUIRED },
    { soort: 'eigenaarZonderMfa', permissie: 'plan:read', verwacht: FORBIDDEN },
    { soort: 'eigenaarMfa', permissie: 'eigen:beheer', verwacht: TOEGESTAAN },
    { soort: 'planner', permissie: 'app.use', verwacht: TOEGESTAAN },
    { soort: 'adminZonderMfa', permissie: 'app.use', verwacht: MFA_REQUIRED },
    { soort: 'planner', permissie: 'eigen:beheer', verwacht: FORBIDDEN },
    { soort: 'zonderRol', permissie: 'plan:read', verwacht: FORBIDDEN },
    { soort: 'geenSessie', permissie: 'plan:read', verwacht: ONGEAUTHENTICEERD },
  ])('suitecontract/AC-14: $soort op $permissie geeft $verwacht', ({ soort, permissie, verwacht }) => {
    expect(uitkomst(soort, permissie, bron)).toStrictEqual(verwacht);
  });

  test('suitecontract/AC-14: een soort buiten actorSoorten gooit met de melding uit ontwerp 7', () => {
    const functie = nodig('verwachteUitkomst', uitkomstSchema);

    expect(() => functie('baasMfa', 'plan:read', bron)).toThrow(
      "onbekende actorsoort 'baasMfa' (niet in actorSoorten van het rollenregister)",
    );
  });

  test('suitecontract/AC-14: een soort van een rol die buiten mfaRollen valt (plannerMfa) gooit ook', () => {
    const functie = nodig('verwachteUitkomst', uitkomstSchema);

    expect(() => functie('plannerMfa', 'plan:read', bron)).toThrow("onbekende actorsoort 'plannerMfa'");
  });

  test('suitecontract/AC-14: een permissie buiten de oracle gooit met de bestaande melding', () => {
    const functie = nodig('verwachteUitkomst', uitkomstSchema);

    expect(() => functie('user', 'bestaat:niet', bron)).toThrow(
      "permissie 'bestaat:niet' staat niet in PERMISSIE_ORACLE (test/security/fixtures.ts)",
    );
  });

  test('suitecontract/AC-14: de MFA-eis komt uit mfaRollen: eigenaar zonder mfaRollen-regel is op eigen:beheer gewoon toegestaan', () => {
    const zonderEigenaar = nepBron({ mfaRollen: ['admin'] });

    expect(uitkomst('eigenaar', 'eigen:beheer', zonderEigenaar)).toStrictEqual(TOEGESTAAN);
  });
});

describe('suitecontract/AC-14: verwachteUitkomst met de echte bron gelijk aan een tabel met de hand', () => {
  // `user` mag alleen deze drie permissies; verder is elke permissie voor admin (met MFA) en weigert ze `user`.
  const USER_MAG = ['app.use', 'me:read', 'me:update'];

  function handTabel(soort: string, permissie: string): Uitkomst {
    if (soort === 'geenSessie') return ONGEAUTHENTICEERD;
    if (soort === 'zonderRol') return FORBIDDEN;
    if (soort === 'user') return USER_MAG.includes(permissie) ? TOEGESTAAN : FORBIDDEN;
    if (soort === 'adminMfa') return TOEGESTAAN;
    if (soort === 'adminZonderMfa') return MFA_REQUIRED;
    throw new Error(`onverwachte soort '${soort}'`);
  }

  test('suitecontract/AC-14: de oracle van de template noemt de permissies waar de tabel op rekent', () => {
    const permissies = Object.keys(echteBron().oracle);

    expect(permissies).toEqual(expect.arrayContaining(USER_MAG));
    expect(permissies.length).toBeGreaterThan(USER_MAG.length);
  });

  test('suitecontract/AC-14: voor elke permissie en elk van de vijf soorten is de uitkomst gelijk aan de tabel (standaardbron en expliciete bron)', () => {
    const permissies = Object.keys(echteBron().oracle);
    const verschillen = ECHTE_SOORTEN.flatMap(({ soort }) =>
      permissies.flatMap((permissie) => {
        const verwacht = handTabel(soort, permissie);
        const standaard = uitkomst(soort, permissie);
        const expliciet = uitkomst(soort, permissie, echteBron());
        return [standaard, expliciet].every((gekregen) => JSON.stringify(gekregen) === JSON.stringify(verwacht))
          ? []
          : [
              `${soort} op ${permissie}: verwacht ${JSON.stringify(verwacht)}, kreeg ${JSON.stringify([standaard, expliciet])}`,
            ];
      }),
    );

    expect(permissies.length).toBeGreaterThan(0);
    expect(verschillen).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// AC-15: beheerrollenMet, ac4Gevallen en ac5Gevallen
// ---------------------------------------------------------------------------------------------------------------------
describe('suitecontract/AC-15: beheerrollenMet', () => {
  test('suitecontract/AC-15: plan:read heeft geen beheerrol, app.use heeft admin en eigenaar', () => {
    const bron = nepBron();

    expect(beheerrollenMet('plan:read', bron)).toStrictEqual([]);
    expect(beheerrollenMet('app.use', bron)).toStrictEqual(['admin', 'eigenaar']);
    expect(beheerrollenMet('eigen:beheer', bron)).toStrictEqual(['eigenaar']);
  });

  test('suitecontract/AC-15: de volgorde is die van register.names, niet van de oracle of mfaRollen', () => {
    const bron = nepBron({
      oracle: { ...NEP_ORACLE, 'app.use': ['eigenaar', 'planner', 'admin', 'user'] },
      mfaRollen: ['eigenaar', 'admin'],
    });

    expect(beheerrollenMet('app.use', bron)).toStrictEqual(['admin', 'eigenaar']);
  });

  test('suitecontract/AC-15: een rol in de oracle maar niet in mfaRollen telt niet; een beheerrol zonder oracle-regel ook niet', () => {
    const bron = nepBron({ mfaRollen: ['admin'] });

    expect(beheerrollenMet('app.use', bron)).toStrictEqual(['admin']);
    expect(beheerrollenMet('eigen:beheer', bron)).toStrictEqual([]);
  });

  test('suitecontract/AC-15: met de echte bron heeft app.use precies admin als beheerrol', () => {
    expect(beheerrollenMet('app.use')).toStrictEqual(['admin']);
    expect(beheerrollenMet('app.use', echteBron())).toStrictEqual(['admin']);
  });
});

const nepRoutes = {
  gebruik: { contract: { method: 'POST', path: '/gebruik', permission: 'app.use' } },
  plan: { contract: { method: 'GET', path: '/plan', permission: 'plan:read' } },
  eigenLezen: { contract: { method: 'GET', path: '/eigen', permission: 'eigen:beheer' } },
  eigenSchrijven: { contract: { method: 'POST', path: '/eigen', permission: 'eigen:beheer' } },
} as const satisfies Record<string, NepRoute>;
const NEP_ROUTES: NepRoute[] = Object.values(nepRoutes);

const sleutel = (soort: string, route: NepRoute): string => `${soort} ${label(route)}`;
const sleutels = (lijst: readonly Paar[]): string[] =>
  lijst.map(({ soort, route }) => {
    const gevonden = NEP_ROUTES.find((kandidaat) => kandidaat === route);
    expect(gevonden, `het geval '${soort}' geeft de route terug die erin ging`).toBeDefined();
    return gevonden === undefined ? soort : sleutel(soort, gevonden);
  });

describe('suitecontract/AC-15: ac4Gevallen en ac5Gevallen met nep-routes', () => {
  test('suitecontract/AC-15: ac4Gevallen bevat precies de paren die FORBIDDEN moeten geven, als gesorteerde verzameling', () => {
    const verwacht = [
      ...['zonderRol'].map((soort) => sleutel(soort, nepRoutes.gebruik)),
      ...['zonderRol', 'user', 'adminMfa', 'adminZonderMfa', 'eigenaarMfa', 'eigenaarZonderMfa'].map((soort) =>
        sleutel(soort, nepRoutes.plan),
      ),
      ...['zonderRol', 'user', 'adminMfa', 'adminZonderMfa', 'planner'].flatMap((soort) => [
        sleutel(soort, nepRoutes.eigenLezen),
        sleutel(soort, nepRoutes.eigenSchrijven),
      ]),
    ].sort();

    expect(sleutels(gevallen('ac4Gevallen', NEP_ROUTES, nepBron())).sort()).toStrictEqual(verwacht);
  });

  test('suitecontract/AC-15: elk paar van ac4Gevallen geeft volgens verwachteUitkomst 403 FORBIDDEN, en geenSessie komt er niet in', () => {
    const bron = nepBron();
    const lijst = gevallen('ac4Gevallen', NEP_ROUTES, bron);

    expect(lijst.length).toBeGreaterThan(0);
    for (const { soort, route } of lijst) {
      const nep = NEP_ROUTES.find((kandidaat) => kandidaat === route);
      expect(nep, soort).toBeDefined();
      expect(uitkomst(soort, nep?.contract.permission ?? '', bron), soort).toStrictEqual(FORBIDDEN);
      expect(soort).not.toBe('geenSessie');
    }
  });

  test('suitecontract/AC-15: ac5Gevallen bevat precies de MFA_REQUIRED-paren en de MFA-doorgang van de GET-route, als gesorteerde verzameling', () => {
    const verwacht = [
      sleutel('adminZonderMfa', nepRoutes.gebruik),
      sleutel('eigenaarZonderMfa', nepRoutes.gebruik),
      sleutel('eigenaarZonderMfa', nepRoutes.eigenLezen),
      sleutel('eigenaarZonderMfa', nepRoutes.eigenSchrijven),
      sleutel('eigenaarMfa', nepRoutes.eigenLezen),
    ].sort();

    expect(sleutels(gevallen('ac5Gevallen', NEP_ROUTES, nepBron())).sort()).toStrictEqual(verwacht);
  });

  test('suitecontract/AC-15: elk ZonderMfa-paar van ac5Gevallen geeft 403 MFA_REQUIRED en elk Mfa-paar is toegestaan (en dus een GET)', () => {
    const bron = nepBron();
    const lijst = gevallen('ac5Gevallen', NEP_ROUTES, bron);

    expect(lijst.length).toBeGreaterThan(0);
    for (const { soort, route } of lijst) {
      const nep = NEP_ROUTES.find((kandidaat) => kandidaat === route);
      expect(nep, soort).toBeDefined();
      const permissie = nep?.contract.permission ?? '';
      if (soort.endsWith('ZonderMfa')) expect(uitkomst(soort, permissie, bron), soort).toStrictEqual(MFA_REQUIRED);
      else {
        expect(uitkomst(soort, permissie, bron), soort).toStrictEqual(TOEGESTAAN);
        expect(nep?.contract.method, `${soort} alleen op een GET (geen bijwerking)`).toBe('GET');
      }
    }
  });

  test('suitecontract/AC-15: zonder beheerrol in mfaRollen heeft ac5Gevallen niets en ac4Gevallen geen MFA-uitzondering', () => {
    const bron = nepBron({ mfaRollen: [] });

    expect(gevallen('ac5Gevallen', NEP_ROUTES, bron)).toStrictEqual([]);
    expect(sleutels(gevallen('ac4Gevallen', NEP_ROUTES, bron))).toContain(sleutel('admin', nepRoutes.plan));
    expect(sleutels(gevallen('ac4Gevallen', NEP_ROUTES, bron))).not.toContain(
      sleutel('eigenaar', nepRoutes.eigenLezen),
    );
  });

  test('suitecontract/AC-15: een lege routelijst geeft geen gevallen', () => {
    expect(gevallen('ac4Gevallen', [], nepBron())).toStrictEqual([]);
    expect(gevallen('ac5Gevallen', [], nepBron())).toStrictEqual([]);
  });
});

describe('suitecontract/AC-15: ac4Gevallen en ac5Gevallen met de echte bron en routes uit src/api/app.ts (gelijk aan 1113a2a5)', () => {
  const routeLabel = (route: NepRoute): string => label(route);
  const oracleRollen = (route: NepRoute): readonly string[] => {
    const rollen = echteBron().oracle[route.contract.permission];
    if (rollen === undefined) throw new Error(`permissie '${route.contract.permission}' staat niet in de oracle`);
    return rollen;
  };

  // Wat routes.int.test.ts op 1113a2a5 draaide: AC-4 voor user (oracle noemt user niet) en zonderRol (elke route);
  // AC-5 voor adminZonderMfa (oracle noemt admin) en adminMfa op de GET-routes daarvan.
  function oud() {
    const ac4 = echteRoutes.flatMap((route) => [
      ...(oracleRollen(route).includes('user') ? [] : [`user ${routeLabel(route)}`]),
      `zonderRol ${routeLabel(route)}`,
    ]);
    const adminRoutes = echteRoutes.filter((route) => oracleRollen(route).includes('admin'));
    const ac5 = adminRoutes.flatMap((route) => [
      `adminZonderMfa ${routeLabel(route)}`,
      ...(route.contract.method === 'GET' ? [`adminMfa ${routeLabel(route)}`] : []),
    ]);
    return { ac4: ac4.sort(), ac5: ac5.sort() };
  }

  const alsSleutels = (lijst: readonly Paar[]): string[] =>
    lijst.map(({ soort, route }) => {
      const gevonden = echteRoutes.find((kandidaat) => kandidaat === route);
      expect(gevonden, `het geval '${soort}' geeft de route terug die erin ging`).toBeDefined();
      return gevonden === undefined ? soort : `${soort} ${routeLabel(gevonden)}`;
    });

  test('suitecontract/AC-15: ac4Gevallen is voor de echte bron gelijk aan (user, routes zonder user in de oracle) en (zonderRol, elke route)', () => {
    expect(echteRoutes.length).toBeGreaterThan(0);
    expect(alsSleutels(gevallen('ac4Gevallen', echteRoutes)).sort()).toStrictEqual(oud().ac4);
    expect(alsSleutels(gevallen('ac4Gevallen', echteRoutes, echteBron())).sort()).toStrictEqual(oud().ac4);
  });

  test('suitecontract/AC-15: ac5Gevallen is voor de echte bron gelijk aan adminZonderMfa op elke admin-route en adminMfa op de GET-routes daarvan', () => {
    expect(oud().ac5.length).toBeGreaterThan(0);
    expect(alsSleutels(gevallen('ac5Gevallen', echteRoutes)).sort()).toStrictEqual(oud().ac5);
    expect(alsSleutels(gevallen('ac5Gevallen', echteRoutes, echteBron())).sort()).toStrictEqual(oud().ac5);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// AC-16: appUseVerschil, beheerVerschil en de vorm van routes.int.test.ts
// ---------------------------------------------------------------------------------------------------------------------
describe('suitecontract/AC-16: appUseVerschil', () => {
  test('suitecontract/AC-16: een oracle waarin app.use planner mist geeft [planner]', () => {
    const oracle = { ...NEP_ORACLE, 'app.use': ['user', 'admin', 'eigenaar'] };

    expect(appUseVerschil(nepBron({ oracle }))).toStrictEqual(['planner']);
  });

  test('suitecontract/AC-16: met planner en eigenaar in app.use is het verschil leeg', () => {
    expect(appUseVerschil(nepBron())).toStrictEqual([]);
  });

  test('suitecontract/AC-16: meerdere ontbrekende rollen komen in de volgorde van register.names', () => {
    const oracle = { ...NEP_ORACLE, 'app.use': ['eigenaar', 'user'] };

    expect(appUseVerschil(nepBron({ oracle }))).toStrictEqual(['admin', 'planner']);
  });

  test('suitecontract/AC-16: met de echte bron is het verschil leeg', () => {
    expect(appUseVerschil()).toStrictEqual([]);
    expect(appUseVerschil(echteBron())).toStrictEqual([]);
  });
});

describe('suitecontract/AC-16: beheerVerschil', () => {
  test('suitecontract/AC-16: eigenaar is beheer in het register maar niet in mfaRollen: [eigenaar]', () => {
    expect(beheerVerschil(nepBron({ mfaRollen: ['admin'] }))).toStrictEqual(['eigenaar']);
  });

  test('suitecontract/AC-16: planner staat in mfaRollen maar heeft geen beheer: [planner]', () => {
    expect(beheerVerschil(nepBron({ mfaRollen: ['admin', 'eigenaar', 'planner'] }))).toStrictEqual(['planner']);
  });

  test('suitecontract/AC-16: mfaRollen gelijk aan de beheerrollen van het register: []', () => {
    expect(beheerVerschil(nepBron({ mfaRollen: ['admin', 'eigenaar'] }))).toStrictEqual([]);
  });

  test('suitecontract/AC-16: zonder mfaRollen zijn alle beheerrollen een verschil, in de volgorde van register.names', () => {
    expect(beheerVerschil(nepBron({ mfaRollen: [] }))).toStrictEqual(['admin', 'eigenaar']);
  });

  test('suitecontract/AC-16: met de echte bron is het verschil leeg', () => {
    expect(beheerVerschil()).toStrictEqual([]);
    expect(beheerVerschil(echteBron())).toStrictEqual([]);
  });
});

// De vormtoets: routes.int.test.ts draait alleen in de runner (pnpm test:db); hier is de bron te lezen zonder database.
describe('suitecontract/AC-16: routes.int.test.ts itereert over de soorten uit het register', () => {
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

  const aanroepen = (naam: string): number =>
    vind(ts.isCallExpression).filter((aanroep) => aanroep.expression.getText() === naam).length;
  const geimporteerd = (): string[] =>
    vind(ts.isImportSpecifier).map((specifier) => (specifier.propertyName ?? specifier.name).text);
  const stringLijsten = (): string[][] =>
    vind(ts.isArrayLiteralExpression).map((lijst) =>
      lijst.elements.flatMap((element) => (ts.isStringLiteralLike(element) ? [element.text] : [])),
    );
  const isLijst = (lijst: readonly string[], ...namen: string[]): boolean =>
    lijst.length === namen.length && namen.every((naam) => lijst.includes(naam));

  test("suitecontract/AC-16: de bron bevat de lijsten ['admin', 'user'] en ['user', 'zonderRol'] niet meer", () => {
    const lijsten = stringLijsten();

    expect(lijsten.filter((lijst) => isLijst(lijst, 'admin', 'user'))).toStrictEqual([]);
    expect(lijsten.filter((lijst) => isLijst(lijst, 'user', 'zonderRol'))).toStrictEqual([]);
  });

  test('suitecontract/AC-16: AC-4 en AC-5 itereren over ac4Gevallen en ac5Gevallen, uit ./fixtures.ts', () => {
    expect(geimporteerd()).toEqual(expect.arrayContaining(['ac4Gevallen', 'ac5Gevallen']));
    expect(aanroepen('ac4Gevallen')).toBeGreaterThanOrEqual(1);
    expect(aanroepen('ac5Gevallen')).toBeGreaterThanOrEqual(1);
  });

  test('suitecontract/AC-16: de rollentests draaien appUseVerschil en beheerVerschil, met de melding uit ontwerp 7', () => {
    const tekst = bron.getFullText();

    expect(aanroepen('appUseVerschil')).toBeGreaterThanOrEqual(1);
    expect(aanroepen('beheerVerschil')).toBeGreaterThanOrEqual(1);
    expect(tekst).toContain(
      "toe aan PERMISSIE_ORACLE['app.use'] en aan elke permissie die de rol krijgt (test/security/fixtures.ts)",
    );
    expect(tekst).toContain('in MFA_ROLLEN als hij beheer heeft, anders niet (test/security/fixtures.ts)');
  });

  test('suitecontract/AC-16: adminHeeftPermissie is vervangen door beheerrollenMet (AC-1 en AC-7 tellen daarmee)', () => {
    expect(geimporteerd()).not.toContain('adminHeeftPermissie');
    expect(aanroepen('adminHeeftPermissie')).toBe(0);
    expect(geimporteerd()).toContain('beheerrollenMet');
    expect(aanroepen('beheerrollenMet')).toBeGreaterThanOrEqual(1);
  });

  test('suitecontract/AC-16: de rol- en soortlijsten komen niet meer vast in de bron: roles.names wordt niet tegen een vaste lijst gelegd', () => {
    const tekst = bron.getFullText();

    expect(tekst).not.toContain("toStrictEqual(['admin', 'user'])");
    expect(tekst).not.toContain("(['user', 'zonderRol'] as const)");
  });
});
