import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { Dialog } from './dialog.tsx';
import { Sidebar, type NavItem } from './sidebar.tsx';

// Gedeeld door SidebarShell en TopbarShell (spec schillen): de menuknop in de balk en de sheet met alle items die hij
// opent. Gewone functies, geen componenten: de schillen zijn de componenten in de catalogus.

export function shellMenuButton(onOpen: () => void, className: string): ReactNode {
  return (
    <Button variant="ghost" size="icon" aria-label={uiTexts.openMenu} className={className} onClick={onOpen}>
      <Menu aria-hidden="true" />
    </Button>
  );
}

interface MenuSheetOptions {
  readonly nav: readonly NavItem<string>[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

// Op smalle schermen schuift de navigatie vanaf links over het scherm. Een klik op een link sluit het menu; de router
// navigeert.
export function shellMenuSheet({ nav, open, onOpenChange }: MenuSheetOptions): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={uiTexts.mainMenu} closeLabel={uiTexts.close} variant="sheet">
      <div
        onClickCapture={() => {
          onOpenChange(false);
        }}
      >
        <Sidebar items={nav} />
      </div>
    </Dialog>
  );
}
