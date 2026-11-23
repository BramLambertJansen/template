import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, test } from 'vitest';

// Rail rails/korte-ref (leerpunt #934, #927, #932): `origin/main` als gitargument lost eerst `refs/heads/origin/main`
// op, dus een lokale branch kan het verschuilen. Gebruik de volle naam `refs/remotes/origin/main`.
// Zonder type-informatie: de rails zijn puur syntactisch.
const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfig: [tseslint.configs.disableTypeChecked],
});

async function railsIn(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  const ruleIds = result?.messages.map((message) => message.ruleId ?? 'parse-fout') ?? [];
  return ruleIds.filter((id) => id.startsWith('rails/') || id === 'parse-fout');
}

const bestanden = ['scripts/kit/x.mjs', 'rails/hooks/lib/x.mjs'];

const fout = [
  "export const a = ['rev-parse', 'origin/main'];",
  "export const a = ['merge-base', \"origin/main\", 'HEAD'];",
  "export const a = 'origin/main^{commit}';",
  "export const a = `origin/main:${'x'}`;",
  "export const a = 'origin/main...HEAD';",
  "export const a = 'HEAD..origin/main';",
  "export const a = 'origin/main~1';",
  "export const a = '^origin/main';",
  "export const a = '--fork-point=origin/main';",
  "export const a = 'origin/main@{1}';",
  "export const a = `${'x'}..origin/main`;",
  "export const BASE = 'origin/main';",
];

const goed = [
  "export const a = 'refs/remotes/origin/main';",
  "export const a = 'refs/remotes/origin/main^{commit}';",
  "export const a = '+refs/heads/main:refs/remotes/origin/main';",
  "export const a = 'HEAD..refs/remotes/origin/main';",
  "export const a = 'geen merge-base met origin/main; toetst niets';",
  'export const a = `haal ze binnen met \\`git merge origin/main\\``;',
  '// git rev-parse origin/main\nexport const a = 1;',
  "export const a = 'origin/mainline';",
];

describe('rails/korte-ref', () => {
  for (const file of bestanden) {
    describe(file, () => {
      test.each(fout)('meldt %s', async (code) => {
        expect(await railsIn(file, code)).toEqual(['rails/korte-ref']);
      });

      test.each(goed)('zwijgt op %s', async (code) => {
        expect(await railsIn(file, code)).toEqual([]);
      });
    });
  }

  describe('buiten bereik', () => {
    test.each(['src/api/x.ts', 'test/x.test.ts', 'scripts/x.mjs'])('zwijgt in %s', async (file) => {
      expect(await railsIn(file, "export const a = 'origin/main';")).toEqual([]);
    });
  });

  test('verse-main.mjs is uitgezonderd (herkent commandotekst, geen gitargument)', async () => {
    expect(await railsIn('rails/hooks/lib/verse-main.mjs', "export const a = new Set(['origin/main']);")).toEqual([]);
  });

  test('de melding noemt de volle refnaam refs/remotes/origin/main', async () => {
    const [result] = await eslint.lintText("export const a = 'origin/main';", { filePath: 'scripts/kit/x.mjs' });
    const melding = result?.messages.find((message) => message.ruleId === 'rails/korte-ref');
    expect(melding).toBeDefined();
    expect(melding?.message).toContain('refs/remotes/origin/main');
  });
});
