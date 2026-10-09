import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from '#core/web/lib/query.ts';
import { ErrorTextsProvider } from '#core/web/ui/error-texts.tsx';
import { errorTexts } from '#web/copy/errors.ts';
import { createAppRouter } from '#web/lib/router.ts';
import { LOGIN_PATH } from '#web/lib/session.ts';

// Compositie-root van de frontend (ADR 0008): query-client, router, foutteksten.
const queryClient = createQueryClient({
  // 401 uit een query of mutatie → inloggen, daarna terug naar waar de gebruiker was (framework §5).
  onUnauthenticated: () => {
    const search = new URLSearchParams({ redirect: router.state.location.href });
    void router.navigate({ href: `${LOGIN_PATH}?${search.toString()}` });
  },
});
const router = createAppRouter(queryClient);

const root = document.getElementById('root');
if (root === null) throw new Error('Element #root ontbreekt in index.html');

createRoot(root).render(
  <StrictMode>
    <ErrorTextsProvider texts={errorTexts}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorTextsProvider>
  </StrictMode>,
);
