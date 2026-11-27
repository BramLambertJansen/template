import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { expect, test } from 'vitest';

// Leerpunt #1031: een hook na een vroege return wisselt het aantal hooks per render; React gooit dat pas in de browser.
// `react-hooks/rules-of-hooks` in eslint.config.js vangt het in src/web en src/core/web. `lintText` past
// eslint-suppressions.json niet toe: dit zijn fixtures zonder onderdrukking.
const eslint = new ESLint({ cwd: process.cwd(), overrideConfig: [tseslint.configs.disableTypeChecked] });

async function hookFouten(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .map((message) => message.ruleId ?? 'parse-fout')
    .filter((id) => id === 'react-hooks/rules-of-hooks' || id === 'parse-fout');
}

const naVroegeReturn = `import { useState } from 'react';
export function Layout({ klaar }: { readonly klaar: boolean }) {
  if (!klaar) return null;
  const [teller] = useState(0);
  return <p>{teller}</p>;
}
`;

const voorVroegeReturn = `import { useState } from 'react';
export function Layout({ klaar }: { readonly klaar: boolean }) {
  const [teller] = useState(0);
  if (!klaar) return null;
  return <p>{teller}</p>;
}
`;

const inVoorwaarde = `import { useState } from 'react';
export function Layout({ klaar }: { readonly klaar: boolean }) {
  if (klaar) useState(0);
  return null;
}
`;

test.each([
  { bestand: 'src/web/features/layout/x.tsx', code: naVroegeReturn, verwacht: ['react-hooks/rules-of-hooks'] },
  { bestand: 'src/web/features/layout/x.tsx', code: inVoorwaarde, verwacht: ['react-hooks/rules-of-hooks'] },
  { bestand: 'src/core/web/ui/x.tsx', code: naVroegeReturn, verwacht: ['react-hooks/rules-of-hooks'] },
  { bestand: 'src/web/features/layout/x.tsx', code: voorVroegeReturn, verwacht: [] },
])('leerpunt #1031: $bestand, hook na of vóór de vroege return', async ({ bestand, code, verwacht }) => {
  expect(await hookFouten(bestand, code)).toStrictEqual(verwacht);
});
