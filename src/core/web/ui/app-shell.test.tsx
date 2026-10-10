import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AppShell } from './app-shell.tsx';
import { PageHeader } from './page-header.tsx';

// Schil toegankelijk (roadmap 3f): skip-link als eerste Tab-stop, paginatitel per scherm, focus naar de h1 na een routewissel.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function shell(routeKey: string, title: string) {
  return (
    <AppShell nav={[]} userName="Ada Admin" menuItems={[]} routeKey={routeKey}>
      <PageHeader title={title} />
    </AppShell>
  );
}

async function nextFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

test('de skip-link is het eerste focusbare element en wijst naar main', () => {
  const { container } = render(shell('/', 'Home'));
  const first = container.querySelector('a, button, input, [tabindex]:not([tabindex="-1"])');
  expect(first?.textContent).toBe('Naar de inhoud');
  expect(first?.getAttribute('href')).toBe('#inhoud');
  expect(screen.getByRole('main').id).toBe('inhoud');
});

test('de h1 zet de paginatitel', () => {
  render(shell('/', 'Accounts'));
  expect(document.title).toBe('Accounts');
});

test('na een routewissel staat de focus op de nieuwe h1; bij het eerste scherm niet', async () => {
  const { rerender } = render(shell('/', 'Home'));
  await nextFrame();
  expect(document.activeElement).toBe(document.body);

  rerender(shell('/admin/accounts', 'Accounts'));
  await nextFrame();
  expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Accounts' }));
});

test('zonder h1 gaat de focus naar main', async () => {
  const { rerender } = render(
    <AppShell nav={[]} userName="Ada Admin" menuItems={[]} routeKey="/">
      <p>laden</p>
    </AppShell>,
  );
  rerender(
    <AppShell nav={[]} userName="Ada Admin" menuItems={[]} routeKey="/b">
      <p>laden</p>
    </AppShell>,
  );
  await nextFrame();
  expect(document.activeElement).toBe(screen.getByRole('main'));
});

test('de skip-link zet de focus op main, zonder fragment in de URL', () => {
  render(shell('/', 'Home'));
  const before = window.location.href;
  fireEvent.click(screen.getByRole('link', { name: 'Naar de inhoud' }));
  expect(document.activeElement).toBe(screen.getByRole('main'));
  expect(window.location.href).toBe(before);
});

test('een voorbeeld-PageHeader met documentTitle={false} laat de paginatitel staan', () => {
  render(
    <AppShell nav={[]} userName="Ada Admin" menuItems={[]} routeKey="/">
      <PageHeader title="Design system" />
      <PageHeader title="Accounts" documentTitle={false} />
    </AppShell>,
  );
  expect(document.title).toBe('Design system');
});
