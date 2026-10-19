// Local verification of the packaged S3 files and both real APIs. Not a production server.
import { createServer, request as proxyRequest } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import vm from 'node:vm';

const root = resolve(process.argv[2] || '');
if (!process.argv[2] || !(await stat(resolve(root, 'canvas/index.html'))).isFile()) {
  throw new Error('Usage: node scripts/preview-deployment.mjs <packaged-site-directory>');
}
const rewrite = vm.runInNewContext(await readFile(new URL('../deploy/cloudfront-spa.js', import.meta.url), 'utf8') + '\nhandler');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const targets = { ec: new URL(process.env.KUSAKARI_EC_PREVIEW_API || 'http://127.0.0.1:18186'),
  canvas: new URL(process.env.KUSAKARI_CANVAS_PREVIEW_API || 'http://127.0.0.1:18181') };
for (const target of Object.values(targets)) {
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') throw new Error('Preview proxies must use loopback HTTP.');
}
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    const target = path.startsWith('/canvas/api/') ? targets.canvas : path.startsWith('/api/') ? targets.ec : null;
    if (target) {
      const upstream = proxyRequest({ hostname: target.hostname, port: target.port, method: request.method,
        path: request.url, headers: request.headers, timeout: 45000 }, (result) => {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
      });
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
      request.on('aborted', () => upstream.destroy());
      request.pipe(upstream);
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    const rewritten = rewrite({ request: { uri: path, method: request.method } });
    if (rewritten.statusCode) {
      response.writeHead(rewritten.statusCode, { Location: rewritten.headers.location.value }).end();
      return;
    }
    const file = resolve(root, '.' + decodeURIComponent(rewritten.uri));
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
});
server.listen(Number(process.env.KUSAKARI_DEPLOY_PREVIEW_PORT || 15486), '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
