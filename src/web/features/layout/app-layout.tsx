import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { isDev } from '#core/web/lib/env.ts';
import { can } from '#shared/permissions.ts';
import { copy } from '#web/copy/ui.ts';
import { navItems } from '#web/lib/nav.ts';
import { actorFromMe } from '#web/lib/session.ts';
import { AppShell, visibleNavItems, type MenuItem } from '#web/ui/index.ts';
import { useLogout, useMe } from '../session/queries.ts';

// Alleen in dev: de items uit src/web/dev komen via een dynamische import (in de productiebundel is die module leeg).
function useDevMenuItems(): readonly MenuItem[] {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [items, setItems] = useState<readonly MenuItem[]>([]);
  useEffect(() => {
    if (!isDev) return;
    let active = true;
    void import('#web/dev/dev-menu.ts').then((module) => {
      if (active) setItems(module.devMenuItems(queryClient, navigate));
    });
    return () => {
      active = false;
    };
  }, [queryClient, navigate]);
  return items;
}

// Layout voor ingelogde schermen (spec accountbeheer): sidebar per rol, profielmenu met "Uitloggen".
export function AppLayout() {
  const me = useMe();
  const logout = useLogout();
  const devItems = useDevMenuItems();
  if (me.data === undefined) return null;

  const menuItems: MenuItem[] = [
    {
      label: copy.menu.logout,
      onSelect: () => {
        logout.mutate();
      },
    },
    ...devItems,
  ];
  return (
    <AppShell nav={visibleNavItems(navItems, actorFromMe(me.data), can)} userName={me.data.naam} menuItems={menuItems}>
      <Outlet />
    </AppShell>
  );
}
