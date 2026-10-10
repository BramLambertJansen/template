import { createFileRoute } from '@tanstack/react-router';
import { AccountsPage } from '#web/features/accounts/accounts-page.tsx';
import { guard } from '#web/lib/session.ts';

export const Route = createFileRoute('/_app/admin/accounts')({
  beforeLoad: guard('accounts:read'),
  component: AccountsPage,
});
