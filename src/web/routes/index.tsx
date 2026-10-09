import { createFileRoute } from '@tanstack/react-router';
import { HealthPage } from '#web/features/health/health-page.tsx';

// Publiek (framework §3): de skeletpagina met alleen de API-status, zonder guard. Vervalt met de ingelogde startpagina (PR 7).
export const Route = createFileRoute('/')({ component: HealthPage });
