import { defineConfig } from '@playwright/test';
import base from './playwright.custom-login.config.js';

export default defineConfig({
  ...base,
  testMatch: 'hero-carousel.spec.js',
  timeout: 90000,
  reporter: [['list'], ['html', { outputFolder: 'artifacts/hero/report', open: 'never' }]],
  outputDir: 'artifacts/hero/results',
  use: { ...base.use, viewport: { width: 1440, height: 1000 } },
  // The carousel uses only the EC API; do not start unrelated Canvas services.
  webServer: base.webServer.slice(0, 2),
});
