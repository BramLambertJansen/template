import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { z } from 'zod';
import { createQueryClient } from '#core/web/lib/query.ts';
import { accountsSearch, type accountItem } from '#shared/contracts/accounts.ts';
import { errorTexts } from '#web/copy/errors.ts';
import { ErrorTextsProvider } from '#web/ui/index.ts';
import { accountKeys } from './queries.ts';
import { AccountsPage } from './accounts-page.tsx';

// Focus na het intrekken van een uitnodiging (spec accountbeheer-uitbreiding, accounts/AC-15, focusvolgorde): AccountsPage met
// de echte host, queries en api-client; alleen fetch en de router-hooks zijn nagebootst.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
}));

// Een serverfout (500) wordt tot twee keer herhaald met backoff (shouldRetry): de refetch faalt pas na ongeveer drie seconden.
const REFETCH_FAILS = { timeout: 8000 };

type Account = z.output<typeof accountItem>;

function account(id: string, naam: string, status: Account['status'] = 'uitgenodigd'): Account {
  return {
    id,
    naam,
    email: `${naam.toLowerCase()}@example.test`,
    rol: 'user',
    status,
    aangemaakt: '2026-10-21T08:00:00Z',
    laatstIngelogd: null,
    gedeactiveerd: false,
    geblokkeerd: false,
  };
}

const ANNA = account('a-1', 'Anna');
const BERT = account('b-1', 'Bert');

const original = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterAll(() => {
  if (original === undefined) Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  else Object.defineProperty(HTMLDialogElement.prototype, 'showModal', original);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Eerste GET /accounts geeft `before`, elke volgende (de refetch na het intrekken) `after`, of een 500 als `after` null is.
function stubApi(before: readonly Account[], after: readonly Account[] | null): void {
  let lists = 0;
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
    if (init?.method === 'DELETE') return json(200, null);
    if (url.startsWith('/api/me')) {
      return json(200, { id: 'admin-1', naam: 'Admin', email: 'admin@example.test', rol: 'admin', tweestap: true });
    }
    lists += 1;
    if (lists === 1) return json(200, { items: before, nextCursor: null });
    return after === null
      ? json(500, { code: 'INTERNAL_ERROR', requestId: 'r2' })
      : json(200, { items: after, nextCursor: null });
  });
}

async function revokeAnna() {
  const client = createQueryClient();
  render(
    <ErrorTextsProvider texts={errorTexts}>
      <QueryClientProvider client={client}>
        <AccountsPage />
      </QueryClientProvider>
    </ErrorTextsProvider>,
  );
  const trigger = await screen.findByRole('button', { name: 'Acties voor Anna' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Uitnodiging intrekken' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'Uitnodiging intrekken?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Intrekken' }));
  return client;
}

describe('accounts/AC-15: focus na intrekken op AccountsPage', () => {
  test('accounts/AC-15: de rij is weg en er blijven rijen: de focus gaat naar de region "Accounts"', async () => {
    stubApi([ANNA, BERT], [BERT]);
    await revokeAnna();

    await waitFor(() => {
      expect(screen.queryByText('anna@example.test')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Accounts' }));
    });
  });

  test('accounts/AC-15: de lijst is leeg na het intrekken: de focus gaat naar de knop "Account uitnodigen"', async () => {
    stubApi([ANNA], []);
    await revokeAnna();

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Account uitnodigen' }));
    });
    expect(screen.queryByRole('region', { name: 'Accounts' })).toBeNull();
  });

  test('accounts/AC-15: de refetch faalt en de rij blijft: de focus verschuift niet naar de region', async () => {
    stubApi([ANNA, BERT], null);
    const client = await revokeAnna();

    await waitFor(() => {
      expect((client.getQueryState(accountKeys.list(accountsSearch.web.parse({})))?.errorUpdatedAt ?? 0) > 0).toBe(
        true,
      );
    }, REFETCH_FAILS);
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    // AsyncView toont de fout in plaats van de tabel; de rij zit nog in de gecachete data, dus de focus blijft staan.
    expect(screen.queryAllByRole('alert').length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: 'Accounts' })).toBeNull();
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Account uitnodigen' }));
  }, 15_000);

  test('accounts/AC-15: de refetch slaagt maar de rij staat er nog: de focus gaat niet naar de region', async () => {
    stubApi([ANNA, BERT], [ANNA, BERT]);
    const client = await revokeAnna();
    const key = accountKeys.list(accountsSearch.web.parse({}));

    // De dialoog sluit na het gelukte intrekken; onSettled heeft de lijst dan al gemarkeerd. Daarna wachten tot de refetch klaar is.
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    await waitFor(() => {
      const state = client.getQueryState(key);
      expect(state?.isInvalidated === false && state.fetchStatus === 'idle').toBe(true);
    });
    expect(screen.getByText('anna@example.test')).toBeDefined();
    const region = screen.getByRole('region', { name: 'Accounts' });
    expect(document.activeElement).not.toBe(region);
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Account uitnodigen' }));
  });
});
