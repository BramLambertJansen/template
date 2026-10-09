import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createQueryClient } from '#core/web/lib/query.ts';
import { ErrorTextsProvider } from '#core/web/ui/error-texts.tsx';
import { errorTexts } from '#web/copy/errors.ts';
import { createAppRouter } from '#web/lib/router.ts';

// De bestandsroutes van de app (routeTree.gen.ts) met dezelfde router als main.tsx.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(path: string) {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ ok: true }))));
  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  render(
    <ErrorTextsProvider texts={errorTexts}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorTextsProvider>,
  );
}

describe('routes van de app', () => {
  test('/ is de publieke skeletpagina met de API-status (framework §3)', async () => {
    show('/');

    expect((await screen.findByRole('status')).textContent).toBe('API-status: ok');
  });

  test('een onbekend pad toont "Pagina niet gevonden"', async () => {
    show('/bestaat-niet');

    expect((await screen.findByRole('heading')).textContent).toBe('Pagina niet gevonden');
  });
});
