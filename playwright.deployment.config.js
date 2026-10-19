import { defineConfig } from '@playwright/test';

const site = process.env.KUSAKARI_DEPLOY_SITE;
if (!site) throw new Error('KUSAKARI_DEPLOY_SITE must point to the packaged site directory.');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
export default defineConfig({
  testDir: './e2e', testMatch: 'deployment.spec.js', workers: 1, timeout: 180000,
  expect: { timeout: 20000 }, outputDir: 'artifacts/deployment-results',
  reporter: [['list'], ['json', { outputFile: 'artifacts/deployment-report.json' }]],
  use: { baseURL: 'http://127.0.0.1:15486', browserName: 'chromium', channel: 'chromium',
    viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: [
    { command: 'node scripts/api.mjs verify-container', cwd: '../kusakari-canvas', url: 'http://127.0.0.1:18181/health/ready',
      reuseExistingServer: false, timeout: 120000, env: { KUSAKARI_CANVAS_PROFILE: 'e2e',
        KUSAKARI_PUBLIC_ORIGIN: 'http://127.0.0.1:15486',
        KUSAKARI_CANVAS_API_PREFIX: '/canvas', KUSAKARI_CANVAS_PORT: '18181',
        KUSAKARI_CANVAS_E2E_EC_URL: 'http://127.0.0.1:18186',
        KUSAKARI_CANVAS_E2E_EC_IMAGE_ORIGIN: 'http://127.0.0.1:15486' } },
    { command: 'node scripts/api.mjs e2e', url: 'http://127.0.0.1:18186/api/health/ready',
      reuseExistingServer: false, timeout: 120000, stdout: 'pipe', env: { SPRING_PROFILES_ACTIVE: 'container',
        KUSAKARI_PRIVATE_PREVIEW: 'true', KUSAKARI_PUBLIC_ORIGIN: 'http://127.0.0.1:15486',
        KUSAKARI_EC_E2E_API_PORT: '18186', KUSAKARI_EC_SECURE_COOKIE: 'false',
        KUSAKARI_EC_E2E_WEB_ORIGIN: 'http://127.0.0.1:15486',
        KUSAKARI_EC_E2E_CANVAS_ORIGIN: 'http://127.0.0.1:15486',
        JAVA_TOOL_OPTIONS: '-Xms64m -Xmx512m',
        KUSAKARI_EC_DB_SSL_MODE: 'DISABLED', KUSAKARI_CANVAS_API_URL: 'http://127.0.0.1:18181/canvas' } },
    { command: `node scripts/preview-deployment.mjs "${site}"`, url: 'http://127.0.0.1:15486/canvas/',
      reuseExistingServer: false, timeout: 30000 },
  ],
});
