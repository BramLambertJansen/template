import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import type { NavItem } from './sidebar.tsx';
import { TOPBAR_INLINE_ITEMS, TopbarShell } from './topbar-shell.tsx';

afterEach(cleanup);

const LONG = 'Rapportages en analyses over alle afdelingen van de organisatie';

const item = (label: string, href: string): NavItem<string> => ({ label, href, permission: 'app.use' });
const NINE = ['Een', 'Twee', 'Drie', 'Vier', 'Vijf', 'Zes', 'Zeven', 'Acht', 'Negen'].map((label) =>
  item(label, `/${label.toLowerCase()}`),
);

function show(nav: readonly NavItem<string>[], at = '/') {
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: [at] }) });
  return render(
    <RouterContextProvider router={router}>
      <TopbarShell nav={nav} userName="Ada Admin" menuItems={[]} routeKey={at}>
        <h1>Inhoud</h1>
      </TopbarShell>
    </RouterContextProvider>,
  );
}

const bar = () => screen.getByRole('navigation', { name: 'Hoofdnavigatie' });

describe('schillen/AC-2: TopbarShell met drie items', () => {
  test('schillen/AC-2: alle drie in de nav "Hoofdnavigatie" in de balk, geen sidebar en geen "Meer"', () => {
    const { container } = show([item('Home', '/'), item('Accounts', '/accounts'), item(LONG, '/rapportages')]);
    const header = container.querySelector('header');
    expect(header?.contains(bar())).toBe(true);
    expect(
      within(bar())
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toStrictEqual(['Home', 'Accounts', LONG]);
    expect(container.querySelector('aside')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Meer' })).toBeNull();
  });

  test('schillen/AC-2: een lange naam kort af met een ellips en blijft volledig de toegankelijke naam', () => {
    show([item(LONG, '/rapportages')]);
    const link = within(bar()).getByRole('link', { name: LONG });
    expect(link.querySelector('.truncate')?.textContent).toBe(LONG);
  });
});

describe('schillen/AC-3: TopbarShell met meer dan TOPBAR_INLINE_ITEMS items', () => {
  test('schillen/AC-3: de eerste vijf in de balk, de rest in "Meer" in dezelfde volgorde', async () => {
    show(NINE);
    expect(TOPBAR_INLINE_ITEMS).toBe(5);
    expect(
      within(bar())
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toStrictEqual(['Een', 'Twee', 'Drie', 'Vier', 'Vijf']);
    fireEvent.keyDown(within(bar()).getByRole('button', { name: 'Meer' }), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((entry) => entry.textContent),
    ).toStrictEqual(['Zes', 'Zeven', 'Acht', 'Negen']);
  });

  test('schillen/AC-3: is het actieve item er een uit "Meer", dan heeft dat item aria-current="page"', async () => {
    show(NINE, '/zeven');
    const more = within(bar()).getByRole('button', { name: 'Meer' });
    expect(more.getAttribute('data-active')).toBe('true');
    expect(within(bar()).queryAllByRole('link', { current: 'page' })).toHaveLength(0);
    fireEvent.keyDown(more, { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Zeven' }).getAttribute('aria-current')).toBe('page');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .filter((entry) => entry.getAttribute('aria-current') === 'page'),
    ).toHaveLength(1);
  });

  test('schillen/AC-3: een actief item in de balk geeft "Meer" geen actieve stijl', () => {
    show(NINE, '/twee');
    expect(within(bar()).getByRole('link', { name: 'Twee' }).getAttribute('aria-current')).toBe('page');
    expect(within(bar()).getByRole('button', { name: 'Meer' }).hasAttribute('data-active')).toBe(false);
  });
});

describe('schillen/AC-7: schil zonder nav-items', () => {
  test('schillen/AC-7: geen nav, geen menuknop en geen sheet', () => {
    const { container } = show([]);
    expect(container.querySelector('nav')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Menu openen' })).toBeNull();
    expect(container.querySelector('dialog')).toBeNull();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  test('schillen/AC-7: met items staan menuknop en sheet er wel (de knop verbergt CSS vanaf 56rem balkbreedte)', () => {
    const { container } = show(NINE);
    expect(screen.getByRole('button', { name: 'Menu openen' }).className).toContain('@4xl:hidden');
    expect(container.querySelector('dialog')).not.toBeNull();
  });
});
