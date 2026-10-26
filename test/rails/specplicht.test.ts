import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { beoordeel, leesConfig, risico, samenvatting, specplichtSamenvatting } from '../../scripts/kit/diff-guard.mjs';

// Spec docs/specs/specplicht.md, AC-1 t/m AC-18: `beoordeelSpecplicht(pr)` is pure en geeft { uitslag, redenen, items }.
// De functie bestaat nog niet: de dynamische import met een expect op de export laat elke test op een assertie falen.
const config = leesConfig(readFileSync('.claude/gates.json', 'utf8'));
const HEAD = 'a'.repeat(40);
const EIGENAAR = 'BramLambertJansen';
const SPECREDEN =
  'specplicht: nieuwe migratie, route, permissie of pagina zonder spec (framework §8, ADR 0058); voeg docs/specs/<naam>.md toe aan de PR of zet "Spec: docs/specs/<naam>.md" in de PR-body (status goedgekeurd of gebouwd op main)';
const GEEN_ITEM = 'geen nieuwe migratie, route, permissie of pagina';

type Wijziging = { status: string; pad: string; van?: string };
type Versies = Record<string, { voor: string | null; na: string | null }>;
type Extra = {
  json?: Versies;
  labels?: string[];
  reviews?: { user: string; state: string; commitId: string; submittedAt: string }[];
  auteur?: string;
  body?: unknown;
  specsOpMain?: Record<string, string | null>;
};

function pr(wijzigingen: Wijziging[], extra: Extra = {}) {
  return { wijzigingen, json: {}, labels: [], reviews: [], auteur: 'template-agent[bot]', headSha: HEAD, ...extra };
}

type Specplicht = { uitslag: string; redenen: string[]; items: unknown };

async function specplicht(p: object): Promise<Specplicht> {
  const module: unknown = await import('../../scripts/kit/diff-guard.mjs');
  const functie: unknown = Reflect.get(Object(module), 'beoordeelSpecplicht');
  expect(typeof functie, 'beoordeelSpecplicht is niet geëxporteerd uit scripts/kit/diff-guard.mjs').toBe('function');
  if (typeof functie !== 'function') throw new Error('beoordeelSpecplicht ontbreekt');
  const uitkomst: unknown = Reflect.apply(functie, undefined, [p]);
  expect(typeof uitkomst).toBe('object');
  const uitslag: unknown = Reflect.get(Object(uitkomst), 'uitslag');
  const redenen: unknown = Reflect.get(Object(uitkomst), 'redenen');
  const items: unknown = Reflect.get(Object(uitkomst), 'items');
  expect(Array.isArray(redenen)).toBe(true);
  return { uitslag: String(uitslag), redenen: Array.isArray(redenen) ? redenen.map(String) : [], items };
}

const routeBron = (inhoud: string) => `import { defineRoute } from '#core/api/route.ts';\n${inhoud}\n`;
const letterlijk = (handler = 'h', permission = "'x'", input = 'i') =>
  routeBron(
    `export const a = defineRoute({ method: 'GET', path: '/x', input: ${input}, output: o, permission: ${permission}, handler: ${handler} });`,
  );
const viaContract = routeBron('export const a = defineRoute(xContract, async () => []);');
const ROUTE_PAD = 'src/api/routes/x.ts';
const nieuweRoute = (inhoud = letterlijk()) =>
  pr([{ status: 'A', pad: ROUTE_PAD }], { json: { [ROUTE_PAD]: { voor: null, na: inhoud } } });
const metExtra = (basis: ReturnType<typeof pr>, extra: Extra) => ({ ...basis, ...extra });

const spec = (status: string) => `---\nstatus: ${status}\nnamespace: x\nsjabloon: mini\n---\n\n# X\n`;
const X = 'docs/specs/x.md';

const permissies = (inhoud: string) =>
  `import { definePermissions } from '#core/shared/can.ts';\nexport const permissions = definePermissions({\n${inhoud}\n});\n`;
const BASIS_PERMISSIES = permissies("  'me:read': { roles: ['user', 'admin'] },");

describe('specplicht: specplichtige categorieën (AC-1 t/m AC-5)', () => {
  test('AC-1: een nieuwe migratie zonder spec is rood, met de specreden en het pad in items', async () => {
    const pad = 'db/migrations/20261015120000_x.sql';
    const uitkomst = await specplicht(pr([{ status: 'A', pad }]));

    expect(uitkomst.uitslag).toBe('rood');
    expect(uitkomst.redenen).toContain(SPECREDEN);
    expect(JSON.stringify(uitkomst.items)).toContain(pad);
  });

  test('AC-2: een nieuwe defineRoute met letterlijke method en path zonder spec is rood', async () => {
    const uitkomst = await specplicht(nieuweRoute());

    expect(uitkomst.uitslag).toBe('rood');
    expect(uitkomst.redenen).toContain(SPECREDEN);
    expect(JSON.stringify(uitkomst.items)).toContain('GET /x');
  });

  test('AC-3: een nieuwe defineRoute via een contract (niet letterlijk) zonder spec is rood', async () => {
    const uitkomst = await specplicht(nieuweRoute(viaContract));

    expect(uitkomst.uitslag).toBe('rood');
    expect(uitkomst.redenen).toContain(SPECREDEN);
  });

  test('AC-4: een nieuwe permissiesleutel zonder spec is rood', async () => {
    const na = permissies("  'me:read': { roles: ['user', 'admin'] },\n  'reports:read': { roles: ['admin'] },");
    const p = pr([{ status: 'M', pad: 'src/shared/permissions.ts' }], {
      json: { 'src/shared/permissions.ts': { voor: BASIS_PERMISSIES, na } },
    });
    const uitkomst = await specplicht(p);

    expect(uitkomst.uitslag).toBe('rood');
    expect(JSON.stringify(uitkomst.items)).toContain('reports:read');
  });

  test.each([
    { naam: 'status A', w: { status: 'A', pad: 'src/web/routes/_app/x.tsx' } },
    { naam: 'status C', w: { status: 'C', van: 'src/web/routes/_app/y.tsx', pad: 'src/web/routes/_app/x.tsx' } },
  ])('AC-5: een nieuw paginabestand ($naam) zonder spec is rood', async ({ w }) => {
    const uitkomst = await specplicht(pr([w]));

    expect(uitkomst.uitslag).toBe('rood');
    expect(JSON.stringify(uitkomst.items)).toContain('src/web/routes/_app/x.tsx');
  });

  test("AC-5: de diff-guard-samenvatting noemt het pad onder Pagina's", () => {
    const tekst = samenvatting(beoordeel(pr([{ status: 'A', pad: 'src/web/routes/_app/x.tsx' }]), config));

    expect(tekst).toContain("Pagina's (nieuw bestand onder src/web/routes)");
    expect(tekst).toContain('src/web/routes/_app/x.tsx');
  });
});

describe('specplicht: een spec in de diff (AC-6)', () => {
  test.each([
    { naam: 'toegevoegd (A)', w: { status: 'A', pad: X } },
    { naam: 'gewijzigd (M)', w: { status: 'M', pad: X } },
    { naam: 'hernoemd (R, doelpad)', w: { status: 'R', van: 'docs/specs/oud.md', pad: X } },
    { naam: 'gekopieerd (C)', w: { status: 'C', van: 'docs/specs/oud.md', pad: X } },
  ])('een nieuwe route plus een spec $naam is groen, ongeacht de status', async ({ w }) => {
    const basis = nieuweRoute();
    const uitkomst = await specplicht({ ...basis, wijzigingen: [...basis.wijzigingen, w] });

    expect(uitkomst.uitslag).toBe('groen');
  });

  test.each([
    { naam: 'verwijderd (D)', w: { status: 'D', pad: X } },
    { naam: 'het sjabloon _template.md', w: { status: 'M', pad: 'docs/specs/_template.md' } },
    { naam: 'een submap', w: { status: 'A', pad: 'docs/specs/sub/x.md' } },
    { naam: 'geen markdown', w: { status: 'A', pad: 'docs/specs/x.txt' } },
  ])('een spec-achtige wijziging die niet telt ($naam) laat de uitslag rood', async ({ w }) => {
    const basis = nieuweRoute();
    const uitkomst = await specplicht({ ...basis, wijzigingen: [...basis.wijzigingen, w] });

    expect(uitkomst.uitslag).toBe('rood');
  });
});

describe('specplicht: een spec in de PR-body (AC-7 t/m AC-13)', () => {
  const metBody = (body: unknown, specsOpMain: Record<string, string | null>) =>
    metExtra(nieuweRoute(), { body, specsOpMain });

  test.each([
    { naam: 'gewoon', body: `Uitleg.\n\nSpec: ${X}\n` },
    { naam: 'met backticks', body: `Spec: \`${X}\`` },
    { naam: 'met \\r\\n', body: `Uitleg\r\nSpec: ${X}\r\nMeer\r\n` },
  ])('AC-7: body $naam met status goedgekeurd op main is groen', async ({ body }) => {
    const uitkomst = await specplicht(metBody(body, { [X]: spec('goedgekeurd') }));

    expect(uitkomst.uitslag).toBe('groen');
  });

  test('AC-8: status gebouwd op main is groen', async () => {
    const uitkomst = await specplicht(metBody(`Spec: ${X}`, { [X]: spec('gebouwd') }));

    expect(uitkomst.uitslag).toBe('groen');
  });

  test.each(['voorstel', 'vervallen'])('AC-9: status %s op main is rood met de statusreden', async (status) => {
    const uitkomst = await specplicht(metBody(`Spec: ${X}`, { [X]: spec(status) }));

    expect(uitkomst.uitslag).toBe('rood');
    expect(uitkomst.redenen).toContain(
      `specplicht: ${X} heeft op main status ${status}; alleen goedgekeurd of gebouwd telt`,
    );
  });

  test.each([
    { naam: 'bestaat niet op main (sleutel ontbreekt)', main: {} },
    { naam: 'geen regulier bestand (null)', main: { [X]: null } },
    { naam: 'geen leesbare frontmatter', main: { [X]: '# X\n\nGeen frontmatter.\n' } },
  ])('AC-10: $naam is rood met de bestaatreden', async ({ main }) => {
    const uitkomst = await specplicht(metBody(`Spec: ${X}`, main));

    expect(uitkomst.uitslag).toBe('rood');
    expect(uitkomst.redenen).toContain(`specplicht: ${X} bestaat niet op main of is geen leesbare spec`);
  });

  test('AC-11: één goedgekeurde en één niet-bestaande Spec-regel is rood', async () => {
    const uitkomst = await specplicht(
      metBody(`Spec: ${X}\nSpec: docs/specs/weg.md`, { [X]: spec('goedgekeurd'), 'docs/specs/weg.md': null }),
    );

    expect(uitkomst.uitslag).toBe('rood');
    expect(uitkomst.redenen).toContain('specplicht: docs/specs/weg.md bestaat niet op main of is geen leesbare spec');
  });

  test.each([
    { naam: 'body null', p: metBody(null, { [X]: spec('goedgekeurd') }) },
    { naam: 'geen body-veld', p: metExtra(nieuweRoute(), { specsOpMain: { [X]: spec('goedgekeurd') } }) },
    { naam: 'body is geen string', p: metBody(42, { [X]: spec('goedgekeurd') }) },
  ])('AC-12: $naam is rood met de specreden', async ({ p }) => {
    const uitkomst = await specplicht(p);

    expect(uitkomst.uitslag).toBe('rood');
    expect(uitkomst.redenen).toContain(SPECREDEN);
  });

  test.each([
    { naam: 'het sjabloon', pad: 'docs/specs/_template.md' },
    { naam: 'een pad met ..', pad: 'docs/specs/../x.md' },
    { naam: 'de placeholder uit het PR-sjabloon', pad: 'docs/specs/<naam>.md' },
  ])('AC-13: Spec-regel met $naam telt niet; een nieuwe route blijft rood', async ({ pad }) => {
    const uitkomst = await specplicht(metBody(`Spec: ${pad}`, { [pad]: spec('goedgekeurd') }));

    expect(uitkomst.uitslag).toBe('rood');
    expect(uitkomst.redenen).toContain(SPECREDEN);
  });
});

describe('specplicht: wat vrij is (AC-14 t/m AC-16, AC-18)', () => {
  test('AC-14: een bestaande route met andere handler, permission of schema is groen', async () => {
    const p = pr([{ status: 'M', pad: ROUTE_PAD }], {
      json: { [ROUTE_PAD]: { voor: letterlijk('h', "'x'", 'i'), na: letterlijk('async () => []', "'y'", 'j') } },
    });

    expect((await specplicht(p)).uitslag).toBe('groen');
  });

  test('AC-14: een gewijzigde rolverdeling van een bestaande permissiesleutel is groen', async () => {
    const na = permissies("  'me:read': { roles: ['admin'] },");
    const p = pr([{ status: 'M', pad: 'src/shared/permissions.ts' }], {
      json: { 'src/shared/permissions.ts': { voor: BASIS_PERMISSIES, na } },
    });

    expect((await specplicht(p)).uitslag).toBe('groen');
  });

  test('AC-15: een hernoemd routebestand (R, routes ongewijzigd) is groen', async () => {
    const nieuw = 'src/api/routes/y.ts';
    const p = pr([{ status: 'R', van: ROUTE_PAD, pad: nieuw }], {
      json: { [nieuw]: { voor: letterlijk(), na: letterlijk() } },
    });

    expect((await specplicht(p)).uitslag).toBe('groen');
  });

  test('AC-15: een hernoemd paginabestand (R) is groen', async () => {
    const p = pr([{ status: 'R', van: 'src/web/routes/_app/a.tsx', pad: 'src/web/routes/_app/b.tsx' }]);

    expect((await specplicht(p)).uitslag).toBe('groen');
  });

  test.each([
    { naam: 'gewijzigd routeTree.gen.ts', w: { status: 'M', pad: 'src/web/routeTree.gen.ts' } },
    { naam: 'nieuw routeTree.gen.ts onder routes', w: { status: 'A', pad: 'src/web/routes/routeTree.gen.ts' } },
    { naam: 'nieuwe test', w: { status: 'A', pad: 'src/web/routes/x.test.tsx' } },
    { naam: 'nieuw .gitkeep', w: { status: 'A', pad: 'src/web/routes/.gitkeep' } },
  ])('AC-16: $naam zonder spec is groen', async ({ w }) => {
    expect((await specplicht(pr([w]))).uitslag).toBe('groen');
  });

  test('AC-18: zonder specplichtig item is een Spec-regel naar een niet-bestaande spec groen, en de body wordt niet gelezen', async () => {
    const p = {
      ...pr([{ status: 'M', pad: 'src/web/main.tsx' }]),
      specsOpMain: { 'docs/specs/bestaat-niet.md': null },
      get body(): string {
        throw new Error('de body mag niet gelezen worden zonder specplichtig item');
      },
    };
    const uitkomst = await specplicht(p);

    expect(uitkomst.uitslag).toBe('groen');
    expect(uitkomst.redenen).toContain(GEEN_ITEM);
  });

  test('AC-18: idem met een gewone body', async () => {
    const p = metExtra(pr([{ status: 'M', pad: 'src/web/main.tsx' }]), {
      body: 'Spec: docs/specs/bestaat-niet.md',
      specsOpMain: { 'docs/specs/bestaat-niet.md': null },
    });

    expect((await specplicht(p)).uitslag).toBe('groen');
  });
});

describe('specplicht: los van de gate-regel (AC-17)', () => {
  test('een auteur die goedkeurder is, met label en goedkeuring, krijgt rood; beoordeel blijft ongewijzigd', async () => {
    const review = { user: EIGENAAR, state: 'APPROVED', commitId: HEAD, submittedAt: '2026-10-10T12:01:00Z' };
    const basis = nieuweRoute();
    const p = {
      ...basis,
      wijzigingen: [...basis.wijzigingen, { status: 'M', pad: 'src/core/shared/can.ts' }],
      auteur: EIGENAAR,
      labels: ['gate-wijziging'],
      reviews: [review],
    };
    const uitkomst = await specplicht(p);
    const oordeel = beoordeel(p, config);

    expect(uitkomst.uitslag).toBe('rood');
    // Eerder `Object.keys(uitkomst)` zonder 'overgang': dat kon nooit falen. Zinvol: de specplicht-redenen noemen de gate-regel niet.
    expect(uitkomst.redenen.join('\n')).not.toMatch(/auteur én goedkeurder/);
    expect(oordeel.uitslag).toBe('overgang');
    expect(oordeel.redenen.join('\n')).toMatch(/auteur én goedkeurder/);
  });
});

describe('specplicht: reviewpunten PR 1 (review-1)', () => {
  const PERMISSIES_PAD = 'src/shared/permissions.ts';
  const permissiePr = (na: string) =>
    pr([{ status: 'M', pad: PERMISSIES_PAD }], { json: { [PERMISSIES_PAD]: { voor: BASIS_PERMISSIES, na } } });
  const rood = async (p: object) => {
    const uitkomst = await specplicht(p);
    expect(uitkomst.uitslag).toBe('rood');
    expect(uitkomst.redenen).toContain(SPECREDEN);
    return uitkomst;
  };

  test.each([
    {
      naam: 'waarde via een constante',
      na: `const ADMIN = { roles: ['admin'] };\n${permissies("  'me:read': { roles: ['user', 'admin'] },\n  'reports:read': ADMIN,")}`,
    },
    { naam: 'spread', na: permissies("  'me:read': { roles: ['user', 'admin'] },\n  ...extra,") },
    {
      naam: 'sleutel zonder quotes',
      na: permissies("  'me:read': { roles: ['user', 'admin'] },\n  reportsRead: { roles: ['admin'] },"),
    },
  ])('permissie die niet letterlijk is ($naam) zonder spec is rood, als permissie-item', async ({ na }) => {
    const uitkomst = await rood(permissiePr(na));

    expect(JSON.stringify(uitkomst.items)).toContain('permissie:');
  });

  test('een route via een import-alias (dr) zonder spec is rood', async () => {
    const bron = `import { defineRoute as dr } from '#core/api/route.ts';\nexport const a = dr({ method: 'GET', path: '/x', input: i, output: o, permission: 'x', handler: h });\n`;
    const uitkomst = await rood(nieuweRoute(bron));

    expect(JSON.stringify(uitkomst.items)).toContain('route:');
  });

  test('een route via een toegewezen alias (const r = defineRoute) zonder spec is rood', async () => {
    const bron = `import { defineRoute } from '#core/api/route.ts';\nconst r = defineRoute;\nexport const a = r({ method: 'GET', path: '/x', input: i, output: o, permission: 'x', handler: h });\n`;
    const uitkomst = await rood(nieuweRoute(bron));

    expect(JSON.stringify(uitkomst.items)).toContain('route:');
  });

  test('een nieuw contractbestand onder src/shared/contracts/ zonder spec is rood, als route', async () => {
    const pad = 'src/shared/contracts/nieuw.ts';
    const p = pr([{ status: 'A', pad }], {
      json: {
        [pad]: {
          voor: null,
          na: "import { z } from 'zod';\nexport const nieuwContract = { method: 'GET', path: '/n', output: z.string() };\n",
        },
      },
    });
    const uitkomst = await rood(p);

    expect(JSON.stringify(uitkomst.items)).toContain(pad);
  });

  test('een paginapad met regeleinde, CR en procent kan geen workflow-opdracht (::) in de samenvatting zetten', async () => {
    const pad = 'src/web/routes/a\n::error::x\r::warning::100%.tsx';
    const p = pr([{ status: 'A', pad }]);
    const uitvoer = [specplichtSamenvatting(await specplicht(p)), samenvatting(beoordeel(p, config))].join('\n');
    const regels = uitvoer.split(/\r\n|\r|\n/);

    expect(uitvoer).toContain('pagina:');
    expect(regels.filter((regel) => regel.startsWith('::'))).toEqual([]);
    expect(uitvoer).toContain('a%0A::error::x%0D::warning::100%25.tsx');
  });

  test('een route via een namespace-import (r.defineRoute) zonder spec is rood en staat in risico().routes', async () => {
    const bron = `import * as r from '#core/api/route.ts';\nexport const x = r.defineRoute({ method: 'GET', path: '/x', permission: 'a:b' });\n`;
    const p = nieuweRoute(bron);
    const uitkomst = await rood(p);

    expect(JSON.stringify(uitkomst.items)).toContain('route:');
    expect(risico(p).routes.join('\n')).toContain('GET /x');
  });
});
