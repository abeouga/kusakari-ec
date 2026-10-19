// Offline distribution checks: no credentials, network, AWS resources or deployments.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const { values } = parseArgs({ options: { 'work-root': { type: 'string' } } });
if (values['work-root'] !== undefined && !values['work-root'].trim()) throw new Error('--work-root must not be empty.');
const workRoot = values['work-root'] ? await realpath(values['work-root']) : tmpdir();
const destination = await mkdtemp(resolve(workRoot, 'kusakari-task-render-'));
const reportFile = values['work-root'] ? resolve(destination, 'config-verification.json')
  : resolve(root, 'artifacts/deployment/config-verification.json');
const file = resolve(destination, 'task.json');
const template = await readFile(resolve(root, 'deploy/task-definition.template.json'), 'utf8');
const env = Object.fromEntries([...template.matchAll(/\$\{([A-Z_]+)\}/g)].map((match) => [match[1], 'local-verification']));
Object.assign(env, {
  PUBLIC_ORIGIN: 'https://preview.invalid', RDS_HOST: 'database.invalid', AWS_REGION: 'ap-northeast-1',
  CANVAS_IMAGE_DIGEST: `example.invalid/canvas@sha256:${'1'.repeat(64)}`,
  EC_IMAGE_DIGEST: `example.invalid/ec@sha256:${'2'.repeat(64)}`,
});
function render(target, overrides = {}) {
  return spawnSync(process.execPath, ['deploy/render-task.mjs', target], {
    cwd: root, env: { ...process.env, ...env, ...overrides }, encoding: 'utf8', timeout: 10000,
  });
}
assert.equal(render(file).status, 0);
const task = JSON.parse(await readFile(file, 'utf8'));
assert.equal(task.containerDefinitions.length, 2);
assert.equal(task.requiresCompatibilities[0], 'FARGATE');
assert.equal(task.containerDefinitions.reduce((sum, container) => sum + container.memory, 0), Number(task.memory));
assert(task.containerDefinitions.every((container) => container.readonlyRootFilesystem && container.user === '10001:10001'));
assert(task.containerDefinitions.every((container) => container.secrets.length === 1));
assert.notEqual(render(file).status, 0, 'must not overwrite existing task output');
assert.notEqual(render(resolve(destination, 'bad-origin.json'), { PUBLIC_ORIGIN: 'http://preview.invalid' }).status, 0);
assert.notEqual(render(resolve(destination, 'mutable.json'), { EC_IMAGE_DIGEST: 'example.invalid/ec:latest' }).status, 0);
const handler = vm.runInNewContext(await readFile(resolve(root, 'deploy/cloudfront-spa.js'), 'utf8') + '\nhandler');
for (const uri of ['/cart', '/cart/gardens/example', '/seller/products', '/account', '/operator']) {
  assert.equal(handler({ request: { uri, method: 'GET' } }).uri, '/index.html');
}
for (const uri of ['/canvas/', '/canvas/gardens/example', '/canvas/model-preview']) {
  assert.equal(handler({ request: { uri, method: 'GET' } }).uri, '/canvas/index.html');
}
for (const uri of ['/api/missing', '/canvas/api/missing', '/canvas/models/missing.glb', '/images/missing.png']) {
  assert.equal(handler({ request: { uri, method: 'GET' } }).uri, uri);
}
assert.equal(handler({ request: { uri: '/cart', method: 'POST' } }).uri, '/cart');
assert.equal(handler({ request: { uri: '/canvas', method: 'GET' } }).statusCode, 308);
const report = { result: 'passed', awsRequests: 0, checks: [
  'two containers with bounded memory', 'non-root/read-only runtime', 'secret references separate from values',
  'immutable images/HTTPS required', 'existing output protected', 'SPA reloads with API/asset 404 preservation',
] };
await mkdir(dirname(reportFile), { recursive: true });
await writeFile(reportFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, report: reportFile, diagnostics: destination }));
