import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { RouterContext } from '#web/lib/session.ts';

// Wortel van de bestandsroutes (framework §5). ErrorBoundary en "niet gevonden" per route via de router (main.tsx).
export const Route = createRootRouteWithContext<RouterContext>()({ component: Outlet });
