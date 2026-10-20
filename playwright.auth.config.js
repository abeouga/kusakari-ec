import { defineConfig } from '@playwright/test';

// Real APIs/MySQL; the provider URL is inspected without contacting or impersonating Cognito.
export default defineConfig({
  testDir: './e2e', testMatch: 'auth.spec.js', workers: 1, timeout: 45000,
  reporter: [['list'], ['json', { outputFile: 'artifacts/auth/report.json' }]],
  outputDir: 'artifacts/auth/results',
  use: { baseURL: 'http://127.0.0.1:15286', browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node scripts/api.mjs e2e', url: 'http://127.0.0.1:18286/api/health', reuseExistingServer: false, timeout: 90000,
      env: { SPRING_PROFILES_ACTIVE: 'cognito', KUSAKARI_EC_E2E_API_PORT: '18286',
        KUSAKARI_EC_E2E_WEB_ORIGIN: 'http://127.0.0.1:15286', KUSAKARI_EC_E2E_CANVAS_ORIGIN: 'http://127.0.0.1:15273',
        KUSAKARI_COGNITO_CLIENT_ID: 'offlineverification',
        KUSAKARI_COGNITO_ISSUER: 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_OFFLINE_TEST',
        KUSAKARI_COGNITO_DOMAIN: 'https://kusakari-offline-test.auth.ap-northeast-1.amazoncognito.com' } },
    { command: 'npm --workspace frontend run dev -- --port 15286', url: 'http://127.0.0.1:15286', reuseExistingServer: false,
      env: { KUSAKARI_EC_API_TARGET: 'http://127.0.0.1:18286', VITE_KUSAKARI_CANVAS_URL: 'http://127.0.0.1:15273/' } },
    { command: 'node scripts/api.mjs dev', cwd: '../kusakari-canvas', url: 'http://127.0.0.1:18280/health/ready',
      reuseExistingServer: false, timeout: 90000, env: { KUSAKARI_CANVAS_PROFILE: 'e2e', KUSAKARI_CANVAS_HOST: '127.0.0.1',
        KUSAKARI_CANVAS_PORT: '18280', KUSAKARI_AUTH_MODE: 'cognito', KUSAKARI_CANVAS_AUTH_EC_URL: 'http://127.0.0.1:18286' } },
    { command: 'npm --workspace frontend run dev -- --port 15273', cwd: '../kusakari-canvas', url: 'http://127.0.0.1:15273',
      reuseExistingServer: false, env: { KUSAKARI_CANVAS_API_TARGET: 'http://127.0.0.1:18280', VITE_KUSAKARI_EC_URL: 'http://127.0.0.1:15286/' } },
  ],
});
