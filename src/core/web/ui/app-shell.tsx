// AppShell is de naam van de schil van vóór de spec schillen; hij verwijst naar SidebarShell, zodat bestaande apps niets
// hoeven te wijzigen (spec schillen, OV-3). Nieuwe code kiest SidebarShell of TopbarShell.
export { SidebarShell as AppShell } from './sidebar-shell.tsx';
