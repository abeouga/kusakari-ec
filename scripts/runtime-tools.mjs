import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Portable tools are scoped to this checkout and never added to the system PATH.
export function importRuntimeTools(root) {
  const path = resolve(root, '.runtime/toolchain.json');
  if (process.platform !== 'win32' || !existsSync(path)) return {};
  const tools = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  const directories = [tools.Node, tools.Java, tools.Dotnet, tools.MySql].filter(Boolean);
  process.env.PATH = [...directories, process.env.PATH].join(';');
  if (tools.Java) process.env.JAVA_HOME = resolve(tools.Java, '..');
  return tools;
}

export function e2eDatabasePort() {
  const match = /^jdbc:mysql:\/\/127\.0\.0\.1:(\d{1,5})\/kusakari_e2e\?connectionTimeZone=UTC$/.exec(
    process.env.KUSAKARI_EC_E2E_DB_URL || '',
  );
  const port = Number(match?.[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('E2E requires the dedicated kusakari_e2e database on 127.0.0.1.');
  }
  return port;
}
