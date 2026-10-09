import { defineConfig } from 'vitest/config';

// unit draait in de sandbox; int alleen via `pnpm test:db` tegen de lokale stack (framework §4, Tests).
export default defineConfig({
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
          environment: 'node',
        },
      },
    ],
  },
});
