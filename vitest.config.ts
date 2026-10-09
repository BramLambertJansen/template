import { defineConfig } from 'vitest/config';

// unit draait in de sandbox; int alleen via `pnpm test:db` in de runner (framework §4, Tests; ADR 0009).
// In de runner is de repo read-only: de cache gaat dan naar RUNNER_CACHE_DIR.
const runnerCache = process.env['RUNNER_CACHE_DIR'];

export default defineConfig({
  ...(runnerCache === undefined ? {} : { cacheDir: runnerCache }),
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['{src,test}/**/*.test.{ts,tsx}'],
          exclude: ['**/*.int.test.ts', 'test/rails/fixtures/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'int',
          include: ['{src,test}/**/*.int.test.ts'],
          exclude: ['test/rails/fixtures/**'],
          environment: 'node',
        },
      },
    ],
  },
});
