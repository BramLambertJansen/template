import { expect, test } from 'vitest';
import * as barrel from './index.ts';

// Eén meldingenplek (spec schillen): de barrel exporteert Toaster niet meer; een eigen <Toaster /> faalt bij de typecheck.
// De schilwissel zelf toetst src/core/web/ui/toast.test.tsx.
test('schillen/AC-15: Toaster is geen export van src/web/ui/index.ts', () => {
  expect(Object.keys(barrel)).not.toContain('Toaster');
  expect(Object.keys(barrel)).toContain('ToastProvider');
});
