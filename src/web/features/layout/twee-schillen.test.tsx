import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createQueryClient } from '#core/web/lib/query.ts';
import { uiTexts } from '#core/web/copy/ui.ts';
import { ErrorTextsProvider } from '#core/web/ui/error-texts.tsx';
import { NotFound, RouteError } from '#core/web/ui/route-error.tsx';
import { can, type Permission } from '#shared/permissions.ts';
import { errorTexts } from '#web/copy/errors.ts';
import { navItems } from '#web/lib/nav.ts';
import { actorFromMe, guard, meQuery, type RouterContext } from '#web/lib/session.ts';
import {
  PageHeader,
  ShellSessionProvider,
  SidebarShell,
  ThemeScope,
  ToastProvider,
  TopbarShell,
  visibleNavItems,
  type NavItem,
} from '#web/ui/index.ts';

// Spec schillen, AC-12: twee layoutroutes in een geheugenrouter, elk met een eigen schil, navigatielijst en ThemeScope.
// Het is de fixture van het recept "Een tweede schil" in docs/gouden-pad.md. De routes staan in code, dus routeTree,
// de catalogus en check:schillen zien ze niet. De themanamen zijn fixturewaarden: een app mag strak en zacht weghalen.

const THEME_EEN = 'fixture-een';
const THEME_TWEE = 'fixture-twee';

const portaalItem: NavItem<Permission> = { label: 'Portaal', href: '/portaal', permission: 'accounts:read' };
// De navigatielijst van de tweede schil staat in de test zelf (recept stap 6: eigen export in nav.ts).
const portaalNav: readonly NavItem<Permission>[] = [
  { label: 'Portaaloverzicht', href: '/portaal', permission: 'accounts:read' },
  { label: 'Terug naar app', href: '/', permission: 'app.use' },
];

type Rol = 'admin' | 'user';

interface Me {
  readonly naam: string;
  readonly rol: Rol;
}

const useRouteKey = () =>
  useRouterState({ select: (state) => state.resolvedLocation?.pathname ?? state.location.pathname });

function EersteLayout({ me }: { readonly me: Me }) {
  const routeKey = useRouteKey();
  return (
    <ThemeScope theme={THEME_EEN}>
      <SidebarShell
        nav={visibleNavItems([...navItems, portaalItem], actorFromMe(me), can)}
        userName={me.naam}
        menuItems={[]}
        routeKey={routeKey}
      >
        <Outlet />
      </SidebarShell>
    </ThemeScope>
  );
}

function TweedeLayout({ me }: { readonly me: Me }) {
  const routeKey = useRouteKey();
  return (
    <ThemeScope theme={THEME_TWEE}>
      <TopbarShell
        nav={visibleNavItems(portaalNav, actorFromMe(me), can)}
        userName={me.naam}
        menuItems={[]}
        routeKey={routeKey}
      >
        <Outlet />
      </TopbarShell>
    </ThemeScope>
  );
}

function buildRouter(rol: Rol) {
  const queryClient = createQueryClient();
  const me = { id: 'x', naam: 'Ada', email: 'ada@example.test', rol };
  queryClient.setQueryData(meQuery.queryKey, me);

  const root = createRootRouteWithContext<RouterContext>()({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    id: '_app',
    beforeLoad: guard('app.use'),
    component: () => <EersteLayout me={me} />,
  });
  const home = createRoute({
    getParentRoute: () => app,
    path: '/',
    component: () => <PageHeader title="Eerste scherm" />,
  });
  const portaal = createRoute({
    getParentRoute: () => root,
    id: '_portaal',
    beforeLoad: guard('accounts:read'),
    component: () => <TweedeLayout me={me} />,
  });
  const portaalScherm = createRoute({
    getParentRoute: () => portaal,
    path: '/portaal',
    component: () => <PageHeader title="Portaalscherm" />,
  });
  return createRouter({
    routeTree: root.addChildren([app.addChildren([home]), portaal.addChildren([portaalScherm])]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { queryClient },
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: NotFound,
  });
}

async function open(rol: Rol) {
  const router = buildRouter(rol);
  await act(async () => {
    await router.load();
  });
  const view = render(
    <ErrorTextsProvider texts={errorTexts}>
      <ToastProvider>
        <ShellSessionProvider>
          <RouterProvider router={router} />
        </ShellSessionProvider>
      </ToastProvider>
    </ErrorTextsProvider>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Eerste scherm' });
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
  return { router, container: view.container };
}

// Wat er in elke schil precies één keer moet staan.
function expectSingletons() {
  expect(screen.getAllByRole('main')).toHaveLength(1);
  expect(screen.getAllByText(uiTexts.offline)).toHaveLength(1);
  expect(document.querySelectorAll('[data-toaster]')).toHaveLength(1);
  expect(document.querySelectorAll('[data-app-theme]')).toHaveLength(1);
}

const theme = () => document.querySelector('[data-app-theme]')?.getAttribute('data-app-theme');
const heading = (name: string) => screen.getByRole('heading', { level: 1, name });

beforeEach(() => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('schillen/AC-12: twee layoutroutes met elk een eigen schil', () => {
  test('schillen/AC-12: de eerste schil is de sidebar met thema een; er staat één main, één melding, één toaster', async () => {
    const { container } = await open('admin');
    expect(container.querySelector('aside')).not.toBeNull();
    expect(screen.queryByRole('navigation', { name: uiTexts.mainNavigation })).toBeNull();
    expect(theme()).toBe(THEME_EEN);
    expectSingletons();
  });

  test('schillen/AC-12: navigeren naar de tweede route wisselt schil en thema en zet de focus op de h1', async () => {
    const { container } = await open('admin');
    fireEvent.click(screen.getByRole('link', { name: 'Portaal' }));
    await screen.findByRole('heading', { level: 1, name: 'Portaalscherm' });

    await waitFor(() => {
      expect(document.activeElement).toBe(heading('Portaalscherm'));
    });
    expect(container.querySelector('aside')).toBeNull();
    expect(screen.getByRole('navigation', { name: uiTexts.mainNavigation })).toBeDefined();
    expect(theme()).toBe(THEME_TWEE);
    expectSingletons();
  });

  test('schillen/AC-12: en terug naar de eerste route wisselt alles weer en de focus staat op de h1', async () => {
    const { container } = await open('admin');
    fireEvent.click(screen.getByRole('link', { name: 'Portaal' }));
    await screen.findByRole('heading', { level: 1, name: 'Portaalscherm' });
    fireEvent.click(screen.getByRole('link', { name: 'Terug naar app' }));
    await screen.findByRole('heading', { level: 1, name: 'Eerste scherm' });

    await waitFor(() => {
      expect(document.activeElement).toBe(heading('Eerste scherm'));
    });
    expect(container.querySelector('aside')).not.toBeNull();
    expect(theme()).toBe(THEME_EEN);
    expectSingletons();
  });

  test('schillen/AC-12: een rol zonder accounts:read ziet in de eerste schil geen link naar het portaal', async () => {
    await open('user');
    expect(screen.queryByRole('link', { name: 'Portaal' })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Home' }).length).toBeGreaterThan(0);
  });

  test('schillen/AC-12: de guard van de tweede route weigert die rol: geen portaalscherm, wel de weigering', async () => {
    const { router } = await open('user');
    await act(async () => {
      await router.navigate({ href: '/portaal' });
    });

    expect(await screen.findByText(errorTexts.FORBIDDEN)).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Portaalscherm' })).toBeNull();
    expect(document.querySelector('[data-app-theme]')).toBeNull();
  });
});
