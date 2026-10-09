import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { uiTexts } from '../copy/ui.ts';
import { ForbiddenError } from '../lib/guard.ts';
import { useErrorText } from './error-texts.tsx';

// ErrorBoundary van elke route (framework §5, via defaultErrorComponent van de router). Toont alleen een tekst bij de
// foutcode, nooit de fout zelf. Geen rechten: de vaste tekst uit de spec, zonder "opnieuw proberen".
export function RouteError({ error }: ErrorComponentProps) {
  const errorText = useErrorText();
  const router = useRouter();
  if (error instanceof ForbiddenError) {
    return (
      <main>
        <p role="alert">{errorText({ code: 'FORBIDDEN' })}</p>
      </main>
    );
  }
  return (
    <main>
      <h1>{uiTexts.errorTitle}</h1>
      <p role="alert">{errorText(error)}</p>
      {/* invalidate laadt de loaders opnieuw en wist de fout; reset() alleen zou de oude fout weer tonen. */}
      <button type="button" onClick={() => void router.invalidate()}>
        {uiTexts.retry}
      </button>
    </main>
  );
}

export function NotFound() {
  return (
    <main>
      <h1>{uiTexts.notFoundTitle}</h1>
    </main>
  );
}
