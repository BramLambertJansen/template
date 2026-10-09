import { useEffect, useState } from 'react';
import { api } from '#web/lib/api.ts';

type Status = 'laden' | 'ok' | 'fout';

const text: Record<Status, string> = {
  laden: 'API-status: laden…',
  ok: 'API-status: ok',
  fout: 'API-status: niet bereikbaar',
};

// Skeletpagina (framework §3): vervalt zodra er een ingelogde startpagina is.
export function HealthPage() {
  const [status, setStatus] = useState<Status>('laden');

  useEffect(() => {
    api.api.health
      .$get()
      .then((response) => {
        setStatus(response.ok ? 'ok' : 'fout');
      })
      .catch(() => {
        setStatus('fout');
      });
  }, []);

  return (
    <main>
      <h1>App-template</h1>
      <p role="status">{text[status]}</p>
    </main>
  );
}
