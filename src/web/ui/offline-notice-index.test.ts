import { expect, test } from 'vitest';
import { OfflineNotice as FromCore } from '#core/web/ui/offline-notice.tsx';
import { exampleTarget } from '#web/features/design-system/example-targets.ts';
import { OfflineNotice } from './index.ts';

test('offline-en-print/AC-15: OfflineNotice komt uit de barrel en staat in het voorbeelddoel example-layout', () => {
  expect(OfflineNotice).toBe(FromCore);
  expect(exampleTarget('OfflineNotice')?.id).toBe('example-layout');
});
