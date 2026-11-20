import { cva } from 'class-variance-authority';
import { useState } from 'react';
import { assert } from '#core/shared/assert.ts';
import { cn } from './cn.ts';

const imageVariants = cva('w-full rounded-lg', {
  variants: {
    ratio: {
      square: 'aspect-square',
      video: 'aspect-video',
      portrait: 'aspect-3/4',
    },
  },
  defaultVariants: { ratio: 'video' },
});

export interface ImageProps {
  readonly src: string;
  readonly alt: string;
  readonly unavailableText: string;
  readonly ratio?: 'square' | 'video' | 'portrait';
  readonly decorative?: boolean;
  readonly className?: string;
}

// Losse afbeelding met vaste beeldverhouding (spec ui-weergave-basis); het foutpatroon volgt Gallery: na een fout de
// fallback met tekst in dezelfde verhouding, een nieuwe src probeert opnieuw, geen retryloop.
export function Image({ src, alt, unavailableText, ratio = 'video', decorative = false, className }: ImageProps) {
  assert(decorative ? alt === '' : alt.trim() !== '', 'Image needs a non-empty alt, or an empty alt when decorative');
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const classes = imageVariants({ ratio });
  if (src === '' || failedSource === src) {
    const status = decorative ? { 'aria-hidden': true } : { role: 'status' };
    return (
      <p
        {...status}
        className={cn(classes, 'flex items-center justify-center bg-muted p-4 text-muted-foreground', className)}
      >
        {unavailableText}
      </p>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={cn(classes, 'object-cover', className)}
      onError={() => {
        setFailedSource(src);
      }}
    />
  );
}
