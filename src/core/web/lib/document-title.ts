import { useEffect } from 'react';

// Paginatitel per scherm (WCAG 2.4.2): "<scherm> · <app>". De app-naam staat één keer in src/web/index.html (<title>) en
// wordt bij het laden van deze module gelezen, vóór het eerste scherm hem overschrijft.
const appName = typeof document === 'undefined' ? '' : document.title;

export function formatDocumentTitle(title: string, app: string): string {
  return app === '' || app === title ? title : `${title} · ${app}`;
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = formatDocumentTitle(title, appName);
  }, [title]);
}
