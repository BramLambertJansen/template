import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { ApiError } from '../lib/api-client.ts';
import { ForbiddenError } from '../lib/guard.ts';
import { ErrorTextsProvider } from './error-texts.tsx';
import { RouteError } from './route-error.tsx';

afterEach(cleanup);

const id = '3f6c2a9e-1b4d-4c8e-9a7f-2d5e8b1c0a64';

// Een route waarvan de loader met de gegeven fout faalt; RouteError is de ErrorBoundary.
function show(error: Error) {
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({
    getParentRoute: () => root,
    path: '/lijst',
    loader: () => Promise.reject(error),
    component: () => 'lijst geladen',
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/lijst'] }),
    defaultErrorComponent: RouteError,
  });
  return render(
    <ErrorTextsProvider
      texts={{
        FORBIDDEN: 'Je hebt geen toegang tot deze pagina.',
        INTERNAL_ERROR: 'Er ging iets mis.',
        NOT_FOUND: 'Niet gevonden.',
      }}
    >
      <RouterProvider router={router} />
    </ErrorTextsProvider>,
  );
}

function follows(first: Element, second: Element): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

async function settled(container: HTMLElement): Promise<number> {
  await screen.findAllByRole('alert');
  return container.querySelectorAll('*').length;
}

describe('RouteError: foutreferentie', () => {
  test('foutreferentie/AC-7: na de foutzin "Referentie: <id>" en de kopieerknop, vóór "Opnieuw proberen"', async () => {
    show(new ApiError('INTERNAL_ERROR', 500, id));

    const sentence = await screen.findByText('Er ging iets mis.');
    const reference = screen.getByText(
      (_, element) => element?.tagName === 'P' && element.textContent === `Referentie: ${id}`,
    );
    const copy = screen.getByRole('button', { name: 'Referentie kopiëren' });
    const retry = screen.getByRole('button', { name: 'Opnieuw proberen' });

    expect(sentence.contains(reference)).toBe(false);
    expect(follows(sentence, reference)).toBe(true);
    expect(follows(reference, copy)).toBe(true);
    expect(follows(copy, retry)).toBe(true);
  });

  test('foutreferentie/AC-8: geen rechten toont geen referentie', async () => {
    show(new ForbiddenError());

    expect((await screen.findByRole('alert')).textContent).toBe('Je hebt geen toegang tot deze pagina.');
    expect(document.body.textContent).not.toContain('Referentie');
    expect(screen.queryByRole('button', { name: 'Referentie kopiëren' })).toBeNull();
  });

  test('foutreferentie/AC-8: een 404 met geldige id toont geen referentie en geen extra element', async () => {
    const withId = await settled(show(new ApiError('NOT_FOUND', 404, id)).container);
    expect(document.body.textContent).not.toContain('Referentie');
    expect(screen.queryByRole('button', { name: 'Referentie kopiëren' })).toBeNull();
    cleanup();

    const withoutId = await settled(show(new ApiError('NOT_FOUND', 404)).container);
    expect(withId).toBe(withoutId);
  });

  test('foutreferentie/AC-8: een 500 zonder id toont geen referentie en geen extra element', async () => {
    const withoutId = await settled(show(new ApiError('INTERNAL_ERROR', 500)).container);
    expect(document.body.textContent).not.toContain('Referentie');
    expect(screen.queryByRole('button', { name: 'Referentie kopiëren' })).toBeNull();
    cleanup();

    // Een fout die geen ApiError is, kreeg en krijgt de bestaande weergave.
    const plain = await settled(show(new Error('x')).container);
    expect(withoutId).toBe(plain);
  });
});
