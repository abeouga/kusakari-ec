import { defineConfig } from '@playwright/test';
process.env.KUSAKARI_ACCEPTANCE_LIVE = 'true';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'acceptance.spec.js',
  workers: 1,
  timeout: 180000,
  expect: { timeout: 20000 },
  use: { browserName: 'chromium', trace: 'off', viewport: { width: 1440, height: 1000 } },
  reporter: [['list'], ['json', { outputFile: 'artifacts/acceptance/report.json' }]],
  outputDir: 'artifacts/acceptance/results',
});
