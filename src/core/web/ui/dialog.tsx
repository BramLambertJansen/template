import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './button.tsx';
import { cn } from './cn.ts';

// Dialoog op het native <dialog> (showModal): modaal, focus gevangen, Esc annuleert, focus terug naar de opener.
// Geen Radix Dialog: die vergrendelt het scrollen met een inline <style>, wat de CSP (style-src 'self') blokkeert
// (framework §6); hier doet CSS dat (body:has(dialog[open]) in styles/index.css).
//
// Varianten: 'modal' (gecentreerd, voor formulieren en bevestigingen) en 'sheet' (schuift vanaf links over het scherm, op
// volle hoogte; voor navigatie op smalle schermen). Een klik op de verduisterde strook naast de sheet sluit hem.

interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly closeLabel?: string;
  readonly variant?: 'modal' | 'sheet';
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  // false: Esc en de sluitknop doen niets (bijv. terwijl een bevestigde actie loopt).
  readonly dismissible?: boolean;
}

// Openen en sluiten via CSS-overgangen; bij prefers-reduced-motion zijn ze ingekort (styles/index.css).
const variantClasses = {
  modal: 'm-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border bg-popover text-popover-foreground',
  sheet:
    'my-0 ms-0 me-auto h-dvh max-h-none w-72 max-w-[calc(100%-3rem)] border-e bg-sidebar text-sidebar-foreground ' +
    'transition-[translate,overlay,display] transition-discrete duration-200 ease-out ' +
    '-translate-x-full open:translate-x-0 starting:open:-translate-x-full ' +
    'backdrop:transition-[opacity,overlay,display] backdrop:transition-discrete backdrop:duration-200 ' +
    'backdrop:opacity-0 open:backdrop:opacity-100 starting:open:backdrop:opacity-0',
} as const;

function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Focus op een element met data-autofocus (ConfirmDialog: "Annuleren"), anders op het eerste veld (spec accountbeheer).
      // React's autoFocus vuurt vóór showModal, als de dialoog nog dicht is, en zonder veld kiest showModal zelf (de sluitknop).
      (
        dialog.querySelector<HTMLElement>('[data-autofocus]') ??
        dialog.querySelector<HTMLElement>('input, select, textarea')
      )?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return ref;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel = 'Sluiten',
  variant = 'modal',
  children,
  footer,
  dismissible = true,
}: DialogProps) {
  const ref = useModal(open);
  const id = useId();
  const sheet = variant === 'sheet';

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-titel`}
      aria-describedby={description === undefined ? undefined : `${id}-uitleg`}
      onClose={() => {
        onOpenChange(false);
      }}
      onCancel={(event) => {
        if (!dismissible) event.preventDefault();
      }}
      // Een klik op de backdrop heeft de <dialog> zelf als doel; binnen de sheet is het doel altijd een kind.
      onClick={(event) => {
        if (dismissible && sheet && event.target === event.currentTarget) onOpenChange(false);
      }}
      className={cn('p-0 shadow-lg', variantClasses[variant])}
    >
      {/* Een modal begint elke keer leeg (formulieren); een sheet blijft staan, zodat hij ook dicht kan schuiven. */}
      {open || sheet ? (
        <div className={sheet ? 'flex h-full flex-col' : 'flex flex-col gap-4 p-6'}>
          <div className={cn('flex items-start justify-between gap-4', sheet && 'items-center border-b px-4 py-2')}>
            <div className="flex flex-col gap-1.5">
              <h2
                id={`${id}-titel`}
                className={sheet ? 'text-base font-semibold' : 'text-lg leading-none font-semibold'}
              >
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
              disabled={!dismissible}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className={sheet ? 'min-h-0 flex-1 overflow-y-auto' : 'contents'}>{children}</div>
          {footer === undefined ? null : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
          )}
        </div>
      ) : null}
    </dialog>
  );
}
