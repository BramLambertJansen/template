import { Menu } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { Dialog } from './dialog.tsx';
import type { MenuItem } from './dropdown-menu.tsx';
import { Sidebar, type NavItem } from './sidebar.tsx';
import { Topbar } from './topbar.tsx';

interface AppShellProps {
  readonly nav: readonly NavItem<string>[];
  readonly userName: string;
  readonly menuItems: readonly MenuItem[];
  // In de topbalk, vóór het profielmenu (bijv. <ThemeToggle />).
  readonly topbarActions?: ReactNode;
  readonly children: ReactNode;
}

// Layout voor ingelogde schermen: sidebar links (vanaf md), topbar met profielmenu, inhoud. Op smalle schermen opent de
// menuknop dezelfde navigatie in een sheet die vanaf links over het scherm schuift. Breakpoints in CSS, geen matchMedia (framework §7).
export function AppShell({ nav, userName, menuItems, topbarActions, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={uiTexts.openMenu}
      className="md:hidden"
      onClick={() => {
        setMenuOpen(true);
      }}
    >
      <Menu aria-hidden="true" />
    </Button>
  );

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      <aside className="hidden border-e bg-sidebar md:block">
        <Sidebar items={nav} />
      </aside>
      <div className="flex min-w-0 flex-col">
        <Topbar userName={userName} menuItems={menuItems} start={menuButton} actions={topbarActions} />
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
      <Dialog
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title={uiTexts.mainMenu}
        closeLabel={uiTexts.close}
        variant="sheet"
      >
        {/* Een klik op een link sluit het menu; de router navigeert. */}
        <div
          onClickCapture={() => {
            setMenuOpen(false);
          }}
        >
          <Sidebar items={nav} />
        </div>
      </Dialog>
    </div>
  );
}
