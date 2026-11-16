import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { plan } from '../../scripts/kit/new-resource.mjs';
import { expectAbsent } from '../support/absence.ts';

// suitecontract/AC-3 (docs/template/specs/suite-volgt-contract.md, ontwerp 2): het contract dat pnpm new:resource maakt geeft
// defineListSearch een `pageSize: <NAAM>_PAGE_SIZE`, zodat de lijstroute `limit` tot en met die grens accepteert en de suite hem
// kan sturen. De gegenereerde contractmodule wordt echt geladen (zoals test/rails/new-resource-lijst.test.ts), nu met
// src/shared/limits.ts erbij: het contract importeert de constante daaruit.

const NODIG = [
  '.prettierrc.json',
  'db/ids.json',
  'db/migrations',
  'src/shared/permissions.ts',
  'src/shared/permissions.test.ts',
  'src/shared/contracts/index.ts',
  'src/shared/limits.ts',
  'src/api/app.ts',
  'src/web/copy/ui.ts',
  'src/web/lib/nav.ts',
  'src/web/routes.test.tsx',
];

const tijdelijkeMappen: string[] = [];

afterAll(() => {
  for (const map of tijdelijkeMappen) rmSync(map, { recursive: true, force: true });
});

function kopie(naam: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'new-resource-limit-'));
  tijdelijkeMappen.push(root);
  for (const pad of NODIG) cpSync(pad, path.join(root, pad), { recursive: true });
  mkdirSync(path.join(root, 'docs/specs'), { recursive: true });
  writeFileSync(
    path.join(root, `docs/specs/${naam}.md`),
    `---\nstatus: goedgekeurd\nnamespace: ${naam}\n---\n\n# ${naam}\n`,
  );
  return root;
}

const modulen = z.record(z.string(), z.unknown());
const zodSchema = z.instanceof(z.ZodType);
const lijstContract = z.object({ input: z.instanceof(z.ZodObject), method: z.literal('GET') });
const zoekmodule = z.object({ pageSize: z.number().optional(), api: zodSchema, web: zodSchema });

interface Geladen {
  readonly contract: string;
  readonly route: string;
  readonly lijst: z.infer<typeof lijstContract> | undefined;
  readonly zoek: z.infer<typeof zoekmodule> | undefined;
  readonly grens: number | undefined;
}

const GEVALLEN = [
  { naam: 'notities', camel: 'notities', constante: 'NOTITIES_PAGE_SIZE' },
  { naam: 'work-items', camel: 'workItems', constante: 'WORK_ITEMS_PAGE_SIZE' },
] as const;

const geladen = new Map<string, Geladen>();

beforeAll(async () => {
  for (const { naam, camel, constante } of GEVALLEN) {
    const root = kopie(naam);
    const p = await plan(root, naam, { rollen: ['user'], nu: new Date('2000-01-01T00:00:00Z') });
    const bestand = (pad: string) => p.bestanden.find((b) => b.pad === pad)?.inhoud ?? '';
    const werkmap = path.join(import.meta.dirname, `.tmp-limit-${naam}-${String(process.pid)}`);
    tijdelijkeMappen.push(werkmap);
    const schrijf = (pad: string, tekst: string) => {
      mkdirSync(path.dirname(path.join(werkmap, pad)), { recursive: true });
      writeFileSync(path.join(werkmap, pad), tekst);
    };
    // De gegenereerde bestanden die het contract nodig heeft; kit.ts is het echte bestand. limits.ts is nieuw in deze lijst:
    // het contract importeert er <NAAM>_PAGE_SIZE uit.
    for (const pad of [
      `src/shared/contracts/${naam}.ts`,
      'src/shared/ids.ts',
      'src/shared/permissions.ts',
      'src/shared/limits.ts',
    ])
      schrijf(pad, bestand(pad));
    cpSync('src/shared/contracts/kit.ts', path.join(werkmap, 'src/shared/contracts/kit.ts'));
    const contractModule = modulen.parse(
      await import(pathToFileURL(path.join(werkmap, `src/shared/contracts/${naam}.ts`)).href),
    );
    const limitsModule = modulen.parse(await import(pathToFileURL(path.join(werkmap, 'src/shared/limits.ts')).href));
    const grens = limitsModule[constante];
    geladen.set(naam, {
      contract: bestand(`src/shared/contracts/${naam}.ts`),
      route: bestand(`src/api/routes/${naam}.ts`),
      lijst: lijstContract.safeParse(contractModule[`${camel}ListContract`]).data,
      zoek: zoekmodule.safeParse(contractModule[`${camel}Search`]).data,
      grens: typeof grens === 'number' ? grens : undefined,
    });
  }
}, 60_000);

function van(naam: string): Geladen {
  const gevonden = geladen.get(naam);
  if (gevonden === undefined) throw new Error(`geen geladen resultaat voor ${naam}`);
  return gevonden;
}

for (const { naam, constante } of GEVALLEN) {
  describe(`suitecontract/AC-3: gegenereerd lijstcontract van ${naam}`, () => {
    test(`suitecontract/AC-3: ${naam}: het lijstcontract en <NAAM>_PAGE_SIZE zijn geladen (de rest van deze groep bewijst dan iets)`, () => {
      expect(van(naam).lijst).toBeDefined();
      expect(van(naam).grens).toBeGreaterThan(0);
    });

    test(`suitecontract/AC-3: ${naam}: de lijstroute accepteert limit tot en met ${constante}, ook als querytekst`, () => {
      const { lijst, grens } = van(naam);

      expect(grens).toBeDefined();
      expect(lijst?.input.safeParse({ limit: 1 }).success).toBe(true);
      expect(lijst?.input.safeParse({ limit: grens }).success).toBe(true);
      expect(lijst?.input.safeParse({ limit: String(grens) }).success).toBe(true);
    });

    test(`suitecontract/AC-3: ${naam}: de lijstroute weigert limit ${constante} + 1, 0 en onzin`, () => {
      const { lijst, grens } = van(naam);

      expect(grens).toBeDefined();
      expect(lijst?.input.safeParse({ limit: (grens ?? 0) + 1 }).success).toBe(false);
      expect(lijst?.input.safeParse({ limit: 0 }).success).toBe(false);
      expect(lijst?.input.safeParse({ limit: 'abc' }).success).toBe(false);
    });

    test(`suitecontract/AC-3: ${naam}: zonder limit geldt ${constante}`, () => {
      const { lijst, grens } = van(naam);

      expect(grens).toBeDefined();
      expect(lijst?.input.safeParse({}).data).toMatchObject({ limit: grens });
    });

    test(`suitecontract/AC-3: ${naam}: ListSearch.pageSize is ${constante} en het webschema kent geen limit`, () => {
      const { zoek, grens } = van(naam);

      expect(zoek?.pageSize).toBe(grens);
      expect(zoek?.web.safeParse({ limit: 3 }).data).toStrictEqual({});
    });

    test(`suitecontract/AC-3: ${naam}: het contract geeft defineListSearch pageSize: ${constante}`, () => {
      const { contract } = van(naam);

      expect(contract).toMatch(new RegExp(`pageSize:\\s*${constante}\\b`));
      expect(contract).toMatch(new RegExp(`import \\{[^}]*\\b${constante}\\b[^}]*\\} from '[^']*limits\\.ts'`));
    });

    test(`suitecontract/AC-3: ${naam}: de gegenereerde route noemt input.limit en niet de constante als aantal rijen`, () => {
      const { route } = van(naam);

      expect(route).toContain('input.limit');
      expectAbsent(route, new RegExp(`hooguit\\s+${constante}(?:\\s|//)+rijen`), {
        recognizes: [`hooguit ${constante} rijen`, `hooguit ${constante}\n// rijen`],
      });
    });
  });
}
