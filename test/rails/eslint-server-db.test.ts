import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { expect, test } from 'vitest';

// Spec create-server, AC-11 (R-LAAG-06): pingDatabase en closeDatabase mogen alleen vanuit src/core/api/server.ts en
// src/core/api/db/** worden geïmporteerd. De regel is no-restricted-imports (op de namen, niet op het pad) in
// eslint.config.js; dependency-cruiser werkt per module en kan dat niet. Zonder type-informatie, zoals de andere railstests.
const eslint = new ESLint({ cwd: process.cwd(), overrideConfig: [tseslint.configs.disableTypeChecked] });

const RULE = 'no-restricted-imports';

// Aantal meldingen van de regel (ook de @typescript-eslint-variant telt) voor deze code op dit pad.
async function restrictedImports(filePath: string, code: string): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath });
  const messages = result?.messages ?? [];
  return messages.filter(({ ruleId }) => ruleId?.endsWith(RULE) === true).length;
}

const DB = '#core/api/db/index.ts';
const PING = `import { pingDatabase } from '${DB}';\nexport const p = pingDatabase;\n`;
const CLOSE = `import { closeDatabase } from '${DB}';\nexport const c = closeDatabase;\n`;

interface Fixture {
  readonly name: string;
  readonly file: string;
  readonly code: string;
}

// Buiten de twee plekken: een import van een van de twee namen faalt, ook via een alias, een re-export of beide tegelijk.
const WEIGERT: Fixture[] = [
  { name: 'pingDatabase in de app (src/api/x.ts)', file: 'src/api/x.ts', code: PING },
  { name: 'closeDatabase in de app (src/api/x.ts)', file: 'src/api/x.ts', code: CLOSE },
  { name: 'closeDatabase in src/api/server.ts', file: 'src/api/server.ts', code: CLOSE },
  { name: 'pingDatabase in src/core/api/http/x.ts', file: 'src/core/api/http/x.ts', code: PING },
  {
    name: 'pingDatabase via een relatief pad in core',
    file: 'src/core/api/http/x.ts',
    code: "import { pingDatabase } from '../db/index.ts';\nexport const p = pingDatabase;\n",
  },
  { name: 'pingDatabase in src/core/api/server/compose.ts', file: 'src/core/api/server/compose.ts', code: PING },
  {
    name: 'beide namen in één import',
    file: 'src/api/x.ts',
    code: `import { closeDatabase, pingDatabase } from '${DB}';\nexport const x = [closeDatabase, pingDatabase];\n`,
  },
  {
    name: 'pingDatabase onder een andere naam',
    file: 'src/api/x.ts',
    code: `import { pingDatabase as ping } from '${DB}';\nexport const p = ping;\n`,
  },
  {
    name: 're-export van closeDatabase',
    file: 'src/api/x.ts',
    code: `export { closeDatabase } from '${DB}';\n`,
  },
  {
    name: 'pingDatabase in src/core/api/auth (naast db, niet erin)',
    file: 'src/core/api/auth/x.ts',
    code: PING,
  },
];

// De toegestane plekken: src/core/api/server.ts en alles onder src/core/api/db/.
const TOEGESTAAN: Fixture[] = [
  {
    name: 'beide namen in src/core/api/server.ts',
    file: 'src/core/api/server.ts',
    code: `import { closeDatabase, pingDatabase } from '${DB}';\nexport const x = [closeDatabase, pingDatabase];\n`,
  },
  {
    name: 'pingDatabase in src/core/api/db/x.ts',
    file: 'src/core/api/db/x.ts',
    code: "import { pingDatabase } from './index.ts';\nexport const p = pingDatabase;\n",
  },
  {
    name: 'closeDatabase in een submap van src/core/api/db',
    file: 'src/core/api/db/sub/y.ts',
    code: "import { closeDatabase } from '../index.ts';\nexport const c = closeDatabase;\n",
  },
];

// Controle dat de regel op de namen kijkt en niet op de hele module: de rest van db/index.ts blijft vrij importeerbaar.
const VRIJ: Fixture[] = [
  {
    name: 'withUser uit dezelfde module in de app',
    file: 'src/api/x.ts',
    code: `import { withUser } from '${DB}';\nexport const w = withUser;\n`,
  },
  {
    name: 'createAuditFn en readIntegrationSwitch uit dezelfde module in core',
    file: 'src/core/api/http/x.ts',
    code: `import { createAuditFn, readIntegrationSwitch } from '${DB}';\nexport const a = [createAuditFn, readIntegrationSwitch];\n`,
  },
];

test.each(WEIGERT)('create-server/AC-11: een import van $name faalt', async ({ file, code }) => {
  expect(await restrictedImports(file, code)).toBeGreaterThan(0);
});

test.each(TOEGESTAAN)('create-server/AC-11: toegestaan: $name', async ({ file, code }) => {
  expect(await restrictedImports(file, code)).toBe(0);
});

test.each(VRIJ)('create-server/AC-11: de regel is naamgebonden: $name geeft geen melding', async ({ file, code }) => {
  expect(await restrictedImports(file, code)).toBe(0);
});
