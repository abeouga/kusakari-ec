import { defineConfig } from '@playwright/test';
import base from './playwright.shopping-regression.config.js';

export default defineConfig({
  ...base,
  // product-create / product-input moved to business-product-*.spec.js (signed-in seller, issue #46).
  testMatch: ['plant-ai.spec.js', 'crud.spec.js', 'product-media.spec.js'],
  grep: /product|plant/,
  reporter: [
    ['list'],
    ['json', { outputFile: 'artifacts/e2e/product-input-results.json' }],
    ['html', { outputFolder: 'artifacts/product-input-report', open: 'never' }],
  ],
  outputDir: 'artifacts/product-input-results',
});
