import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Response } from 'node-fetch';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { fetchWithProxy } from '../../scripts/fetch-with-proxy';
import {
  MAX_URLS_PER_RUN,
  compareUrls,
  fetchSitemapUrls,
  finalizeRun,
  keyFileProblem,
  loadConfig,
  loadState,
  main,
  parseCli,
  parseSitemap,
  planRun,
  releaseVersion,
  run,
  saveState,
  submitUrls,
  tierOf,
  waitForRelease,
  whatsNewPath,
  type IndexNowConfig,
  type IndexNowState,
  type RunOptions,
} from '../../scripts/indexnow';

const HOST = 'aspire.dev';
const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const NOW = new Date('2026-10-13T06:43:00.000Z');

const config: IndexNowConfig = {
  host: HOST,
  key: KEY,
  endpoint: 'https://api.indexnow.org/indexnow',
  sitemapIndex: `https://${HOST}/sitemap-index.xml`,
  budgets: { release: 5, rotation: 3 },
};

const url = (pathname: string) => `https://${HOST}${pathname}`;
const urls = (paths: string[]) => paths.map(url);

// Ten pages in the order they are sent: four English pages, three API pages, three localized pages.
const DOCS = ['/', '/app-host/', '/get-started/', '/whats-new/aspire-13-6/'];
const API = [
  '/reference/api/csharp/a/',
  '/reference/api/csharp/b/',
  '/reference/api/typescript/c/',
];
const LOCALIZED = ['/de/', '/de/app-host/', '/ja/'];
const SMALL_SITE = [...DOCS, ...API, ...LOCALIZED];

function syntheticUrls(count: number, prefix = '/reference/api/csharp/page-'): string[] {
  return Array.from({ length: count }, (_, index) =>
    url(`${prefix}${String(index).padStart(6, '0')}/`)
  );
}

function makeState(overrides: Partial<IndexNowState> = {}): IndexNowState {
  return { host: HOST, updatedAt: NOW.toISOString(), cycle: null, known: [], ...overrides };
}

/** A clock that only moves when the code under test sleeps. */
function createClock() {
  let current = NOW.getTime();
  return {
    now: () => new Date(current),
    sleep: vi.fn<(ms: number) => Promise<void>>((ms) => {
      current += ms;
      return Promise.resolve();
    }),
  };
}

interface PostCall {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/** A stand-in for aspire.dev and the IndexNow endpoint. */
function createSite(paths: string[], key = KEY) {
  const site = {
    paths: [...paths],
    keyLive: true,
    liveReleases: new Set<string>(),
    /** Statuses for the upcoming IndexNow POSTs; 200 when the queue is empty. */
    responses: [] as number[],
    posts: [] as PostCall[],
    fetch: vi.fn<typeof fetchWithProxy>(),
  };

  const urlset = () =>
    '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:xhtml="http://www.w3.org/1999/xhtml">' +
    site.paths
      .map(
        (pathname) =>
          `<url><loc>${url(pathname)}</loc><xhtml:link rel="alternate" hreflang="en" href="${url(pathname)}"/></url>`
      )
      .join('') +
    '</urlset>';

  site.fetch.mockImplementation((input, init) => {
    const target = new URL(String(input));
    if (target.origin === 'https://api.indexnow.org') {
      site.posts.push(JSON.parse(init?.body as string) as PostCall);
      return Promise.resolve(new Response('', { status: site.responses.shift() ?? 200 }));
    }
    if (target.pathname === `/${key}.txt`) {
      return Promise.resolve(
        site.keyLive ? new Response(key) : new Response('Not found', { status: 404 })
      );
    }
    if (target.pathname === '/sitemap-index.xml') {
      return Promise.resolve(
        new Response(
          `<sitemapindex><sitemap><loc>${url('/sitemap-0.xml')}</loc></sitemap></sitemapindex>`
        )
      );
    }
    if (target.pathname === '/sitemap-0.xml') return Promise.resolve(new Response(urlset()));
    const release = /^\/whats-new\/aspire-(\d+)(?:-(\d+))?\/$/.exec(target.pathname);
    if (release) {
      const live = site.liveReleases.has(`${release[1]}.${release[2] ?? '0'}`);
      return Promise.resolve(new Response('', { status: live ? 200 : 404 }));
    }
    return Promise.resolve(new Response('Not found', { status: 404 }));
  });

  return site;
}

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(path.join(os.tmpdir(), 'indexnow-test-'));
  for (const method of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, method).mockImplementation(() => undefined);
  }
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(stateDir, { recursive: true, force: true });
});

describe('config', () => {
  test('the committed config is valid and its key file is served from the site root', async () => {
    const real = await loadConfig();
    expect(real.host).toBe('aspire.dev');
    expect(real.key).toMatch(/^[A-Za-z0-9-]{8,128}$/);
    expect(new URL(real.endpoint).protocol).toBe('https:');
    expect(new URL(real.sitemapIndex)).toMatchObject({ protocol: 'https:', hostname: real.host });
    // One request carries a whole run, so a budget cannot exceed what a request may hold.
    for (const budget of Object.values(real.budgets)) {
      expect(Number.isInteger(budget)).toBe(true);
      expect(budget).toBeGreaterThanOrEqual(1);
      expect(budget).toBeLessThanOrEqual(MAX_URLS_PER_RUN);
    }

    const keyFile = fileURLToPath(new URL(`../../public/${real.key}.txt`, import.meta.url));
    const contents = await readFile(keyFile, 'utf8');
    expect(contents.charCodeAt(0)).not.toBe(0xfeff);
    expect(contents.trim()).toBe(real.key);
  });
});

describe('sitemap', () => {
  const urlset = (...locations: string[]) =>
    `<urlset>${locations.map((location) => `<url><loc>${location}</loc></url>`).join('')}</urlset>`;

  test('reads <loc> values, decodes entities and ignores xhtml alternates', () => {
    const parsed = parseSitemap(
      '<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml">' +
        '<url><loc>https://aspire.dev/</loc><xhtml:link rel="alternate" hreflang="de" href="https://aspire.dev/de/"/></url>' +
        '<url><loc> https://aspire.dev/a?b=1&amp;c=2 </loc></url>' +
        '</urlset>'
    );
    expect(parsed).toEqual({
      kind: 'urlset',
      locations: ['https://aspire.dev/', 'https://aspire.dev/a?b=1&c=2'],
    });
  });

  test('recognizes a sitemap index and rejects documents that are not sitemaps', () => {
    expect(
      parseSitemap(
        '<sitemapindex><sitemap><loc>https://aspire.dev/s.xml</loc></sitemap></sitemapindex>'
      )
    ).toEqual({ kind: 'index', locations: ['https://aspire.dev/s.xml'] });
    expect(() => parseSitemap('<html><body>Not found</body></html>')).toThrow(/not a sitemap/i);
  });

  test('follows a sitemap index to its child sitemaps', async () => {
    const site = createSite(['/', '/a/']);
    expect(await fetchSitemapUrls(config.sitemapIndex, HOST, site.fetch)).toEqual(
      urls(['/', '/a/'])
    );
    expect(site.fetch).toHaveBeenCalledTimes(2);
  });

  test('keeps https pages on the host, drops fragments and de-duplicates', async () => {
    const fetch = vi
      .fn<typeof fetchWithProxy>()
      .mockResolvedValue(
        new Response(
          urlset(
            'https://aspire.dev/a/',
            'https://aspire.dev/a/#section',
            'https://ASPIRE.dev/b/',
            'http://aspire.dev/c/',
            'https://aspire.dev:8443/d/',
            'https://example.com/f/',
            'not a url'
          )
        )
      );
    expect(await fetchSitemapUrls(config.sitemapIndex, HOST, fetch)).toEqual(urls(['/a/', '/b/']));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Ignored 4'));
  });

  test('refuses child sitemaps on another host, nested indexes and failed requests', async () => {
    const index = (child: string) =>
      new Response(`<sitemapindex><sitemap><loc>${child}</loc></sitemap></sitemapindex>`);
    const fetch = vi.fn<typeof fetchWithProxy>();

    fetch.mockResolvedValueOnce(index('https://evil.example/s.xml'));
    await expect(fetchSitemapUrls(config.sitemapIndex, HOST, fetch)).rejects.toThrow(
      /not an https URL on aspire\.dev/
    );

    fetch.mockResolvedValueOnce(index(url('/a.xml'))).mockResolvedValueOnce(index(url('/b.xml')));
    await expect(fetchSitemapUrls(config.sitemapIndex, HOST, fetch)).rejects.toThrow(/nested/);

    fetch.mockResolvedValueOnce(new Response('oops', { status: 503 }));
    await expect(fetchSitemapUrls(config.sitemapIndex, HOST, fetch)).rejects.toThrow(/HTTP 503/);
  });
});

describe('ordering', () => {
  test('puts English pages first, then the API reference, then localized pages', () => {
    expect(tierOf('/')).toBe(0);
    expect(tierOf('/app-host/certificate-configuration/')).toBe(0);
    expect(tierOf('/reference/cli/')).toBe(0);
    expect(tierOf('/reference/api')).toBe(0);
    expect(tierOf('/deployment/')).toBe(0);
    expect(tierOf('/reference/api/csharp/aspire.hosting/')).toBe(1);
    expect(tierOf('/zh-cn/whats-new/upgrade-aspire/')).toBe(2);
    expect(tierOf('/pt-br/')).toBe(2);
    expect(tierOf('/de/reference/api/csharp/x/')).toBe(2);
  });

  test('sorts by tier and then by URL', () => {
    const shuffled = urls([...SMALL_SITE].reverse());
    expect(shuffled.sort(compareUrls)).toEqual(urls(SMALL_SITE));
  });
});

describe('planning', () => {
  const base = {
    current: urls(SMALL_SITE),
    state: null as IndexNowState | null,
    mode: 'daily' as const,
    budgets: config.budgets,
  };
  const rotation = (cursor: string | null) => ({ kind: 'rotation' as const, cursor });
  const known = urls(SMALL_SITE);

  test('a cold start seeds the known list instead of treating every URL as new', () => {
    const plan = planRun(base);
    expect(plan).toMatchObject({
      coldStart: true,
      newUrls: [],
      removedUrls: [],
      fresh: [],
      windowComplete: false,
      cycle: { kind: 'rotation', cursor: null },
    });
    expect(plan.window).toEqual(urls(['/', '/app-host/', '/get-started/']));
  });

  test('a pass continues after its cursor, even when the cursor left the sitemap', () => {
    for (const cursor of ['/get-started/', '/get-started/gone/']) {
      const state = makeState({ known, cycle: rotation(url(cursor)) });
      const plan = planRun({ ...base, state });
      expect(plan.coldStart).toBe(false);
      expect(plan.window).toEqual(urls([DOCS[3], API[0], API[1]]));
    }
  });

  test('a flush starts a release pass from the top and leaves new URLs to its window', () => {
    const created = url('/reference/api/csharp/ab/');
    const state = makeState({ known, cycle: rotation(url('/ja/')) });
    const plan = planRun({ ...base, current: [...known, created], state, mode: 'flush' });
    expect(plan.cycle).toEqual({ kind: 'release', cursor: null });
    expect(plan.budget).toBe(5);
    expect(plan.newUrls).toEqual([created]);
    expect(plan.fresh).toEqual([]);
    expect(plan.window).toEqual(urls([...DOCS, API[0]]));
  });

  test('a release pass keeps its larger budget until it finishes', () => {
    const state = makeState({ known, cycle: { kind: 'release', cursor: url('/get-started/') } });
    const plan = planRun({ ...base, state });
    expect(plan.budget).toBe(5);
    expect(plan.window).toEqual(urls([DOCS[3], ...API, LOCALIZED[0]]));
  });

  test('removed and new URLs go first and count against the budget', () => {
    const current = [...known.filter((entry) => entry !== url('/ja/')), url('/aaa/')];
    const state = makeState({ known, cycle: rotation(url('/get-started/')) });
    const plan = planRun({ ...base, current, state });
    expect(plan.removed).toEqual([url('/ja/')]);
    expect(plan.fresh).toEqual([url('/aaa/')]);
    expect(plan.window).toEqual([url(DOCS[3])]);
  });

  test('--limit replaces the budget and also caps the removed and new URLs', () => {
    expect(planRun({ ...base, limit: 2 }).window).toHaveLength(2);

    const gone = [url(API[2]), url('/ja/')];
    const removing = planRun({
      ...base,
      current: known.filter((entry) => !gone.includes(entry)),
      state: makeState({ known }),
      limit: 1,
    });
    expect(removing.removedUrls).toEqual(gone);
    expect(removing.removed).toEqual([gone[0]]);
    expect(removing.window).toEqual([]);

    const created = urls(['/aaa/', '/aab/', '/aac/']);
    const adding = planRun({
      ...base,
      current: [...known, ...created],
      state: makeState({ known }),
      limit: 2,
    });
    expect(adding.newUrls).toHaveLength(3);
    expect(adding.fresh).toEqual(created.slice(0, 2));
    expect(adding.window).toEqual([]);
  });

  test('never plans more than one request, whatever the budget', () => {
    const current = syntheticUrls(12_000, '/docs/page-');
    const budgets = { release: 50_000, rotation: 50_000 };
    const plan = planRun({ ...base, current, budgets, mode: 'flush' });
    expect(plan.budget).toBe(MAX_URLS_PER_RUN);
    expect(plan.window).toHaveLength(MAX_URLS_PER_RUN);
  });

  test('refuses an empty sitemap', () => {
    expect(() => planRun({ ...base, current: [] })).toThrow(/no URLs/);
  });

  test('refuses a sitemap that shrank by more than 20% unless allowed', () => {
    const before = syntheticUrls(100);
    const state = makeState({ known: before });
    expect(() => planRun({ ...base, current: before.slice(0, 79), state })).toThrow(
      /--allow-shrink/
    );
    expect(() => planRun({ ...base, current: before.slice(0, 80), state })).not.toThrow();
    const allowed = planRun({ ...base, current: before.slice(0, 79), state, allowShrink: true });
    expect(allowed.removedUrls).toHaveLength(21);
  });
});

describe('finalizing a run', () => {
  const known = urls(SMALL_SITE);
  const base = { current: known, mode: 'daily' as const, budgets: config.budgets };
  const options = (current: string[], submitted = true) => ({
    host: HOST,
    current,
    submitted,
    now: NOW,
  });

  test('remembers the whole sitemap and moves the cursor once the request was accepted', () => {
    const plan = planRun({ ...base, state: null });
    const next = finalizeRun(plan, options(known));
    expect(next.known).toEqual([...known].sort());
    expect(next.cycle).toEqual({ kind: 'rotation', cursor: url('/get-started/') });
    expect(next.updatedAt).toBe(NOW.toISOString());
  });

  test('finishes the pass when the window reaches the end of the sitemap', () => {
    const state = makeState({ known, cycle: { kind: 'release', cursor: url(API[2]) } });
    const plan = planRun({ ...base, state });
    expect(plan.window).toEqual(urls(LOCALIZED));
    expect(plan.windowComplete).toBe(true);
    expect(finalizeRun(plan, options(known)).cycle).toBeNull();
    expect(finalizeRun(plan, options(known, false)).cycle).toEqual(state.cycle);
  });

  test('keeps URLs that were not sent pending', () => {
    const created = urls(['/aaa/', '/aab/']);
    const current = [...known.filter((entry) => entry !== url('/ja/')), ...created];
    const plan = planRun({ ...base, current, state: makeState({ known }) });
    expect(plan.removed).toEqual([url('/ja/')]);
    expect(plan.fresh).toEqual(created);

    const failed = finalizeRun(plan, options(current, false));
    expect(failed.known).toContain(url('/ja/'));
    expect(failed.known).not.toContain(created[0]);
    expect(failed.known).not.toContain(created[1]);
    expect(failed.cycle).toEqual({ kind: 'rotation', cursor: null });

    const accepted = finalizeRun(plan, options(current));
    expect(accepted.known).not.toContain(url('/ja/'));
    expect(accepted.known).toEqual(expect.arrayContaining(created));
  });

  test('keeps the new URLs beyond the per-run cap pending', () => {
    const before = syntheticUrls(3);
    const created = syntheticUrls(10_005, '/reference/api/csharp/new-');
    const current = [...before, ...created];
    const plan = planRun({ ...base, current, state: makeState({ known: before }) });
    expect(plan.fresh).toHaveLength(MAX_URLS_PER_RUN);

    const next = finalizeRun(plan, options(current));
    expect(current.filter((entry) => !next.known.includes(entry))).toEqual(created.slice(10_000));
  });

  test('a flush counts its new URLs as known even when the request failed', () => {
    const created = url('/reference/api/csharp/ab/');
    const current = [...known, created];
    const plan = planRun({ ...base, current, state: makeState({ known }), mode: 'flush' });
    const next = finalizeRun(plan, options(current, false));
    expect(next.known).toContain(created);
    expect(next.cycle).toEqual({ kind: 'release', cursor: null });
  });

  test('a new page ahead of the cursor is sent now and again when the pass reaches it', () => {
    const created = url('/reference/api/csharp/ab/');
    const current = [...known, created];
    const state = makeState({ known, cycle: { kind: 'rotation', cursor: url('/get-started/') } });
    const plan = planRun({ ...base, current, state });
    expect(plan.fresh).toEqual([created]);

    const later = planRun({ ...base, current, state: finalizeRun(plan, options(current)) });
    expect(later.window).toContain(created);
  });

  test('a release burst over a sitemap shaped like aspire.dev takes four runs and sends each URL once', () => {
    const docs = syntheticUrls(611, '/docs/page-');
    const api = syntheticUrls(24_207);
    const localized = syntheticUrls(7_518, '/de/page-');
    const current = [...localized, ...api, ...docs];
    const budgets = { release: 10_000, rotation: 1_000 };

    let state = makeState({ known: current });
    const sizes: number[] = [];
    const seen = new Set<string>();
    for (let day = 0; day < 10; day++) {
      const plan = planRun({
        current,
        state,
        mode: day === 0 ? 'flush' : 'daily',
        budgets,
      });
      if (day === 0) expect(plan.window.slice(0, 611)).toEqual(docs);
      for (const entry of plan.window) {
        expect(seen.has(entry)).toBe(false);
        seen.add(entry);
      }
      sizes.push(plan.window.length);
      state = finalizeRun(plan, options(current));
      if (state.cycle === null) break;
    }
    expect(sizes).toEqual([10_000, 10_000, 10_000, 2_336]);
    expect(seen.size).toBe(current.length);

    // The next run starts a slow rotation pass from the top.
    const after = planRun({ current, state, mode: 'daily', budgets });
    expect(after.cycle.kind).toBe('rotation');
    expect(after.window).toHaveLength(1_000);
    expect(after.window[0]).toBe(docs[0]);
  });
});

describe('state on disk', () => {
  const valid = {
    schemaVersion: 1,
    host: HOST,
    updatedAt: NOW.toISOString(),
    cycle: null,
    known: [url('/')],
  };
  const stateFile = () => path.join(stateDir, 'state.json');

  test('round-trips in a single file', async () => {
    const state = makeState({
      cycle: { kind: 'release', cursor: url('/de/') },
      known: urls(SMALL_SITE),
    });
    await saveState(stateDir, state);
    expect(await readdir(stateDir)).toEqual(['state.json']);
    expect(await loadState(stateDir, HOST)).toEqual(state);
  });

  test('a missing state is a cold start without a warning', async () => {
    expect(await loadState(stateDir, HOST)).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  test.each([
    ['invalid JSON', '{not json'],
    ['another schema version', JSON.stringify({ ...valid, schemaVersion: 2 })],
    ['another host', JSON.stringify({ ...valid, host: 'example.com' })],
    ['an empty known list', JSON.stringify({ ...valid, known: [] })],
    [
      'URLs of another host',
      JSON.stringify({ ...valid, known: [url('/'), 'https://evil.example/'] }),
    ],
    ['an insecure URL', JSON.stringify({ ...valid, known: ['http://aspire.dev/'] })],
    [
      'a cursor of another host',
      JSON.stringify({ ...valid, cycle: { kind: 'release', cursor: 'https://evil.example/' } }),
    ],
    ['an empty cursor', JSON.stringify({ ...valid, cycle: { kind: 'release', cursor: '' } })],
    ['a malformed pass', JSON.stringify({ ...valid, cycle: { kind: 'weekly', cursor: null } })],
    ['a missing pass', JSON.stringify({ ...valid, cycle: undefined })],
  ])('ignores a state with %s and starts cold', async (_name, content) => {
    await writeFile(stateFile(), content);
    expect(await loadState(stateDir, HOST)).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Ignoring unusable'));
  });
});

describe('submitting', () => {
  function fetchWith(...responses: (Response | Error)[]) {
    const fetch = vi.fn<typeof fetchWithProxy>();
    for (const response of responses) {
      if (response instanceof Error) fetch.mockRejectedValueOnce(response);
      else fetch.mockResolvedValueOnce(response);
    }
    return fetch;
  }
  const batch = syntheticUrls(3);

  test('POSTs the documented payload in a single request', async () => {
    const fetch = fetchWith(new Response('', { status: 200 }));
    const clock = createClock();
    expect(await submitUrls(config, batch, { fetch, sleep: clock.sleep })).toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [target, init] = fetch.mock.calls[0];
    expect(String(target)).toBe(config.endpoint);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json; charset=utf-8' });
    expect(JSON.parse(init?.body as string)).toEqual({
      host: HOST,
      key: KEY,
      keyLocation: `https://${HOST}/${KEY}.txt`,
      urlList: batch,
    });
  });

  test('accepts 202, which IndexNow answers while it verifies a new key', async () => {
    const fetch = fetchWith(new Response('', { status: 202 }));
    expect(await submitUrls(config, batch, { fetch, sleep: createClock().sleep })).toEqual({
      ok: true,
    });
  });

  test('retries server errors with back-off, then gives up', async () => {
    const fetch = fetchWith(
      new Response('', { status: 503 }),
      new Response('', { status: 503 }),
      new Response('', { status: 503 }),
      new Response('unavailable', { status: 503 })
    );
    const clock = createClock();
    expect(await submitUrls(config, batch, { fetch, sleep: clock.sleep })).toEqual({
      ok: false,
      status: 503,
      detail: 'unavailable',
    });
    expect(clock.sleep.mock.calls.map(([ms]) => ms)).toEqual([5_000, 30_000, 120_000]);
  });

  test('succeeds when a retry gets through, and treats network errors like server errors', async () => {
    const clock = createClock();
    const recovered = fetchWith(
      new Response('', { status: 502 }),
      new Response('', { status: 200 })
    );
    expect(await submitUrls(config, batch, { fetch: recovered, sleep: clock.sleep })).toEqual({
      ok: true,
    });
    expect(clock.sleep).toHaveBeenCalledTimes(1);

    const boom = new Error('socket hang up');
    const offline = fetchWith(boom, boom, boom, boom);
    expect(await submitUrls(config, batch, { fetch: offline, sleep: clock.sleep })).toEqual({
      ok: false,
      status: 0,
      detail: 'socket hang up',
    });
  });

  test.each([400, 403, 422, 429])('does not retry HTTP %s', async (status) => {
    const fetch = fetchWith(new Response('nope', { status }));
    const clock = createClock();
    expect(await submitUrls(config, batch, { fetch, sleep: clock.sleep })).toEqual({
      ok: false,
      status,
      detail: 'nope',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(clock.sleep).not.toHaveBeenCalled();
  });
});

describe('the live site', () => {
  test('checks that the key file is served and contains the key', async () => {
    const site = createSite([]);
    expect(await keyFileProblem(config, site.fetch)).toBeNull();

    site.keyLive = false;
    expect(await keyFileProblem(config, site.fetch)).toBe(
      `GET https://aspire.dev/${KEY}.txt returned HTTP 404`
    );

    const wrong = vi.fn<typeof fetchWithProxy>().mockResolvedValue(new Response('another-key'));
    expect(await keyFileProblem(config, wrong)).toMatch(/does not contain/);
    const down = vi.fn<typeof fetchWithProxy>().mockRejectedValue(new Error('offline'));
    expect(await keyFileProblem(config, down)).toMatch(/offline/);
  });

  test("derives the What's new page of a release", () => {
    expect(whatsNewPath('13.6')).toBe('/whats-new/aspire-13-6/');
    expect(whatsNewPath('9.5')).toBe('/whats-new/aspire-9-5/');
    expect(whatsNewPath('14.0')).toBe('/whats-new/aspire-14/');
    expect(() => whatsNewPath('13')).toThrow();
    expect(() => whatsNewPath('13.6.1')).toThrow();
  });

  test('waits until the release page is served, and gives up when it never is', async () => {
    const site = createSite([]);
    const clock = createClock();
    let polls = 0;
    clock.sleep.mockImplementation(() => {
      if (++polls === 2) site.liveReleases.add('13.6');
      return Promise.resolve();
    });
    const deps = { fetch: site.fetch, sleep: clock.sleep, now: clock.now };
    expect(
      await waitForRelease(HOST, '13.6', deps, { timeoutMs: 600_000, intervalMs: 60_000 })
    ).toBe(true);
    expect(clock.sleep).toHaveBeenCalledTimes(2);
    expect(site.fetch.mock.calls.every(([, init]) => init?.method === 'HEAD')).toBe(true);

    const idle = createClock();
    const start = idle.now().getTime();
    const never = { fetch: site.fetch, sleep: idle.sleep, now: idle.now };
    expect(
      await waitForRelease(HOST, '14.0', never, { timeoutMs: 180_000, intervalMs: 60_000 })
    ).toBe(false);
    expect(idle.now().getTime() - start).toBeLessThanOrEqual(180_000);
  });
});

describe('triggers', () => {
  const pullRequest = (
    overrides: Record<string, unknown> = {},
    head: Record<string, unknown> = {}
  ) => ({
    pull_request: {
      merged: true,
      title: 'Content for release: 13.6',
      head: { ref: 'release/13.6', repo: { full_name: 'microsoft/aspire.dev' }, ...head },
      base: { ref: 'main', repo: { full_name: 'microsoft/aspire.dev' } },
      ...overrides,
    },
  });

  test('recognizes a merged release/X.Y pull request from this repository', () => {
    expect(releaseVersion(pullRequest())).toBe('13.6');
    expect(releaseVersion(pullRequest({}, { ref: 'release/14.0' }))).toBe('14.0');
  });

  test.each([
    ['one that was closed without merging', pullRequest({ merged: false })],
    ['one from a fork', pullRequest({}, { repo: { full_name: 'someone/aspire.dev' } })],
    ['one from another branch', pullRequest({}, { ref: 'someone/fix-typo' })],
    ['one from release/X.Y.Z', pullRequest({}, { ref: 'release/13.6.1' })],
    [
      'one that only has a release title',
      pullRequest({ title: 'Merge release/13.4 into main' }, { ref: 'joperezr/merge-13-4' }),
    ],
    ['a payload without a pull request', {}],
    ['no payload', undefined],
  ])('ignores %s', (_name, event) => {
    expect(releaseVersion(event)).toBeNull();
  });
});

describe('command line', () => {
  test('reads the options and applies the defaults', () => {
    expect(parseCli(['--state-dir', stateDir])).toEqual({
      stateDir,
      mode: 'daily',
      limit: undefined,
      release: undefined,
      trigger: 'manual',
      dryRun: false,
      allowShrink: false,
    });
    expect(
      parseCli([
        ...['--state-dir', stateDir, '--mode', 'flush', '--limit', '500', '--release', '13.6'],
        ...['--trigger', 'workflow_dispatch', '--dry-run', '--allow-shrink'],
      ])
    ).toEqual({
      stateDir,
      mode: 'flush',
      limit: 500,
      release: '13.6',
      trigger: 'workflow_dispatch',
      dryRun: true,
      allowShrink: true,
    });
  });

  test.each([
    ['no state directory', []],
    ['an unknown mode', ['--state-dir', 'x', '--mode', 'weekly']],
    ['a limit below 1', ['--state-dir', 'x', '--limit', '0']],
    ['a limit above one request', ['--state-dir', 'x', '--limit', '10001']],
    ['a limit that is not a number', ['--state-dir', 'x', '--limit', 'many']],
    ['a release that is not X.Y', ['--state-dir', 'x', '--release', '13']],
    ['an unknown flag', ['--state-dir', 'x', '--changed-files', 'f.jsonl']],
  ])('rejects %s', (_name, argv) => {
    expect(() => parseCli(argv)).toThrow();
  });
});

describe('running end to end', () => {
  let site: ReturnType<typeof createSite>;
  let clock: ReturnType<typeof createClock>;

  beforeEach(() => {
    site = createSite(SMALL_SITE);
    clock = createClock();
  });

  const runDay = (overrides: Partial<RunOptions> = {}) => {
    site.posts.length = 0;
    return run({
      config,
      stateDir,
      mode: 'daily',
      trigger: 'schedule',
      fetch: site.fetch,
      sleep: clock.sleep,
      now: clock.now,
      ...overrides,
    });
  };
  const submitted = () => site.posts.flatMap((post) => post.urlList);
  const savedState = () => loadState(stateDir, HOST);
  const readState = () => readFile(path.join(stateDir, 'state.json'), 'utf8');

  test('a cold start submits the first window and seeds the state', async () => {
    const result = await runDay();
    expect(result).toMatchObject({ outcome: 'completed', submitted: 3, stateChanged: true });
    expect(result.summary).toContain('## IndexNow submission for aspire.dev: completed');
    expect(result.summary).toContain('Sitemap: 10 URLs');
    expect(result.summary).toContain('Pass: rotation, 3 of 10 URLs covered (30%)');
    expect(result.summary).toContain('Cold start');
    expect(submitted()).toEqual(urls(['/', '/app-host/', '/get-started/']));

    const state = await savedState();
    expect(state?.known).toHaveLength(10);
    expect(state?.cycle?.cursor).toBe(url('/get-started/'));
  });

  test('daily runs walk the sitemap without repeating a URL and then start over', async () => {
    const days: string[][] = [];
    for (let day = 0; day < 5; day++) {
      await runDay();
      days.push(submitted());
    }
    expect(days).toEqual([
      urls(['/', '/app-host/', '/get-started/']),
      urls([DOCS[3], API[0], API[1]]),
      urls([API[2], '/de/', '/de/app-host/']),
      urls(['/ja/']),
      urls(['/', '/app-host/', '/get-started/']),
    ]);
  });

  test('removed and new URLs are sent first, and only a new page ahead of the cursor repeats', async () => {
    await runDay();
    const days = [submitted()];

    site.paths = [
      ...site.paths.filter((entry) => entry !== '/ja/'),
      '/aaa/',
      '/reference/api/csharp/ab/',
    ];
    const second = await runDay();
    expect(second.summary).toContain('2 new and 1 removed');
    expect(submitted()).toEqual(urls(['/ja/', '/aaa/', '/reference/api/csharp/ab/']));
    days.push(submitted());

    for (let day = 0; day < 3; day++) {
      await runDay();
      days.push(submitted());
    }
    const everything = days.flat();
    const seen = new Set(everything);
    expect(seen).toEqual(new Set([...urls(site.paths), url('/ja/')]));
    expect(everything).toHaveLength(seen.size + 1);
    expect(everything.filter((entry) => entry === url('/reference/api/csharp/ab/'))).toHaveLength(
      2
    );
  });

  test('a flush restarts from the top at the release budget and then returns to the rotation', async () => {
    await runDay();
    const flush = await runDay({ mode: 'flush', release: undefined });
    expect(flush.summary).toContain('Pass: release');
    expect(submitted()).toEqual(urls([...DOCS, API[0]]));

    await runDay();
    expect(submitted()).toEqual(urls([API[1], API[2], ...LOCALIZED]));
    expect((await savedState())?.cycle).toBeNull();

    await runDay();
    expect(submitted()).toEqual(urls(['/', '/app-host/', '/get-started/']));
  });

  test('skips a cold start while the key file is not live yet', async () => {
    site.keyLive = false;
    const result = await runDay();
    expect(result).toMatchObject({ outcome: 'skipped', submitted: 0, stateChanged: false });
    expect(site.posts).toHaveLength(0);
    expect(await savedState()).toBeNull();
  });

  test('fails when the key file disappears after the first successful run', async () => {
    await runDay();
    site.keyLive = false;
    await expect(runDay()).rejects.toThrow(/key file is not reachable/);
  });

  test('a dry run plans without submitting or saving, even while the key file is missing', async () => {
    site.keyLive = false;
    const result = await runDay({ dryRun: true });
    expect(result).toMatchObject({ outcome: 'dry-run', submitted: 3, stateChanged: false });
    expect(result.summary).toContain('Dry run');
    expect(site.posts).toHaveLength(0);
    expect(await savedState()).toBeNull();
  });

  test('waits for the release page before submitting', async () => {
    clock.sleep.mockImplementationOnce(() => {
      site.liveReleases.add('13.6');
      return Promise.resolve();
    });
    const result = await runDay({ mode: 'flush', release: '13.6' });
    expect(result.outcome).toBe('completed');
    expect(result.summary).toContain('release 13.6');
    expect(clock.sleep).toHaveBeenCalledTimes(1);
    expect(site.posts).toHaveLength(1);
  });

  test('does not submit when the release page never goes live', async () => {
    await expect(runDay({ mode: 'flush', release: '13.6' })).rejects.toThrow(/did not go live/);
    expect(site.posts).toHaveLength(0);
    expect(await savedState()).toBeNull();
  });

  test.each([429, 422])(
    'a request answered with HTTP %s fails and leaves the state alone',
    async (status) => {
      await runDay();
      const before = await readState();
      site.responses = [status];
      const result = await runDay();
      expect(result).toMatchObject({ outcome: 'failed', submitted: 0, stateChanged: false });
      expect(result.failure).toContain(String(status));
      expect(result.failure).toContain('The next run tries again.');
      expect(await readState()).toBe(before);

      await runDay();
      expect(submitted()).toEqual(urls([DOCS[3], API[0], API[1]]));
    }
  );

  test('a flush whose request failed still starts the release pass', async () => {
    await runDay();
    site.responses = [429];
    const result = await runDay({ mode: 'flush' });
    expect(result).toMatchObject({ outcome: 'failed', stateChanged: true });
    expect(result.failure).toContain('release pass was started');
    expect((await savedState())?.cycle).toEqual({ kind: 'release', cursor: null });

    await runDay();
    expect(submitted()).toEqual(urls([...DOCS, API[0]]));
  });

  test('a cold start whose request failed still seeds the state', async () => {
    site.responses = [422];
    const result = await runDay();
    expect(result).toMatchObject({ outcome: 'failed', stateChanged: true });
    const state = await savedState();
    expect(state?.known).toHaveLength(10);
    expect(state?.cycle?.cursor).toBeNull();
  });

  test('refuses a sitemap that suddenly lost most of its pages and keeps the state', async () => {
    await runDay();
    const before = await readState();
    site.paths = site.paths.slice(0, 5);
    await expect(runDay()).rejects.toThrow(/--allow-shrink/);
    expect(await readState()).toBe(before);
  });

  test('replaces a state that lists other sites instead of submitting what it lists', async () => {
    await saveState(
      stateDir,
      makeState({ known: [url('/'), 'https://evil.example/spam/', 'http://aspire.dev/insecure/'] })
    );
    const result = await runDay();
    expect(result.summary).toContain('Cold start');
    expect(submitted().every((entry) => entry.startsWith('https://aspire.dev/'))).toBe(true);
    expect((await savedState())?.known).toEqual([...urls(SMALL_SITE)].sort());
  });

  test('sends a single request even when the budget is larger than a request can hold', async () => {
    site = createSite(
      Array.from({ length: 12_000 }, (_, index) => `/docs/page-${String(index).padStart(5, '0')}/`)
    );
    const budgets = { release: 50_000, rotation: 50_000 };
    await runDay({ config: { ...config, budgets }, mode: 'flush' });
    expect(site.posts).toHaveLength(1);
    expect(site.posts[0].urlList).toHaveLength(MAX_URLS_PER_RUN);
  });
});

describe('the command line entry point', () => {
  async function runMain(argv: string[], event?: unknown) {
    const files = {
      GITHUB_EVENT_PATH: path.join(stateDir, 'event.json'),
      GITHUB_STEP_SUMMARY: path.join(stateDir, 'summary.md'),
      GITHUB_OUTPUT: path.join(stateDir, 'output.txt'),
    };
    if (event !== undefined) await writeFile(files.GITHUB_EVENT_PATH, JSON.stringify(event));
    const real = await loadConfig();
    const site = createSite(SMALL_SITE, real.key);
    const clock = createClock();
    const code = await main(['--state-dir', path.join(stateDir, 'state'), ...argv], files, {
      fetch: site.fetch,
      sleep: clock.sleep,
      now: clock.now,
    });
    const read = (file: string) => readFile(file, 'utf8').catch(() => '');
    return {
      code,
      site,
      real,
      summary: await read(files.GITHUB_STEP_SUMMARY),
      output: await read(files.GITHUB_OUTPUT),
    };
  }

  const pullRequest = (title: string, ref: string) => ({
    pull_request: {
      merged: true,
      title,
      head: { ref, repo: { full_name: 'microsoft/aspire.dev' } },
      base: { ref: 'main', repo: { full_name: 'microsoft/aspire.dev' } },
    },
  });

  test('skips a merged pull request that is not a release', async () => {
    const { code, output, summary, site } = await runMain(
      ['--trigger', 'pull_request'],
      pullRequest('Fix a typo', 'someone/typo')
    );
    expect(code).toBe(0);
    expect(output).toBe('state_changed=false\n');
    expect(summary).toContain('skipped');
    expect(summary).toContain('not a merged release');
    expect(site.fetch).not.toHaveBeenCalled();
  });

  test('a merged release pull request starts a burst once the release page is live', async () => {
    const files = { GITHUB_EVENT_PATH: path.join(stateDir, 'event.json') };
    await writeFile(
      files.GITHUB_EVENT_PATH,
      JSON.stringify(pullRequest('Content for release: 13.6', 'release/13.6'))
    );
    const real = await loadConfig();
    const site = createSite(SMALL_SITE, real.key);
    site.liveReleases.add('13.6');
    const clock = createClock();
    const env = { ...files, GITHUB_OUTPUT: path.join(stateDir, 'output.txt') };
    const code = await main(['--state-dir', stateDir, '--trigger', 'pull_request'], env, {
      fetch: site.fetch,
      sleep: clock.sleep,
      now: clock.now,
    });

    expect(code).toBe(0);
    expect(await readFile(env.GITHUB_OUTPUT, 'utf8')).toBe('state_changed=true\n');
    expect(site.posts).toHaveLength(1);
    expect(site.posts[0]).toMatchObject({ host: real.host, key: real.key });
    expect(site.posts[0].urlList).toEqual(urls(SMALL_SITE));
    expect((await loadState(stateDir, real.host))?.cycle).toBeNull();
  });

  test('reports a failed run and returns a failing exit code', async () => {
    const { code, output, summary } = await runMain(['--mode', 'flush', '--release', '13.6']);
    expect(code).toBe(1);
    expect(output).toBe('state_changed=false\n');
    expect(summary).toContain('failed');
    expect(summary).toContain('did not go live');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('did not go live'));
  });

  test('rejects invalid arguments', async () => {
    const { code } = await runMain(['--mode', 'weekly']);
    expect(code).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('--mode'));
  });
});
