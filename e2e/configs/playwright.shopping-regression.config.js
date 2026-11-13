import { defineConfig } from '@playwright/test';
import { fromRoot } from './paths.js';
import base from './playwright.business.config.js';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

// Issue #113: the cart, orders and Canvas need a signed-in buyer (real Cognito), so these suites share the business
// servers: EC API 18286 and screen 15286, Canvas API 18280 and screen 15273, the dedicated MySQL (kusakari_e2e).
export default defineConfig({
  ...base,
  testMatch: ['shop.spec.js', 'crud.spec.js', 'workspace.spec.js', 'api.spec.js', 'seller-products.spec.js', 'sidebar.spec.js'],
  timeout: 120000,
  reporter: [['list'], ['json', { outputFile: fromRoot('artifacts/e2e/shopping-regression-results.json') }],
    ['html', { outputFolder: fromRoot('artifacts/shopping-regression-report'), open: 'never' }]],
  outputDir: fromRoot('artifacts/shopping-regression-results'),
});
