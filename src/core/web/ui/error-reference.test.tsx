import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, createApiClient } from '../lib/api-client.ts';
import { AsyncView } from './async-view.tsx';
import { ErrorReference } from './error-reference.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const id = '3f6c2a9e-1b4d-4c8e-9a7f-2d5e8b1c0a64';

function referenceText(text: string) {
  return screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === text);
}

function clipboard(writeText: (value: string) => Promise<void>) {
  vi.stubGlobal('navigator', { clipboard: { writeText } });
}

test('foutreferentie/AC-9: kopiëren zet precies de id op het klembord en meldt succes; de knop is een native knop', async () => {
  const write = vi.fn(() => Promise.resolve());
  clipboard(write);
  render(<ErrorReference error={new ApiError('INTERNAL_ERROR', 500, id)} />);
  expect(referenceText(`Referentie: ${id}`)).toBeDefined();
  const button = screen.getByRole('button', { name: 'Referentie kopiëren' });
  // Enter en Spatie activeren een native <button type="button"> zelf (R-UI-06); de klik is hetzelfde pad.
  expect(button.tagName).toBe('BUTTON');
  expect(button.getAttribute('type')).toBe('button');
  button.focus();
  fireEvent.click(button);
  await screen.findByText('Referentie gekopieerd.');
  expect(write).toHaveBeenCalledExactlyOnceWith(id);
  expect(document.activeElement).toBe(button);
});

test('foutreferentie/AC-9: een geweigerd klembord meldt de fout en de referentie blijft zichtbaar', async () => {
  clipboard(() => Promise.reject(new Error('denied')));
  render(<ErrorReference error={new ApiError('INTERNAL_ERROR', 500, id)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Referentie kopiëren' }));
  await screen.findByText('Kopiëren is niet gelukt. Selecteer en kopieer de tekst zelf.');
  expect(referenceText(`Referentie: ${id}`)).toBeDefined();
});

test.each([
  ['een ApiError onder 500', new ApiError('NOT_FOUND', 404, id)],
  ['een ApiError 500 zonder id', new ApiError('INTERNAL_ERROR', 500)],
  ['een gewone fout', Object.assign(new Error('x'), { status: 500, requestId: id })],
  ['geen fout', undefined],
])('zonder referentie-voorwaarde rendert ErrorReference niets: %s', (_, error) => {
  const { container } = render(<ErrorReference error={error} />);
  expect(container.childElementCount).toBe(0);
});

test('foutreferentie/AC-15: van een foutbody met message, stack en detail komt alleen de requestId in de DOM', async () => {
  const contract = { method: 'GET', path: '/items', input: z.object({}).strict(), output: z.null() } as const;
  const client = createApiClient<readonly [typeof contract]>();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        Response.json(
          { code: 'INTERNAL_ERROR', requestId: id, message: 'geheim', stack: 'geheim', detail: 'geheim' },
          { status: 500 },
        ),
      ),
    ),
  );
  function Example() {
    const query = useQuery({
      queryKey: ['geheim'],
      queryFn: () => client.call(`${contract.method} ${contract.path}`, {}),
      retry: false,
    });
    return (
      <>
        <AsyncView query={query}>{() => null}</AsyncView>
        {query.error === null ? null : <ErrorReference error={query.error} />}
      </>
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Example />
    </QueryClientProvider>,
  );
  await screen.findAllByText((_, element) => element?.tagName === 'P' && element.textContent === `Referentie: ${id}`);
  expect(document.body.textContent).not.toContain('geheim');
  expect(document.body.textContent).not.toContain('INTERNAL_ERROR');
  expect(document.body.textContent).not.toContain('500');
});
