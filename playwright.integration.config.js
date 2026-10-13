import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from './playwright.config.js';

const canvasRoot = fileURLToPath(new URL('../kusakari-canvas/', import.meta.url));
export default defineConfig({
  ...base,
  testMatch: 'canvas-integration.spec.js',
  testIgnore: [],
  timeout: 90000,
  webServer: [
    base.webServer[0],
    { ...base.webServer[1], env: { ...base.webServer[1].env, VITE_KUSAKARI_CANVAS_URL: 'http://127.0.0.1:15173/' } },
    {
      command: 'node scripts/api.mjs dev',
      cwd: canvasRoot,
      url: 'http://127.0.0.1:18080/api/assets',
      timeout: 120000,
      reuseExistingServer: false,
      env: { KUSAKARI_CANVAS_PROFILE: 'e2e', KUSAKARI_CANVAS_HOST: '127.0.0.1', KUSAKARI_CANVAS_PORT: '18080' },
    },
    {
      command: 'npm --workspace frontend run dev -- --port 15173',
      cwd: canvasRoot,
      url: 'http://127.0.0.1:15173',
      reuseExistingServer: false,
      env: { KUSAKARI_CANVAS_API_TARGET: 'http://127.0.0.1:18080', VITE_KUSAKARI_EC_URL: 'http://127.0.0.1:15186/' },
    },
  ],
});
