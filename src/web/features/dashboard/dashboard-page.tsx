import { Link } from '@tanstack/react-router';
import { copy } from '#web/copy/ui.ts';
import { Button, PageHeader } from '#web/ui/index.ts';

// Dashboard van een admin (spec accounts/AC-3): titel en de link naar de accounts.
export function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={copy.dashboard.title} />
      <div>
        <Button asChild variant="outline">
          <Link to="/admin/accounts">{copy.dashboard.accounts}</Link>
        </Button>
      </div>
    </div>
  );
}
