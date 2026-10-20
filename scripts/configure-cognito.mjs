import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only public development settings are copied. DB credentials and API keys stay local.
const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const check = args.includes('--check');
const canvasIndex = args.indexOf('--canvas-root');
if (args.some((value, index) => value !== '--check' && value !== '--canvas-root'
    && !(canvasIndex >= 0 && index === canvasIndex + 1))
    || (canvasIndex >= 0 && (!args[canvasIndex + 1] || args[canvasIndex + 1].startsWith('--')))) {
  throw new Error('Usage: node scripts/configure-cognito.mjs [--check] [--canvas-root PATH]');
}
const canvasRoot = canvasIndex < 0 ? resolve(root, '../kusakari-canvas') : resolve(args[canvasIndex + 1]);
const targets = [
  { root, keys: ['SPRING_PROFILES_ACTIVE', 'KUSAKARI_COGNITO_ISSUER', 'KUSAKARI_COGNITO_DOMAIN',
    'KUSAKARI_COGNITO_CLIENT_ID', 'KUSAKARI_EC_WEB_ORIGIN', 'KUSAKARI_EC_CANVAS_ORIGIN',
    'VITE_KUSAKARI_CANVAS_URL', 'KUSAKARI_CANVAS_API_URL'] },
  { root: canvasRoot, keys: ['KUSAKARI_AUTH_MODE', 'KUSAKARI_CANVAS_AUTH_EC_URL',
    'VITE_KUSAKARI_EC_URL', 'KUSAKARI_CANVAS_EC_URL'] },
];

// Prepare both files before writing either one, so missing setup/configuration fails early.
const changes = targets.map((target) => {
  const values = JSON.parse(readFileSync(resolve(target.root, 'config/cognito.development.json'), 'utf8'));
  if (Object.keys(values).length !== target.keys.length || target.keys.some((key) =>
    typeof values[key] !== 'string' || !values[key] || /[\r\n]/.test(values[key]))
    || Object.keys(values).some((key) => !target.keys.includes(key))) {
    throw new Error('Public Cognito configuration contains missing or unsupported settings.');
  }
  const path = resolve(target.root, '.env');
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const retained = text.split(/\r?\n/).filter((line) => !target.keys.includes(line.split('=', 1)[0].trim()));
  while (retained.at(-1) === '') retained.pop();
  return { path, text: [...retained, '', ...Object.entries(values).map(([key, value]) => `${key}=${value}`), ''].join('\n') };
});
if (!check) for (const change of changes) writeFileSync(change.path, change.text, { mode: 0o600 });
console.log(check ? 'EC/Canvas configuration is valid. No files changed.'
  : 'EC/Canvas Cognito settings updated. Local secrets preserved. Restart both applications.');
