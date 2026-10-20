import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
import base from './playwright.auth.config.js';

const local = Object.fromEntries(
  readFileSync(new URL('./.env', import.meta.url), 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')];
    }),
);
const servers =
  /** @type {import('@playwright/test').TestConfig['webServer'] & Array<import('@playwright/test').WebServerConfig>} */ (
    base.webServer
  );

export default defineConfig({
  ...base,
  testMatch: 'custom-login.spec.js',
  timeout: 90000,
  reporter: [['list'], ['json', { outputFile: 'artifacts/custom-login/report.json' }]],
  outputDir: 'artifacts/custom-login/results',
  // Requests contain real credentials: never record browser traces or HARs.
  use: { ...base.use, trace: 'off' },
  webServer: servers.map((server, index) =>
    index === 0
      ? {
          ...server,
          env: {
            ...server.env,
            ...Object.fromEntries(
              ['KUSAKARI_COGNITO_CLIENT_ID', 'KUSAKARI_COGNITO_ISSUER', 'KUSAKARI_COGNITO_DOMAIN'].map((key) => {
                if (!local[key]) throw new Error(`Missing ${key}`);
                return [key, local[key]];
              }),
            ),
          },
        }
      : server,
  ),
});
