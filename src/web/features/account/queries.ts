import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '#web/lib/api.ts';
import { auth } from '#web/lib/auth.ts';
import { meQuery } from '#web/lib/session.ts';

// Het eigen account (spec eigen-account). Elke mutatie invalideert `me` en alles eronder (`me/sessions`).
export const accountKeys = {
  me: meQuery.queryKey,
};

export function useRename() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (naam: string) => api.call('PATCH /me', { naam }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.me }),
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ huidig, nieuw }: { readonly huidig: string; readonly nieuw: string }) =>
      auth.changePassword(huidig, nieuw),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.me }),
  });
}
