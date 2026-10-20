import { defineConfig } from '@playwright/test';
import base from './playwright.business.config.js';

export default defineConfig({
  ...base,
  testMatch: 'shopping-picker.spec.js',
  reporter: [['list'], ['json', { outputFile: 'artifacts/shopping-picker/report.json' }]],
  outputDir: 'artifacts/shopping-picker/results',
  use: { ...base.use, trace: 'off', screenshot: 'only-on-failure' },
});
