import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Avatar, initials } from './avatar.tsx';
import { initials as topbarInitials } from './topbar.tsx';

afterEach(cleanup);

test('ui-weergave-basis/AC-1: zonder src één benoemd img-element met verborgen initialen en geen <img>', () => {
  for (const src of [undefined, '']) {
    const { container, unmount } = render(<Avatar name="Anna de Vries" src={src} />);
    const avatar = screen.getByRole('img', { name: 'Anna de Vries' });
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(avatar.textContent).toBe('AV');
    const text = screen.getByText('AV');
    expect(text.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('img')).toBeNull();
    unmount();
  }
});

test('ui-weergave-basis/AC-2: afbeelding, fout naar initialen, nieuwe src opnieuw, zelfde src geen retry', () => {
  const { container, rerender } = render(<Avatar name="Anna de Vries" src="/a.svg" />);
  const image = container.querySelector('img');
  expect(image?.getAttribute('src')).toBe('/a.svg');
  expect(image?.getAttribute('alt')).toBe('Anna de Vries');
  expect(screen.queryByText('AV')).toBeNull();
  fireEvent.error(screen.getByRole('img', { name: 'Anna de Vries' }));
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByRole('img', { name: 'Anna de Vries' }).textContent).toBe('AV');
  rerender(<Avatar name="Anna de Vries" src="/a.svg" />);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('AV')).toBeTruthy();
  rerender(<Avatar name="Anna de Vries" src="/b.svg" />);
  expect(container.querySelector('img')?.getAttribute('src')).toBe('/b.svg');
  expect(screen.queryByText('AV')).toBeNull();
});

test('ui-weergave-basis/AC-3: decoratief heeft geen toegankelijke naam, met en zonder afbeelding', () => {
  const { container, rerender } = render(<Avatar name="Anna de Vries" src="/a.svg" decorative />);
  expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  fireEvent.error(container.querySelector('img') ?? document.body);
  const afterError = container.firstElementChild;
  expect(afterError?.getAttribute('aria-hidden')).toBe('true');
  expect(afterError?.hasAttribute('role')).toBe(false);
  expect(afterError?.hasAttribute('aria-label')).toBe(false);
  rerender(<Avatar name="Anna de Vries" decorative />);
  const root = container.firstElementChild;
  expect(root?.getAttribute('aria-hidden')).toBe('true');
  expect(root?.hasAttribute('role')).toBe(false);
  expect(screen.queryByRole('img')).toBeNull();
});

test('ui-weergave-basis/AC-4: maten, rond, initialen en lege namen', () => {
  const sizes = [
    ['sm', 'size-6'],
    ['md', 'size-9'],
    ['lg', 'size-12'],
  ] as const;
  for (const [size, expected] of sizes) {
    const { unmount } = render(<Avatar name="Anna de Vries" size={size} />);
    const avatar = screen.getByRole('img', { name: 'Anna de Vries' });
    expect(avatar.classList.contains(expected)).toBe(true);
    expect(avatar.classList.contains('rounded-full')).toBe(true);
    unmount();
  }
  const { unmount } = render(<Avatar name="Anna de Vries" />);
  expect(screen.getByRole('img', { name: 'Anna de Vries' }).classList.contains('size-9')).toBe(true);
  unmount();
  const image = render(<Avatar name="Anna de Vries" src="/a.svg" size="lg" />);
  const img = image.container.querySelector('img');
  expect(img?.classList.contains('size-12')).toBe(true);
  expect(img?.classList.contains('rounded-full')).toBe(true);
  image.unmount();
  expect(initials('  ada   van   dijk ')).toBe('AD');
  expect(initials('Élodie')).toBe('É');
  for (const name of ['', '   ']) {
    expect(() => render(<Avatar name={name} />)).toThrow();
    cleanup();
    const decorative = render(<Avatar name={name} decorative />);
    expect(decorative.container.textContent).toBe('?');
    decorative.unmount();
  }
});

test('ui-weergave-basis/AC-5: topbar her-exporteert dezelfde initials()', () => {
  expect(topbarInitials).toBe(initials);
});
