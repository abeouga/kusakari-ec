import { defineConfig } from '@playwright/test';
import { fromRoot } from './paths.js';
import base from './playwright.shopping-regression.config.js';
export default defineConfig({ ...base,
  testMatch: ['cart-ux.spec.js','garden-thumbnail.spec.js','shop.spec.js','crud.spec.js','canvas-integration.spec.js'],
  reporter: [['list'],['json',{outputFile: fromRoot('artifacts/e2e/cart-ux-results.json')}]],
  outputDir: fromRoot('artifacts/cart-ux-results'),
});
