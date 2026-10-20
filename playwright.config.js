import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: [
    'business*.spec.js',
    'acceptance.spec.js',
    'canvas-integration.spec.js',
    'canvas-commerce.spec.js',
    'auth.spec.js',
    'custom-login.spec.js',
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: [['list'], ['html', { outputFolder: 'artifacts/playwright-report', open: 'never' }]],
  outputDir: 'artifacts/playwright-results',
  use: {
    baseURL: 'http://127.0.0.1:15186',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/api.mjs e2e',
      url: 'http://127.0.0.1:18086/api/health',
      timeout: 90000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: 'npm --workspace frontend run dev -- --port 15186',
      env: { KUSAKARI_EC_API_TARGET: 'http://127.0.0.1:18086' },
      url: 'http://127.0.0.1:15186',
      reuseExistingServer: false,
    },
  ],
});
