import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Carousel } from './carousel.tsx';

afterEach(cleanup);

test('een ouderwissel trekt focus niet terug na bewust verlaten van de dia zonder volgend focusdoel', () => {
  const items = [
    { id: 'first', label: 'Eerste', content: <input aria-label="Invoer" /> },
    { id: 'second', label: 'Tweede', content: 'Tweede inhoud' },
  ];
  const onValueChange = vi.fn();
  const { rerender } = render(<Carousel label="Beelden" items={items} value="first" onValueChange={onValueChange} />);
  const input = screen.getByRole('textbox', { name: 'Invoer' });
  input.focus();
  input.blur();
  expect(document.activeElement).toBe(document.body);
  rerender(<Carousel label="Beelden" items={items} value="second" onValueChange={onValueChange} />);
  expect(screen.getByRole('group', { name: '2 van 2: Tweede' })).toBeTruthy();
  expect(document.activeElement).toBe(document.body);
  expect(onValueChange).not.toHaveBeenCalled();
});
