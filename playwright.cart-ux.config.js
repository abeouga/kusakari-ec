import { defineConfig } from '@playwright/test';
import base from './playwright.shopping-regression.config.js';
export default defineConfig({ ...base,
  testMatch: ['cart-ux.spec.js','garden-thumbnail.spec.js','shop.spec.js','crud.spec.js','canvas-integration.spec.js'],
  reporter: [['list'],['json',{outputFile:'artifacts/e2e/cart-ux-results.json'}]],
  outputDir:'artifacts/cart-ux-results',
});
