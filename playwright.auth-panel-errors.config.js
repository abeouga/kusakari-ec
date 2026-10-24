import { defineConfig } from '@playwright/test';
import base from './playwright.custom-login.config.js';

// Real Cognito/MySQL; logout and cart handoff failures are injected only by aborting those requests.
export default defineConfig({
  ...base,
  testMatch: 'auth-panel-errors.spec.js',
  reporter: [['list'], ['json', { outputFile: 'artifacts/auth-panel-errors/report.json' }]],
  outputDir: 'artifacts/auth-panel-errors/results',
});
