import { defineConfig } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const site = process.env.KUSAKARI_DEPLOY_SITE;
const artifacts = process.env.KUSAKARI_DEPLOY_ARTIFACTS;
if (process.env.KUSAKARI_LINUX_VERIFICATION !== 'true' || !site || !artifacts) {
  throw new Error('Run through Canvas verification.verify_linux_containers with its isolated Docker fixtures.');
}
// A Windows commit-limit exhaustion crashes Chromium/Node before test actions can run.
// Fail early without changing page-file settings or closing the user's applications.
if (process.platform === 'win32') {
  const availableKiB = Number(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory'],
  { encoding: 'utf8', timeout: 15000, windowsHide: true }).trim());
  if (!Number.isFinite(availableKiB) || availableKiB < 1024 * 1024) {
    throw new Error('Windows has less than 1 GiB of available commit memory. Free memory before running the Linux browser verification.');
  }
}
const baseURL = `http://127.0.0.1:${process.env.KUSAKARI_DEPLOY_PREVIEW_PORT}`;
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
export default defineConfig({
  testDir: './e2e', testMatch: 'deployment.spec.js', workers: 1, timeout: 180000,
  expect: { timeout: 20000 }, outputDir: `${artifacts}/test-results`,
  reporter: [['list'], ['json', { outputFile: `${artifacts}/browser-report.json` }]],
  use: { baseURL, browserName: 'chromium', channel: 'chromium',
    viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  // Both real Linux APIs and their dedicated databases are owned by the calling verifier.
  webServer: { command: `node scripts/preview-deployment.mjs "${site}"`, url: `${baseURL}/canvas/`,
    reuseExistingServer: false, timeout: 30000 },
});
