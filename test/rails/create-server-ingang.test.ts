import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// Spec create-server (docs/template/specs/create-server.md), AC-1: src/api/server.ts is alleen configuratie en registraties;
// de koppeling tussen core-onderdelen staat in core (runServer). Het bestand wordt als tekst gelezen: de test start niets en
// laadt de omgeving niet.
const source = readFileSync(path.join(import.meta.dirname, '../../src/api/server.ts'), 'utf8');

// Verboden tekst volgens de spec (letterlijk): de koppeling hoort niet meer in de app-zone.
const FORBIDDEN = [
  'createAuth',
  'createSmtpMailer',
  'createReadiness',
  'createDevLogin',
  'createWebApp',
  'startServer',
  'pingDatabase',
  'closeDatabase',
  'env(',
];

interface Import {
  readonly names: readonly string[];
  readonly from: string;
}

// `import { a, type B as C } from 'x'` → namen a en B (de naam in de bron, niet de lokale alias); `import d from 'x'` → d.
function importsOf(code: string): Import[] {
  const statements = code.matchAll(/^import\s+(?:type\s+)?([^;]*?)\s+from\s+['"]([^'"]+)['"]/gm);
  return [...statements].map(([, clause = '', from = '']) => ({
    from,
    names: clause
      .replace(/[{}]/g, ',')
      .split(',')
      .map(
        (part) =>
          part
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)[0] ?? '',
      )
      .filter((name) => name !== ''),
  }));
}

const fromCore = importsOf(source).filter(({ from }) => from.startsWith('#core/') || from.includes('/core/'));

describe('create-server/AC-1: src/api/server.ts importeert uit core alleen runServer', () => {
  test.each(FORBIDDEN)('create-server/AC-1: de tekst van src/api/server.ts bevat %s niet', (token) => {
    expect(source).not.toContain(token);
  });

  test('create-server/AC-1: elke import uit core is precies { runServer } uit #core/api/server.ts', () => {
    expect(fromCore).toStrictEqual([{ from: '#core/api/server.ts', names: ['runServer'] }]);
  });

  test('create-server/AC-1: het bestand roept runServer aan met await', () => {
    expect(source).toMatch(/^await runServer\(/m);
  });
});

describe('create-server/AC-1: de importlezer van deze test', () => {
  test('leest namen, type-importen en aliassen uit de importregels', () => {
    const code =
      "import { a, type B as C } from '#core/x.ts';\nimport type { D } from '../core/y.ts';\nimport e from './z.ts';\n";

    expect(importsOf(code)).toStrictEqual([
      { from: '#core/x.ts', names: ['a', 'B'] },
      { from: '../core/y.ts', names: ['D'] },
      { from: './z.ts', names: ['e'] },
    ]);
  });
});
