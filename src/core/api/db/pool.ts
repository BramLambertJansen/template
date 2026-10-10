import pg from 'pg';

// Kleine pool per proces (framework §2): API en database staan in dezelfde regio, een request houdt een verbinding
// maar één transactie vast.
const POOL_SIZE = 5;
const IDLE_TIMEOUT_MS = 10_000;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: POOL_SIZE, idleTimeoutMillis: IDLE_TIMEOUT_MS });
}

// Readiness (framework §3, ADR 0018): kan de API de database bereiken? Een eigen verbinding (max 1), los van de pool van
// withUser(): een volle pool onder belasting maakt de instantie niet "niet klaar", en een hangende ping houdt geen plek
// van een request vast. Verbinden en de query zijn elk begrensd op timeoutMs; na een fout wordt de verbinding weggegooid,
// zodat een half-open verbinding nooit blijft hangen. Draait als api_user zonder withUser(); `select 1` raakt geen tabel.
export interface Ping {
  readonly ping: () => Promise<void>;
  readonly end: () => Promise<void>;
}

export function createPing(connectionString: string, timeoutMs: number): Ping {
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    keepAlive: true,
    // Herkenbaar in pg_stat_activity (en in de integratietest).
    application_name: 'readiness',
  });
  // Een idle verbinding die wegvalt (herstart of failover van de database) meldt pg-pool als 'error' op de pool; zonder
  // listener stopt dat het proces. De pool gooit de verbinding weg; de volgende ping verbindt opnieuw of meldt de fout.
  pool.on('error', () => undefined);
  return {
    ping: async () => {
      const client = await pool.connect();
      try {
        await client.query('select 1');
        client.release();
      } catch (error) {
        client.release(true);
        throw error;
      }
    },
    end: async () => {
      await pool.end();
    },
  };
}
