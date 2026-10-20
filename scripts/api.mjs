import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { e2eDatabasePort, importRuntimeTools } from './runtime-tools.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
importRuntimeTools(root);
const explicitSpringProfile = process.env.SPRING_PROFILES_ACTIVE;
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const mode = process.argv[2] || 'dev';
if (mode === 'e2e') {
  // Business E2E uses real Cognito with its own database and explicit server settings.
  process.env.SPRING_PROFILES_ACTIVE = explicitSpringProfile || 'cognito';
  // Paid AI verification is opt-in and never inherits the development credential.
  process.env.KUSAKARI_EC_OPENAI_API_KEY = process.env.KUSAKARI_EC_E2E_OPENAI_API_KEY || '';
  const url = process.env.KUSAKARI_EC_E2E_DB_URL;
  e2eDatabasePort();
  process.env.KUSAKARI_EC_DB_URL = url;
  process.env.KUSAKARI_EC_API_PORT = process.env.KUSAKARI_EC_E2E_API_PORT || '18086';
  process.env.KUSAKARI_EC_WEB_ORIGIN = process.env.KUSAKARI_EC_E2E_WEB_ORIGIN || 'http://127.0.0.1:15186';
  process.env.KUSAKARI_EC_CANVAS_ORIGIN = process.env.KUSAKARI_EC_E2E_CANVAS_ORIGIN || 'http://127.0.0.1:15173';
}
const build = mode === 'build';
const windowsBuild = build && process.platform === 'win32';
let command = 'java';
let args = ['-jar', resolve(root, 'backend', 'target', 'kusakari-ec-api-0.1.0.jar')];
if (build) {
  command = './mvnw';
  args = ['-B', '-ntp', 'package', '-DskipTests'];
  if (windowsBuild) {
    command = 'mvnw.cmd -B -ntp package -DskipTests';
    args = [];
  }
}
const child = spawn(command, args, {
  cwd: resolve(root, 'backend'),
  stdio: 'inherit',
  shell: windowsBuild,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
