import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { expect, test } from 'vitest';

// proza-checks (docs/template/specs/proza-checks.md), R-WEB-01: drie lintregels voor het routeraam van de web-zone. Per
// fixture is de verzameling rail-meldingen precies één van `rails/route-guard`, `rails/router`, `rails/web-globaal` of leeg
// (`rule: null`). Vorm en helper volgen test/rails/eslint-web.test.ts.
// De testnamen krijgen hun voorvoegsel via test.each ('proza-checks/$name'); voor de AC-dekking van check-docs staan de
// ids hier letterlijk: proza-checks/AC-1, proza-checks/AC-2, proza-checks/AC-3, proza-checks/AC-4, proza-checks/AC-5,
// proza-checks/AC-6, proza-checks/AC-7, proza-checks/AC-8, proza-checks/AC-9.
const eslint = new ESLint({ cwd: process.cwd(), overrideConfig: [tseslint.configs.disableTypeChecked] });

async function meldingen(filePath: string, code: string): Promise<{ ruleId: string; message: string }[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .map((message) => ({ ruleId: message.ruleId ?? 'parse-fout', message: message.message }))
    .filter(({ ruleId }) => ruleId.startsWith('rails/') || ruleId === 'parse-fout');
}

async function railsIn(filePath: string, code: string): Promise<string[]> {
  return [...new Set((await meldingen(filePath, code)).map(({ ruleId }) => ruleId))];
}

interface Fixture {
  name: string;
  file: string;
  code: string;
  rule: 'rails/route-guard' | 'rails/router' | 'rails/web-globaal' | null;
}

const ROUTE = 'src/web/routes/_app/x.tsx';
const IMPORTS =
  "import { createFileRoute } from '@tanstack/react-router';\nimport { guard } from '#web/lib/session.ts';\n";
const route = (opties: string) => `${IMPORTS}export const Route = createFileRoute('/_app/x')(${opties});\n`;
const MET_GUARD = "{ beforeLoad: guard('accounts:read'), component: X }";

// De routes zelf, zoals ze nu zijn (AC-13: elk bestand onder src/web/routes voldoet).
const REPO = path.resolve(import.meta.dirname, '../..');
const lees = (bestand: string) => readFileSync(path.join(REPO, bestand), 'utf8');

// Inhoud van src/web/routes/uitnodiging.tsx: een publieke route zonder guard.
const UITNODIGING = [
  "import { createFileRoute } from '@tanstack/react-router';",
  "import { z } from 'zod';",
  "import { InvitationPage } from '#web/features/invitation/invitation-page.tsx';",
  '',
  "export const Route = createFileRoute('/uitnodiging')({",
  '  validateSearch: z.object({ token: z.string().optional().catch(undefined) }),',
  '  component: InvitationRoute,',
  '});',
  '',
].join('\n');

const LOGIN = [
  "import { createFileRoute } from '@tanstack/react-router';",
  '',
  "export const Route = createFileRoute('/login')({",
  '  beforeLoad: async ({ context }) => {',
  '    await context.queryClient.fetchQuery({});',
  '  },',
  '  component: LoginRoute,',
  '});',
  '',
].join('\n');

const AC1: Fixture[] = [
  {
    name: 'AC-1 zonder beforeLoad',
    file: ROUTE,
    code: `import { createFileRoute } from '@tanstack/react-router';\nexport const Route = createFileRoute('/_app/x')({ component: X });\n`,
    rule: 'rails/route-guard',
  },
  {
    name: 'AC-1 eigen beforeLoad zonder guard',
    file: ROUTE,
    code: route('{ beforeLoad: async () => {}, component: X }'),
    rule: 'rails/route-guard',
  },
  {
    name: 'AC-1 guard(p) zonder tekstliteral',
    file: ROUTE,
    code: route('{ beforeLoad: guard(p), component: X }'),
    rule: 'rails/route-guard',
  },
  {
    name: 'AC-1 guard() zonder permissie',
    file: ROUTE,
    code: route('{ beforeLoad: guard(), component: X }'),
    rule: 'rails/route-guard',
  },
  {
    name: "AC-1 guard('a', 'b') met twee argumenten",
    file: ROUTE,
    code: route("{ beforeLoad: guard('a', 'b'), component: X }"),
    rule: 'rails/route-guard',
  },
  {
    name: "AC-1 other('a') in plaats van guard",
    file: ROUTE,
    code: route("{ beforeLoad: other('a'), component: X }"),
    rule: 'rails/route-guard',
  },
  {
    name: "AC-1 beforeLoad met can('a') in plaats van guard",
    file: ROUTE,
    code: route("{ beforeLoad: async () => can('a'), component: X }"),
    rule: 'rails/route-guard',
  },
  {
    name: 'AC-1 de opties als variabele',
    file: ROUTE,
    code: `${IMPORTS}const opts = ${MET_GUARD};\nexport const Route = createFileRoute('/_app/x')(opts);\n`,
    rule: 'rails/route-guard',
  },
  {
    name: 'AC-1 randgeval: guard in een eigen functie is geweigerd, schrijf hem inline',
    file: ROUTE,
    code: route("{ beforeLoad: (c) => guard('a')(c), component: X }"),
    rule: 'rails/route-guard',
  },
  {
    name: 'AC-1 randgeval: spread zwijgt als beforeLoad: guard met tekst er letterlijk staat',
    file: ROUTE,
    code: route("{ ...base, beforeLoad: guard('a') }"),
    rule: null,
  },
];

const OPTIES_GOED = "createFileRoute('/_app/x')({ beforeLoad: guard('a'), component: X })";
const AC2: Fixture[] = [
  {
    name: 'AC-2 eigen guard als const',
    file: ROUTE,
    code: `import { createFileRoute } from '@tanstack/react-router';\nconst guard = (p: string) => async () => {};\nexport const Route = ${OPTIES_GOED};\n`,
    rule: 'rails/route-guard',
  },
  {
    name: 'AC-2 eigen guard als function',
    file: ROUTE,
    code: `import { createFileRoute } from '@tanstack/react-router';\nfunction guard() {}\nexport const Route = ${OPTIES_GOED};\n`,
    rule: 'rails/route-guard',
  },
  {
    name: "AC-2 guard uit '#web/lib/other.ts'",
    file: ROUTE,
    code: `import { createFileRoute } from '@tanstack/react-router';\nimport { guard } from '#web/lib/other.ts';\nexport const Route = ${OPTIES_GOED};\n`,
    rule: 'rails/route-guard',
  },
  {
    name: "AC-2 guard uit '../../lib/session.ts' (relatief)",
    file: ROUTE,
    code: `import { createFileRoute } from '@tanstack/react-router';\nimport { guard } from '../../lib/session.ts';\nexport const Route = ${OPTIES_GOED};\n`,
    rule: 'rails/route-guard',
  },
  {
    name: "AC-2 een andere export als guard (`other as guard`) uit '#web/lib/session.ts'",
    file: ROUTE,
    code: `import { createFileRoute } from '@tanstack/react-router';\nimport { other as guard } from '#web/lib/session.ts';\nexport const Route = ${OPTIES_GOED};\n`,
    rule: 'rails/route-guard',
  },
];

const AC3: Fixture[] = [
  { name: 'AC-3 uitnodiging-inhoud in _app/x.tsx', file: ROUTE, code: UITNODIGING, rule: 'rails/route-guard' },
  {
    name: 'AC-3 uitnodiging-inhoud in login/index.tsx',
    file: 'src/web/routes/login/index.tsx',
    code: UITNODIGING,
    rule: 'rails/route-guard',
  },
  {
    name: 'AC-3 uitnodiging-inhoud in uitnodiging-nieuw.tsx',
    file: 'src/web/routes/uitnodiging-nieuw.tsx',
    code: UITNODIGING,
    rule: 'rails/route-guard',
  },
  {
    name: 'AC-3 mag: login.tsx zonder guard',
    file: 'src/web/routes/login.tsx',
    code: LOGIN,
    rule: null,
  },
  {
    name: 'AC-3 mag: uitnodiging.tsx zonder guard',
    file: 'src/web/routes/uitnodiging.tsx',
    code: UITNODIGING,
    rule: null,
  },
  {
    name: 'AC-3 mag: __root.tsx zoals hij nu is',
    file: 'src/web/routes/__root.tsx',
    code: lees('src/web/routes/__root.tsx'),
    rule: null,
  },
  {
    name: 'AC-3 mag: -delen/x.tsx met alleen een component (geen createFileRoute)',
    file: 'src/web/routes/-delen/x.tsx',
    code: 'export function X() {\n  return null;\n}\n',
    rule: null,
  },
];

const AC4: Fixture[] = [
  { name: 'AC-4 mag: guard met tekstliteral uit session.ts', file: ROUTE, code: route(MET_GUARD), rule: null },
  {
    name: 'AC-4 mag: met validateSearch en loaderDeps erbij',
    file: ROUTE,
    code: route(
      "{ beforeLoad: guard('accounts:read'), validateSearch: (s) => s, loaderDeps: ({ search }) => search, component: X }",
    ),
    rule: null,
  },
];

const AC5: Fixture[] = [
  {
    name: 'AC-5 createRouter zonder defaultErrorComponent',
    file: 'src/web/lib/x.ts',
    code: "import { createRouter } from '@tanstack/react-router';\nexport const r = createRouter({ routeTree });\n",
    rule: 'rails/router',
  },
  {
    name: 'AC-5 createRouter met defaultErrorComponent: undefined',
    file: 'src/web/lib/x.ts',
    code: "import { createRouter } from '@tanstack/react-router';\nexport const r = createRouter({ routeTree, defaultErrorComponent: undefined });\n",
    rule: 'rails/router',
  },
  {
    name: 'AC-5 createRouter met de opties als variabele',
    file: 'src/web/lib/x.ts',
    code: "import { createRouter } from '@tanstack/react-router';\nexport const r = createRouter(opts);\n",
    rule: 'rails/router',
  },
  ...['false', 'null', 'undefined'].map((waarde): Fixture => ({
    name: `AC-5 een route met errorComponent: ${waarde}`,
    file: ROUTE,
    code: route(`{ beforeLoad: guard('accounts:read'), errorComponent: ${waarde}, component: X }`),
    rule: 'rails/router',
  })),
  {
    name: 'AC-5 mag: src/web/lib/router.ts zoals hij nu is',
    file: 'src/web/lib/router.ts',
    code: lees('src/web/lib/router.ts'),
    rule: null,
  },
  {
    name: 'AC-5 mag: createRouter({ routeTree }) in een test',
    file: 'src/web/lib/x.test.tsx',
    code: "import { createRouter } from '@tanstack/react-router';\nexport const r = createRouter({ routeTree });\n",
    rule: null,
  },
];

const AC6: Fixture[] = [
  ...['createRoute', 'createLazyRoute', 'createLazyFileRoute'].flatMap((naam) => [
    {
      name: `AC-6 ${naam} in een feature`,
      file: 'src/web/features/a/x.tsx',
      code: `import { ${naam} } from '@tanstack/react-router';\nexport const r = ${naam}('/x');\n`,
      rule: 'rails/router' as const,
    },
    {
      name: `AC-6 ${naam} in core-web`,
      file: 'src/core/web/ui/x.tsx',
      code: `import { ${naam} } from '@tanstack/react-router';\nexport const r = ${naam}('/x');\n`,
      rule: 'rails/router' as const,
    },
  ]),
  {
    name: 'AC-6 rr.createRoute via een namespace-import',
    file: 'src/web/features/a/x.tsx',
    code: "import * as rr from '@tanstack/react-router';\nexport const r = rr.createRoute({});\n",
    rule: 'rails/router',
  },
  {
    name: 'AC-6 mag: createRoute in een test',
    file: 'src/web/features/a/x.test.tsx',
    code: "import { createRoute } from '@tanstack/react-router';\nexport const r = createRoute({});\n",
    rule: null,
  },
];

// AC-7: apparaatdetectie, in een scherm, in core-web en in een test (de regel geldt voor heel WEB, ook tests).
const DETECTIE = [
  "export const v = window.matchMedia('(min-width: 1px)');",
  "export const v = matchMedia('x');",
  "export const v = window['matchMedia']('(min-width: 1px)');",
  'export const v = navigator.userAgent;',
  'export const v = window.navigator.userAgent;',
  "export const v = navigator['userAgent'];",
  'export const v = navigator.userAgentData;',
  'const { userAgent } = navigator;\nexport const v = userAgent;',
  'export const isMobile = true;',
  'export const v = useIsMobile();',
  'export const v = { isMobileDevice: 1 };',
];
const DETECTIE_PADEN = ['src/web/features/a/x.tsx', 'src/core/web/ui/x.tsx', 'src/web/features/a/x.test.tsx'];
const AC7: Fixture[] = DETECTIE_PADEN.flatMap((file) =>
  DETECTIE.map((code) => ({
    name: `AC-7 ${file}: ${code.split('\n')[0] ?? ''}`,
    file,
    code: `${code}\n`,
    rule: 'rails/web-globaal' as const,
  })),
);

// AC-8: een store-library, statisch, als re-export en als import().
const STORES = [
  'zustand',
  'zustand/middleware',
  'jotai',
  'valtio',
  'recoil',
  'mobx',
  'mobx-react-lite',
  'redux',
  'react-redux',
  '@reduxjs/toolkit',
  'nanostores',
  '@nanostores/react',
  'effector',
  '@tanstack/store',
  '@tanstack/react-store',
];
const AC8: Fixture[] = [
  ...STORES.map((bron): Fixture => ({
    name: `AC-8 import uit ${bron}`,
    file: 'src/web/features/a/x.tsx',
    code: `import { s } from '${bron}';\nexport const v = s;\n`,
    rule: 'rails/web-globaal',
  })),
  {
    name: 'AC-8 export … from zustand',
    file: 'src/web/features/a/x.tsx',
    code: "export { create } from 'zustand';\n",
    rule: 'rails/web-globaal',
  },
  {
    name: 'AC-8 import() van zustand',
    file: 'src/web/features/a/x.tsx',
    code: "export const m = await import('zustand');\n",
    rule: 'rails/web-globaal',
  },
];

const AC9: Fixture[] = [
  {
    name: 'AC-9 mag: een media-query in tekst',
    file: 'src/web/features/a/x.tsx',
    code: "export const css = '@media (min-width: 640px)';\n",
    rule: null,
  },
  {
    name: 'AC-9 mag: userAgentLabel als naam',
    file: 'src/web/features/a/x.tsx',
    code: "export const userAgentLabel = 'x';\n",
    rule: null,
  },
  {
    name: 'AC-9 mag: thisMobile bevat isMobile alleen midden in de naam',
    file: 'src/web/features/a/x.tsx',
    code: 'export const thisMobile = 1;\n',
    rule: null,
  },
  {
    name: 'AC-9 mag: session.userAgent (ander object dan navigator)',
    file: 'src/web/features/a/x.tsx',
    code: "const session = { userAgent: 'x' };\nexport const v = session.userAgent;\n",
    rule: null,
  },
  {
    name: 'AC-9 mag: useQuery uit @tanstack/react-query in queries.ts',
    file: 'src/web/features/a/queries.ts',
    code: "import { useQuery } from '@tanstack/react-query';\nexport const q = useQuery;\n",
    rule: null,
  },
  {
    name: 'AC-9 mag: navigator.userAgent buiten de web-zone (src/api)',
    file: 'src/api/x.ts',
    code: 'export const v = navigator.userAgent;\n',
    rule: null,
  },
];

test.each([...AC1, ...AC2, ...AC3, ...AC4, ...AC5, ...AC6, ...AC7, ...AC8, ...AC9])(
  'proza-checks/$name',
  async ({ file, code, rule }) => {
    expect(await railsIn(file, code)).toStrictEqual(rule === null ? [] : [rule]);
  },
);

// De meldingen letterlijk uit de spec, één fixture per regel.
test.each([
  {
    name: 'AC-1 rails/route-guard meldt de letterlijke tekst',
    file: ROUTE,
    code: route('{ component: X }'),
    rule: 'rails/route-guard',
    message:
      "Elke schermroute in src/web/routes zet in createFileRoute(…)({ … }) `beforeLoad: guard('<permissie>')`, met guard uit '#web/lib/session.ts' (R-WEB-01, R-UIT-03); uitzondering alleen login.tsx en uitnodiging.tsx.",
  },
  {
    name: 'AC-5 rails/router meldt de letterlijke tekst',
    file: 'src/web/lib/x.ts',
    code: 'export const r = createRouter({ routeTree });\n',
    rule: 'rails/router',
    message:
      'Routes alleen als bestandsroute in src/web/routes (geen createRoute, createLazyRoute of createLazyFileRoute); createRouter zet defaultErrorComponent en een route zet errorComponent niet uit (R-WEB-01).',
  },
  {
    name: 'AC-7 rails/web-globaal meldt de letterlijke tekst',
    file: 'src/web/features/a/x.tsx',
    code: 'export const v = navigator.userAgent;\n',
    rule: 'rails/web-globaal',
    message:
      'Geen matchMedia, userAgent, isMobile of store-library in de web-zone: breakpoints in CSS, UI-state in de URL, serverdata via queries.ts (R-WEB-01).',
  },
])('proza-checks/$name', async ({ file, code, rule, message }) => {
  const gevonden = await meldingen(file, code);

  expect([...new Set(gevonden.map((m) => `${m.ruleId}: ${m.message}`))]).toStrictEqual([`${rule}: ${message}`]);
});

function bestandenOnder(map: string): string[] {
  return readdirSync(path.join(REPO, map), { withFileTypes: true }).flatMap((entry) => {
    const pad = `${map}/${entry.name}`;
    if (entry.isDirectory()) return bestandenOnder(pad);
    return /\.(ts|tsx)$/.test(entry.name) ? [pad] : [];
  });
}

test('proza-checks/AC-13 elke route onder src/web/routes voldoet aan de drie regels', async () => {
  const bestanden = bestandenOnder('src/web/routes').filter((pad) => !pad.endsWith('routeTree.gen.ts'));
  expect(bestanden.length).toBeGreaterThan(0);

  const meldingenPerBestand = await Promise.all(
    bestanden.map(async (pad) => ({ pad, regels: await railsIn(pad, lees(pad)) })),
  );

  expect(meldingenPerBestand.filter(({ regels }) => regels.length > 0)).toStrictEqual([]);
});
