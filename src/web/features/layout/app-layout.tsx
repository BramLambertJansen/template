import { Outlet } from '@tanstack/react-router';
import { can } from '#shared/permissions.ts';
import { copy } from '#web/copy/ui.ts';
import { navItems } from '#web/lib/nav.ts';
import { actorFromMe } from '#web/lib/session.ts';
import { AppShell, visibleNavItems, type MenuItem } from '#web/ui/index.ts';
import { useLogout, useMe } from '../session/queries.ts';

// Layout voor ingelogde schermen (spec accountbeheer): sidebar per rol, profielmenu met "Uitloggen".
export function AppLayout() {
  const me = useMe();
  const logout = useLogout();
  if (me.data === undefined) return null;

  const menuItems: MenuItem[] = [
    {
      label: copy.menu.logout,
      onSelect: () => {
        logout.mutate();
      },
    },
  ];
  return (
    <AppShell nav={visibleNavItems(navItems, actorFromMe(me.data), can)} userName={me.data.naam} menuItems={menuItems}>
      <Outlet />
    </AppShell>
  );
}
