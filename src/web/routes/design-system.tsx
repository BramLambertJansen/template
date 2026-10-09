import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router';
import { isDev } from '#core/web/lib/env.ts';

// De componentcatalogus (framework §7): alleen in dev. Buiten dev geeft de route 404, en bij build is src/web/dev/ leeg
// (devOnlyModules in vite.config.ts; test/ui/bundle.test.ts). Geen can()-guard: de pagina toont geen data.
export const Route = createFileRoute('/design-system')({
  beforeLoad: () => {
    if (!isDev) notFound({ throw: true });
  },
  component: lazyRouteComponent(() => import('#web/dev/design-system-page.tsx'), 'DesignSystemPage'),
});
