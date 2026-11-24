import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AppShell } from './app-shell.tsx';
import { Sidebar } from './sidebar.tsx';
import { ToastProvider } from './toast.tsx';
import { Topbar } from './topbar.tsx';

// AppShell met offline-melding en printstijlen (spec offline-en-print, AC-10 t/m AC-13).
const OFFLINE = 'Je bent offline. Wijzigingen worden niet opgeslagen tot de verbinding terug is.';

let online = true;

beforeEach(() => {
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

function shell() {
  return (
    <ToastProvider>
      <AppShell nav={[]} userName="Ada Admin" menuItems={[]}>
        <p>inhoud</p>
      </AppShell>
    </ToastProvider>
  );
}

function fire(type: string) {
  act(() => {
    window.dispatchEvent(new Event(type));
  });
}

function goOffline() {
  online = false;
  fire('offline');
}

test('offline-en-print/AC-10: de melding staat één keer tussen header en main, is geen Tab-stop; online geen status', () => {
  const { container } = render(shell());
  expect(screen.queryByRole('status')).toBeNull();

  goOffline();
  const statuses = screen.getAllByRole('status');
  expect(statuses).toHaveLength(1);
  const notice = statuses[0];
  expect(notice?.textContent).toBe(OFFLINE);
  const header = container.querySelector('header');
  const main = screen.getByRole('main');
  if (notice === undefined || header === null) throw new Error('melding of header ontbreekt');
  expect(header.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(notice.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(notice.hasAttribute('tabindex')).toBe(false);
  expect(notice.querySelector('a, button, input, [tabindex]')).toBeNull();

  const first = container.querySelector('a, button, input, [tabindex]:not([tabindex="-1"])');
  expect(first?.textContent).toBe('Naar de inhoud');
});

test('offline-en-print/AC-11: print-klassen op schil, sidebar, topbar en toaster', () => {
  const { container } = render(shell());
  goOffline();
  const outer = container.firstElementChild;
  expect(outer?.classList.contains('print:block')).toBe(true);
  expect(screen.getByRole('link', { name: 'Naar de inhoud' }).classList.contains('print:hidden')).toBe(true);
  expect(container.querySelector('aside')?.classList.contains('print:hidden')).toBe(true);
  expect(screen.getByRole('status').classList.contains('print:hidden')).toBe(true);
  expect(screen.getByRole('main').classList.contains('print:p-0')).toBe(true);
  cleanup();

  const topbar = render(<Topbar userName="Ada Admin" menuItems={[]} />);
  expect(topbar.container.querySelector('header')?.classList.contains('print:hidden')).toBe(true);
  cleanup();

  const sidebar = render(<Sidebar items={[]} />);
  expect(sidebar.container.querySelector('nav')?.classList.contains('print:hidden')).toBe(true);
  cleanup();

  const toaster = render(<ToastProvider>{null}</ToastProvider>);
  expect(toaster.container.firstElementChild?.classList.contains('print:hidden')).toBe(true);
});

test('offline-en-print/AC-12: donker thema wordt licht tijdens afdrukken en daarna weer donker; de bewaarde keuze blijft', () => {
  document.documentElement.dataset['theme'] = 'dark';
  localStorage.setItem('thema', 'dark');
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  render(shell());

  fire('beforeprint');
  expect(document.documentElement.dataset['theme']).toBe('light');
  expect(localStorage.getItem('thema')).toBe('dark');

  fire('afterprint');
  expect(document.documentElement.dataset['theme']).toBe('dark');
  expect(localStorage.getItem('thema')).toBe('dark');
  expect(setItem).not.toHaveBeenCalled();
});

test('offline-en-print/AC-13: licht blijft licht, afterprint alleen verandert niets, unmount zet terug en ruimt op', () => {
  document.documentElement.dataset['theme'] = 'light';
  const first = render(shell());
  fire('beforeprint');
  expect(document.documentElement.dataset['theme']).toBe('light');
  fire('afterprint');
  expect(document.documentElement.dataset['theme']).toBe('light');
  first.unmount();

  document.documentElement.dataset['theme'] = 'dark';
  const second = render(shell());
  fire('afterprint');
  expect(document.documentElement.dataset['theme']).toBe('dark');
  second.unmount();

  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const third = render(shell());
  fire('beforeprint');
  expect(document.documentElement.dataset['theme']).toBe('light');
  third.unmount();
  expect(document.documentElement.dataset['theme']).toBe('dark');
  for (const type of ['beforeprint', 'afterprint']) {
    const handlers = add.mock.calls.filter(([name]) => name === type).map(([, handler]) => handler);
    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) {
      expect(remove.mock.calls.some(([name, removed]) => name === type && removed === handler)).toBe(true);
    }
  }
  fire('afterprint');
  expect(document.documentElement.dataset['theme']).toBe('dark');
});
