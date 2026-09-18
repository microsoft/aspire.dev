import { readFile, writeFile } from 'node:fs/promises';

const repositories = [
  'microsoft/aspire',
  'microsoft/aspire-samples',
  'CommunityToolkit/Aspire',
  'microsoft/aspire.dev',
  'microsoft/dcp',
];
const iconRoot =
  'https://raw.githubusercontent.com/Rettend/github-material-icon-theme/main/download/';

/** @param {URL} url */
export function isQualificationInput(url) {
  return (
    (url.origin === 'https://api.github.com' &&
      /^\/repos\/[^/]+\/[^/]+\/contributors$/.test(url.pathname)) ||
    (url.href.startsWith(iconRoot) &&
      ['version.txt', 'language-map.json', 'material-icons.json'].includes(
        url.href.slice(iconRoot.length)
      ))
  );
}

/** @param {string} path */
export async function captureQualificationInputs(path) {
  if (process.env.CI !== 'true') throw new Error('Input capture is CI-only.');
  if (!process.env.GH_TOKEN) throw new Error('Input capture requires a read-only GitHub token.');
  const snapshot = {};
  async function capture(url, authenticated = false) {
    const response = await fetch(url, {
      headers: authenticated
        ? { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' }
        : {},
    });
    if (!response.ok) throw new Error(`Qualification input failed: ${response.status} ${url}`);
    const body = await response.text();
    snapshot[url] = { body, contentType: response.headers.get('content-type') || 'text/plain' };
    return body;
  }
  for (const repository of repositories) {
    for (let page = 1; ; page++) {
      const url = `https://api.github.com/repos/${repository}/contributors?per_page=100&page=${page}`;
      const contributors = JSON.parse(await capture(url, true));
      if (!Array.isArray(contributors)) throw new Error(`Invalid contributors response: ${url}`);
      if (contributors.length < 100) break;
    }
  }
  for (const name of ['version.txt', 'language-map.json', 'material-icons.json']) {
    await capture(iconRoot + name);
  }
  await writeFile(path, JSON.stringify(snapshot, null, 2));
  console.log(`[incremental-pilot] captured ${Object.keys(snapshot).length} public responses`);
}

/**
 * @param {Record<string, {body: string, contentType: string}>} snapshot
 * @param {typeof fetch} fallback
 * @returns {typeof fetch}
 */
export function replayQualificationInputs(snapshot, fallback) {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!isQualificationInput(url)) return fallback(input, init);
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    if (method !== 'GET' || !Object.hasOwn(snapshot, url.href)) {
      throw new Error(`Uncaptured qualification request: ${method} ${url.href}`);
    }
    const { body, contentType } = snapshot[url.href];
    return new Response(body, { headers: { 'content-type': contentType } });
  };
}

// Only the CI harness opts its child build processes into this preload.
if (process.env.ASPIRE_QUALIFICATION_INPUTS) {
  if (process.env.CI !== 'true') throw new Error('Input replay is CI-only.');
  const snapshot = JSON.parse(await readFile(process.env.ASPIRE_QUALIFICATION_INPUTS, 'utf8'));
  const replay = replayQualificationInputs(snapshot, globalThis.fetch);
  let failed = false;
  process.on('exit', () => {
    if (failed) process.exitCode = 1;
  });
  globalThis.fetch = async (...args) => {
    try {
      return await replay(...args);
    } catch (error) {
      // A dependency may catch fetch failures and return empty content.
      failed = true;
      throw error;
    }
  };
}
