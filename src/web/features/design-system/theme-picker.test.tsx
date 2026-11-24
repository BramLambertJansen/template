import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { defineThemes } from '#core/web/lib/theme.ts';
import { ThemePicker } from './theme-picker.tsx';

// Spec app-thema: de themakiezer op /design-system (AC-16) en geen kiezer zonder thema's (AC-17). <html> blijft ongemoeid.
// Een eigen register: de voorbeeldthema's van de app mogen weg (de e2e toont de meegeleverde strak en zacht).
const themes = defineThemes({ strak: { label: 'Strak' }, zacht: { label: 'Zacht' } });
afterEach(cleanup);

test('app-thema/AC-16: de kiezer toont Standaard, Strak en Zacht en geeft de keuze door zonder <html> te wijzigen', () => {
  const onChange = vi.fn();
  render(<ThemePicker themes={themes} value={null} onChange={onChange} />);
  const select = screen.getByRole('combobox', { name: 'Thema' });
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toStrictEqual([
    'Standaard',
    'Strak',
    'Zacht',
  ]);
  fireEvent.change(select, { target: { value: 'zacht' } });
  fireEvent.change(select, { target: { value: '' } });
  expect(onChange.mock.calls).toStrictEqual([['zacht'], [null]]);
  expect(document.documentElement.hasAttribute('data-app-theme')).toBe(false);
});

test('app-thema/AC-17: met defineThemes({}) rendert de catalogus geen kiezer', () => {
  const { container } = render(<ThemePicker themes={defineThemes({})} value={null} onChange={vi.fn()} />);
  expect(container.innerHTML).toBe('');
});
