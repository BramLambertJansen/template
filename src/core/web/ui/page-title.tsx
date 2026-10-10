import { useDocumentTitle } from '../lib/document-title.ts';
import { cn } from './cn.ts';

// De enige h1 van een scherm (PageHeader, CenteredCard, RouteError): zet ook de paginatitel. tabIndex -1 zodat de AppShell
// na een routewissel de focus hierheen kan zetten (WCAG 2.4.3); geen focusrand, want je kunt er niet met Tab naartoe.
export function PageTitle({ title, className }: { readonly title: string; readonly className?: string }) {
  useDocumentTitle(title);
  return (
    <h1 tabIndex={-1} className={cn('focus:outline-none', className)}>
      {title}
    </h1>
  );
}
