import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { ApiError } from '../lib/api-client.ts';
import { AsyncView } from './async-view.tsx';
import { Button } from './button.tsx';

afterEach(cleanup);

const id = '3f6c2a9e-1b4d-4c8e-9a7f-2d5e8b1c0a64';

function referenceText() {
  return screen.queryByText((_, element) => element?.tagName === 'P' && element.textContent === `Referentie: ${id}`);
}

function follows(first: Element, second: Element): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function Failing({ error }: { readonly error: Error }) {
  const query = useQuery({ queryKey: ['fout'], queryFn: () => Promise.reject(error), retry: false });
  return <AsyncView query={query}>{() => null}</AsyncView>;
}

function Stale({ load }: { readonly load: () => Promise<string[]> }) {
  const query = useQuery({
    queryKey: ['verouderd'],
    queryFn: load,
    initialData: ['Anna'],
    staleTime: Infinity,
    retry: false,
  });
  return (
    <>
      <Button onClick={() => void query.refetch()}>Verversen</Button>
      <AsyncView query={query} refresh={{ refreshingLabel: 'Verversen…', staleLabel: 'Mogelijk verouderd.' }}>
        {(data) => <p>{data.join(', ')}</p>}
      </AsyncView>
    </>
  );
}

function withClient(children: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>);
}

describe('AsyncView: foutreferentie', () => {
  test('foutreferentie/AC-10: binnen de alert-container, na de foutzin en vóór "Opnieuw proberen"', async () => {
    withClient(<Failing error={new ApiError('INTERNAL_ERROR', 500, id)} />);

    const retry = await screen.findByRole('button', { name: 'Opnieuw proberen' });
    const container = retry.closest('[role="alert"]');
    const reference = referenceText();
    const copy = screen.getByRole('button', { name: 'Referentie kopiëren' });
    const sentence = container?.querySelector('p');

    expect(container).not.toBeNull();
    expect(reference).not.toBeNull();
    expect(container?.contains(reference)).toBe(true);
    expect(container?.contains(copy)).toBe(true);
    if (sentence === null || sentence === undefined || reference === null)
      throw new Error('foutzin of referentie ontbreekt');
    expect(sentence.textContent).not.toContain('Referentie');
    expect(follows(sentence, reference)).toBe(true);
    expect(follows(reference, copy)).toBe(true);
    expect(follows(copy, retry)).toBe(true);
  });

  test.each([
    ['een ApiError 400 met id', new ApiError('VALIDATION', 400, id)],
    ['een ApiError 500 zonder id', new ApiError('INTERNAL_ERROR', 500)],
  ])('foutreferentie/AC-10: geen referentie bij %s', async (_, error) => {
    withClient(<Failing error={error} />);

    await screen.findByRole('button', { name: 'Opnieuw proberen' });
    expect(document.body.textContent).not.toContain('Referentie');
    expect(screen.queryByRole('button', { name: 'Referentie kopiëren' })).toBeNull();
  });

  test('foutreferentie/AC-11: verouderd met een 503 toont de referentie; na een geslaagde refetch is hij weg', async () => {
    let fail: (error: Error) => void = () => undefined;
    let calls = 0;
    withClient(
      <Stale
        load={() => {
          calls += 1;
          return calls === 1
            ? new Promise<string[]>((_, reject) => {
                fail = reject;
              })
            : Promise.resolve(['Bert']);
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Verversen' }));
    await screen.findByText('Verversen…');
    act(() => {
      fail(new ApiError('UNAVAILABLE', 503, id));
    });

    const retry = await screen.findByRole('button', { name: 'Opnieuw proberen' });
    const container = retry.closest('[role="alert"]');
    expect(container?.textContent).toContain('Mogelijk verouderd.');
    expect(container?.contains(referenceText())).toBe(true);
    expect(container?.contains(screen.getByRole('button', { name: 'Referentie kopiëren' }))).toBe(true);
    expect(screen.getByText('Anna')).toBeDefined();

    fireEvent.click(retry);
    await screen.findByText('Bert');
    expect(referenceText()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Referentie kopiëren' })).toBeNull();
  });
});
