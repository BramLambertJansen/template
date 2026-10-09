import { defineConfig } from 'vitest/config';

// unit draait in de sandbox; int alleen via `pnpm test:db` tegen de lokale stack (framework §4, Tests).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/**/*.int.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'int',
          include: ['src/**/*.int.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
