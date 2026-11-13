import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Absolute paths keep this base valid when e2e/configs/* extends it.
const repoRoot = fileURLToPath(new URL('./', import.meta.url));
const fromRoot = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  testDir: fromRoot('e2e'),
  // Issue #113: only the signed-out catalog suites run on these servers; every other suite has its own config in
  // e2e/configs (the cart, orders, Canvas and seller screens need a signed-in member and real Cognito).
  testMatch: ['catalog-pagination.spec.js', 'sticky-header.spec.js'],
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: [['list'], ['html', { outputFolder: fromRoot('artifacts/playwright-report'), open: 'never' }]],
  outputDir: fromRoot('artifacts/playwright-results'),
  use: {
    baseURL: 'http://127.0.0.1:15186',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/api.mjs e2e',
      cwd: repoRoot,
      url: 'http://127.0.0.1:18086/api/health',
      timeout: 90000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: 'npm --workspace frontend run dev -- --port 15186',
      cwd: repoRoot,
      env: { KUSAKARI_EC_API_TARGET: 'http://127.0.0.1:18086' },
      url: 'http://127.0.0.1:15186',
      reuseExistingServer: false,
    },
  ],
});
