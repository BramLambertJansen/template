import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createQueryClient } from '#core/web/lib/query.ts';
import { ErrorTextsProvider } from '#core/web/ui/error-texts.tsx';
import { errorTexts } from '#web/copy/errors.ts';
import { createAppRouter } from '#web/lib/router.ts';

// Spec accountbeheer-uitbreiding, accounts/AC-27: de sectie "Herstelcodes" op /account staat er alleen bij tweestap true,
// ongeacht de rol. De API is hier nagebootst (de echte flow staat in e2e/backup-codes.spec.ts).
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(rol: 'user' | 'admin', tweestap: boolean) {
  vi.stubGlobal('fetch', (url: string) => {
    if (url.startsWith('/api/me/sessions')) return Promise.resolve(new Response(JSON.stringify({ items: [] })));
    return Promise.resolve(
      new Response(JSON.stringify({ id: 'u1', naam: 'Anna de Vries', email: 'anna@example.test', rol, tweestap })),
    );
  });
  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: ['/account'] }));
  render(
    <ErrorTextsProvider texts={errorTexts}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorTextsProvider>,
  );
}

async function sectionTitles(): Promise<string[]> {
  await screen.findByRole('textbox', { name: 'Naam' });
  return screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
}

describe('/account: sectie Herstelcodes (accounts/AC-27)', () => {
  test('accounts/AC-27: een user met tweestap true ziet de sectie Herstelcodes', async () => {
    show('user', true);

    expect(await sectionTitles()).toContain('Herstelcodes');
    expect(screen.getByRole('button', { name: 'Nieuwe herstelcodes maken' })).toBeTruthy();
  });

  test('accounts/AC-27: een user met tweestap false ziet de sectie niet', async () => {
    show('user', false);

    expect(await sectionTitles()).not.toContain('Herstelcodes');
  });

  test('accounts/AC-27: een admin met tweestap false ziet de sectie niet (niet de rol beslist)', async () => {
    show('admin', false);

    expect(await sectionTitles()).not.toContain('Herstelcodes');
  });

  test('accounts/AC-27: een admin met tweestap true ziet de sectie', async () => {
    show('admin', true);

    expect(await sectionTitles()).toContain('Herstelcodes');
  });
});
