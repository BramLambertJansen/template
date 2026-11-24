import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

// Rand met 3:1 contrast (--input), 44 px hoog, focusring; aria-invalid kleurt de rand (Form/FormField zet het).
export const inputBase =
  'flex min-h-control w-full rounded-control border-control border-input bg-control px-control-x text-base text-control ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-[invalid=true]:border-destructive';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn(inputBase, className)} {...props} />;
}
