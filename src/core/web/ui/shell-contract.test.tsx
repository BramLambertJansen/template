import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { CenteredCard } from './centered-card.tsx';
import { PageHeader } from './page-header.tsx';
import { ShellSessionProvider } from './shell-frame.tsx';
import { SidebarShell } from './sidebar-shell.tsx';
import type { NavItem } from './sidebar.tsx';
import { shellContract } from './testing.tsx';
import { TopbarShell } from './topbar-shell.tsx';

const nav: NavItem<string>[] = [
  { label: 'Home', href: '/', permission: 'app.use' },
  { label: 'Accounts', href: '/accounts', permission: 'app.use' },
  { label: 'Instellingen', href: '/instellingen', permission: 'app.use' },
];
const props = { nav, userName: 'Ada Admin', menuItems: [] };

// De contracttest slaagt op beide schillen, ook zonder nav-items (dan geen nav, menuknop of sheet).
describe('schillen/AC-5: shellContract op beide schillen', () => {
  shellContract(SidebarShell, { props });
  shellContract(TopbarShell, { props });
  shellContract(SidebarShell, { props: { ...props, nav: [] } });
  shellContract(TopbarShell, { props: { ...props, nav: [] } });
});

// schillen/AC-16: focus bij de mount van een schil, met ShellSessionProvider onder StrictMode.
afterEach(cleanup);

const nextFrame = async () => {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
};

// Eén router per test, zodat een rerender dezelfde router houdt.
function appWithRouter() {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return (node: ReactNode, session = true) => {
    const tree = <RouterContextProvider router={router}>{node}</RouterContextProvider>;
    return <StrictMode>{session ? <ShellSessionProvider>{tree}</ShellSessionProvider> : tree}</StrictMode>;
  };
}

const sidebar = (title: string, children?: ReactNode) => (
  <SidebarShell {...props} routeKey="/">
    <PageHeader title={title} />
    {children}
  </SidebarShell>
);
const topbar = (title: string) => (
  <TopbarShell {...props} routeKey="/">
    <PageHeader title={title} />
  </TopbarShell>
);
const login = <CenteredCard title="Inloggen">formulier</CenteredCard>;

async function settle() {
  await nextFrame();
  await nextFrame();
}

describe('schillen/AC-16: focus bij de mount van een schil', () => {
  test('schillen/AC-16: de schil mount in een latere commit dan de provider (async guard): focus blijft op body', async () => {
    const wrap = appWithRouter();
    const { rerender } = render(wrap(null));
    await settle();
    rerender(wrap(sidebar('Dashboard')));
    await settle();
    expect(document.activeElement).toBe(document.body);
  });

  test('schillen/AC-16: met een CenteredCard als kind in dezelfde commit blijft de focus op body', async () => {
    const wrap = appWithRouter();
    const { rerender } = render(wrap(null));
    await settle();
    rerender(wrap(sidebar('Dashboard', <CenteredCard title="E-mailadres bevestigd">klaar</CenteredCard>)));
    await settle();
    expect(document.activeElement).toBe(document.body);
  });

  test('schillen/AC-16: eerst een CenteredCard, daarna een schil: focus op de h1', async () => {
    const wrap = appWithRouter();
    const { rerender } = render(wrap(login));
    await settle();
    rerender(wrap(sidebar('Dashboard')));
    await settle();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Dashboard' }));
  });

  test('schillen/AC-16: een schil die een andere vervangt: focus op de h1', async () => {
    const wrap = appWithRouter();
    const { rerender } = render(wrap(sidebar('Beheer')));
    await settle();
    expect(document.activeElement).toBe(document.body);
    rerender(wrap(topbar('Portaal')));
    await settle();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Portaal' }));
  });

  test('schillen/AC-16: zonder provider geen focus bij de mount, wel bij een wissel van routeKey', async () => {
    const wrap = appWithRouter();
    const { rerender } = render(wrap(login, false));
    await settle();
    rerender(wrap(sidebar('Dashboard'), false));
    await settle();
    expect(document.activeElement).toBe(document.body);
    rerender(
      wrap(
        <SidebarShell {...props} routeKey="/accounts">
          <PageHeader title="Accounts" />
        </SidebarShell>,
        false,
      ),
    );
    await settle();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Accounts' }));
  });
});
