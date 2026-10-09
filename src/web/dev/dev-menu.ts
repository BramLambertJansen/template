import type { QueryClient } from '@tanstack/react-query';
import type { useNavigate } from '@tanstack/react-router';
import type { MenuItem } from '#web/ui/index.ts';
import { switchRole } from './switch-role.ts';

// Extra items in het profielmenu, alleen lokaal (spec accountbeheer: "Wissel naar gebruiker" / "Wissel naar beheerder").
export function devMenuItems(queryClient: QueryClient, navigate: ReturnType<typeof useNavigate>): MenuItem[] {
  return [
    { label: 'Wissel naar gebruiker', onSelect: () => void switchRole('user', queryClient, navigate) },
    { label: 'Wissel naar beheerder', onSelect: () => void switchRole('admin', queryClient, navigate) },
  ];
}
