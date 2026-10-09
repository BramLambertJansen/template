import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HealthPage } from '#web/features/health/health-page.tsx';

const root = document.getElementById('root');
if (root === null) throw new Error('Element #root ontbreekt in index.html');

createRoot(root).render(
  <StrictMode>
    <HealthPage />
  </StrictMode>,
);
