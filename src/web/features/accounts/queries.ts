import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type { inviteInput } from '#shared/contracts/accounts.ts';
import { api } from '#web/lib/api.ts';

// Accounts (spec accountbeheer): lijst per pagina met cursor; uitnodigen en opnieuw uitnodigen invalideren de lijst.
export const accountKeys = {
  all: ['accounts'] as const,
  list: () => [...accountKeys.all, 'list'] as const,
};

const firstPage: string | null = null;

export function useAccounts() {
  return useInfiniteQuery({
    queryKey: accountKeys.list(),
    queryFn: ({ pageParam }) => api.call('GET /accounts', pageParam === null ? {} : { cursor: pageParam }),
    initialPageParam: firstPage,
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function useInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: z.input<typeof inviteInput>) => api.call('POST /accounts/invite', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  });
}

export function useReinvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.call('POST /accounts/:id/reinvite', { id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  });
}
