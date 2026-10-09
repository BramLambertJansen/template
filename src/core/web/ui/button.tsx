import { Slot } from '@radix-ui/react-slot';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { buttonVariants } from './button-recipe.ts';
import { cn } from './cn.ts';

export { buttonBase, buttonVariantMap, buttonVariants } from './button-recipe.ts';

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    // Rendert het kind (bijv. een link) met de stijl van een knop.
    readonly asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, type = 'button', ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component className={cn(buttonVariants({ variant, size }), className)} {...(asChild ? {} : { type })} {...props} />
  );
}
