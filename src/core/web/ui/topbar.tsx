import type { ReactNode } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { initials } from './avatar.tsx';
import { DropdownMenu, type MenuItem } from './dropdown-menu.tsx';

// Initialen voor de profielknop wonen bij Avatar (spec ui-weergave-basis/AC-5); her-export voor bestaande imports.
export { initials };

interface TopbarProps {
  readonly userName: string;
  readonly menuItems: readonly MenuItem[];
  // Links in de balk, bijv. de menuknop op smalle schermen (AppShell).
  readonly start?: ReactNode;
  // Rechts, vóór het profielmenu: bijv. de themaschakelaar (AppShell).
  readonly actions?: ReactNode;
}

// Profielmenu rechts (spec accountbeheer: knop met initialen, toegankelijke naam "Profielmenu").
export function Topbar({ userName, menuItems, start, actions }: TopbarProps) {
  return (
    <header className="flex min-h-14 items-center gap-2 border-b bg-background px-3 print:hidden">
      {start}
      <div className="ms-auto flex items-center gap-1">
        {actions}
        <DropdownMenu
          items={menuItems}
          trigger={
            <Button variant="ghost" size="icon" aria-label={uiTexts.profileMenu} className="rounded-full">
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
              >
                {initials(userName)}
              </span>
            </Button>
          }
        />
      </div>
    </header>
  );
}
