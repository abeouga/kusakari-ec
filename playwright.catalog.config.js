import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
  ...base,
  testMatch: 'catalog-pagination.spec.js',
  timeout: 90000,
  reporter: [['list'], ['json', { outputFile: 'artifacts/catalog-pagination/report.json' }]],
  outputDir: 'artifacts/catalog-pagination/results',
  use: { ...base.use, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' },
  // Build first; serve the saved bundle so concurrent source edits cannot trigger HMR during scroll checks.
  webServer: base.webServer.map((server, index) =>
    index === 1
      ? {
          ...server,
          command: 'npm --workspace frontend exec -- vite preview --host 127.0.0.1 --port 15186 --strictPort',
        }
      : server,
  ),
});
