import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { receptFouten, schillenFouten } from '../../scripts/kit/check-schillen.mjs';

// Spec schillen, AC-11, AC-13 en AC-14: de check die elke schil aan de contracttest koppelt (schillenFouten) en de toets op
// het recept "Een tweede schil" in docs/gouden-pad.md (receptFouten). De fixture-repo's staan in een tijdelijke map onder
// TMPDIR (test/setup/tmp-root.ts ruimt op), als .tsx-tekst, zodat er geen fixtures in typecheck, lint of depcruise komen.

const repo = path.join(import.meta.dirname, '../..');
const VERWIJZING = 'Een tweede schil';

function emptyRoot(): string {
  return mkdtempSync(path.join(tmpdir(), 'check-schillen-'));
}

function put(root: string, rel: string, text: string): void {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

// --- Fixtures voor schillenFouten ---------------------------------------------------------------------------------------
const frameImport = "import { ShellFrame } from '#core/web/ui/shell-frame.tsx';\n";
const schilSource = (name: string) =>
  `${frameImport}export function ${name}({ children }) {\n  return <ShellFrame header={null} nav={null}>{children}</ShellFrame>;\n}\n`;
const suiteSource = (name: string, file: string) =>
  `import { shellContract } from '#core/web/ui/testing.tsx';\nimport { ${name} } from './${file}';\nshellContract(${name}, { props: {} });\n`;
const routeSource = (id: string, component: string, from: string) =>
  `import { createFileRoute } from '@tanstack/react-router';\nimport { ${component} } from '${from}';\nimport { guard } from '#web/lib/session.ts';\nexport const Route = createFileRoute('${id}')({ beforeLoad: guard('app.use'), component: ${component} });\n`;
const layoutWith = (component: string, body: string) =>
  `import { Outlet } from '@tanstack/react-router';\nexport function ${component}() {\n  return ${body};\n}\n`;

function meldingenVoor(errors: readonly string[], ...bestanden: string[]): string[] {
  return errors.filter((fout) => bestanden.some((bestand) => fout.includes(bestand)));
}

describe('schillen/AC-11: een schil zonder contracttest', () => {
  test('schillen/AC-11: ShellFrame in src/web/ui/ zonder testbestand met shellContract faalt met bestand en verwijzing', () => {
    const root = emptyRoot();
    put(root, 'src/web/ui/mijn-schil.tsx', schilSource('MijnSchil'));

    const errors = schillenFouten(root);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('src/web/ui/mijn-schil.tsx');
    expect(errors[0]).toContain(VERWIJZING);
  });

  test('schillen/AC-11: een suite op een andere schil telt niet voor deze schil', () => {
    const root = emptyRoot();
    put(root, 'src/web/ui/mijn-schil.tsx', schilSource('MijnSchil'));
    put(root, 'src/web/ui/andere-schil.tsx', schilSource('AndereSchil'));
    put(root, 'src/web/ui/mijn-schil.test.tsx', suiteSource('AndereSchil', 'andere-schil.tsx'));

    const errors = schillenFouten(root);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('src/web/ui/mijn-schil.tsx');
    expect(errors[0]).toContain(VERWIJZING);
  });

  test('schillen/AC-11: dezelfde schil in src/core/web/ui/ zonder suite faalt ook', () => {
    const root = emptyRoot();
    put(root, 'src/core/web/ui/kern-schil.tsx', schilSource('KernSchil'));

    const errors = schillenFouten(root);

    expect(meldingenVoor(errors, 'src/core/web/ui/kern-schil.tsx')).toHaveLength(1);
    expect(errors.join('\n')).toContain(VERWIJZING);
  });

  test('schillen/AC-11: een schil met een suite die shellContract op hem draait geeft []', () => {
    const root = emptyRoot();
    put(root, 'src/web/ui/mijn-schil.tsx', schilSource('MijnSchil'));
    put(root, 'src/web/ui/mijn-schil.test.tsx', suiteSource('MijnSchil', 'mijn-schil.tsx'));

    expect(schillenFouten(root)).toStrictEqual([]);
  });
});

describe('schillen/AC-11: een layoutroute zonder geregistreerde schil', () => {
  test('schillen/AC-11: een layoutroute met een layoutcomponent met een rauwe main faalt met bestand en verwijzing', () => {
    const root = emptyRoot();
    put(
      root,
      'src/web/routes/_portaal.tsx',
      routeSource('/_portaal', 'PortaalLayout', '#web/features/layout/portaal-layout.tsx'),
    );
    put(root, 'src/web/features/layout/portaal-layout.tsx', layoutWith('PortaalLayout', '<main><Outlet /></main>'));

    const errors = schillenFouten(root);

    expect(errors).toHaveLength(1);
    expect(meldingenVoor(errors, 'portaal-layout.tsx', '_portaal.tsx')).toHaveLength(1);
    expect(errors[0]).toContain(VERWIJZING);
  });

  test('schillen/AC-11: een layoutroute met een relatieve import naar een layout met een rauwe main faalt ook', () => {
    const root = emptyRoot();
    put(
      root,
      'src/web/routes/_portaal.tsx',
      routeSource('/_portaal', 'PortaalLayout', '../features/layout/portaal-layout.tsx'),
    );
    put(root, 'src/web/features/layout/portaal-layout.tsx', layoutWith('PortaalLayout', '<main><Outlet /></main>'));

    expect(meldingenVoor(schillenFouten(root), 'portaal-layout.tsx', '_portaal.tsx')).toHaveLength(1);
  });

  test('schillen/AC-11: de bestaande vorm geeft []: _app met SidebarShell en kindroutes onder /_app', () => {
    const root = emptyRoot();
    put(root, 'src/web/routes/__root.tsx', 'export const Route = createRootRoute({ component: Outlet });\n');
    put(root, 'src/web/routes/_app.tsx', routeSource('/_app', 'AppLayout', '#web/features/layout/app-layout.tsx'));
    put(
      root,
      'src/web/features/layout/app-layout.tsx',
      layoutWith('AppLayout', '<SidebarShell nav={[]} userName="x" menuItems={[]}><Outlet /></SidebarShell>'),
    );
    put(
      root,
      'src/web/routes/_app/account.tsx',
      routeSource('/_app/account', 'AccountPage', '#web/features/account/account-page.tsx'),
    );
    put(root, 'src/web/features/account/account-page.tsx', layoutWith('AccountPage', '<main>account</main>'));
    // Een geneste layout zonder pad valt bewust buiten de check.
    put(
      root,
      'src/web/routes/_app/_stap.tsx',
      routeSource('/_app/_stap', 'StapLayout', '#web/features/layout/stap-layout.tsx'),
    );
    put(root, 'src/web/features/layout/stap-layout.tsx', layoutWith('StapLayout', '<main><Outlet /></main>'));

    expect(schillenFouten(root)).toStrictEqual([]);
  });

  test('schillen/AC-11: TopbarShell en AppShell tellen als geregistreerde schil', () => {
    for (const schil of ['TopbarShell', 'AppShell']) {
      const root = emptyRoot();
      put(
        root,
        'src/web/routes/_portaal.tsx',
        routeSource('/_portaal', 'PortaalLayout', '#web/features/layout/portaal-layout.tsx'),
      );
      put(
        root,
        'src/web/features/layout/portaal-layout.tsx',
        layoutWith('PortaalLayout', `<${schil} nav={[]} userName="x" menuItems={[]}><Outlet /></${schil}>`),
      );

      expect(schillenFouten(root), schil).toStrictEqual([]);
    }
  });

  test('schillen/AC-11: een eigen schil met suite in een layoutroute geeft []', () => {
    const root = emptyRoot();
    put(root, 'src/web/ui/mijn-schil.tsx', schilSource('MijnSchil'));
    put(root, 'src/web/ui/mijn-schil.test.tsx', suiteSource('MijnSchil', 'mijn-schil.tsx'));
    put(
      root,
      'src/web/routes/_portaal.tsx',
      routeSource('/_portaal', 'PortaalLayout', '#web/features/layout/portaal-layout.tsx'),
    );
    put(
      root,
      'src/web/features/layout/portaal-layout.tsx',
      layoutWith('PortaalLayout', '<MijnSchil><Outlet /></MijnSchil>'),
    );

    expect(schillenFouten(root)).toStrictEqual([]);
  });

  test('schillen/AC-11: een eigen schil zonder suite is geen geregistreerde schil voor de layoutroute', () => {
    const root = emptyRoot();
    put(root, 'src/web/ui/mijn-schil.tsx', schilSource('MijnSchil'));
    put(
      root,
      'src/web/routes/_portaal.tsx',
      routeSource('/_portaal', 'PortaalLayout', '#web/features/layout/portaal-layout.tsx'),
    );
    put(
      root,
      'src/web/features/layout/portaal-layout.tsx',
      layoutWith('PortaalLayout', '<MijnSchil><Outlet /></MijnSchil>'),
    );

    const errors = schillenFouten(root);

    expect(meldingenVoor(errors, 'src/web/ui/mijn-schil.tsx')).toHaveLength(1);
    expect(meldingenVoor(errors, 'portaal-layout.tsx', '_portaal.tsx')).toHaveLength(1);
  });

  test('schillen/AC-11: de echte repo geeft []', () => {
    expect(schillenFouten(repo)).toStrictEqual([]);
  });
});

describe('schillen/AC-14: ShellFrame buiten de schilmappen', () => {
  test('schillen/AC-14: <ShellFrame in een feature faalt met dat pad en de verwijzing', () => {
    const root = emptyRoot();
    put(root, 'src/web/features/x/scherm.tsx', schilSource('Scherm'));

    const errors = schillenFouten(root);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('src/web/features/x/scherm.tsx');
    expect(errors[0]).toContain(VERWIJZING);
  });

  test('schillen/AC-14: hetzelfde in een testbestand faalt niet', () => {
    const root = emptyRoot();
    put(root, 'src/web/features/x/scherm.test.tsx', schilSource('Scherm'));

    expect(schillenFouten(root)).toStrictEqual([]);
  });
});

// --- Fixtures voor receptFouten -----------------------------------------------------------------------------------------
const GOUDEN_PAD = 'docs/gouden-pad.md';
const SKILL = '.claude/skills/nieuw-scherm/SKILL.md';
const VEREIST = [
  'ShellFrame',
  'shellContract',
  'src/shared/permissions.ts',
  'src/web/lib/nav.ts',
  'e2e/shell.spec.ts',
  'src/web/features/layout/twee-schillen.test.tsx',
] as const;
const BESTANDEN = [
  'src/shared/permissions.ts',
  'src/web/lib/nav.ts',
  'e2e/shell.spec.ts',
  'src/web/features/layout/twee-schillen.test.tsx',
];
const goedeSkill = 'Een nieuwe layoutroute: volg `docs/gouden-pad.md`, sectie "Een tweede schil".\n';

interface ReceptOptions {
  readonly weg?: string;
  readonly extra?: string;
  readonly skill?: string;
  readonly zonderSectie?: boolean;
}

// Een root met alle bestanden uit het recept en een sectie die de vereiste verwijzingen noemt (elk in backticks).
function receptRoot({ weg, extra, skill = goedeSkill, zonderSectie = false }: ReceptOptions = {}): string {
  const root = emptyRoot();
  for (const file of BESTANDEN) put(root, file, '// fixture\n');
  const regels = VEREIST.filter((ref) => ref !== weg).map((ref) => `- \`${ref}\``);
  regels.push('- Een route: `src/web/routes/_<naam>.tsx`, met regel `docs/gouden-pad.md:3`.');
  if (extra !== undefined) regels.push(`- ${extra}`);
  const sectie = zonderSectie ? '' : `## ${VERWIJZING}\n\n${regels.join('\n')}\n\n`;
  // Een pad buiten de sectie telt niet mee.
  put(root, GOUDEN_PAD, `# Gouden pad\n\n${sectie}## Volgende sectie\n\n\`src/bestaat/niet.ts\`\n`);
  put(root, SKILL, skill);
  return root;
}

describe('schillen/AC-13: het recept "Een tweede schil" in het gouden pad', () => {
  test('schillen/AC-13: de echte repo geeft []', () => {
    expect(receptFouten(repo)).toStrictEqual([]);
  });

  test('schillen/AC-13: een complete fixture geeft [] (pad met <, regelachtervoegsel en pad buiten de sectie tellen niet)', () => {
    expect(receptFouten(receptRoot())).toStrictEqual([]);
  });

  test('schillen/AC-13: zonder de sectie faalt de test en noemt de melding de sectie', () => {
    const errors = receptFouten(receptRoot({ zonderSectie: true }));

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain(VERWIJZING);
  });

  test.each(VEREIST)('schillen/AC-13: zonder verwijzing naar %s faalt de test met die verwijzing', (ref) => {
    const errors = receptFouten(receptRoot({ weg: ref }));

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain(ref);
  });

  test('schillen/AC-13: een pad in backticks dat niet bestaat faalt met dat pad', () => {
    const errors = receptFouten(receptRoot({ extra: '`src/web/features/layout/bestaat-niet.tsx`' }));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('src/web/features/layout/bestaat-niet.tsx');
  });

  test('schillen/AC-13: een pad met < wordt overgeslagen', () => {
    expect(receptFouten(receptRoot({ extra: '`src/web/routes/_<naam>/index.tsx`' }))).toStrictEqual([]);
  });

  test('schillen/AC-13: een skill zonder verwijzing naar het gouden pad faalt met die verwijzing', () => {
    const errors = receptFouten(receptRoot({ skill: 'Volg sectie "Een tweede schil".\n' }));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(GOUDEN_PAD);
  });

  test('schillen/AC-13: een skill zonder verwijzing naar de sectie faalt met die verwijzing', () => {
    const errors = receptFouten(receptRoot({ skill: 'Volg `docs/gouden-pad.md`.\n' }));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(VERWIJZING);
  });
});
