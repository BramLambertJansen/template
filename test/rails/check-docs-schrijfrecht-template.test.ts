import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// templateregime/AC-10 (docs/specs/templateregime.md): het schrijfrecht van de architect omvat `docs/template/adr/**` en
// `docs/template/specs/**`, ook in SCHRIJFRECHT_VRIJ (scripts/kit/check-docs.mjs); check-docs is groen op de samenhang met de
// padtabel. De fixtures zijn in de oude vorm (`gates`), zoals check-docs-schrijfrecht.test.ts; dat levert een eigen melding
// `docs:paden:oude-vorm` op, die hier buiten beschouwing blijft (alleen sleutels met `schrijfrecht` tellen).
const ROOT = path.join(import.meta.dirname, '../..');
const TEMPLATE_DOCUMENTEN = ['docs/template/adr/**', 'docs/template/specs/**'];
const BASIS = ['docs/adr/**', 'docs/specs/**'];

function strings(waarde: unknown): string[] {
  return Array.isArray(waarde) ? waarde.map(String) : [];
}

function veld(waarde: unknown, sleutel: string): unknown {
  return typeof waarde === 'object' && waarde !== null ? Reflect.get(waarde, sleutel) : undefined;
}

// Een git-repo met `gates` waarin de architect-paden en de template-documenten gates zijn.
function repo(schrijfrecht: Record<string, string[]>): string {
  const gates = ['docs/framework.md', ...BASIS, ...TEMPLATE_DOCUMENTEN, 'scripts/**', 'test/**'];
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-schrijfrecht-template-'));
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: {} }),
    '.github/CODEOWNERS': gates.map((glob) => `/${glob.replace(/\*\*$/, '')} @e`).join('\n') + '\n',
    '.claude/settings.json': JSON.stringify({
      permissions: { ask: gates.filter((glob) => glob !== 'test/**').map((glob) => `Edit(${glob})`) },
    }),
    '.claude/gates.json': JSON.stringify({
      gates,
      jsonGates: {},
      testpaden: ['test/**'],
      schrijfrecht: { reviewer: [], developer: ['**'], ...schrijfrecht },
    }),
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function schrijfrechtMeldingen(root: string) {
  return (await docsViolations(root)).filter((violation) => violation.key.includes('schrijfrecht'));
}

describe('templateregime/AC-10 schrijfrecht van de architect op de template-documenten', () => {
  test('templateregime/AC-10 .claude/gates.json geeft de architect docs/template/adr/** en docs/template/specs/** naast docs/adr/** en docs/specs/**', () => {
    const gates: unknown = JSON.parse(readFileSync(path.join(ROOT, '.claude/gates.json'), 'utf8'));
    const architect = strings(veld(veld(gates, 'schrijfrecht'), 'architect'));

    expect(architect).toEqual(expect.arrayContaining([...BASIS, ...TEMPLATE_DOCUMENTEN]));
  });

  test('templateregime/AC-10 de architect mag de template-documenten schrijven zonder overlapmelding met de gates', async () => {
    const root = repo({ architect: [...BASIS, ...TEMPLATE_DOCUMENTEN] });

    expect(await schrijfrechtMeldingen(root)).toStrictEqual([]);
  });

  test('templateregime/AC-10 een andere rol blijft gemeld op de template-documenten', async () => {
    const root = repo({ architect: [...BASIS, ...TEMPLATE_DOCUMENTEN], docs: ['docs/template/adr/**'] });
    const meldingen = await schrijfrechtMeldingen(root);

    // Alleen de rol docs wordt gemeld; de architect niet (nu nog wel: SCHRIJFRECHT_VRIJ kent de template-documenten niet).
    expect(meldingen.some((m) => m.message.includes('docs') && m.message.includes('docs/template/adr/**'))).toBe(true);
    expect(meldingen.some((m) => m.message.includes('architect'))).toBe(false);
  });

  test('templateregime/AC-10 de echte gates.json is groen op de samenhang van het schrijfrecht met de padtabel', async () => {
    const meldingen = (await docsViolations(ROOT)).filter((violation) => violation.key.includes('schrijfrecht'));

    expect(meldingen).toStrictEqual([]);
  });
});
