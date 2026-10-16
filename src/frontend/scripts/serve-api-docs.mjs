import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(process.env.HYBRID_API_DOCS_MANIFEST || resolve(frontend, 'dist-hybrid/hybrid-api-docs.json'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1 || manifest.mode !== 'hybrid-api-docs' || !/^[a-f0-9]{64}$/.test(manifest.buildId)) {
  throw new Error('Expected a compatible prebuilt hybrid-api-docs.json artifact.');
}
if (manifest.platform !== process.platform) {
  throw new Error(`This Astro adapter artifact targets ${manifest.platform}; download the ${process.platform} POC artifact instead.`);
}
const root = dirname(manifestPath);
const entry = resolve(root, manifest.server);
const entryRelative = relative(root, entry);
if (isAbsolute(entryRelative) || entryRelative.startsWith('..')) throw new Error('Renderer entrypoint escapes its artifact.');
const { handler } = await import(pathToFileURL(entry).href);
const paths = new Set(manifest.routes.flatMap(({ html, markdown }) => html ? [html, markdown] : [markdown]));
let requests = 0;
let cacheHits = 0;
let cacheMisses = 0;
let ready = false;
const started = process.memoryUsage();
const server = http.createServer((req, res) => {
  res.setHeader('X-Aspire-Build-Id', manifest.buildId);
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__hybrid-api-docs/health') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = ready ? 200 : 503;
    res.end(JSON.stringify({ ready, buildId: manifest.buildId, requests, cacheHits, cacheMisses, started, memory: process.memoryUsage() }));
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  if (!paths.has(url.pathname) && !['/_image', '/_image/'].includes(url.pathname)) {
    res.writeHead(404);
    res.end('API route not found');
    return;
  }
  requests++;
  res.once('finish', () => {
    if (res.getHeader('X-Astro-Cache') === 'HIT') cacheHits++;
    if (res.getHeader('X-Astro-Cache') === 'MISS') cacheMisses++;
  });
  handler(req, res, () => {
    res.writeHead(404);
    res.end('API route not found');
  }).catch((error) => {
    console.error(`[hybrid-api-docs] Rendering ${url.pathname} failed`, error);
    if (res.headersSent) res.destroy(error);
    else {
      res.writeHead(500, { 'Cache-Control': 'no-store' });
      res.end('API rendering failed');
    }
  });
});
server.on('error', (error) => { console.error(error); process.exitCode = 1; });
server.listen(Number(process.env.PORT || 4323), process.env.HOST || '127.0.0.1', async () => {
  try {
    const path = manifest.routes.find(({ html }) => html?.split('/').length >= 7)?.html;
    if (!path) throw new Error('The artifact has no API detail route for rendering readiness.');
    const site = new URL(manifest.site);
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      headers: {
        Host: site.host, 'X-Forwarded-Host': site.host, 'X-Forwarded-Proto': site.protocol.slice(0, -1),
        'X-Aspire-Cache-Bypass': '1',
      },
      signal: AbortSignal.timeout(30000),
    });
    const body = await response.text();
    if (!response.ok || !body.includes('<html')) throw new Error(`API rendering readiness failed: HTTP ${response.status}`);
    ready = true;
    console.log(`[hybrid-api-docs] ${manifest.buildId} ready on ${JSON.stringify(address)}`);
  } catch (error) {
    console.error('[hybrid-api-docs] Startup rendering check failed', error);
    process.exitCode = 1;
    server.close();
    server.closeAllConnections();
  }
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { server.close(); server.closeAllConnections(); });
}
