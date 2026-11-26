import { useEffect, useState, type RefObject } from 'react';
import type { z } from 'zod';
import { ApiError } from '#core/web/lib/api-client.ts';
import type { accountItem } from '#shared/contracts/accounts.ts';
import { copy } from '#web/copy/ui.ts';
import { ConfirmDialog, Notice, useErrorText } from '#web/ui/index.ts';
import { focusAfterDialog } from './focus-after-dialog.ts';
import { useSendResetLink } from './queries.ts';

// Resetlink sturen (spec accountbeheer-uitbreiding, accounts/AC-16): niet rood (geen destructieve actie); de fout blijft in de
// dialoog, ACCOUNT_DEACTIVATED met een eigen tekst (de algemene is de inlogfout). De lijst ververst in onSettled.
export function ResetLinkDialog({
  account,
  open,
  onClose,
  onSent,
}: {
  account: z.output<typeof accountItem>;
  open: boolean;
  onClose: () => void;
  onSent: (text: string) => void;
}) {
  const send = useSendResetLink();
  const errorText = useErrorText();
  const error = send.error;
  const message =
    error instanceof ApiError && error.code === 'ACCOUNT_DEACTIVATED'
      ? copy.accounts.resetLinkDialog.deactivated
      : errorText(error);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          send.reset();
          onClose();
        }
      }}
      title={copy.accounts.resetLinkDialog.title}
      description={copy.accounts.resetLinkDialog.description(account.naam)}
      confirmLabel={copy.accounts.resetLinkDialog.confirm}
      destructive={false}
      busy={send.isPending}
      onConfirm={() => {
        send.mutateAsync(account.id).then(
          () => {
            onSent(copy.accounts.resetLinkSent(account.email));
          },
          () => undefined,
        );
      }}
    >
      {send.isError ? <Notice tone="error">{message}</Notice> : null}
    </ConfirmDialog>
  );
}

// De dialoog van één rij. Na een gelukte verzending gaat hij weg zonder sluitanimatie (zoals de intrekdialoog); na verzenden én
// na annuleren (knop, Esc) krijgt de menuknop van de rij (`trigger`) de focus terug zodra de dialoog dicht is
// (focusAfterDialog: de native dialoog zou hem anders op het weggehaalde menu-item terugzetten).
export function useResetLinkDialog(
  account: z.output<typeof accountItem>,
  trigger: RefObject<HTMLElement | null>,
  onSent: (text: string) => void,
) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  // Na verzenden komt het sluiten uit een promise (geen discrete update): pas na de commit die de dialoog weghaalt de focus zetten.
  const [refocus, setRefocus] = useState(false);
  useEffect(() => {
    if (!refocus || mounted) return;
    setRefocus(false);
    focusAfterDialog(trigger);
  }, [refocus, mounted, trigger]);
  const dialog = mounted ? (
    <ResetLinkDialog
      account={account}
      open={open}
      onClose={() => {
        setOpen(false);
        focusAfterDialog(trigger);
      }}
      onSent={(text) => {
        setMounted(false);
        setOpen(false);
        setRefocus(true);
        onSent(text);
      }}
    />
  ) : null;
  return {
    dialog,
    ask: () => {
      setMounted(true);
      setOpen(true);
    },
  };
}
