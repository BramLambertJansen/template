import { defineConfig, devices } from '@playwright/test';

// E2E draait altijd tegen de echte lokale stack (`pnpm dev`), nooit met een gemockte API.
const baseURL = `http://127.0.0.1:${process.env['WEB_PORT'] ?? '5173'}`;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: true,
  use: { baseURL },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
});
