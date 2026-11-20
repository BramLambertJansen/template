import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Gallery } from './gallery.tsx';
import { Image } from './image.tsx';

afterEach(cleanup);

const base = { src: '/a.svg', alt: 'Groene bergen', unavailableText: 'Afbeelding niet beschikbaar.' };

test('ui-weergave-basis/AC-6: één lazy <img> met alt, volle breedte, object-cover en standaard aspect-video', () => {
  const { container } = render(<Image {...base} />);
  expect(container.querySelectorAll('img')).toHaveLength(1);
  const image = screen.getByRole('img', { name: 'Groene bergen' });
  expect(image.getAttribute('alt')).toBe('Groene bergen');
  expect(image.getAttribute('loading')).toBe('lazy');
  for (const name of ['w-full', 'object-cover', 'aspect-video', 'rounded-lg']) {
    expect(image.classList.contains(name)).toBe(true);
  }
});

test('ui-weergave-basis/AC-7: ratio bepaalt de aspect-klasse van afbeelding en fallback', () => {
  const ratios = [
    ['square', 'aspect-square'],
    ['video', 'aspect-video'],
    ['portrait', 'aspect-3/4'],
  ] as const;
  for (const [ratio, expected] of ratios) {
    const { container, unmount } = render(<Image {...base} ratio={ratio} />);
    expect(container.querySelector('img')?.classList.contains(expected)).toBe(true);
    fireEvent.error(container.querySelector('img') ?? document.body);
    expect(screen.getByRole('status').classList.contains(expected)).toBe(true);
    unmount();
  }
});

test('ui-weergave-basis/AC-8: fout toont de fallbacktekst, nieuwe src probeert opnieuw, lege src direct fallback', () => {
  const { container, rerender } = render(<Image {...base} />);
  fireEvent.error(screen.getByRole('img', { name: 'Groene bergen' }));
  expect(container.querySelector('img')).toBeNull();
  const fallback = screen.getByRole('status');
  expect(fallback.tagName).toBe('P');
  expect(fallback.textContent).toBe('Afbeelding niet beschikbaar.');
  rerender(<Image {...base} />);
  expect(container.querySelector('img')).toBeNull();
  rerender(<Image {...base} src="/b.svg" />);
  expect(container.querySelector('img')?.getAttribute('src')).toBe('/b.svg');
  rerender(<Image {...base} src="" />);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('Afbeelding niet beschikbaar.');
});

test('ui-weergave-basis/AC-9: alt-controle bij runtime; decoratief met lege alt en verborgen fallback', () => {
  for (const alt of ['', '   ']) {
    expect(() => render(<Image {...base} alt={alt} />)).toThrow();
    cleanup();
  }
  expect(() => render(<Image {...base} decorative />)).toThrow();
  cleanup();
  const { container } = render(<Image {...base} alt="" decorative />);
  expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  fireEvent.error(container.querySelector('img') ?? document.body);
  const fallback = container.querySelector('p');
  expect(fallback?.getAttribute('aria-hidden')).toBe('true');
  expect(fallback?.hasAttribute('role')).toBe(false);
  expect(screen.queryByRole('status')).toBeNull();
});

test('ui-weergave-basis/AC-10: Gallery blijft los van Image en accepteert elke alt zoals voorheen', () => {
  render(
    <Gallery
      label="Foto’s"
      items={[{ id: 'spaties', src: '/a.svg', alt: '   ' }]}
      unavailableText="Afbeelding niet beschikbaar."
    />,
  );
  expect(screen.getByRole('list', { name: 'Foto’s' }).querySelector('img')?.getAttribute('alt')).toBe('   ');
});
