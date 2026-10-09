import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

// Vaste nonce alleen voor de dev-server: Vite en de React-preamble zetten inline tags. De build en `vite preview`
// gebruiken exact de CSP uit framework §6, zonder nonce.
const DEV_NONCE = 'dev-only-nonce';

function contentSecurityPolicy(nonce?: string): string {
  const extra = nonce === undefined ? '' : ` 'nonce-${nonce}'`;
  return [
    "default-src 'self'",
    `script-src 'self'${extra}`,
    `style-src 'self'${extra}`,
    "connect-src 'self'",
    "img-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

function securityHeaders(nonce?: string): Record<string, string> {
  return {
    'Content-Security-Policy': contentSecurityPolicy(nonce),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

// Eén bron: browserslist in package.json ("safari >= 16.4") → build.target ("safari16.4").
function buildTarget(queries: readonly string[]): string[] {
  return queries.map((query) => {
    const match = /^(\w+) >= ([\d.]+)$/.exec(query);
    if (match?.[1] === undefined || match[2] === undefined) {
      throw new Error(`browserslist-regel niet te vertalen naar build.target: ${query}`);
    }
    return `${match[1]}${match[2]}`;
  });
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '');
  const webPort = Number(env['WEB_PORT'] ?? '5173');
  const apiTarget = `http://127.0.0.1:${env['API_PORT'] ?? '8787'}`;
  const proxy = { '/api': { target: apiTarget } };
  const isDev = command === 'serve' && mode === 'development';

  // In de runner (ADR 0009) is de repo read-only: de cache gaat dan naar RUNNER_CACHE_DIR.
  const runnerCache = env['RUNNER_CACHE_DIR'];

  return {
    root: 'src/web',
    ...(runnerCache === undefined ? {} : { cacheDir: runnerCache }),
    envDir: import.meta.dirname,
    plugins: [react()],
    html: isDev ? { cspNonce: DEV_NONCE } : {},
    build: { outDir: '../../dist/web', emptyOutDir: true, target: buildTarget(pkg.browserslist) },
    server: { host: '127.0.0.1', port: webPort, strictPort: true, proxy, headers: securityHeaders(DEV_NONCE) },
    preview: { host: '127.0.0.1', port: webPort, strictPort: true, proxy, headers: securityHeaders() },
  };
});
