import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { can } from '#shared/permissions.ts';
import { copy } from '#web/copy/ui.ts';
import { navItems } from '#web/lib/nav.ts';
import { actorFromMe } from '#web/lib/session.ts';
import { Button, SidebarShell, ThemeToggle, TopbarShell, visibleNavItems, type MenuItem } from '#web/ui/index.ts';
import { useLogout, useMe } from '../session/queries.ts';
import { schilKeuze, voorbeeldNav } from './schil-voorbeeld.ts';

function useMenuItems(): MenuItem[] {
  const logout = useLogout();
  const navigate = useNavigate();
  return [
    {
      label: copy.menu.account,
      onSelect: () => {
        void navigate({ to: '/account' });
      },
    },
    {
      label: copy.menu.logout,
      onSelect: () => {
        logout.mutate();
      },
    },
  ];
}

// In de schilwissel op /design-system: terug naar de gewone navigatie (geen navigatie-item, spec schillen).
function voorbeeldActions(): ReactNode {
  return (
    <>
      {/* exact: alleen actief op precies deze URL, dus nooit in de schilwissel zelf. */}
      <Button asChild variant="ghost">
        <Link to="/design-system" search={{ vak: 'schillen' }} activeOptions={{ exact: true }}>
          {copy.schillen.gewoneNavigatie}
        </Link>
      </Button>
      <ThemeToggle />
    </>
  );
}

// Layout voor ingelogde schermen (spec accountbeheer): sidebar per rol, themaschakelaar en profielmenu met "Mijn account"
// (spec eigen-account) boven "Uitloggen". Op /design-system kiest ?schil=topbalk of ?schil=sidebar de schil met
// voorbeeldnavigatie (spec schillen), alleen met design-system:read; elders of zonder dat recht telt schil niet.
export function AppLayout() {
  const me = useMe();
  const menuItems = useMenuItems();
  // resolvedLocation: pas als het nieuwe scherm gerenderd is (ook na een lazy route of loader), niet bij de start van het laden.
  const location = useRouterState({ select: (state) => state.resolvedLocation ?? state.location });
  if (me.data === undefined) return null;

  const actor = actorFromMe(me.data);
  const keuze = schilKeuze(location.pathname, location.search, can(actor, 'design-system:read'));
  if (keuze?.schil === 'topbalk') {
    return (
      <TopbarShell
        nav={voorbeeldNav(keuze)}
        userName={me.data.naam}
        menuItems={menuItems}
        topbarActions={voorbeeldActions()}
        routeKey={location.pathname}
      >
        <Outlet />
      </TopbarShell>
    );
  }
  return (
    <SidebarShell
      nav={keuze === null ? visibleNavItems(navItems, actor, can) : voorbeeldNav(keuze)}
      userName={me.data.naam}
      menuItems={menuItems}
      topbarActions={keuze === null ? <ThemeToggle /> : voorbeeldActions()}
      routeKey={location.pathname}
    >
      <Outlet />
    </SidebarShell>
  );
}
