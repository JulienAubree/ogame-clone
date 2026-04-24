import { defineConfig } from 'vitest/config';

// Vitest is for unit tests; Playwright-driven specs live under e2e/ and have
// their own runner (pnpm test:e2e / test:e2e:staging).
export default defineConfig({
  test: {
    exclude: ['node_modules', 'dist', 'e2e/**', '.turbo/**'],
  },
});
