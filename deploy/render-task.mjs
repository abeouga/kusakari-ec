// Offline rendering only: this file never loads credentials or calls AWS.
import { readFile, writeFile } from 'node:fs/promises';
const source = await readFile(new URL('task-definition.template.json', import.meta.url), 'utf8');
const value = JSON.parse(source);
function substitute(input) {
  if (typeof input === 'string') return input.replace(/\$\{([A-Z_]+)\}/g, (_, name) => {
    if (!process.env[name]) throw new Error(`Missing ${name}`);
    return process.env[name];
  });
  if (Array.isArray(input)) return input.map(substitute);
  if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, substitute(entry)]));
  return input;
}
const result = substitute(value);
for (const container of result.containerDefinitions) {
  if (!/@sha256:[a-f0-9]{64}$/.test(container.image)) throw new Error('Use immutable image digests, not mutable tags.');
}
const origin = new URL(process.env.PUBLIC_ORIGIN);
if (origin.protocol !== 'https:' || origin.origin !== process.env.PUBLIC_ORIGIN) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin.');
const output = process.argv[2];
if (!output) throw new Error('Usage: node deploy/render-task.mjs <new-output-file>');
await writeFile(output, JSON.stringify(result, null, 2), { flag: 'wx' });
console.log('Rendered locally. No resource created, registered or deployed.');
