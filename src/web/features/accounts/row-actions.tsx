import { useState } from 'react';
import type { z } from 'zod';
import type { accountItem } from '#shared/contracts/accounts.ts';
import { copy } from '#web/copy/ui.ts';
import { Button, DropdownMenu, useErrorText, type MenuItem } from '#web/ui/index.ts';
import { useActivate, useReinvite, useUnblock } from './queries.ts';
import { AccountStatusDialog } from './account-status-dialog.tsx';
import { useRevokeHost } from './revoke-invitation-dialog.tsx';

type Account = z.output<typeof accountItem>;
export type AccountMessage = { readonly tone: 'info' | 'error'; readonly text: string } | null;

export interface AccountHandlers {
  readonly unblock: () => void;
  readonly activate: () => void;
  readonly askBlock: () => void;
  readonly askDeactivate: () => void;
  readonly reinvite: () => void;
  readonly askRevoke: () => void;
}

// Spec accountbeheer-uitbreiding: uitgenodigd "Opnieuw uitnodigen" en "Uitnodiging intrekken"; de eigen rij geen uitschakelacties.
export function itemsFor(account: Account, isOwn: boolean, handlers: AccountHandlers): readonly MenuItem[] {
  if (account.status === 'uitgenodigd') {
    return [
      { label: copy.accounts.reinvite, onSelect: handlers.reinvite },
      { label: copy.accounts.revoke, onSelect: handlers.askRevoke },
    ];
  }
  if (isOwn) return [];
  return [
    account.geblokkeerd
      ? { label: copy.accounts.unblock, onSelect: handlers.unblock }
      : { label: copy.accounts.block, onSelect: handlers.askBlock },
    account.gedeactiveerd
      ? { label: copy.accounts.activate, onSelect: handlers.activate }
      : { label: copy.accounts.deactivate, onSelect: handlers.askDeactivate },
  ];
}

export function AccountActions({
  account,
  isOwn,
  busy,
  onMessage,
}: {
  account: Account;
  isOwn: boolean;
  busy: boolean;
  onMessage: (message: AccountMessage) => void;
}) {
  const unblock = useUnblock();
  const activate = useActivate();
  const reinvite = useReinvite();
  const [confirming, setConfirming] = useState<'block' | 'deactivate' | null>(null);
  // De intrekdialoog staat bij de host (AccountsPage), los van de rijen (spec accountbeheer-uitbreiding, focusvolgorde).
  const revokeHost = useRevokeHost();
  const errorText = useErrorText();
  const pending = unblock.isPending || activate.isPending || reinvite.isPending;
  const succeed = (text: string) => {
    setConfirming(null);
    onMessage({ tone: 'info', text });
  };
  const fail = (error: unknown) => {
    onMessage({ tone: 'error', text: errorText(error) });
  };
  const ask = (action: 'block' | 'deactivate') => {
    onMessage(null);
    setConfirming(action);
  };
  const run = (work: () => Promise<unknown>, text: string) => {
    onMessage(null);
    work().then(() => {
      succeed(text);
    }, fail);
  };
  const items = itemsFor(account, isOwn, {
    unblock: () => {
      run(() => unblock.mutateAsync(account.id), copy.accounts.unblocked(account.naam));
    },
    activate: () => {
      run(() => activate.mutateAsync(account.id), copy.accounts.activated(account.naam));
    },
    reinvite: () => {
      run(() => reinvite.mutateAsync(account.id), copy.inviteDialog.sent(account.email));
    },
    askBlock: () => {
      ask('block');
    },
    askDeactivate: () => {
      ask('deactivate');
    },
    askRevoke: () => {
      onMessage(null);
      revokeHost(account);
    },
  });
  if (items.length === 0) return null;
  const close = () => {
    setConfirming(null);
  };
  return (
    <>
      <DropdownMenu
        trigger={
          <Button variant="outline" disabled={busy || pending}>
            {copy.accounts.rowActions(account.naam)}
          </Button>
        }
        items={items.map((item) => ({ ...item, disabled: busy || pending }))}
      />
      {/* De intrekdialoog leeft in RevokeInvitationHost, niet in de rij (spec accountbeheer-uitbreiding). */}
      <AccountStatusDialog account={account} action={confirming} onClose={close} onChanged={succeed} />
    </>
  );
}
