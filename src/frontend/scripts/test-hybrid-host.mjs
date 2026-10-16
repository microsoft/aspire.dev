import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'dist-hybrid/hybrid-api-docs.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const children = [];
const containerMode = process.env.HYBRID_TEST_CONTAINERS === '1';
const hostContainer = `hybrid-host-${process.pid}`;
const workerContainer = `hybrid-renderer-${process.pid}`;
const standbyContainer = `hybrid-standby-${process.pid}`;
const execute = promisify(execFile);
let output = '';

function launch(command, args, env) {
  const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32' && command === 'pnpm' });
  children.push(child);
  child.on('error', (error) => { output += `${command}: ${error.message}\n`; });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (data) => { output += data.toString(); });
  return child;
}

async function stopWorker(child, name) {
  const stopped = once(child, 'exit');
  if (containerMode) execFileSync('docker', ['stop', '--time', '2', name]);
  else child.kill();
  await stopped;
  if (containerMode) execFileSync('docker', ['rm', name]);
}

async function request(url, init = {}) {
  const container = { '14323': workerContainer, '14325': standbyContainer }[new URL(url).port];
  if (!containerMode || !container) return fetch(url, init);
  const { stdout } = await execute('docker', ['exec', container, 'node', '--input-type=module', '-e',
    `const response = await fetch(${JSON.stringify(url)}, {
      headers: ${JSON.stringify(init.headers ?? {})}, signal: AbortSignal.timeout(2000)
    });
    console.log(JSON.stringify({
      body: await response.text(), status: response.status, headers: [...response.headers]
    }));`], { timeout: 10000, maxBuffer: 64 * 1024 * 1024 });
  const response = JSON.parse(stdout);
  return new Response(response.body, { status: response.status, headers: response.headers });
}

async function ready(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await request(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch (error) {
      if (child.exitCode !== null) throw new Error(`POC process exited: ${output}`, { cause: error });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`POC endpoint did not become ready: ${url}\n${output}`);
}

const workerUrl = 'http://127.0.0.1:14323';
const standbyUrl = 'http://127.0.0.1:14325';
const hostUrl = 'http://127.0.0.1:14324';
const measures = {};
try {
  let host;
  if (containerMode) {
    host = launch('docker', ['run', '--name', hostContainer,
      '--add-host', 'host.docker.internal:host-gateway',
      '-p', '14324:8080',
      '-e', 'ASPNETCORE_ENVIRONMENT=Production',
      '-e', 'HybridApiDocs__ArtifactPath=/app/hybrid/hybrid-api-docs.json',
      '-e', `HybridApiDocs__RendererUrls__0=${workerUrl}`,
      '-e', `HybridApiDocs__RendererUrls__1=${standbyUrl}`,
      '-e', 'ConnectionStrings__cache=host.docker.internal:6379,abortConnect=false',
      'hybrid-poc-host:test'], process.env);
    await ready(`${hostUrl}/healthz`, host);
  }
  function workerProcess(name, port) {
    return containerMode
      ? launch('docker', ['run', '--name', name, '--network', `container:${hostContainer}`,
        '-e', `PORT=${port}`, 'hybrid-poc-renderer:test'], process.env)
      : launch(process.execPath, ['scripts/serve-api-docs.mjs'], {
        ...process.env, PORT: String(port), HYBRID_API_DOCS_MANIFEST: manifestPath,
      });
  }
  const worker = workerProcess(workerContainer, 14323);
  const standby = workerProcess(standbyContainer, 14325);
  await ready(`${workerUrl}/__hybrid-api-docs/health`, worker);
  await ready(`${standbyUrl}/__hybrid-api-docs/health`, standby);
  if (!containerMode) host = launch('dotnet', [resolve(root, '../statichost/StaticHost/bin/Release/net10.0/StaticHost.dll')], {
    ...process.env,
    ASPNETCORE_URLS: hostUrl,
    ASPNETCORE_ENVIRONMENT: 'Production',
    HybridApiDocs__ArtifactPath: manifestPath,
    HybridApiDocs__RendererUrls__0: workerUrl,
    HybridApiDocs__RendererUrls__1: standbyUrl,
    Live__Twitch__ClientId: '',
    Live__YouTube__ApiKey: '',
  });
  await ready(`${hostUrl}/healthz`, host);
  await ready(`${hostUrl}/healthz/api-docs`, host);
  if (containerMode) {
    const containers = JSON.parse(execFileSync('docker', ['inspect', hostContainer, workerContainer, standbyContainer], { encoding: 'utf8' }));
    assert.ok(containers.every(container => container.Mounts.length === 0), 'No checkout or shared volume may supply runtime files.');
    assert.deepEqual(Object.keys(containers[0].HostConfig.PortBindings), ['8080/tcp']);
    assert.ok(containers.slice(1).every(container =>
      [`container:${hostContainer}`, `container:${containers[0].Id}`].includes(container.HostConfig.NetworkMode)));
  }
  const statsOf = async (url) => (await request(`${url}/__hybrid-api-docs/health`)).json();
  // Mirrors HybridApiDocsEndpointPool.PreferredIndex: pages are routed to a stable worker.
  const ownerOf = (path) => {
    let hash = 2166136261;
    for (const byte of Buffer.from(path)) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    return hash % 2;
  };
  const stats = async () => {
    const all = await Promise.all([workerUrl, standbyUrl].map(statsOf));
    const sum = (key) => all.reduce((total, worker) => total + worker[key], 0);
    return { requests: sum('requests'), cacheHits: sum('cacheHits'), cacheMisses: sum('cacheMisses'), workers: all };
  };
  async function page(path, init = {}) {
    const start = performance.now();
    const response = await fetch(hostUrl + path, { ...init, signal: AbortSignal.timeout(60000) });
    const text = await response.text();
    assert.equal(response.status, 200, `${path}: ${response.status}\n${text.slice(0, 500)}\n${output}`);
    measures[path] ??= [];
    measures[path].push(Math.round((performance.now() - start) * 100) / 100);
    return { response, text };
  }
  const initial = await stats();
  const home = await page('/');
  assert.ok(!home.text.includes('<title>Aspire Static Host</title>'), 'The placeholder wwwroot home must not shadow the hybrid homepage.');
  await page('/docs/');
  assert.equal((await stats()).requests, initial.requests);
  // Every kind of file the static build emits (recordings, Pagefind indexes, WASM, ...) must be served.
  const clientRoot = resolve(dirname(manifestPath), manifest.client);
  const samples = new Map();
  for (const entry of await readdir(clientRoot, { recursive: true, withFileTypes: true })) {
    const extension = entry.name.includes('.') ? entry.name.slice(entry.name.lastIndexOf('.')) : '';
    if (!entry.isFile() || !extension || extension === '.md' || samples.has(extension)) continue;
    const relative = resolve(entry.parentPath, entry.name).slice(clientRoot.length).replaceAll('\\', '/');
    samples.set(extension, relative.startsWith('/') ? relative : `/${relative}`);
  }
  for (const [extension, path] of samples) {
    const response = await fetch(hostUrl + path.split('/').map(encodeURIComponent).join('/'));
    assert.equal(response.status, 200, `Client files ending in ${extension} must be served: ${path}`);
    await response.arrayBuffer();
  }
  assert.ok(['.cast', '.pagefind', '.pf_meta'].every((extension) => samples.has(extension)), 'The sample set must cover the file types that need explicit serving.');
  const packageRoute = manifest.routes.find(({ html }) => html?.startsWith('/reference/api/csharp/') && html.split('/').length === 6);
  assert.ok(packageRoute);
  const csharp = await page(packageRoute.html);
  assert.equal(csharp.response.headers.get('X-Astro-Cache'), 'MISS');
  assert.equal(csharp.response.headers.get('Cache-Control'), 'no-cache');
  const etag = csharp.response.headers.get('ETag');
  assert.ok(etag?.startsWith('W/'));
  const cold = await stats();
  assert.equal(cold.cacheMisses, initial.cacheMisses + 1);
  const csharpHit = await page(packageRoute.html);
  assert.equal(csharpHit.text, csharp.text);
  assert.equal(csharpHit.response.headers.get('X-Astro-Cache'), 'HIT');
  assert.equal((await stats()).requests, cold.requests + 1, 'StaticHost must forward cache hits to Astro.');
  assert.equal((await stats()).cacheMisses, cold.cacheMisses);
  const directHit = await request(`${[workerUrl, standbyUrl][ownerOf(packageRoute.html)]}${packageRoute.html}`, {
    headers: { Host: 'aspire.dev', 'X-Forwarded-Host': 'aspire.dev', 'X-Forwarded-Proto': 'https' },
  });
  assert.equal(directHit.headers.get('X-Astro-Cache'), 'HIT', 'The same response must be cached in Astro itself.');
  assert.equal(await directHit.text(), csharp.text);
  const beforeRevalidation = await stats();
  const revalidated = await fetch(hostUrl + packageRoute.html, { headers: { 'If-None-Match': etag } });
  assert.equal(revalidated.status, 304);
  assert.equal((await stats()).requests, beforeRevalidation.requests, 'A matching validator must not reach the renderer.');
  const queried = await page(`${packageRoute.html}?cachebust=1`);
  assert.equal(queried.response.headers.get('X-Astro-Cache'), 'HIT', 'Query strings must not multiply renders.');
  const credentialRequest = await page(packageRoute.html, { headers: { Authorization: 'Bearer poc-test' } });
  assert.equal(credentialRequest.response.headers.get('X-Astro-Cache'), 'HIT', 'Credentials must not bypass the native cache.');
  assert.equal((await stats()).cacheMisses, cold.cacheMisses);
  const typescript = await page('/reference/api/typescript/');
  assert.equal(typescript.response.headers.get('X-Astro-Cache'), null, 'The landing pages are static files.');
  assert.ok(typescript.text.includes('data-api-search-index-url="/reference/api-search/typescript.json"'));
  assert.ok(Buffer.byteLength(typescript.text) < 2_000_000, 'The search index must not be embedded in the page.');
  const searchIndex = await page('/reference/api-search/typescript.json');
  assert.equal(searchIndex.response.headers.get('X-Astro-Cache'), null, 'The index is served as a static file.');
  assert.ok(Buffer.byteLength(searchIndex.text) >= 13_000_000);
  assert.ok(JSON.parse(searchIndex.text).length > 30_000);
  const stampede = manifest.routes.find(({ html }) => html?.startsWith('/reference/api/typescript/') && html.split('/').length === 6);
  assert.ok(stampede);
  const beforeStampede = await stats();
  const stampedePages = await Promise.all(Array.from({ length: 12 }, () => page(stampede.html)));
  assert.ok(stampedePages.every(({ text }) => text === stampedePages[0].text));
  assert.ok((await stats()).cacheMisses - beforeStampede.cacheMisses <= 3, 'Concurrent requests for a cold page must share a render.');
  for (const language of ['csharp', 'typescript']) {
    const route = manifest.routes.find(({ html }) => html?.startsWith(`/reference/api/${language}/`) && html.split('/').length >= 7);
    assert.ok(route);
    const detail = await page(route.html);
    assert.equal(detail.response.headers.get('X-Astro-Cache'), 'MISS');
    const before = await stats();
    const pages = [];
    for (let visit = 0; visit < 20; visit++) pages.push(await page(route.html));
    assert.ok(pages.every(({ text, response }) => text === detail.text && response.headers.get('X-Astro-Cache') === 'HIT'));
    assert.equal((await stats()).requests, before.requests + 20);
    assert.equal((await stats()).cacheMisses, before.cacheMisses);
    const direct = await page(route.markdown);
    assert.equal(direct.response.headers.get('X-Astro-Cache'), 'MISS');
    const negotiated = await page(route.html, { headers: { Accept: 'text/markdown' } });
    assert.equal(negotiated.response.headers.get('X-Astro-Cache'), 'HIT');
    assert.equal(negotiated.text, direct.text);
    assert.ok(negotiated.response.headers.get('cache-control').includes('private'));
    assert.ok(pages[0].response.headers.get('link').includes(route.markdown));
  }
  const unknown = await fetch(`${hostUrl}/reference/api/not-a-page/`);
  assert.equal(unknown.status, 404);
  assert.ok((await unknown.text()).includes('<html'), 'Unknown API pages must get the site 404 page.');
  if (process.env.HYBRID_TEST_BROWSER === '1') {
    const install = launch('pnpm', ['exec', 'playwright', 'install', '--with-deps', 'chromium'], process.env);
    assert.equal((await once(install, 'exit'))[0], 0, output.slice(-10000));
    const browser = launch('pnpm', ['exec', 'playwright', 'test', '--config', 'playwright.hybrid.config.mjs'],
      { ...process.env, HYBRID_TEST_URL: hostUrl });
    assert.equal((await once(browser, 'exit'))[0], 0, output.slice(-10000));
  }
  const final = await stats();
  await stopWorker(worker, workerContainer);
  await page('/docs/');
  const ownedByPrimary = manifest.routes.find(({ html }) => html && !measures[html] && ownerOf(html) === 0);
  assert.ok(ownedByPrimary);
  const failover = await page(ownedByPrimary.html);
  assert.equal(failover.response.headers.get('X-Astro-Cache'), 'MISS', 'The standby owns its own native cache.');
  assert.equal((await page(ownedByPrimary.html)).response.headers.get('X-Astro-Cache'), 'HIT');
  assert.equal((await fetch(`${hostUrl}/healthz/api-docs`)).status, 200);
  await stopWorker(standby, standbyContainer);
  const previouslyCached = await fetch(hostUrl + ownedByPrimary.html);
  assert.equal(previouslyCached.status, 502, 'No ASP.NET cache may hide loss of every renderer.');
  assert.ok((await previouslyCached.text()).includes('Try again'), 'An outage must explain itself and offer a retry.');
  assert.equal((await fetch(`${hostUrl}/healthz/api-docs`)).status, 503);
  assert.equal((await fetch(`${hostUrl}/healthz`)).status, 200, 'Static pages must stay healthy without renderers.');
  await page('/docs/');
  const unwarmed = manifest.routes.find(({ html }) => html && !measures[html]);
  assert.ok(unwarmed);
  const failure = await fetch(hostUrl + unwarmed.html);
  assert.equal(failure.status, 502);
  const recovered = workerProcess(workerContainer, 14323);
  await ready(`${workerUrl}/__hybrid-api-docs/health`, recovered);
  await ready(`${hostUrl}/healthz/api-docs`, host);
  assert.equal((await page(ownedByPrimary.html)).response.headers.get('X-Astro-Cache'), 'MISS');
  assert.equal((await page(ownedByPrimary.html)).response.headers.get('X-Astro-Cache'), 'HIT');
  const results = { success: true, separateContainers: containerMode, cacheOwner: 'astro-memory', primaryOutageFailover: true, rendererRecovery: true, buildId: manifest.buildId, measures, initial, final };
  await writeFile(resolve(root, 'hybrid-host-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await writeFile(resolve(root, 'hybrid-host-processes.log'), output);
  if (containerMode) {
    for (const name of [workerContainer, standbyContainer, hostContainer]) {
      const running = execFileSync('docker', ['ps', '-aq', '--filter', `name=^/${name}$`], { encoding: 'utf8' }).trim();
      if (running) execFileSync('docker', ['rm', '--force', name]);
    }
  }
  for (const child of children) if (child.exitCode === null) child.kill();
}
