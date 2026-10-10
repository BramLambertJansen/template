import type { ReactNode } from 'react';
import { PageTitle } from './page-title.tsx';

// Titel van een scherm binnen de AppShell (de enige h1), met acties rechts; op smalle schermen eronder.
export function PageHeader({ title, actions }: { readonly title: string; readonly actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <PageTitle title={title} className="text-2xl font-semibold tracking-tight" />
      {actions === undefined ? null : <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
