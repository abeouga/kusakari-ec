import { defineConfig } from '@playwright/test';
import { fromRoot } from './paths.js';
import base from './playwright.business.config.js';

export default defineConfig({
  ...base,
  testMatch: ['shopping-picker.spec.js', 'shopping-list-card.spec.js'],
  reporter: [['list'], ['json', { outputFile: fromRoot('artifacts/shopping-picker/report.json') }]],
  outputDir: fromRoot('artifacts/shopping-picker/results'),
  use: { ...base.use, trace: 'off', screenshot: 'only-on-failure' },
});
