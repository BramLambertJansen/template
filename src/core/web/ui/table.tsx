import type { ComponentProps, Ref } from 'react';
import { cn } from './cn.ts';

// Tabel (spec accountbeheer). De omhulling scrolt zelf horizontaal, zodat de pagina op 375 px niet breder wordt.
// relative: anders hangt een absoluut element (sr-only kolomkop) aan de pagina en steekt het buiten beeld.
// Met het toetsenbord te scrollen (WCAG 2.1.1, axe scrollable-region-focusable): de omhulling is focusbaar en heeft een naam.
// regionRef: wie de focus naar de tabel wil zetten, zet hem op deze omhulling; alleen die draagt naam en focusring
// (spec accountbeheer-uitbreiding, focus na intrekken).
export function Table({
  className,
  label,
  regionRef,
  ...props
}: ComponentProps<'table'> & { readonly label: string; readonly regionRef?: Ref<HTMLDivElement> | undefined }) {
  return (
    <div
      ref={regionRef}
      role="region"
      aria-label={label}
      tabIndex={0}
      className="relative w-full overflow-x-auto rounded-lg border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-table-header [&_tr]:border-table-row', className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-table-row', className)} {...props} />;
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn('h-11 px-3 text-left align-middle font-medium whitespace-nowrap text-table-header', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-3 py-table-cell-y align-middle whitespace-nowrap', className)} {...props} />;
}
