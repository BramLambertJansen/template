import { createContext, useContext, useState, type ReactNode } from 'react';
import type { z } from 'zod';
import { assert } from '#core/shared/assert.ts';
import { ApiError } from '#core/web/lib/api-client.ts';
import type { accountItem } from '#shared/contracts/accounts.ts';
import { copy } from '#web/copy/ui.ts';
import { ConfirmDialog, Notice, useErrorText } from '#web/ui/index.ts';
import { useRevokeInvitation } from './queries.ts';

type Account = z.output<typeof accountItem>;

// Uitnodiging intrekken (spec accountbeheer-uitbreiding, accounts/AC-15): de fout blijft in de dialoog; ALREADY_ACTIVE met een
// eigen tekst (de genodigde accepteerde intussen). De lijst ververst in onSettled van de mutatie.
export function RevokeInvitationDialog({
  account,
  open,
  onClose,
  onRevoked,
}: {
  account: Account;
  open: boolean;
  onClose: () => void;
  onRevoked: (text: string) => void;
}) {
  const revoke = useRevokeInvitation();
  const errorText = useErrorText();
  const error = revoke.error;
  const message =
    error instanceof ApiError && error.code === 'ALREADY_ACTIVE'
      ? copy.accounts.revokeDialog.alreadyActive
      : errorText(error);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          revoke.reset();
          onClose();
        }
      }}
      title={copy.accounts.revokeDialog.title}
      description={copy.accounts.revokeDialog.description(account.email)}
      confirmLabel={copy.accounts.revokeDialog.confirm}
      busy={revoke.isPending}
      onConfirm={() => {
        revoke.mutateAsync(account.id).then(
          () => {
            onRevoked(copy.accounts.revoked(account.email));
          },
          () => undefined,
        );
      }}
    >
      {revoke.isError ? <Notice tone="error">{message}</Notice> : null}
    </ConfirmDialog>
  );
}

type AskRevoke = (account: Account) => void;
const RevokeHostContext = createContext<AskRevoke | null>(null);

// De rij vraagt de host om de dialoog; de host is verplicht (één pad: de dialoog leeft in RevokeInvitationHost).
export function useRevokeHost(): AskRevoke {
  const ask = useContext(RevokeHostContext);
  assert(ask !== null, 'useRevokeHost vraagt een RevokeInvitationHost boven de rij');
  return ask;
}

// Host van de intrekdialoog (spec accountbeheer-uitbreiding, focusvolgorde): de dialoog en zijn mutatiestatus hangen niet aan de
// rij. Het account is een momentopname bij het openen, zodat de dialoog met zijn fout blijft staan als een statusfilter de rij
// na de refetch weghaalt of de lijst leeg wordt. Bij elke opening is de dialoog weer bruikbaar, ook als de rij na een
// geslaagde intrekking blijft staan (refetch faalde). Na een geslaagde intrekking gaat de dialoog weg zonder sluitanimatie;
// de focus zet de ouder in onRevoked (met het account). De refetch is dan nog niet klaar: onSettled start hem zonder erop te
// wachten, dus de ouder wacht zelf op de volgende dataUpdatedAt/errorUpdatedAt (useFocusAfterRevoke). Sluiten door de gebruiker
// loopt via de dialoog zelf (animatie, focus terug op de opener).
export function RevokeInvitationHost({
  children,
  onRevoked,
}: {
  children: ReactNode;
  onRevoked: (account: Account, text: string) => void;
}) {
  const [target, setTarget] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const ask = (account: Account) => {
    setTarget(account);
    setOpen(true);
  };
  return (
    <RevokeHostContext.Provider value={ask}>
      {children}
      {target === null ? null : (
        <RevokeInvitationDialog
          key={target.id}
          account={target}
          open={open}
          onClose={() => {
            setOpen(false);
          }}
          onRevoked={(text) => {
            setTarget(null);
            setOpen(false);
            onRevoked(target, text);
          }}
        />
      )}
    </RevokeHostContext.Provider>
  );
}
