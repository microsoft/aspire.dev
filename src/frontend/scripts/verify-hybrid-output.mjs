import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { measureOutput } from './measure-build-output.mjs';

export async function verifyHybridOutput(hybridRoot) {
  const manifest = JSON.parse(await readFile(resolve(hybridRoot, 'hybrid-api-docs.json'), 'utf8'));
  assert.equal(manifest.mode, 'hybrid-api-docs');
  assert.equal(manifest.schemaVersion, 1);
  const [hybrid, server] = await Promise.all([
    measureOutput(resolve(hybridRoot, manifest.client)),
    measureOutput(resolve(hybridRoot, 'server')),
  ]);
  const landing = /^reference\/api\/(?:csharp|typescript)(?:\/index\.html|\.md)$/;
  const api = (path) => path.startsWith('reference/api/') && /\.(html|md)$/.test(path) && !landing.test(path);
  assert.deepEqual(hybrid.files.filter(({ path }) => api(path)), [], 'API HTML/Markdown was prerendered.');
  assert.ok(server.files.some(({ path }) => path === 'entry.mjs'), 'Missing private renderer entrypoint.');
  const redirectFiles = new Set(manifest.redirects.map(({ path }) => `${path.replace(/^\/|\/$/g, '')}/index.html`));
  const clientFiles = new Set(hybrid.files.map(({ path }) => path));
  for (const redirect of manifest.redirects) {
    const destination = redirect.destination.replace(/^\/|\/$/g, '');
    assert.ok(clientFiles.has(`${destination}/index.html`) || clientFiles.has(`${destination}.html`)
      || manifest.routes.some(({ html }) => html === redirect.destination)
      || manifest.redirects.some(({ path }) => path === redirect.destination),
    `Configured redirect has no destination: ${redirect.path} -> ${redirect.destination}`);
  }
  const nonApi = (files) => files.filter(({ path }) =>
    /\.(html|md)$/.test(path) && !api(path) && !redirectFiles.has(path)).map(({ path }) => path);
  for (const page of ['csharp/index.html', 'typescript/index.html', 'csharp.md', 'typescript.md']) {
    assert.ok(clientFiles.has(`reference/api/${page}`), `The API landing pages must stay prerendered: ${page}`);
  }
  assert.ok(clientFiles.has('reference/api-search/typescript.json'), 'Missing API search index.');
  for (const file of ['index.html', '404.html', 'llms.txt', 'sitemap-index.xml', 'sitemap-api.xml']) {
    assert.ok(hybrid.files.some(({ path }) => path === file), `Missing ${file}`);
  }
  assert.ok(!hybrid.files.some(({ path }) => path === 'hybrid-api-docs.json' || path.startsWith('server/')));
  const sitemap = await readFile(resolve(hybridRoot, manifest.client, 'sitemap-api.xml'), 'utf8');
  for (const { html } of manifest.routes) {
    if (html) assert.ok(sitemap.includes(`<loc>${manifest.site}${html}</loc>`), `Missing sitemap URL ${html}`);
  }
  return {
    buildId: manifest.buildId,
    hybridClient: { bytes: hybrid.totalBytes, files: hybrid.files.length },
    hybridServer: { bytes: server.totalBytes, files: server.files.length },
    nonApiPages: nonApi(hybrid.files).length,
    apiRoutes: manifest.routes.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await verifyHybridOutput(resolve(process.argv[2] || 'dist-hybrid'));
  await writeFile(resolve('hybrid-output-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
