import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { OfflineNotice } from './offline-notice.tsx';

// Offline-melding (spec offline-en-print): nagebootste navigator.onLine en window-events, nep-timers.
const OFFLINE = 'Je bent offline. Wijzigingen worden niet opgeslagen tot de verbinding terug is.';
const BACK_ONLINE = 'Weer online.';

let online = true;

beforeEach(() => {
  online = true;
  vi.useFakeTimers();
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function goOffline() {
  online = false;
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
}

function goOnline() {
  online = true;
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

test('offline-en-print/AC-1: online bij het mounten rendert niets', () => {
  const { container } = render(<OfflineNotice />);
  expect(screen.queryByRole('status')).toBeNull();
  expect(container.textContent).toBe('');
  expect(screen.queryByText(OFFLINE)).toBeNull();
  expect(screen.queryByText(BACK_ONLINE)).toBeNull();
});

test('offline-en-print/AC-2: een offline-event toont één status met de offline-tekst en laat de focus staan', () => {
  render(
    <>
      <input aria-label="veld" />
      <OfflineNotice />
    </>,
  );
  const field = screen.getByLabelText('veld');
  field.focus();
  goOffline();
  const statuses = screen.getAllByRole('status');
  expect(statuses).toHaveLength(1);
  expect(statuses[0]?.textContent).toBe(OFFLINE);
  expect(document.activeElement).toBe(field);
});

test('offline-en-print/AC-3: offline bij het mounten toont de offline-tekst direct, zonder "Weer online."', () => {
  online = false;
  render(<OfflineNotice />);
  expect(screen.getByRole('status').textContent).toBe(OFFLINE);
  expect(screen.queryByText(BACK_ONLINE)).toBeNull();
});

test('offline-en-print/AC-4: na herstel staat "Weer online." precies 5000 ms in hetzelfde soort element', () => {
  online = false;
  render(<OfflineNotice />);
  const offlineElement = screen.getByRole('status');
  goOnline();
  const restored = screen.getByRole('status');
  expect(restored.textContent).toBe(BACK_ONLINE);
  expect(restored.tagName).toBe(offlineElement.tagName);
  expect(screen.queryByText(OFFLINE)).toBeNull();
  advance(4999);
  expect(screen.getByRole('status').textContent).toBe(BACK_ONLINE);
  advance(1);
  expect(screen.queryByRole('status')).toBeNull();
});

test('offline-en-print/AC-5: een online-event zonder voorafgaande offline-staat toont niets, ook twee keer', () => {
  render(<OfflineNotice />);
  goOnline();
  goOnline();
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByText(BACK_ONLINE)).toBeNull();
});

test('offline-en-print/AC-6: offline tijdens "Weer online." blijft staan; een nieuw herstel start opnieuw 5000 ms', () => {
  online = false;
  render(<OfflineNotice />);
  goOnline();
  advance(3000);
  goOffline();
  expect(screen.getByRole('status').textContent).toBe(OFFLINE);
  advance(5000);
  expect(screen.getByRole('status').textContent).toBe(OFFLINE);

  goOnline();
  advance(4999);
  expect(screen.getByRole('status').textContent).toBe(BACK_ONLINE);
  advance(1);
  expect(screen.queryByRole('status')).toBeNull();
});

test('offline-en-print/AC-7: twee offline-events geven één element met de tekst één keer', () => {
  const { container } = render(<OfflineNotice />);
  goOffline();
  goOffline();
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(container.textContent).toBe(OFFLINE);
});

test('offline-en-print/AC-8: na unmount zijn de listeners weg, loopt er geen timer en geven events geen waarschuwing', () => {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const consoleError = vi.spyOn(console, 'error');
  online = false;
  const { unmount } = render(<OfflineNotice />);
  goOnline();
  expect(vi.getTimerCount()).toBeGreaterThan(0);

  unmount();
  for (const type of ['online', 'offline']) {
    const handlers = add.mock.calls.filter(([name]) => name === type).map(([, handler]) => handler);
    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) {
      expect(remove.mock.calls.some(([name, removed]) => name === type && removed === handler)).toBe(true);
    }
  }
  expect(vi.getTimerCount()).toBe(0);

  goOffline();
  goOnline();
  advance(5000);
  expect(consoleError).not.toHaveBeenCalled();
});

test('offline-en-print/AC-9: geen knop, link of tabindex; klassen per staat gelijk aan Notice, beide print:hidden', () => {
  online = false;
  const { container } = render(<OfflineNotice />);
  expect(container.querySelector('button, a, [tabindex]')).toBeNull();
  const offlineClasses = [...screen.getByRole('status').classList];
  expect(offlineClasses).toEqual(expect.arrayContaining(['border-warning', 'text-warning', 'print:hidden']));

  goOnline();
  expect(container.querySelector('button, a, [tabindex]')).toBeNull();
  const restoredClasses = [...screen.getByRole('status').classList];
  expect(restoredClasses).toEqual(expect.arrayContaining(['border-success', 'text-success', 'print:hidden']));
});
