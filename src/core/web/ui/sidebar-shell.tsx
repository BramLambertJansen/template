import { useState } from 'react';
import { ShellFrame, type ShellProps } from './shell-frame.tsx';
import { shellMenuButton, shellMenuSheet } from './shell-menu.tsx';
import { Sidebar } from './sidebar.tsx';
import { Topbar } from './topbar.tsx';

// Schil met sidebar (spec schillen): sidebar links (vanaf md, breedte --shell-sidebar-width), topbalk met profielmenu,
// inhoud. Op smalle schermen opent de menuknop dezelfde navigatie in een sheet. Breakpoints in CSS, geen matchMedia
// (framework §7). Skip-link, focus, offline-melding en afdrukken komen uit ShellFrame; meldingen uit ToastProvider.
// Zonder nav-items geen nav, menuknop of sheet; de kolom blijft, zodat de indeling gelijk is aan die met items.
export function SidebarShell({ nav, userName, menuItems, topbarActions, routeKey, buildInfo, children }: ShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hasNav = nav.length > 0;
  const openMenu = () => {
    setMenuOpen(true);
  };
  return (
    <ShellFrame
      className="md:grid md:grid-cols-shell-sidebar"
      routeKey={routeKey}
      buildInfo={buildInfo}
      aside={
        <aside className="hidden border-shell-e bg-sidebar md:block print:hidden">
          {hasNav ? <Sidebar items={nav} /> : null}
        </aside>
      }
      header={
        <Topbar
          userName={userName}
          menuItems={menuItems}
          start={hasNav ? shellMenuButton(openMenu, 'md:hidden') : undefined}
          actions={topbarActions}
        />
      }
      nav={hasNav ? shellMenuSheet({ nav, open: menuOpen, onOpenChange: setMenuOpen }) : null}
    >
      {children}
    </ShellFrame>
  );
}
