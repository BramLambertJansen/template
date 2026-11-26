import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { z } from 'zod';
import { createQueryClient } from '#core/web/lib/query.ts';
import { accountsSearch, type accountItem } from '#shared/contracts/accounts.ts';
import { errorTexts } from '#web/copy/errors.ts';
import { ErrorTextsProvider, Table, TableBody } from '#web/ui/index.ts';
import { AccountRow } from './account-row.tsx';
import { accountKeys, useAccounts } from './queries.ts';
import { RevokeInvitationHost } from './revoke-invitation-dialog.tsx';

// Uitnodiging intrekken in de accountlijst (spec accountbeheer-uitbreiding, accounts/AC-15 en het intrekdeel van
// accounts/AC-19): de items in het menu "Acties voor {naam}", de ConfirmDialog met zijn eigen foutregel en de
// invalidatie van de lijst in onSettled. Het scherm loopt via AccountRow met de echte api-client; fetch is nagebootst.
// Een serverfout (500) wordt tot twee keer herhaald met backoff (shouldRetry): de refetch faalt pas na ongeveer drie seconden.
const REFETCH_FAILS = { timeout: 8000 };

type Account = z.output<typeof accountItem>;

const INVITED: Account = {
  id: 'uitgenodigd-1',
  naam: 'Anna',
  email: 'anna@example.test',
  rol: 'user',
  status: 'uitgenodigd',
  aangemaakt: '2026-10-21T08:00:00Z',
  laatstIngelogd: null,
  gedeactiveerd: false,
  geblokkeerd: false,
};

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

interface Call {
  readonly url: string;
  readonly method: string;
}

function stubApi(status: number, body: unknown): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET' });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  });
  return calls;
}

function show(account: Account = INVITED) {
  const client = createQueryClient();
  const key = [...accountKeys.all, 'list', {}];
  client.setQueryData(key, { items: [account], nextCursor: null });
  const onMessage = vi.fn();
  const onRevoked = vi.fn();
  render(
    <ErrorTextsProvider texts={errorTexts}>
      <QueryClientProvider client={client}>
        <RevokeInvitationHost onRevoked={onRevoked}>
          <Table label="Accounts">
            <TableBody>
              <AccountRow account={account} myId="admin-1" busy={false} onMessage={onMessage} />
            </TableBody>
          </Table>
        </RevokeInvitationHost>
      </QueryClientProvider>
    </ErrorTextsProvider>,
  );
  return { client, key, onMessage, onRevoked };
}

async function openMenu(naam = 'Anna'): Promise<void> {
  const trigger = screen.queryByRole('button', { name: `Acties voor ${naam}` });
  expect(trigger).not.toBeNull();
  if (trigger === null) return;
  fireEvent.keyDown(trigger, { key: 'Enter' });
  await screen.findByRole('menu');
}

async function openRevokeDialog() {
  await openMenu();
  const item = screen.queryByRole('menuitem', { name: 'Uitnodiging intrekken' });
  expect(item).not.toBeNull();
  if (item !== null) fireEvent.click(item);
  const dialog = screen.queryByRole('alertdialog', { name: 'Uitnodiging intrekken?' });
  expect(dialog).not.toBeNull();
  return dialog;
}

describe('accounts/AC-15: het menu voor een uitgenodigd account', () => {
  test('accounts/AC-15: menuknop "Acties voor {naam}" met precies "Opnieuw uitnodigen" en "Uitnodiging intrekken"', async () => {
    show();
    await openMenu();

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toStrictEqual([
      'Opnieuw uitnodigen',
      'Uitnodiging intrekken',
    ]);
    // De losse knop "Opnieuw uitnodigen" is een menu-item geworden.
    expect(screen.queryByRole('button', { name: 'Opnieuw uitnodigen' })).toBeNull();
  });

  test('accounts/AC-15: "Opnieuw uitnodigen" in het menu roept nog steeds reinvite aan', async () => {
    const calls = stubApi(200, null);
    show();
    await openMenu();
    const item = screen.queryByRole('menuitem', { name: 'Opnieuw uitnodigen' });
    expect(item).not.toBeNull();
    if (item !== null) fireEvent.click(item);

    await waitFor(() => {
      expect(calls).toStrictEqual([{ url: '/api/accounts/uitgenodigd-1/reinvite', method: 'POST' }]);
    });
  });
});

describe('accounts/AC-15: de bevestigingsdialoog', () => {
  test('accounts/AC-15: letterlijke teksten, focus op "Annuleren", niets verstuurd tot bevestigen', async () => {
    const calls = stubApi(200, null);
    show();
    const dialog = await openRevokeDialog();

    expect(dialog?.textContent).toContain(
      'De link aan anna@example.test werkt niet meer en het account verdwijnt uit de lijst.',
    );
    expect(within(dialog ?? document.body).queryByRole('button', { name: 'Intrekken' })).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Annuleren' }));
    expect(calls).toStrictEqual([]);
  });

  test('accounts/AC-15: bevestigen stuurt DELETE /api/accounts/:id/invitation, sluit de dialoog en meldt de intrekking', async () => {
    const calls = stubApi(200, null);
    const { onRevoked } = show();
    const dialog = await openRevokeDialog();
    const confirm = within(dialog ?? document.body).queryByRole('button', { name: 'Intrekken' });
    expect(confirm).not.toBeNull();
    if (confirm !== null) fireEvent.click(confirm);

    await waitFor(() => {
      expect(calls).toStrictEqual([{ url: '/api/accounts/uitgenodigd-1/invitation', method: 'DELETE' }]);
    });
    await waitFor(() => {
      expect(onRevoked).toHaveBeenLastCalledWith(INVITED, 'De uitnodiging aan anna@example.test is ingetrokken.');
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  test('accounts/AC-15: ALREADY_ACTIVE toont de eigen tekst in de dialoog (niet de algemene), de dialoog blijft open', async () => {
    stubApi(409, { code: 'ALREADY_ACTIVE', requestId: 'r1' });
    const { onMessage, onRevoked } = show();
    const dialog = await openRevokeDialog();
    const confirm = within(dialog ?? document.body).queryByRole('button', { name: 'Intrekken' });
    expect(confirm).not.toBeNull();
    if (confirm !== null) fireEvent.click(confirm);

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')?.textContent).toContain(
        'Dit account is inmiddels actief; de uitnodiging is al gebruikt.',
      );
    });
    expect(screen.queryByRole('alertdialog')?.textContent).not.toContain(errorTexts.ALREADY_ACTIVE);
    expect(onRevoked).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalledWith(expect.objectContaining({ tone: 'info' }));
  });
});

async function revokeAndExpectInvalidated(status: number, body: unknown): Promise<void> {
  const calls = stubApi(status, body);
  const { client, key } = show();
  const dialog = await openRevokeDialog();
  const confirm = within(dialog ?? document.body).queryByRole('button', { name: 'Intrekken' });
  expect(confirm).not.toBeNull();
  await act(async () => {
    if (confirm !== null) fireEvent.click(confirm);
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(calls.map((call) => call.method)).toStrictEqual(['DELETE']);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
}

describe('accounts/AC-15 en accounts/AC-19: de lijst wordt ververst (onSettled)', () => {
  test('accounts/AC-15: na gelukt intrekken is de accountlijst ongeldig verklaard', async () => {
    await revokeAndExpectInvalidated(200, null);
  });

  test('accounts/AC-15: ook na een fout (mogelijk na commit) is de accountlijst ongeldig verklaard', async () => {
    await revokeAndExpectInvalidated(500, { code: 'INTERNAL_ERROR' });
  });

  test('accounts/AC-15: ook na ALREADY_ACTIVE is de accountlijst ongeldig verklaard', async () => {
    await revokeAndExpectInvalidated(409, { code: 'ALREADY_ACTIVE' });
  });
});

// Een echte observer op de lijst (zoals AccountsPage): na de mutatie haalt onSettled de lijst opnieuw op en die geeft nu een
// andere status. De dialoog hoort dan zijn eigen foutregel te houden.
function ObservedRows({ search }: { search: ReturnType<typeof accountsSearch.web.parse> }) {
  const accounts = useAccounts(search);
  const items = accounts.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <RevokeInvitationHost onRevoked={vi.fn()}>
      <Table label="Accounts">
        <TableBody>
          {items.map((account) => (
            <AccountRow key={account.id} account={account} myId="admin-1" busy={false} onMessage={vi.fn()} />
          ))}
        </TableBody>
      </Table>
    </RevokeInvitationHost>
  );
}

function renderObserved(
  client: ReturnType<typeof createQueryClient>,
  search: ReturnType<typeof accountsSearch.web.parse>,
) {
  render(
    <ErrorTextsProvider texts={errorTexts}>
      <QueryClientProvider client={client}>
        <ObservedRows search={search} />
      </QueryClientProvider>
    </ErrorTextsProvider>,
  );
}

describe('accounts/AC-15: refetch-race met een echte lijst-observer', () => {
  test('accounts/AC-15: de lijst meldt na de mutatie "actief" (409 ALREADY_ACTIVE): de dialoog blijft open met de eigen tekst', async () => {
    const active: Account = { ...INVITED, status: 'actief' };
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return Promise.resolve(
          new Response(JSON.stringify({ code: 'ALREADY_ACTIVE', requestId: 'r1' }), { status: 409 }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ items: [active], nextCursor: null }), { status: 200 }));
    });
    const client = createQueryClient();
    client.setQueryData(accountKeys.list(accountsSearch.web.parse({})), {
      pages: [{ items: [INVITED], nextCursor: null }],
      pageParams: [null],
    });
    renderObserved(client, accountsSearch.web.parse({}));
    const dialog = await openRevokeDialog();
    const confirm = within(dialog ?? document.body).queryByRole('button', { name: 'Intrekken' });
    expect(confirm).not.toBeNull();
    if (confirm !== null) fireEvent.click(confirm);

    // Eerst wachten tot de refetch de rij 'Actief' toont, pas daarna toetsen dat de dialoog zijn eigen fout houdt.
    await waitFor(() => {
      expect(screen.queryByRole('row')?.textContent).toContain('Actief');
    });
    expect(screen.queryByRole('alertdialog')?.textContent).toContain(
      'Dit account is inmiddels actief; de uitnodiging is al gebruikt.',
    );
    expect(screen.queryByRole('alertdialog')?.textContent).not.toContain(errorTexts.ALREADY_ACTIVE);
  });

  test('accounts/AC-15: observer met statusfilter uitgenodigd: de rij verdwijnt na de refetch, de dialoog blijft open met de fout', async () => {
    const search = accountsSearch.web.parse({ status: 'uitgenodigd' });
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return Promise.resolve(
          new Response(JSON.stringify({ code: 'ALREADY_ACTIVE', requestId: 'r1' }), { status: 409 }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    });
    const client = createQueryClient();
    client.setQueryData(accountKeys.list(search), {
      pages: [{ items: [INVITED], nextCursor: null }],
      pageParams: [null],
    });
    renderObserved(client, search);
    const dialog = await openRevokeDialog();
    const confirm = within(dialog ?? document.body).queryByRole('button', { name: 'Intrekken' });
    expect(confirm).not.toBeNull();
    if (confirm !== null) fireEvent.click(confirm);

    await waitFor(() => {
      expect(screen.queryByRole('row')).toBeNull();
    });
    expect(screen.queryByRole('alertdialog')?.textContent).toContain(
      'Dit account is inmiddels actief; de uitnodiging is al gebruikt.',
    );
  });

  test('accounts/AC-15: intrekken lukt maar de refetch faalt (rij blijft staan): "Uitnodiging intrekken" opent opnieuw een dialoog', async () => {
    const search = accountsSearch.web.parse({});
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Promise.resolve(new Response(JSON.stringify(null), { status: 200 }));
      return Promise.resolve(
        new Response(JSON.stringify({ code: 'INTERNAL_ERROR', requestId: 'r2' }), { status: 500 }),
      );
    });
    const client = createQueryClient();
    client.setQueryData(accountKeys.list(search), {
      pages: [{ items: [INVITED], nextCursor: null }],
      pageParams: [null],
    });
    renderObserved(client, search);
    const dialog = await openRevokeDialog();
    const confirm = within(dialog ?? document.body).queryByRole('button', { name: 'Intrekken' });
    expect(confirm).not.toBeNull();
    if (confirm !== null) fireEvent.click(confirm);

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    await waitFor(() => {
      const state = client.getQueryState(accountKeys.list(search));
      expect(state?.status === 'error' || (state?.errorUpdatedAt ?? 0) > 0).toBe(true);
    }, REFETCH_FAILS);
    expect(screen.queryByRole('row')?.textContent).toContain('anna@example.test');

    await openMenu();
    const item = screen.queryByRole('menuitem', { name: 'Uitnodiging intrekken' });
    expect(item).not.toBeNull();
    if (item !== null) fireEvent.click(item);
    expect(screen.queryByRole('alertdialog', { name: 'Uitnodiging intrekken?' })).not.toBeNull();
  }, 15_000);
});
