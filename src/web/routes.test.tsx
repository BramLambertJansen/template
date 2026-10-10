import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createQueryClient } from '#core/web/lib/query.ts';
import { ErrorTextsProvider } from '#core/web/ui/error-texts.tsx';
import { errorTexts } from '#web/copy/errors.ts';
import { createAppRouter } from '#web/lib/router.ts';

// De bestandsroutes van de app (routeTree.gen.ts) met dezelfde router als main.tsx; de API is hier nagebootst (de echte
// flows staan in e2e/accounts.spec.ts). Spec accountbeheer: AC-1, AC-2, AC-3 (deels), AC-7.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Me = { id: string; naam: string; email: string; rol: 'user' | 'admin' } | null;

function show(path: string, me: Me) {
  vi.stubGlobal('fetch', (input: string) => {
    const url = input;
    if (url.endsWith('/api/me')) {
      return Promise.resolve(
        me === null
          ? new Response(JSON.stringify({ code: 'UNAUTHENTICATED', requestId: 'r' }), { status: 401 })
          : new Response(JSON.stringify(me)),
      );
    }
    return Promise.resolve(new Response(JSON.stringify({ items: [], nextCursor: null })));
  });
  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  render(
    <ErrorTextsProvider texts={errorTexts}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorTextsProvider>,
  );
  return router;
}

const user = { id: 'u1', naam: 'Anna de Vries', email: 'anna@example.test', rol: 'user' } as const;
const admin = { ...user, id: 'a1', naam: 'Bea Beheer', rol: 'admin' } as const;

describe('routes van de app', () => {
  test('anoniem op /: naar /login, zonder sidebar of topbar (AC-1)', async () => {
    const router = show('/', null);

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Inloggen');
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({ redirect: '/' });
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Profielmenu' })).toBeNull();
  });

  test('user op /: Home, sidebar met alleen Home, profielmenu rechts (AC-2)', async () => {
    show('/', user);

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Home');
    const nav = screen.getAllByRole('navigation', { name: 'Hoofdmenu' })[0];
    expect(
      within(nav ?? document.body)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toStrictEqual(['Home']);
    expect(screen.getByRole('button', { name: 'Profielmenu' }).textContent).toBe('AV');
  });

  test('user op /admin: "Je hebt geen toegang tot deze pagina." (AC-7)', async () => {
    show('/admin', user);

    expect((await screen.findByRole('alert')).textContent).toBe('Je hebt geen toegang tot deze pagina.');
  });

  test('admin op /admin: Dashboard met de link Accounts, sidebar met Home en Dashboard (AC-3)', async () => {
    show('/admin', admin);

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Dashboard');
    expect(screen.getByRole('link', { name: 'Accounts' }).getAttribute('href')).toBe('/admin/accounts');
    const nav = screen.getAllByRole('navigation', { name: 'Hoofdmenu' })[0];
    expect(
      within(nav ?? document.body)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toStrictEqual(['Home', 'Dashboard']);
  });

  test('al ingelogd op /login: door naar de start van de rol', async () => {
    const router = show('/login', admin);

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Dashboard');
    expect(router.state.location.pathname).toBe('/admin');
  });

  test('/uitnodiging zonder token: één melding, geen formulier', async () => {
    show('/uitnodiging', null);

    expect((await screen.findByRole('alert')).textContent).toBe(errorTexts.INVITATION_INVALID);
    expect(screen.queryByLabelText('Wachtwoord')).toBeNull();
  });

  test('een onbekend pad toont "Pagina niet gevonden"', async () => {
    show('/bestaat-niet', null);

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Pagina niet gevonden');
  });
});
