import { defineConfig } from '@playwright/test';
import { fromRoot } from './paths.js';
import base from './playwright.shopping-regression.config.js';

export default defineConfig({
  ...base,
  testMatch: ['canvas-integration.spec.js', 'canvas-commerce.spec.js'],
  testIgnore: [],
  reporter: [['list'], ['json', { outputFile: fromRoot('artifacts/e2e/shopping-integration-results.json') }],
    ['html', { outputFolder: fromRoot('artifacts/shopping-integration-report'), open: 'never' }]],
  outputDir: fromRoot('artifacts/shopping-integration-results'),
});
