import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { DesignSystemPage } from '#web/features/design-system/design-system-page.tsx';
import { schilSearch } from '#web/features/layout/schil-voorbeeld.ts';
import { guard } from '#web/lib/session.ts';

// De componentcatalogus (framework §7, spec design-system): alleen voor admins, ook in productie. autoCodeSplitting
// (vite.config.ts) zet de component in een eigen chunk, buiten de entry-chunk (test/ui/bundle.test.ts, AC-6).
export const Route = createFileRoute('/_app/design-system')({
  beforeLoad: guard('design-system:read'),
  // `vak` is het open tabblad (spec designsystem-toolbox); een onbekende waarde opent het eerste. `schil` en `items` kiezen
  // de schil met voorbeeldnavigatie (spec schillen; AppLayout leest ze), een onbekende waarde valt terug op de standaard.
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    vak: z.string().optional().catch(undefined),
    ...schilSearch,
  }),
  component: DesignSystemPage,
});
