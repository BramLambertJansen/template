import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { uiTexts } from '../copy/ui.ts';
import { ForbiddenError } from '../lib/guard.ts';
import { Button } from './button.tsx';
import { PageTitle } from './page-title.tsx';
import { useErrorText } from './error-texts.tsx';

// ErrorBoundary van elke route (framework §5, via defaultErrorComponent van de router). Toont alleen een tekst bij de
// foutcode, nooit de fout zelf. Geen rechten: de vaste tekst uit de spec, zonder "opnieuw proberen".
export function RouteError({ error }: ErrorComponentProps) {
  const errorText = useErrorText();
  const router = useRouter();
  if (error instanceof ForbiddenError) {
    return (
      <main className="p-6">
        <p role="alert" className="text-foreground">
          {errorText({ code: 'FORBIDDEN' })}
        </p>
      </main>
    );
  }
  return (
    <main className="flex flex-col items-start gap-3 p-6">
      <PageTitle title={uiTexts.errorTitle} className="text-2xl font-semibold" />
      <p role="alert" className="text-destructive">
        {errorText(error)}
      </p>
      {/* invalidate laadt de loaders opnieuw en wist de fout; reset() alleen zou de oude fout weer tonen. */}
      <Button variant="outline" onClick={() => void router.invalidate()}>
        {uiTexts.retry}
      </Button>
    </main>
  );
}

export function NotFound() {
  return (
    <main className="p-6">
      <PageTitle title={uiTexts.notFoundTitle} className="text-2xl font-semibold" />
    </main>
  );
}
