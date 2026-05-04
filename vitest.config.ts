import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'happy-dom',
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov', 'html'],
      all: true,
      skipFull: false,
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/index.ts',
        'src/**/*.d.ts',
        'src/manifest.ts',
        // .tsx (Preact components) are tested via Playwright E2E, not unit tests.
        // Including them here breaks Rolldown's instrumentation parser.
        'src/**/*.tsx',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
