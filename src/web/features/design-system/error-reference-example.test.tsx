import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, expect, test } from 'vitest';
import { AsyncAndErrorSections } from './additional-examples.tsx';

afterEach(cleanup);

function renderSections() {
  const route = createRootRoute({ component: AsyncAndErrorSections });
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/'] }) });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

// e2e/design-system.spec.ts zoekt na "Opnieuw proberen" precies één status in de regio "RouteError en NotFound"; een
// CopyButton rendert altijd een (lege) status, dus het referentievoorbeeld staat in een eigen sectie (spec foutreferentie).
test('de regio RouteError en NotFound heeft na opnieuw proberen precies één status en geen referentie', async () => {
  renderSections();
  const errors = within(await screen.findByRole('region', { name: 'RouteError en NotFound' }));
  fireEvent.click(errors.getByRole('button', { name: 'Opnieuw proberen' }));
  expect(errors.getAllByRole('status').map((status) => status.textContent)).toStrictEqual([
    'Opnieuw geprobeerd (voorbeeld).',
  ]);
  expect(errors.queryByRole('button', { name: 'Referentie kopiëren' })).toBeNull();
});

test('de sectie ErrorReference toont een fictieve serverfout met referentie en kopieerknop', async () => {
  renderSections();
  const reference = within(await screen.findByRole('region', { name: 'ErrorReference' }));
  expect(reference.getAllByText('3f6c2a9e-1b4d-4c8e-9a7f-2d5e8b1c0a64').length).toBeGreaterThan(0);
  expect(reference.getAllByRole('button', { name: 'Referentie kopiëren' }).length).toBeGreaterThan(0);
});
