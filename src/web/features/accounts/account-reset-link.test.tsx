import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { z } from 'zod';
import { createQueryClient } from '#core/web/lib/query.ts';
import type { accountItem } from '#shared/contracts/accounts.ts';
import { errorTexts } from '#web/copy/errors.ts';
import { ErrorTextsProvider, Table, TableBody } from '#web/ui/index.ts';
import { AccountRow } from './account-row.tsx';
import { accountKeys } from './queries.ts';
import { RevokeInvitationHost } from './revoke-invitation-dialog.tsx';

// Resetlink sturen in de accountlijst (spec accountbeheer-uitbreiding, accounts/AC-16 en het webdeel van accounts/AC-19): de
// volgorde van de menu-items, de eigen rij, de ConfirmDialog met zijn eigen ACCOUNT_DEACTIVATED-tekst. Het scherm loopt via
// AccountRow met de echte api-client; fetch is nagebootst.
type Account = z.output<typeof accountItem>;

const ACTIVE: Account = {
  id: 'account-1',
  naam: 'Anna',
  email: 'anna@example.test',
  rol: 'user',
  status: 'actief',
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

function show(account: Account = ACTIVE, myId = 'admin-1') {
  const client = createQueryClient();
  const key = [...accountKeys.all, 'list', {}];
  client.setQueryData(key, { items: [account], nextCursor: null });
  const onMessage = vi.fn();
  render(
    <ErrorTextsProvider texts={errorTexts}>
      <QueryClientProvider client={client}>
        <RevokeInvitationHost onRevoked={vi.fn()}>
          <Table label="Accounts">
            <TableBody>
              <AccountRow account={account} myId={myId} busy={false} onMessage={onMessage} />
            </TableBody>
          </Table>
        </RevokeInvitationHost>
      </QueryClientProvider>
    </ErrorTextsProvider>,
  );
  return { client, key, onMessage };
}

async function openMenu(naam = 'Anna'): Promise<void> {
  const trigger = screen.queryByRole('button', { name: `Acties voor ${naam}` });
  expect(trigger).not.toBeNull();
  if (trigger === null) return;
  fireEvent.keyDown(trigger, { key: 'Enter' });
  await screen.findByRole('menu');
}

async function openResetDialog() {
  await openMenu();
  const item = screen.queryByRole('menuitem', { name: 'Resetlink sturen' });
  expect(item).not.toBeNull();
  if (item !== null) fireEvent.click(item);
  const dialog = screen.queryByRole('alertdialog', { name: 'Resetlink sturen?' });
  expect(dialog).not.toBeNull();
  return dialog;
}

describe('accounts/AC-16: het menu voor een actief account', () => {
  test('accounts/AC-16: items in de volgorde Resetlink sturen, Blokkeren, Deactiveren', async () => {
    show();
    await openMenu();

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toStrictEqual([
      'Resetlink sturen',
      'Blokkeren',
      'Deactiveren',
    ]);
  });

  test('accounts/AC-16: de eigen rij heeft geen "Resetlink sturen" (en geen "Blokkeren"); eigen wachtwoord via /account', () => {
    show(ACTIVE, ACTIVE.id);
    const trigger = screen.queryByRole('button', { name: 'Acties voor Anna' });
    if (trigger !== null) fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(screen.queryByRole('menuitem', { name: 'Resetlink sturen' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Blokkeren' })).toBeNull();
  });
});

describe('accounts/AC-16: de bevestigingsdialoog', () => {
  test('accounts/AC-16: letterlijke teksten, focus op "Annuleren", niets verstuurd tot bevestigen', async () => {
    const calls = stubApi(200, null);
    show();
    const dialog = await openResetDialog();

    expect(dialog?.textContent).toContain(
      'Anna krijgt een mail met een link om een nieuw wachtwoord in te stellen. Het huidige wachtwoord blijft werken tot dan.',
    );
    expect(within(dialog ?? document.body).queryByRole('button', { name: 'Link sturen' })).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Annuleren' }));
    expect(calls).toStrictEqual([]);
  });

  test('accounts/AC-16: bevestigen stuurt POST /api/accounts/:id/reset-link, sluit de dialoog en meldt "Resetlink verstuurd naar {email}."', async () => {
    const calls = stubApi(200, null);
    const { onMessage } = show();
    const dialog = await openResetDialog();
    const confirm = within(dialog ?? document.body).queryByRole('button', { name: 'Link sturen' });
    expect(confirm).not.toBeNull();
    if (confirm !== null) fireEvent.click(confirm);

    await waitFor(() => {
      expect(calls).toStrictEqual([{ url: '/api/accounts/account-1/reset-link', method: 'POST' }]);
    });
    await waitFor(() => {
      expect(onMessage).toHaveBeenLastCalledWith({ tone: 'info', text: 'Resetlink verstuurd naar anna@example.test.' });
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  test('accounts/AC-16: ACCOUNT_DEACTIVATED toont de eigen tekst in de dialoog (niet de inlogfout), de dialoog blijft open', async () => {
    stubApi(409, { code: 'ACCOUNT_DEACTIVATED', requestId: 'r1' });
    const { onMessage } = show();
    const dialog = await openResetDialog();
    const confirm = within(dialog ?? document.body).queryByRole('button', { name: 'Link sturen' });
    expect(confirm).not.toBeNull();
    if (confirm !== null) fireEvent.click(confirm);

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')?.textContent).toContain(
        'Dit account is gedeactiveerd. Activeer het eerst.',
      );
    });
    expect(screen.queryByRole('alertdialog')?.textContent).not.toContain(errorTexts.ACCOUNT_DEACTIVATED);
    expect(onMessage).not.toHaveBeenCalledWith(expect.objectContaining({ tone: 'info' }));
  });

  test('accounts/AC-16: ook na een fout is de accountlijst ongeldig verklaard (onSettled)', async () => {
    const calls = stubApi(409, { code: 'ACCOUNT_BLOCKED', requestId: 'r2' });
    const { client, key } = show();
    const dialog = await openResetDialog();
    const confirm = within(dialog ?? document.body).queryByRole('button', { name: 'Link sturen' });
    expect(confirm).not.toBeNull();
    if (confirm !== null) fireEvent.click(confirm);

    await waitFor(() => {
      expect(calls.map((call) => call.method)).toStrictEqual(['POST']);
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    });
  });
});

// Focusvolgorde (accounts/AC-16): ververst de lijst terwijl de menuknop de focus heeft (zoekterm in de URL na de debounce, een
// refetch), dan blijft die focus staan. Een `disabled` knop verloor hem in de browser, waardoor de focus na het annuleren van de
// dialoog soms op body viel (e2e/account-reset-link.spec.ts). Tijdens het verversen opent het menu niet.
describe('accounts/AC-16: de menuknop tijdens het verversen van de lijst', () => {
  function row(busy: boolean) {
    return (
      <ErrorTextsProvider texts={errorTexts}>
        <QueryClientProvider client={createQueryClient()}>
          <RevokeInvitationHost onRevoked={vi.fn()}>
            <Table label="Accounts">
              <TableBody>
                <AccountRow account={ACTIVE} myId="admin-1" busy={busy} onMessage={vi.fn()} />
              </TableBody>
            </Table>
          </RevokeInvitationHost>
        </QueryClientProvider>
      </ErrorTextsProvider>
    );
  }

  test('accounts/AC-16: de knop blijft focusbaar en houdt de focus; het menu opent niet zolang de lijst ververst', () => {
    const { rerender } = render(row(false));
    const trigger = screen.getByRole('button', { name: 'Acties voor Anna' });
    trigger.focus();
    rerender(row(true));

    expect(trigger.hasAttribute('disabled')).toBe(false);
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(trigger);
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.queryByRole('menu')).toBeNull();

    rerender(row(false));
    expect(document.activeElement).toBe(trigger);
    expect(trigger.hasAttribute('aria-disabled')).toBe(false);
  });
});
