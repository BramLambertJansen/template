import { useQuery } from '@tanstack/react-query';
import { api } from '#web/lib/api.ts';

// Versie en build van de server voor de voet van de schil (spec release-versie, addendum): één keer per sessie, geen
// herhaalpoging. buildInfo() gooit nooit; null betekent geen voet.
// enabled=false (op /design-system): geen aanroep.
export function useBuildInfo(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['build-info'],
    queryFn: () => api.buildInfo(),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
