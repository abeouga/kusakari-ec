import { defineConfig } from '@playwright/test';
import base from './playwright.shopping-regression.config.js';

export default defineConfig({
  ...base,
  testMatch: [
    'product-create.spec.js',
    'product-input.spec.js',
    'plant-ai.spec.js',
    'crud.spec.js',
    'product-media.spec.js',
  ],
  grep: /product|plant/,
  reporter: [
    ['list'],
    ['json', { outputFile: 'artifacts/e2e/product-input-results.json' }],
    ['html', { outputFolder: 'artifacts/product-input-report', open: 'never' }],
  ],
  outputDir: 'artifacts/product-input-results',
});
