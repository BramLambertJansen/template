import { useEffect, useState } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { cn } from './cn.ts';
import { noticeVariants } from './notice.tsx';

// Hoe lang "Weer online." blijft staan; gelijk aan een succes-toast (SUCCESS_MS in toast.tsx).
const BACK_ONLINE_MS = 5000;

type Connection = 'online' | 'offline' | 'restored';

// Alleen navigator.onLine en de events online/offline van window: geen ping, geen globale store (spec offline-en-print).
function useConnection(): Connection {
  const [connection, setConnection] = useState<Connection>(() => (navigator.onLine ? 'online' : 'offline'));

  useEffect(() => {
    const handleOffline = () => {
      setConnection('offline');
    };
    const handleOnline = () => {
      setConnection((previous) => (previous === 'offline' ? 'restored' : previous));
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    // Een wisseling tussen de eerste render en het koppelen hierboven gaf geen event: lees de staat één keer opnieuw.
    if (navigator.onLine) handleOnline();
    else handleOffline();
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // De timer hoort bij de herstelstaat: een nieuwe offline-staat of unmount ruimt hem op.
  useEffect(() => {
    if (connection !== 'restored') return;
    const timer = setTimeout(() => {
      setConnection('online');
    }, BACK_ONLINE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [connection]);

  return connection;
}

// Niet-blokkerende melding dat het netwerk weg is en, kort, dat het terug is. Beleefd voorgelezen via role="status", geen
// Tab-stop, verplaatst de focus niet; verdwijnt bij afdrukken. Elke schil rendert hem al (ShellFrame); plaats hem zelf alleen op een
// scherm zonder schil (docs/offline-en-print.md).
export function OfflineNotice() {
  const connection = useConnection();
  if (connection === 'online') return null;
  const offline = connection === 'offline';
  return (
    <p role="status" className={cn(noticeVariants({ tone: offline ? 'warning' : 'success' }), 'print:hidden')}>
      {offline ? uiTexts.offline : uiTexts.backOnline}
    </p>
  );
}
