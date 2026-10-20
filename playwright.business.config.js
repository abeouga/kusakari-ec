import { defineConfig } from '@playwright/test';
import base from './playwright.custom-login.config.js';

export default defineConfig({
  ...base,
  testMatch: ['business*.spec.js', 'custom-login.spec.js', 'guest-cart.spec.js'],
  timeout: 180000,
  expect: { timeout: 20000 },
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'artifacts/business/report.json' }]],
  outputDir: 'artifacts/business/results',
  use: { ...base.use, trace: 'off', viewport: { width: 1440, height: 1000 } },
  webServer: base.webServer.map((server, index) =>
    index === 0
      ? {
          ...server,
          env: { ...server.env, KUSAKARI_CANVAS_API_URL: 'http://127.0.0.1:18280' },
        }
      : server,
  ),
});
