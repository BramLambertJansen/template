import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { OfflineNotice } from './offline-notice.tsx';

// Een wisseling van navigator.onLine tussen de eerste render en het koppelen van de listeners valt vóór addEventListener;
// de melding leest navigator.onLine daarom na het koppelen opnieuw (review offline-en-print).
const OFFLINE = 'Je bent offline. Wijzigingen worden niet opgeslagen tot de verbinding terug is.';
const BACK_ONLINE = 'Weer online.';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('offline tussen render en koppelen van de listeners toont de offline-tekst zonder event', () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValueOnce(true).mockReturnValue(false);
  render(<OfflineNotice />);
  expect(screen.getByRole('status').textContent).toBe(OFFLINE);
});

test('online tussen render en koppelen van de listeners geldt als herstel', () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValueOnce(false).mockReturnValue(true);
  render(<OfflineNotice />);
  expect(screen.getByRole('status').textContent).toBe(BACK_ONLINE);
});

test('zonder wisseling blijft het online-geval leeg', () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  render(<OfflineNotice />);
  expect(screen.queryByRole('status')).toBeNull();
});
