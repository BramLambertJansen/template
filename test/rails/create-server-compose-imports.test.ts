import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// Spec create-server, AC-9: src/core/api/server/compose.ts importeert #core/api/db niet. De module src/core/api/db/index.ts
// roept bij het importeren env() aan en maakt een pool, dus een module die hem laadt is zonder volledige omgeving niet te
// testen; daarom krijgt compose.ts de database als parts van runServer (src/core/api/server.ts). Het bestand wordt als tekst
// gelezen. Alleen de types-module van de database (db/types.ts: geen pool, geen env) is toegestaan.
const COMPOSE = 'src/core/api/server/compose.ts';
const root = path.join(import.meta.dirname, '../..');

// Elke bronnaam van een static import, export-from, side-effect-import of dynamische import.
function specifiersOf(code: string): string[] {
  const patterns = [
    /\b(?:import|export)\b[^;'"`]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...code.matchAll(pattern)].map(([, specifier = '']) => specifier));
}

const DB_MODULE = /(^|\/)db(\/|$)/;
const DB_TYPES_ONLY = /(^|\/)db\/types\.ts$/;

// De bronnen die de databasemodule (met pool en env()) laden: alles onder een db-map, behalve de types-module.
function databaseImports(code: string): string[] {
  return specifiersOf(code).filter((specifier) => DB_MODULE.test(specifier) && !DB_TYPES_ONLY.test(specifier));
}

const APP_ALIASES = ['#shared/', '#web/', '#api/'];
const APP_DIRECTORIES = ['src/api/', 'src/shared/', 'src/web/'];

// De bronnen uit de app-zone, via een alias of een relatief pad vanuit de map van compose.ts.
function appImports(code: string): string[] {
  return specifiersOf(code).filter((specifier) => {
    if (APP_ALIASES.some((alias) => specifier.startsWith(alias))) return true;
    if (!specifier.startsWith('.')) return false;
    const resolved = path.posix.join(path.posix.dirname(COMPOSE), specifier);
    return APP_DIRECTORIES.some((directory) => resolved.startsWith(directory));
  });
}

describe('create-server/AC-9: compose.ts importeert #core/api/db niet', () => {
  test('create-server/AC-9: src/core/api/server/compose.ts bestaat en importeert geen databasemodule', () => {
    expect(existsSync(path.join(root, COMPOSE)), `${COMPOSE} bestaat`).toBe(true);

    expect(databaseImports(readFileSync(path.join(root, COMPOSE), 'utf8'))).toStrictEqual([]);
  });

  test('create-server/AC-9: compose.ts importeert niets uit de app (#shared, #web, #api, src/api, src/shared, src/web)', () => {
    expect(existsSync(path.join(root, COMPOSE)), `${COMPOSE} bestaat`).toBe(true);

    expect(appImports(readFileSync(path.join(root, COMPOSE), 'utf8'))).toStrictEqual([]);
  });
});

describe('create-server/AC-9: de importlezer van deze test', () => {
  test.each([
    "import { withUser } from '#core/api/db/index.ts';",
    "import { withUser } from '../db/index.ts';",
    "import { withUser } from '../db';",
    "import * as db from '../db/';",
    "import { closeDatabase } from '#core/api/db/index';",
    "export { pingDatabase } from '../db/index.ts';",
    "const m = await import('../db/index.ts');",
    "import '#core/api/db/index.ts';",
    "import { createWithUser } from '../db/with-user.ts';",
  ])('meldt %s', (code) => {
    expect(databaseImports(code)).toHaveLength(1);
  });

  test.each([
    "import type { WithUser } from '#core/api/db/types.ts';",
    "import type { Tx } from '../db/types.ts';",
    "import { createApp } from '../http/create-app.ts';",
    "import { guardWithUser } from '../outbound/index.ts';",
    "import { env } from '../env.ts';",
  ])('meldt %s niet', (code) => {
    expect(databaseImports(code)).toStrictEqual([]);
  });

  test.each([
    "import { roles } from '#shared/roles.ts';",
    "import { x } from '../../../shared/roles.ts';",
    "import { buildApp } from '../../../api/app.ts';",
    "import { y } from '#web/lib/api.ts';",
  ])('meldt app-import %s', (code) => {
    expect(appImports(code)).toHaveLength(1);
  });

  test.each([
    "import { createApp } from '../http/create-app.ts';",
    "import { unsafeCast } from '../../shared/unsafe-cast.ts';",
    "import { can } from '#core/shared/can.ts';",
  ])('meldt core-import %s niet als app-import', (code) => {
    expect(appImports(code)).toStrictEqual([]);
  });
});
