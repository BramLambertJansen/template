import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';

// Melding op de pagina: status (bijv. "Uitnodiging verstuurd naar …") of fout. role volgt de soort, zodat een schermlezer
// een fout meteen voorleest en een status beleefd.
const noticeVariants = cva('rounded-md border px-3 py-2 text-sm', {
  variants: {
    tone: {
      info: 'border-border bg-muted text-foreground',
      error: 'border-destructive bg-background font-medium text-destructive',
    },
  },
  defaultVariants: { tone: 'info' },
});

export function Notice({
  tone = 'info',
  children,
}: {
  readonly tone?: 'info' | 'error';
  readonly children: ReactNode;
}) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={noticeVariants({ tone })}>
      {children}
    </p>
  );
}
