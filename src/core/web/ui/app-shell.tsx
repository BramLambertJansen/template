import { Menu } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  // Verandert bij elke routewissel (bijv. het pad); de focus gaat dan naar de h1 van het nieuwe scherm (WCAG 2.4.3).
  readonly routeKey?: string;
  readonly children: ReactNode;
}

const MAIN_ID = 'inhoud';

// Na een routewissel (niet bij het eerste scherm) de focus naar de h1 van het nieuwe scherm, of naar main als die er
// (nog) niet is. Zo leest een schermlezer de nieuwe titel voor, en begint Tab bovenaan de inhoud. Na de render, zodat
// een sluitend menu zijn focus eerst teruggeeft.
function useFocusOnRouteChange(routeKey: string | undefined) {
  const mainRef = useRef<HTMLElement>(null);
  const previous = useRef(routeKey);
  useEffect(() => {
    if (previous.current === routeKey) return;
    previous.current = routeKey;
    const frame = requestAnimationFrame(() => {
      const main = mainRef.current;
      (main?.querySelector<HTMLElement>('h1') ?? main)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [routeKey]);
  return mainRef;
}

// Layout voor ingelogde schermen: sidebar links (vanaf md), topbar met profielmenu, inhoud. Op smalle schermen opent de
// menuknop dezelfde navigatie in een sheet die vanaf links over het scherm schuift. Breakpoints in CSS, geen matchMedia (framework §7).
export function AppShell({ nav, userName, menuItems, topbarActions, routeKey, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useFocusOnRouteChange(routeKey);
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
      {/* Eerste Tab-stop (WCAG 2.4.1): langs sidebar en topbalk direct naar de inhoud. Alleen zichtbaar met focus. */}
      <a
        href={`#${MAIN_ID}`}
        className="sr-only rounded-md bg-background px-3 py-2 text-sm text-foreground focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:ring-2 focus:ring-ring"
      >
        {uiTexts.skipToContent}
      </a>
      <aside className="hidden border-e bg-sidebar md:block">
        <Sidebar items={nav} />
      </aside>
      <div className="flex min-w-0 flex-col">
        <Topbar userName={userName} menuItems={menuItems} start={menuButton} actions={topbarActions} />
        <main ref={mainRef} id={MAIN_ID} tabIndex={-1} className="min-w-0 flex-1 p-4 focus:outline-none md:p-6">
          {children}
        </main>
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
