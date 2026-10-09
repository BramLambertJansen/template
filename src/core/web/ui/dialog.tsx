import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './button.tsx';

// Dialoog op het native <dialog> (showModal): modaal, focus gevangen, Esc annuleert, focus terug naar de opener.
// Geen Radix Dialog: die vergrendelt het scrollen met een inline <style>, wat de CSP (style-src 'self') blokkeert
// (framework §6); hier doet CSS dat (body:has(dialog[open]) in styles/index.css).

interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly closeLabel?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel = 'Sluiten',
  children,
  footer,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-titel`}
      aria-describedby={description === undefined ? undefined : `${id}-uitleg`}
      onClose={() => {
        onOpenChange(false);
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border bg-popover p-0 text-popover-foreground shadow-lg"
    >
      {open ? (
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 id={`${id}-titel`} className="text-lg leading-none font-semibold">
                {title}
              </h2>
              {description === undefined ? null : (
                <p id={`${id}-uitleg`} className="text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={closeLabel}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          {children}
          {footer === undefined ? null : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
          )}
        </div>
      ) : null}
    </dialog>
  );
}
