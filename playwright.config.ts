import { defineConfig, devices } from '@playwright/test';

// E2E draait altijd tegen de echte lokale stack, nooit met een gemockte API. Lokaal start de eigenaar die met
// `pnpm dev`; in de runner van `pnpm ui:check` (ADR 0009) start Playwright de API en Vite zelf.
const webPort = process.env['WEB_PORT'] ?? '5173';
const baseURL = `http://127.0.0.1:${webPort}`;
const inRunner = process.env['RUNNER'] === '1';
const outputDir = process.env['RUNNER_OUTPUT_DIR'];

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: true,
  use: { baseURL },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  ...(outputDir === undefined ? {} : { outputDir: `${outputDir}/test-results` }),
  ...(inRunner
    ? {
        webServer: [
          { command: 'node src/api/server.ts', url: 'http://127.0.0.1:8787/api/health' },
          { command: 'node node_modules/vite/bin/vite.js --configLoader native', url: baseURL },
        ],
      }
    : {}),
});
