import type { ReactNode } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { Dialog } from './dialog.tsx';

// Bevestiging vóór een actie die je niet zomaar terugdraait (roadmap 3f): blokkeren, verwijderen, sessies beëindigen.
// De focus staat bij openen op "Annuleren", zodat Enter of een dubbele klik niets kapotmaakt. Tijdens `busy` zijn beide
// knoppen uit en toont de bevestigknop "Bezig…"; sluiten doet de ouder na succes (bijv. in onSuccess van de mutatie).
// Een fout toont de ouder als children (bijv. <Notice>), zodat de dialoog open blijft.

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  // Werkwoord van de actie ("Blokkeren"), niet "OK" of "Ja".
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  // Rood voor verwijderen en blokkeren; standaard aan, want daar is deze dialoog voor.
  readonly destructive?: boolean;
  readonly busy?: boolean;
  readonly children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = true,
  busy = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!busy}
      title={title}
      description={description}
      closeLabel={uiTexts.close}
      footer={
        <>
          <Button
            variant="outline"
            data-autofocus=""
            disabled={busy}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {uiTexts.cancel}
          </Button>
          <Button variant={destructive ? 'destructive' : 'primary'} disabled={busy} onClick={onConfirm}>
            {busy ? uiTexts.busy : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
