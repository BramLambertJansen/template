import { Link } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { isDev } from '#core/web/lib/env.ts';
import { copy } from '#web/copy/ui.ts';
import { Button, PageHeader } from '#web/ui/index.ts';

// Lokaal ook een link naar /design-system (besluit eigenaar 2026-10-10); in de productiebundel bestaat src/web/dev niet.
const DevDashboardLinks = isDev
  ? lazy(() => import('#web/dev/dashboard-links.tsx').then((module) => ({ default: module.DevDashboardLinks })))
  : null;

// Dashboard van een admin (spec accounts/AC-3): titel en de link naar de accounts.
export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={copy.dashboard.title} />
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/admin/accounts">{copy.dashboard.accounts}</Link>
        </Button>
        {DevDashboardLinks === null ? null : (
          <Suspense fallback={null}>
            <DevDashboardLinks />
          </Suspense>
        )}
      </div>
    </div>
  );
}
