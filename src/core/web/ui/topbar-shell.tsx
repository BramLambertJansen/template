import { useRouter } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { DropdownMenu } from './dropdown-menu.tsx';
import { NavLink, useIsActiveHref } from './nav-link.tsx';
import { ShellFrame, type ShellProps } from './shell-frame.tsx';
import { shellMenuButton, shellMenuSheet } from './shell-menu.tsx';
import type { NavItem } from './sidebar.tsx';
import { Topbar } from './topbar.tsx';

// Het aantal items in de balk vóór "Meer" (spec schillen, OV-1): een vast getal, geen gemeten breedte (R-WEB-01). Meer
// past op 1280 px niet betrouwbaar naast acties en profielmenu; een app met veel items kiest de SidebarShell.
export const TOPBAR_INLINE_ITEMS = 5;

// De items in de balk: de eerste TOPBAR_INLINE_ITEMS als link, de rest in het menu "Meer" (zelfde volgorde). Een lange
// naam kort af met een ellips; de volledige naam blijft de toegankelijke naam. Het actieve item heeft aria-current="page",
// ook in "Meer"; dan heeft de knop "Meer" de actieve stijl. Verborgen tot de balk minstens 56rem breed is (container
// query @4xl, in rem zodat de drempel meeschaalt met de tekstgrootte); daaronder staat de menuknop er.
function TopbarNav({ items }: { readonly items: readonly NavItem<string>[] }) {
  const router = useRouter();
  const isActive = useIsActiveHref();
  const inline = items.slice(0, TOPBAR_INLINE_ITEMS);
  const more = items.slice(TOPBAR_INLINE_ITEMS);
  return (
    <nav aria-label={uiTexts.mainNavigation} className="hidden min-w-0 items-center gap-shell-nav @4xl:flex">
      {inline.map(({ label, href, icon: Icon }) => (
        <NavLink key={href} href={href} className="max-w-32 min-w-0 shrink">
          {Icon === undefined ? null : <Icon aria-hidden="true" />}
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
      {more.length === 0 ? null : (
        <DropdownMenu
          align="start"
          items={more.map((item) => ({
            label: item.label,
            current: isActive(item.href),
            onSelect: () => {
              void router.navigate({ href: item.href });
            },
          }))}
          trigger={
            <Button
              variant="ghost"
              data-active={more.some((item) => isActive(item.href)) ? 'true' : undefined}
              className="shrink-0 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
            >
              {uiTexts.more}
              <ChevronDown aria-hidden="true" />
            </Button>
          }
        />
      )}
    </nav>
  );
}

// Schil met topbalk (spec schillen): geen sidebar; vanaf een balkbreedte van 56rem staan de items horizontaal in de balk,
// links de items, rechts topbarActions en het profielmenu. Smaller (ook onder md en bij 200 % tekst) toont de balk de
// menuknop met dezelfde sheet als de SidebarShell. Garanties uit ShellFrame; meldingen uit ToastProvider. Zonder
// nav-items geen nav, menuknop of sheet.
export function TopbarShell({ nav, userName, menuItems, topbarActions, routeKey, children }: ShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hasNav = nav.length > 0;
  const openMenu = () => {
    setMenuOpen(true);
  };
  return (
    <ShellFrame
      className="flex flex-col"
      routeKey={routeKey}
      header={
        <Topbar
          userName={userName}
          menuItems={menuItems}
          start={
            hasNav ? (
              <div className="@container flex min-w-0 flex-1 items-center">
                {shellMenuButton(openMenu, '@4xl:hidden')}
                <TopbarNav items={nav} />
              </div>
            ) : undefined
          }
          actions={topbarActions}
        />
      }
      nav={hasNav ? shellMenuSheet({ nav, open: menuOpen, onOpenChange: setMenuOpen }) : null}
    >
      {children}
    </ShellFrame>
  );
}
