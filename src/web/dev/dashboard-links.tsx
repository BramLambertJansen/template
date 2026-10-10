import { Link } from '@tanstack/react-router';
import { Button } from '#web/ui/index.ts';

// Alleen lokaal (besluit eigenaar 2026-10-10): op het admin-dashboard een link naar de componentcatalogus. src/web/dev is
// leeg in de productiebundel; de tekst staat daarom hier en niet in src/web/copy.
export function DevDashboardLinks() {
  return (
    <Button asChild variant="outline">
      <Link to="/design-system">Design system</Link>
    </Button>
  );
}
