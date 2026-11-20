import { cva } from 'class-variance-authority';
import { useState } from 'react';
import { assert } from '#core/shared/assert.ts';
import { cn } from './cn.ts';

// Initialen: eerste letter van het eerste en het laatste woord (ook voor de profielknop van Topbar).
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '');
  const first = Array.from(words[0] ?? '')[0] ?? '?';
  const last = words.length > 1 ? (Array.from(words.at(-1) ?? '')[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

const avatarVariants = cva('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full', {
  variants: {
    size: {
      sm: 'size-6 text-xs',
      md: 'size-9 text-sm',
      lg: 'size-12 text-base',
    },
  },
  defaultVariants: { size: 'md' },
});

export interface AvatarProps {
  readonly name: string;
  // Ook expliciet undefined: een app geeft vaak een optioneel profielveld door.
  readonly src?: string | undefined;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly decorative?: boolean;
  readonly className?: string;
}

// Profielfoto of initialen (spec ui-weergave-basis). Na een laadfout de initialen; een nieuwe src probeert opnieuw.
export function Avatar({ name, src, size = 'md', decorative = false, className }: AvatarProps) {
  assert(decorative || name.trim() !== '', 'Avatar needs a non-empty name unless decorative');
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const classes = cn(avatarVariants({ size }), className);
  if (src !== undefined && src !== '' && failedSource !== src) {
    return (
      <img
        src={src}
        alt={decorative ? '' : name}
        className={cn(classes, 'object-cover')}
        onError={() => {
          setFailedSource(src);
        }}
      />
    );
  }
  const label = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name };
  return (
    <span {...label} className={cn(classes, 'bg-secondary font-semibold text-secondary-foreground')}>
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}
