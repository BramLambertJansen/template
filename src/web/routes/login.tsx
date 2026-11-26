import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { LoginPage } from '#web/features/login/login-page.tsx';
import { actorFromMe, homeFor, meQuery } from '#web/lib/session.ts';

// Publiek (framework §3): het inlogscherm. Al ingelogd → door naar de start van de rol (spec accountbeheer).
const search = z.object({
  redirect: z.string().optional().catch(undefined),
  ingesteld: z.boolean().optional().catch(undefined),
  // Na een nieuw wachtwoord via een resetlink (spec accountbeheer-uitbreiding).
  gewijzigd: z.boolean().optional().catch(undefined),
  sessie: z.literal('verlopen').optional().catch(undefined),
});

export const Route = createFileRoute('/login')({
  validateSearch: search,
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.query(meQuery).catch(() => null);
    if (me !== null) redirect({ to: homeFor(actorFromMe(me)), throw: true });
  },
  component: LoginRoute,
});

function LoginRoute() {
  const { redirect: target, ingesteld, gewijzigd, sessie } = Route.useSearch();
  const notice =
    ingesteld === true ? 'ingesteld' : gewijzigd === true ? 'gewijzigd' : sessie === 'verlopen' ? 'verlopen' : null;
  return <LoginPage notice={notice} redirect={target} />;
}
