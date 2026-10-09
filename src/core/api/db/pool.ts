import pg from 'pg';

// Kleine pool per proces (framework §2): API en database staan in dezelfde regio, een request houdt een verbinding
// maar één transactie vast.
const POOL_SIZE = 5;
const IDLE_TIMEOUT_MS = 10_000;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: POOL_SIZE, idleTimeoutMillis: IDLE_TIMEOUT_MS });
}
