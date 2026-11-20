import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { RelativeTime } from './relative-time.tsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function timeElement(container: HTMLElement): HTMLTimeElement {
  const elements = container.querySelectorAll('time');
  expect(elements).toHaveLength(1);
  const element = elements.item(0);
  expect(element).toBeInstanceOf(HTMLTimeElement);
  return element;
}

function visibleText(element: HTMLElement): string {
  return element.firstChild?.textContent ?? '';
}

test('relatieve-tijd/AC-7: één time-element met dateTime, title, korte tekst en de volledige datum voor schermlezers', () => {
  const { container } = render(<RelativeTime iso="2026-11-13T09:57:00Z" now={new Date('2026-11-13T10:00:00Z')} />);
  const element = timeElement(container);
  expect(element.getAttribute('datetime')).toBe('2026-11-13T09:57:00Z');
  expect(element.getAttribute('title')).toBe('13 november 2026 om 10:57');
  expect(visibleText(element)).toBe('3 minuten geleden');
  expect(element.textContent).toBe('3 minuten geleden (13 november 2026 om 10:57)');
  const hidden = element.querySelector('.sr-only');
  expect(hidden?.textContent).toBe(' (13 november 2026 om 10:57)');
});

test('relatieve-tijd/AC-8: zonder now rekent hij met de klok bij render en zet geen timer', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-13T10:00:00Z'));
  const { container } = render(<RelativeTime iso="2026-11-12T09:00:00Z" />);
  const element = timeElement(container);
  expect(visibleText(element)).toBe('gisteren');
  act(() => {
    vi.advanceTimersByTime(60 * 60 * 1000);
  });
  expect(visibleText(element)).toBe('gisteren');
  expect(vi.getTimerCount()).toBe(0);
});

test('relatieve-tijd/AC-9: geen interactief element: geen tabIndex en geen rol', () => {
  const { container } = render(<RelativeTime iso="2026-11-13T09:57:00Z" now={new Date('2026-11-13T10:00:00Z')} />);
  const element = timeElement(container);
  expect(element.hasAttribute('tabindex')).toBe(false);
  expect(element.hasAttribute('role')).toBe(false);
  expect(screen.queryByRole('button')).toBeNull();
});
