import { defineConfig } from '@playwright/test';
import base from './playwright.shopping-regression.config.js';

export default defineConfig({
  ...base,
  testMatch: ['canvas-integration.spec.js', 'canvas-commerce.spec.js'],
  testIgnore: [],
  reporter: [['list'], ['json', { outputFile: 'artifacts/e2e/shopping-integration-results.json' }],
    ['html', { outputFolder: 'artifacts/shopping-integration-report', open: 'never' }]],
  outputDir: 'artifacts/shopping-integration-results',
});
