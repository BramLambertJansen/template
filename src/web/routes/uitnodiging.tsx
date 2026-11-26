import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { InvitationPage } from '#web/features/invitation/invitation-page.tsx';

// Publiek (framework §3): de link uit de uitnodigingsmail en uit de resetmail (`soort=reset`, spec accountbeheer-uitbreiding;
// INVITATION_PATH in src/core/api/auth/options.ts). Zonder of met een onbekende soort: de uitnodiging.
export const Route = createFileRoute('/uitnodiging')({
  validateSearch: z.object({
    token: z.string().optional().catch(undefined),
    soort: z.enum(['uitnodiging', 'reset']).optional().catch(undefined),
  }),
  component: InvitationRoute,
});

function InvitationRoute() {
  const { token, soort } = Route.useSearch();
  return <InvitationPage token={token} soort={soort ?? 'uitnodiging'} />;
}
