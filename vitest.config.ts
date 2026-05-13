import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'happy-dom',
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
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
        // The SW shim and the chrome.* facade are intentionally not
        // unit-tested — they exist precisely so the rest of the
        // background package can be tested without mocking chrome.*.
        // Both are exercised by Playwright e2e instead.
        'src/background/service-worker.ts',
        'src/background/chrome-api.ts',
      ],
      thresholds: {
        lines: 75,
        functions: 65,
        branches: 60,
        statements: 70,
      },
    },
  },
});
