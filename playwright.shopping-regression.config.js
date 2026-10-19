import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const canvasDirectory = fileURLToPath(new URL('../kusakari-canvas/', import.meta.url));
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['shop.spec.js', 'crud.spec.js', 'workspace.spec.js'],
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['json', { outputFile: 'artifacts/e2e/shopping-regression-results.json' }],
    ['html', { outputFolder: 'artifacts/shopping-regression-report', open: 'never' }]],
  outputDir: 'artifacts/shopping-regression-results',
  use: { baseURL: 'http://127.0.0.1:15286', browserName: 'chromium', channel: 'chromium',
    viewport: { width: 1440, height: 1000 }, actionTimeout: 20000, navigationTimeout: 20000,
    trace: { mode: 'retain-on-failure', screenshots: false }, screenshot: 'only-on-failure' },
  webServer: [
    { command: 'npm run dev:api', cwd: canvasDirectory, url: 'http://127.0.0.1:18081/api/assets',
      timeout: 120000, reuseExistingServer: false,
      env: { KUSAKARI_CANVAS_PROFILE: 'e2e', KUSAKARI_CANVAS_PORT: '18081' } },
    { command: 'node scripts/api.mjs e2e', url: 'http://127.0.0.1:18186/api/health',
      timeout: 90000, reuseExistingServer: false,
      env: { KUSAKARI_CANVAS_API_URL: 'http://127.0.0.1:18081', KUSAKARI_EC_E2E_API_PORT: '18186',
        KUSAKARI_EC_E2E_WEB_ORIGIN: 'http://127.0.0.1:15286' } },
    { command: 'npm --workspace frontend run dev -- --host 127.0.0.1 --port 15173 --strictPort', cwd: canvasDirectory,
      url: 'http://127.0.0.1:15173', reuseExistingServer: false,
      env: { KUSAKARI_CANVAS_API_TARGET: 'http://127.0.0.1:18081', VITE_KUSAKARI_EC_URL: 'http://127.0.0.1:15286/' } },
    { command: 'npm --workspace frontend run dev -- --host 127.0.0.1 --port 15286 --strictPort',
      url: 'http://127.0.0.1:15286', reuseExistingServer: false,
      env: { KUSAKARI_EC_API_TARGET: 'http://127.0.0.1:18186', VITE_KUSAKARI_CANVAS_URL: 'http://127.0.0.1:15173/' } },
  ],
});
