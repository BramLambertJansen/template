import { cleanup, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, expect, test } from 'vitest';
import { StatTile, type StatTileProps } from './stat-tile.tsx';

afterEach(cleanup);

function follows(first: Node, second: Node): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function renderInRouter(props: StatTileProps, path: string) {
  const route = createRootRoute({ component: () => <StatTile {...props} /> });
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: [path] }) });
  render(<RouterProvider router={router} />);
  return router;
}

test('ui-weergave-basis/AC-11: benoemde groep via aria-labelledby, label vóór waarde, geen lege elementen', () => {
  render(<StatTile label="Actieve accounts" value="1.234" />);
  const group = screen.getByRole('group', { name: 'Actieve accounts' });
  const labelId = group.getAttribute('aria-labelledby') ?? '';
  expect(labelId).not.toBe('');
  const label = within(group).getByText('Actieve accounts');
  expect(label.id).toBe(labelId);
  const value = within(group).getByText('1.234');
  expect(follows(label, value)).toBe(true);
  expect(group.children).toHaveLength(2);
});

test('ui-weergave-basis/AC-12: trend met tekst en verborgen icoon, drie iconen, één kleur', () => {
  const icons = new Set<string>();
  for (const direction of ['up', 'down', 'flat'] as const) {
    const { unmount } = render(
      <StatTile label="Actieve accounts" value="1.234" trend={{ direction, label: '12% meer dan vorige maand' }} />,
    );
    const text = screen.getByText('12% meer dan vorige maand');
    const trend = text.closest('.flex') ?? text;
    const icon = trend.querySelector('svg');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    icons.add(icon?.innerHTML ?? '');
    expect(trend.classList.contains('text-muted-foreground')).toBe(true);
    expect([...trend.classList].filter((name) => name.startsWith('text-') && name !== 'text-sm')).toStrictEqual([
      'text-muted-foreground',
    ]);
    unmount();
  }
  expect(icons.size).toBe(3);
});

test('ui-weergave-basis/AC-13: toelichting staat zichtbaar na de waarde', () => {
  render(<StatTile label="Openstaande taken" value="8" description="Taken zonder eigenaar tellen niet mee." />);
  const value = screen.getByText('8');
  const description = screen.getByText('Taken zonder eigenaar tellen niet mee.');
  expect(follows(value, description)).toBe(true);
});

test('ui-weergave-basis/AC-14: één routerlink zonder aria-current of sidebarklassen; de tegel zelf is geen link', async () => {
  const props = {
    label: 'Actieve accounts',
    value: '1.234',
    link: { href: '/admin/accounts', label: 'Bekijk accounts' },
  };
  renderInRouter(props, '/admin/accounts');
  const group = await screen.findByRole('group', { name: 'Actieve accounts' });
  const links = screen.getAllByRole('link');
  expect(links).toHaveLength(1);
  const link = screen.getByRole('link', { name: 'Bekijk accounts' });
  expect(link.getAttribute('href')).toBe('/admin/accounts');
  expect(link.hasAttribute('aria-current')).toBe(false);
  expect(group.tagName).toBe('DIV');
  expect(screen.queryByRole('button')).toBeNull();
  for (const name of [
    'text-card-foreground',
    'underline',
    'underline-offset-4',
    'hover:bg-transparent',
    'hover:text-card-foreground',
    'aria-[current=page]:bg-transparent',
    'aria-[current=page]:text-card-foreground',
  ]) {
    expect(link.classList.contains(name)).toBe(true);
  }
  expect([...link.classList].filter((name) => name.includes('sidebar'))).toStrictEqual([]);
  cleanup();
  const router = renderInRouter(props, '/');
  fireEvent.click(await screen.findByRole('link', { name: 'Bekijk accounts' }));
  await waitFor(() => {
    expect(router.state.location.pathname).toBe('/admin/accounts');
  });
});

test('ui-weergave-basis/AC-15: lege teksten falen; een lange waarde breekt af binnen de tegel', () => {
  const valid: StatTileProps = { label: 'Actieve accounts', value: '1.234' };
  const invalid: readonly StatTileProps[] = [
    { ...valid, label: '' },
    { ...valid, label: '   ' },
    { ...valid, value: '' },
    { ...valid, value: '  ' },
    { ...valid, trend: { direction: 'up', label: ' ' } },
    { ...valid, link: { href: '/admin/accounts', label: '' } },
    { ...valid, link: { href: '', label: 'Bekijk accounts' } },
    { ...valid, link: { href: '   ', label: 'Bekijk accounts' } },
  ];
  for (const props of invalid) {
    expect(() => render(<StatTile {...props} />)).toThrow();
    cleanup();
  }
  const long = 'x'.repeat(40);
  render(<StatTile label="Langste wachtrij" value={long} />);
  const value = screen.getByText(long);
  expect(value.classList.contains('break-words')).toBe(true);
  expect(value.classList.contains('min-w-0')).toBe(true);
});
