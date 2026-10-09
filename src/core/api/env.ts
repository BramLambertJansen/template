// Enige plek met process.env (framework §4). Het volledige env-schema (zod, APP_ENV, secrets-regels) volgt in roadmap stuk 2.

const DEFAULT_API_PORT = 8787;

export function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Ongeldige poort: ${value}`);
  }
  return port;
}

export const env = {
  apiPort: parsePort(process.env['API_PORT'], DEFAULT_API_PORT),
  // Verplicht zodra src/core/api/db geladen wordt (die faalt dan bij opstart); het env-schema volgt in stuk 2.
  databaseUrl: process.env['DATABASE_URL'],
};
