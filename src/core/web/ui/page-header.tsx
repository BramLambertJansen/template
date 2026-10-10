import type { ReactNode } from 'react';

// Titel van een scherm binnen de AppShell (de enige h1), met acties rechts; op smalle schermen eronder.
export function PageHeader({ title, actions }: { readonly title: string; readonly actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {actions === undefined ? null : <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
