import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { roles } from '#shared/roles.ts';
import { meQuery } from '#web/lib/session.ts';
import { DevRoleSwitcher } from './role-switcher.tsx';

// De dev-rolwisselaar met een register van de app (spec rollenregister, AC-15): een knop per rol uit het register, dus ook de
// rollen die de app zelf toevoegt. Het register en de namen zijn hier die van de spec (planner, eigenaar, toezicht).
vi.mock('#shared/roles.ts', async () => {
  const { defineRoles } = await import('#core/shared/roles.ts');
  return { roles: defineRoles({ planner: { beheer: false }, eigenaar: { beheer: true }, toezicht: { beheer: true } }) };
});
vi.mock('#web/copy/ui.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#web/copy/ui.ts')>()),
  roleLabels: {
    user: 'Gebruiker',
    admin: 'Beheerder',
    planner: 'Planner',
    eigenaar: 'Eigenaar',
    toezicht: 'Toezicht',
  },
}));

afterEach(cleanup);

async function show(current: string) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(meQuery.queryKey, { id: 'x', naam: 'X', email: 'x@x', rol: current, tweestap: false });
  const root = createRootRoute({ component: DevRoleSwitcher });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return screen.findByRole('button', { name: 'Rol wisselen (alleen lokaal)' });
}

describe('DevRoleSwitcher met een rollenregister', () => {
  test('rollenregister/AC-15: het paneel toont een knop per rol uit het register, ook de rollen van de app', async () => {
    fireEvent.click(await show('eigenaar'));

    const labels = ['Gebruiker', 'Beheerder', 'Planner', 'Eigenaar', 'Toezicht'];
    expect(roles.names).toHaveLength(labels.length);
    const buttons = labels.map((name) => screen.getByRole('button', { name }));
    expect(buttons).toHaveLength(roles.names.length);
  });

  test('rollenregister/AC-15: alleen de huidige rol is gemarkeerd', async () => {
    fireEvent.click(await show('toezicht'));

    const pressed = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.textContent);
    expect(pressed).toStrictEqual(['Toezicht']);
  });
});
