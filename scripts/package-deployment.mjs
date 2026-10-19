import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({ options: { 'canvas-root': { type: 'string' }, output: { type: 'string' } } });
const canvas = resolve(values['canvas-root'] || join(root, '../kusakari-canvas'));
const output = resolve(values.output || join(root, 'artifacts/deploy', new Date().toISOString().replace(/[:.]/g, '-')));
if (JSON.parse(await readFile(join(canvas, 'package.json'), 'utf8')).name !== 'kusakari-canvas') {
  throw new Error('--canvas-root must point to the Kusakari Canvas repository.');
}
// Refuse existing destinations; no sync --delete or destructive cleanup.
await mkdir(dirname(output), { recursive: true });
await mkdir(output, { recursive: false });
function build(cwd, variables) {
  return new Promise((accept, reject) => {
    const child = spawn('npm run build:web', { cwd, shell: true, stdio: 'inherit', env: { ...process.env, ...variables } });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? accept() : reject(new Error(`Static build failed (${code}).`)));
  });
}
await build(root, { VITE_KUSAKARI_CANVAS_URL: '/canvas/' });
await build(canvas, { KUSAKARI_CANVAS_WEB_BASE: '/canvas/', VITE_KUSAKARI_EC_URL: '/' });
await cp(join(root, 'frontend/dist'), join(output, 'site'), { recursive: true });
await cp(join(canvas, 'frontend/dist'), join(output, 'site/canvas'), { recursive: true });
const files = [];
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inventory(path);
    else {
      if (entry.name.startsWith('.env')) throw new Error('A settings file entered the static artifact.');
      const data = await readFile(path);
      files.push({ path: relative(join(output, 'site'), path).replaceAll('\\', '/'), bytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex') });
    }
  }
}
await inventory(join(output, 'site'));
await writeFile(join(output, 'manifest.json'), JSON.stringify({ ecBase: '/', canvasBase: '/canvas/', files }, null, 2));
console.log(`Static artifact only; nothing uploaded: ${output}`);
