import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';

// Spec ci-bewijs AC-7: `roodMelding` is nieuw; laden als `unknown` zodat de test op een assertie faalt, niet bij het laden.
// Importeren start geen main(): die staat achter `import.meta.main`.
const root = path.resolve(import.meta.dirname, '../..');

test('ci-bewijs/AC-7: roodMelding(12) verwijst naar de logcommando voor die PR', async () => {
  const mod: unknown = await import(pathToFileURL(path.join(root, 'scripts/kit/pr-verify.mjs')).href);
  const roodMelding: unknown = typeof mod === 'object' && mod !== null ? Reflect.get(mod, 'roodMelding') : undefined;

  expect(typeof roodMelding).toBe('function');
  const uit: unknown = Reflect.apply(
    unsafeCast<(...args: unknown[]) => unknown>(roodMelding, 'gecontroleerd hierboven'),
    undefined,
    [12],
  );
  expect(uit).toBe(
    'CI is rood; herstel de oorzaak en controleer de nieuwe commit (fouten per rode job: pnpm pr:log 12)',
  );
});
