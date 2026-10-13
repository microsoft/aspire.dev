import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { Response } from 'node-fetch';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { fetchWithProxy } from '../../scripts/fetch-with-proxy';
import {
  MAX_URLS_PER_REQUEST,
  compareUrls,
  countCovered,
  detectReleaseMerge,
  emptyReport,
  fetchSitemapLocations,
  finalizeRun,
  hasApiChanges,
  isReleaseLive,
  loadConfig,
  loadState,
  main,
  normalizeUrls,
  parseChangedFiles,
  parseCli,
  parseConfig,
  parseRetryAfter,
  parseSitemap,
  planRun,
  readDeployment,
  renderSummary,
  resolveRun,
  run,
  saveState,
  submitUrls,
  tierOf,
  urlsForChangedFiles,
  verifyKeyFile,
  waitForRelease,
  whatsNewPath,
  type ChangedFile,
  type Cycle,
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

// Ten pages in (tier, path) order: four English pages, three API pages, three localized pages.
const DOCS = ['/', '/app-host/', '/get-started/', '/whats-new/aspire-13-6/'];
const API = [
  '/reference/api/csharp/a/',
  '/reference/api/csharp/b/',
  '/reference/api/typescript/c/',
];
const LOCALIZED = ['/de/', '/de/app-host/', '/ja/'];
const SMALL_SITE = [...DOCS, ...API, ...LOCALIZED];

function createLogger() {
  return {
    info: vi.fn<(message: string) => void>(),
    warn: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string) => void>(),
  };
}

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

type CycleInput = Omit<Cycle, 'updated'> & { updated?: string[] };

function makeState(
  overrides: Partial<Omit<IndexNowState, 'cycle'>> & { cycle?: CycleInput | null } = {}
): IndexNowState {
  const { cycle, ...rest } = overrides;
  return {
    host: HOST,
    updatedAt: '2026-10-12T06:43:00.000Z',
    deployment: '',
    cycle: cycle ? { updated: [], ...cycle } : null,
    lastRun: null,
    known: [],
    ...rest,
  };
}

function syntheticUrls(count: number, prefix = '/reference/api/csharp/page-'): string[] {
  return Array.from({ length: count }, (_, index) =>
    url(`${prefix}${String(index).padStart(6, '0')}/`)
  );
}

interface PostCall {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

type QueuedResponse = number | { status: number; headers?: Record<string, string> };

/** The JSON body of a request the code under test sent. */
function postBody(init?: { body?: unknown }): PostCall {
  expect(typeof init?.body).toBe('string');
  return JSON.parse(init?.body as string) as PostCall;
}

/** A stand-in for aspire.dev and the IndexNow endpoint. */
function createSite(paths: string[], key = KEY) {
  const site = {
    paths: [...paths],
    keyLive: true,
    liveReleases: new Set<string>(),
    deployment: 'deadbeefcafe0123456789',
    /** Statuses for upcoming IndexNow POSTs; 200 when the queue is empty. */
    responses: [] as QueuedResponse[],
    posts: [] as PostCall[],
    fetch: vi.fn<typeof fetchWithProxy>(),
  };

  const urlset = () =>
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
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
      const body = postBody(init);
      site.posts.push(body);
      const next = site.responses.shift() ?? 200;
      const { status, headers } = typeof next === 'number' ? { status: next, headers: {} } : next;
      return Promise.resolve(new Response('', { status, headers }));
    }
    if (target.pathname === `/${key}.txt`) {
      return Promise.resolve(
        site.keyLive ? new Response(key) : new Response('Not found', { status: 404 })
      );
    }
    if (target.pathname === '/sitemap-index.xml') {
      return Promise.resolve(
        new Response(
          '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
            `<sitemap><loc>${url('/sitemap-0.xml')}</loc></sitemap></sitemapindex>`
        )
      );
    }
    if (target.pathname === '/sitemap-0.xml') return Promise.resolve(new Response(urlset()));
    if (target.pathname === '/') {
      return Promise.resolve(
        new Response(
          `<html><head><meta name="git-commit-id" content="${site.deployment}"></head></html>`
        )
      );
    }
    const release = /^\/whats-new\/aspire-(\d+)(?:-(\d+))?\/$/.exec(target.pathname);
    if (release) {
      const version = `${release[1]}.${release[2] ?? '0'}`;
      return Promise.resolve(
        new Response('', { status: site.liveReleases.has(version) ? 200 : 404 })
      );
    }
    return Promise.resolve(new Response('Not found', { status: 404 }));
  });

  return site;
}

type Site = ReturnType<typeof createSite>;

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(path.join(os.tmpdir(), 'indexnow-test-'));
});

afterEach(async () => {
  await rm(stateDir, { recursive: true, force: true });
});

describe('IndexNow config', () => {
  test('the committed config is valid and its key file is served from the site root', async () => {
    const real = await loadConfig();
    const keyFile = fileURLToPath(new URL(`../../public/${real.key}.txt`, import.meta.url));
    const contents = await readFile(keyFile, 'utf8');
    expect(contents.charCodeAt(0)).not.toBe(0xfeff);
    expect(contents.trim()).toBe(real.key);
    expect(real.host).toBe('aspire.dev');
    expect(new URL(real.sitemapIndex).hostname).toBe(real.host);
  });

  test.each([
    ['a key that is too short', { ...config, key: 'short' }],
    ['a key with illegal characters', { ...config, key: `${KEY.slice(0, 31)}_` }],
    ['an endpoint that is not https', { ...config, endpoint: 'http://api.indexnow.org/indexnow' }],
    ['a sitemap on another host', { ...config, sitemapIndex: 'https://example.com/sitemap.xml' }],
    ['a zero budget', { ...config, budgets: { release: 0, rotation: 3 } }],
    ['a budget above the limit', { ...config, budgets: { release: 5, rotation: 50_001 } }],
    ['an uppercase host', { ...config, host: 'Aspire.dev' }],
  ])('rejects %s', (_name, value) => {
    expect(() => parseConfig(value)).toThrow();
  });

  test('accepts the shape used by the workflow', () => {
    expect(parseConfig(config)).toEqual(config);
  });
});

describe('sitemap parsing', () => {
  test('reads <loc> values, decodes entities and ignores xhtml alternates', () => {
    const parsed = parseSitemap(
      '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' +
        '<url><loc>https://aspire.dev/</loc><xhtml:link rel="alternate" hreflang="de" href="https://aspire.dev/de/"/></url>' +
        '<url><loc> https://aspire.dev/a?b=1&amp;c=2 </loc></url>' +
        '<url><loc>https://aspire.dev/&#233;&#xE9;/</loc></url>' +
        '</urlset>'
    );
    expect(parsed).toEqual({
      kind: 'urlset',
      locations: ['https://aspire.dev/', 'https://aspire.dev/a?b=1&c=2', 'https://aspire.dev/éé/'],
    });
  });

  test('recognizes a sitemap index', () => {
    const parsed = parseSitemap(
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://aspire.dev/sitemap-0.xml</loc></sitemap></sitemapindex>'
    );
    expect(parsed).toEqual({ kind: 'index', locations: ['https://aspire.dev/sitemap-0.xml'] });
  });

  test('rejects documents that are not sitemaps', () => {
    expect(() => parseSitemap('<html><body>Not found</body></html>')).toThrow(/not a sitemap/i);
  });

  test('follows a sitemap index to its child sitemaps', async () => {
    const site = createSite(['/', '/a/']);
    expect(await fetchSitemapLocations(config.sitemapIndex, site.fetch)).toEqual([
      url('/'),
      url('/a/'),
    ]);
    expect(site.fetch).toHaveBeenCalledTimes(2);
  });

  test('refuses child sitemaps on another host or nested indexes', async () => {
    const fetch = vi.fn<typeof fetchWithProxy>();
    fetch.mockResolvedValueOnce(
      new Response(
        '<sitemapindex><sitemap><loc>https://evil.example/s.xml</loc></sitemap></sitemapindex>'
      )
    );
    await expect(fetchSitemapLocations(config.sitemapIndex, fetch)).rejects.toThrow(
      /not an https URL on aspire\.dev/
    );

    fetch.mockResolvedValueOnce(
      new Response(
        '<sitemapindex><sitemap><loc>https://aspire.dev/a.xml</loc></sitemap></sitemapindex>'
      )
    );
    fetch.mockResolvedValueOnce(
      new Response(
        '<sitemapindex><sitemap><loc>https://aspire.dev/b.xml</loc></sitemap></sitemapindex>'
      )
    );
    await expect(fetchSitemapLocations(config.sitemapIndex, fetch)).rejects.toThrow(/nested/);
  });

  test('fails when the sitemap cannot be fetched', async () => {
    const fetch = vi.fn<typeof fetchWithProxy>();
    fetch.mockResolvedValueOnce(new Response('oops', { status: 503 }));
    await expect(fetchSitemapLocations(config.sitemapIndex, fetch)).rejects.toThrow(/HTTP 503/);
  });

  test('keeps https URLs on the host, drops fragments and de-duplicates', () => {
    const { urls, rejected } = normalizeUrls(
      [
        'https://aspire.dev/a/',
        'https://aspire.dev/a/#section',
        'https://ASPIRE.dev/b/',
        'http://aspire.dev/c/',
        'https://aspire.dev:8443/d/',
        'https://user:pass@aspire.dev/e/',
        'https://example.com/f/',
        'not a url',
      ],
      HOST
    );
    expect(urls).toEqual(['https://aspire.dev/a/', 'https://aspire.dev/b/']);
    expect(rejected).toHaveLength(5);
  });
});

describe('ordering', () => {
  test('puts English pages first, then the API reference, then localized pages', () => {
    expect(tierOf('/')).toBe(0);
    expect(tierOf('/app-host/certificate-configuration/')).toBe(0);
    expect(tierOf('/reference/cli/')).toBe(0);
    expect(tierOf('/reference/api')).toBe(0);
    expect(tierOf('/reference/api/csharp/aspire.hosting/')).toBe(1);
    expect(tierOf('/zh-cn/whats-new/upgrade-aspire/')).toBe(2);
    expect(tierOf('/pt-br/')).toBe(2);
    expect(tierOf('/de/reference/api/csharp/x/')).toBe(2);
    expect(tierOf('/deployment/')).toBe(0);
  });

  test('sorts by tier and then by URL', () => {
    const shuffled = [...SMALL_SITE].reverse().map(url);
    expect(shuffled.sort((a, b) => compareUrls(a, b))).toEqual(SMALL_SITE.map(url));
  });

  test('counts how many URLs a cursor has covered', () => {
    const urls = SMALL_SITE.map(url);
    expect(countCovered(urls, null)).toBe(0);
    expect(countCovered(urls, url('/get-started/'))).toBe(3);
    expect(countCovered(urls, url('/ja/'))).toBe(10);
  });
});

describe('pages updated by a release', () => {
  const file = (filename: string, overrides: Partial<ChangedFile> = {}): ChangedFile => ({
    status: 'modified',
    filename,
    changes: 4,
    patch: null,
    ...overrides,
  });
  const docs = (relative: string, overrides: Partial<ChangedFile> = {}) =>
    file(`src/frontend/src/content/docs/${relative}`, overrides);
  const apiData = (
    kind: 'pkgs' | 'ts-modules',
    name: string,
    overrides: Partial<ChangedFile> = {}
  ) => file(`src/frontend/src/data/${kind}/${name}`, { status: 'renamed', ...overrides });
  const patchOf = (...lines: string[]) => ['@@ -4 +4 @@', ...lines].join('\n');
  const VERSION_ONLY = patchOf(
    '-    "version": "13.5.4",',
    '+    "version": "13.6.0",',
    '-    "sourceCommit": "9c1b401dd677"',
    '+    "sourceCommit": "f4c27f2d43dd"',
    '-          "sourceLines": "37-87"',
    '+          "sourceLines": "39-89"'
  );
  const REAL_CHANGE = patchOf(
    '-    "version": "13.5.4",',
    '+    "version": "13.6.0",',
    '+          "name": "AsExpress",'
  );

  const site = [
    '/',
    '/app-host/',
    '/app-host/eventing/',
    '/get-started/first-app/',
    '/whats-new/aspire-13-6/',
    '/de/',
    '/de/app-host/',
    '/reference/api/csharp/aspire.hosting/',
    '/reference/api/csharp/aspire.hosting/distributedapplication/',
    '/reference/api/csharp/aspire.hosting.redis/',
    '/reference/api/csharp/aspire.hosting.redis/addredis/',
    '/reference/api/typescript/aspire.hosting.redis/',
    '/reference/api/typescript/aspire.hosting.redis/addredis/',
  ].map(url);
  const map = (...files: ChangedFile[]) => urlsForChangedFiles(files, site, HOST);

  test('reads one JSON object per line', () => {
    const text =
      '{"status":"modified","filename":"a.mdx","changes":3,"patch":"@@ -1 +1 @@"}\n' +
      '\n' +
      '{"status":"renamed","filename":"b.json","patch":null}\n';
    expect(parseChangedFiles(text)).toEqual([
      { status: 'modified', filename: 'a.mdx', changes: 3, patch: '@@ -1 +1 @@' },
      { status: 'renamed', filename: 'b.json', changes: null, patch: null },
    ]);
    expect(parseChangedFiles('')).toEqual([]);
  });

  test.each([
    ['text that is not JSON', 'not json', /Line 1 .* not JSON/],
    ['an object without a filename', '{"status":"added"}', /Line 1 .* "filename"/],
    ['a value that is not an object', '{"status":"added","filename":"a"}\n42', /Line 2/],
  ])('rejects %s', (_name, text, message) => {
    expect(() => parseChangedFiles(text)).toThrow(message);
  });

  test('API data only counts when more than the volatile keys changed', () => {
    expect(hasApiChanges(file('x.json', { status: 'added' }))).toBe(true);
    expect(hasApiChanges(file('x.json', { patch: VERSION_ONLY }))).toBe(false);
    expect(hasApiChanges(file('x.json', { patch: REAL_CHANGE }))).toBe(true);
    // GitHub leaves out the diff of a large change, but a pure rename has none to show.
    expect(hasApiChanges(file('x.json', { changes: 900 }))).toBe(true);
    expect(hasApiChanges(file('x.json', { changes: null }))).toBe(true);
    expect(hasApiChanges(file('x.json', { status: 'renamed', changes: 0 }))).toBe(false);
  });

  test('maps docs to their route', () => {
    expect(
      map(
        docs('app-host/eventing.mdx'),
        docs('app-host/index.mdx'),
        docs('de/index.mdx'),
        docs('get-started/first-app.md')
      )
    ).toEqual(
      ['/app-host/', '/app-host/eventing/', '/de/', '/get-started/first-app/'].map(url).sort()
    );
    expect(map(docs('index.mdx'))).toEqual([url('/')]);
    expect(map(docs('de/app-host/index.mdx'))).toEqual([url('/de/app-host/')]);
  });

  test('ignores docs without a page, removed docs and files no page comes from', () => {
    expect(
      map(
        docs('404.mdx'),
        docs('app-host/removed.mdx'),
        docs('app-host/eventing.mdx', { status: 'removed' }),
        file('src/frontend/src/components/Header.astro'),
        file('src/frontend/src/assets/logo.svg'),
        file('src/frontend/package.json'),
        file('src/frontend/src/content/docs/app-host/diagram.svg')
      )
    ).toEqual([]);
  });

  test('maps an API data file to every page of its package, and only that package', () => {
    expect(map(apiData('pkgs', 'Aspire.Hosting.13.6.0.json', { patch: REAL_CHANGE }))).toEqual(
      [
        '/reference/api/csharp/aspire.hosting/',
        '/reference/api/csharp/aspire.hosting/distributedapplication/',
      ].map(url)
    );
    expect(
      map(
        apiData('pkgs', 'Aspire.Hosting.Redis.13.6.0-preview.1.26478.8.json', {
          patch: REAL_CHANGE,
        })
      )
    ).toEqual(
      [
        '/reference/api/csharp/aspire.hosting.redis/',
        '/reference/api/csharp/aspire.hosting.redis/addredis/',
      ].map(url)
    );
  });

  test('maps a TypeScript module file to its module pages', () => {
    expect(
      map(apiData('ts-modules', 'Aspire.Hosting.Redis.13.6.0.json', { patch: REAL_CHANGE }))
    ).toEqual(
      [
        '/reference/api/typescript/aspire.hosting.redis/',
        '/reference/api/typescript/aspire.hosting.redis/addredis/',
      ].map(url)
    );
  });

  test('skips API data files that only moved to the new version', () => {
    expect(
      map(
        apiData('pkgs', 'Aspire.Hosting.13.6.0.json', { patch: VERSION_ONLY }),
        apiData('ts-modules', 'Aspire.Hosting.Redis.13.6.0.json', { status: 'renamed', changes: 0 })
      )
    ).toEqual([]);
  });

  test('counts new API data files and ignores packages without pages', () => {
    expect(
      map(apiData('pkgs', 'Aspire.Hosting.Redis.13.6.0.json', { status: 'added' }))
    ).toHaveLength(2);
    expect(map(apiData('pkgs', 'Aspire.Unknown.13.6.0.json', { status: 'added' }))).toEqual([]);
  });

  test('returns each page once, in a stable order', () => {
    const result = map(
      docs('app-host/eventing.mdx'),
      apiData('pkgs', 'Aspire.Hosting.Redis.13.6.0.json', { patch: REAL_CHANGE }),
      docs('app-host/eventing.mdx')
    );
    expect(new Set(result).size).toBe(result.length);
    expect(result).toEqual([...result].sort());
  });
});

describe('planning', () => {
  const base = {
    current: SMALL_SITE.map(url),
    state: null as IndexNowState | null,
    mode: 'daily' as const,
    reason: 'schedule',
    budgets: config.budgets,
    now: NOW,
  };

  test('a cold start seeds the known list instead of treating every URL as new', () => {
    const plan = planRun(base);
    expect(plan.coldStart).toBe(true);
    expect(plan.newUrls).toEqual([]);
    expect(plan.removedUrls).toEqual([]);
    expect(plan.cycle).toMatchObject({ kind: 'rotation', cursor: null, reason: 'schedule' });
    expect(plan.window).toEqual(['/', '/app-host/', '/get-started/'].map(url));
    expect(plan.windowComplete).toBe(false);
  });

  test('a cycle continues after its cursor', () => {
    const plan = planRun({
      ...base,
      state: makeState({
        known: base.current,
        cycle: {
          kind: 'rotation',
          reason: 'schedule',
          startedAt: '2026-10-12T00:00:00.000Z',
          cursor: url('/get-started/'),
          skip: [],
        },
      }),
    });
    expect(plan.coldStart).toBe(false);
    expect(plan.window).toEqual(
      ['/whats-new/aspire-13-6/', '/reference/api/csharp/a/', '/reference/api/csharp/b/'].map(url)
    );
  });

  test('a cursor that is no longer in the sitemap still finds the next URL', () => {
    const plan = planRun({
      ...base,
      state: makeState({
        known: base.current,
        cycle: {
          kind: 'rotation',
          reason: 'schedule',
          startedAt: '2026-10-12T00:00:00.000Z',
          cursor: url('/get-started/gone/'),
          skip: [],
        },
      }),
    });
    expect(plan.window[0]).toBe(url('/whats-new/aspire-13-6/'));
  });

  test('a flush restarts the cycle from the top with the release budget', () => {
    const plan = planRun({
      ...base,
      mode: 'flush',
      reason: 'release/13.6',
      state: makeState({
        known: base.current,
        cycle: {
          kind: 'rotation',
          reason: 'schedule',
          startedAt: '2026-10-01T00:00:00.000Z',
          cursor: url('/ja/'),
          skip: [url('/de/')],
        },
      }),
    });
    expect(plan.cycle).toMatchObject({
      kind: 'release',
      reason: 'release/13.6',
      cursor: null,
      skip: [],
    });
    expect(plan.budget).toBe(5);
    expect(plan.window).toEqual(
      [
        '/',
        '/app-host/',
        '/get-started/',
        '/whats-new/aspire-13-6/',
        '/reference/api/csharp/a/',
      ].map(url)
    );
  });

  test('a release cycle keeps its larger budget until it completes', () => {
    const plan = planRun({
      ...base,
      state: makeState({
        known: base.current,
        cycle: {
          kind: 'release',
          reason: 'release/13.6',
          startedAt: '',
          cursor: url('/ja/'),
          skip: [],
        },
      }),
    });
    expect(plan.budget).toBe(5);
  });

  test('--limit replaces the budget', () => {
    expect(planRun({ ...base, limit: 2 }).window).toHaveLength(2);
  });

  test('new and removed URLs go first and count against the budget', () => {
    const known = SMALL_SITE.map(url);
    const current = [...known.filter((entry) => entry !== url('/ja/')), url('/aaa/')];
    const plan = planRun({
      ...base,
      current,
      state: makeState({
        known,
        cycle: {
          kind: 'rotation',
          reason: 'schedule',
          startedAt: '',
          cursor: url('/get-started/'),
          skip: [],
        },
      }),
    });
    expect(plan.removed).toEqual([url('/ja/')]);
    expect(plan.fresh).toEqual([url('/aaa/')]);
    expect(plan.window).toEqual([url('/whats-new/aspire-13-6/')]);
  });

  test('a new URL ahead of the cursor is not sent again by the window', () => {
    const known = SMALL_SITE.map(url);
    const created = url('/reference/api/csharp/ab/');
    const plan = planRun({
      ...base,
      current: [...known, created],
      state: makeState({
        known,
        cycle: {
          kind: 'rotation',
          reason: 'schedule',
          startedAt: '',
          cursor: url('/get-started/'),
          skip: [],
        },
      }),
      limit: 10,
    });
    expect(plan.fresh).toEqual([created]);
    expect(plan.window).not.toContain(created);
    expect(plan.window).toHaveLength(7);
  });

  test('new and removed URLs beyond the per-run cap stay pending', () => {
    const known = syntheticUrls(3);
    const created = syntheticUrls(10_005, '/reference/api/csharp/new-');
    const plan = planRun({
      ...base,
      current: [...known, ...created],
      state: makeState({ known }),
      limit: 20_000,
    });
    expect(plan.newUrls).toHaveLength(10_005);
    expect(plan.fresh).toHaveLength(10_000);
    const next = finalizeRun(plan, {
      host: HOST,
      current: [...known, ...created],
      accepted: plan.removed.length + plan.fresh.length + plan.window.length,
      now: NOW,
      trigger: 'schedule',
      deployment: '',
      statuses: [200],
    });
    const stillNew = created.filter((entry) => !next.known.includes(entry));
    expect(stillNew).toHaveLength(
      5 - plan.window.filter((entry) => created.includes(entry)).length
    );
  });

  test('pages updated by the release rank ahead of every other page', () => {
    const updated = [url('/reference/api/csharp/b/'), url('/de/app-host/')];
    const plan = planRun({
      ...base,
      mode: 'flush',
      reason: 'release/13.6',
      updatedUrls: updated,
      limit: 4,
    });
    expect(plan.cycle.updated).toEqual([...updated].sort());
    // Updated pages first (English, then API, then localized), then the rest in the usual order.
    expect(plan.window).toEqual(
      ['/reference/api/csharp/b/', '/de/app-host/', '/', '/app-host/'].map(url)
    );
  });

  test('updated pages that are not in the sitemap are dropped', () => {
    const plan = planRun({
      ...base,
      mode: 'flush',
      reason: 'release/13.6',
      updatedUrls: [url('/gone/'), url('/ja/'), url('/ja/')],
    });
    expect(plan.cycle.updated).toEqual([url('/ja/')]);
  });

  test('a cycle that is already running keeps its own updated pages', () => {
    const plan = planRun({
      ...base,
      updatedUrls: [url('/de/')],
      state: makeState({
        known: base.current,
        cycle: {
          kind: 'release',
          reason: 'release/13.6',
          startedAt: '',
          cursor: null,
          skip: [],
          updated: [url('/ja/')],
        },
      }),
    });
    expect(plan.cycle.updated).toEqual([url('/ja/')]);
    expect(plan.window[0]).toBe(url('/ja/'));
  });

  test('the cursor walks the updated pages first and then the rest', () => {
    const updated = [url('/reference/api/csharp/b/'), url('/de/app-host/')];
    const plan = planRun({
      ...base,
      state: makeState({
        known: base.current,
        cycle: {
          kind: 'release',
          reason: 'release/13.6',
          startedAt: '',
          cursor: url('/reference/api/csharp/b/'),
          skip: [],
          updated,
        },
      }),
    });
    expect(plan.window).toEqual(
      ['/de/app-host/', '/', '/app-host/', '/get-started/', '/whats-new/aspire-13-6/'].map(url)
    );
  });

  test('a release covers its new pages with the updated ones, docs before the API reference', () => {
    const known = SMALL_SITE.map(url);
    const created = [url('/reference/api/csharp/ab/'), url('/reference/api/csharp/ac/')];
    const createdDocs = url('/aaa/');
    const updated = [url('/app-host/')];
    const plan = planRun({
      ...base,
      current: [...known, ...created, createdDocs],
      state: makeState({ known }),
      mode: 'flush',
      reason: 'release/13.6',
      updatedUrls: updated,
    });
    expect(plan.newUrls).toHaveLength(3);
    expect(plan.fresh).toEqual([]);
    expect(plan.cycle.updated).toEqual([...updated, ...created, createdDocs].sort());
    expect(plan.window).toEqual(
      ['/aaa/', '/app-host/', '/reference/api/csharp/ab/', '/reference/api/csharp/ac/', '/'].map(
        url
      )
    );
  });

  test('a new page that appears after a release cycle started still goes first', () => {
    const known = SMALL_SITE.map(url);
    const late = url('/reference/api/csharp/zz/');
    const plan = planRun({
      ...base,
      current: [...known, late],
      state: makeState({
        known,
        cycle: {
          kind: 'release',
          reason: 'release/13.6',
          startedAt: '',
          cursor: url('/get-started/'),
          skip: [],
          updated: [url('/app-host/')],
        },
      }),
    });
    expect(plan.fresh).toEqual([late]);
    expect(plan.cycle.updated).toEqual([url('/app-host/')]);
  });

  test('a new page the running cycle already names is still sent first on a daily run', () => {
    const known = SMALL_SITE.map(url);
    const returned = url('/reference/api/csharp/ab/');
    const plan = planRun({
      ...base,
      current: [...known, returned],
      state: makeState({
        known,
        cycle: {
          kind: 'release',
          reason: 'release/13.6',
          startedAt: '',
          cursor: url('/get-started/'),
          skip: [],
          updated: [returned],
        },
      }),
    });
    // The cursor has already passed its place in the cycle, so only sending it first submits it.
    expect(plan.fresh).toEqual([returned]);
    expect(plan.window).not.toContain(returned);
  });

  test('--limit also caps the new and removed URLs that go first', () => {
    const known = SMALL_SITE.map(url);
    const current = [
      ...known.filter((entry) => entry !== url('/ja/')),
      url('/aaa/'),
      url('/aab/'),
      url('/aac/'),
    ];
    const plan = planRun({ ...base, current, state: makeState({ known }), limit: 2 });
    expect(plan.removed).toEqual([url('/ja/')]);
    expect(plan.fresh).toEqual([url('/aaa/')]);
    expect(plan.window).toEqual([]);
    expect(plan.newUrls).toHaveLength(3);
  });

  test('--limit also caps the removed URLs that go first', () => {
    const known = SMALL_SITE.map(url);
    const gone = [url('/reference/api/typescript/c/'), url('/ja/')];
    const plan = planRun({
      ...base,
      current: known.filter((entry) => !gone.includes(entry)),
      state: makeState({ known }),
      limit: 1,
    });
    expect(plan.removedUrls).toEqual(gone);
    expect(plan.removed).toEqual([gone[0]]);
    expect(plan.window).toEqual([]);
  });

  test('refuses an empty sitemap', () => {
    expect(() => planRun({ ...base, current: [] })).toThrow(/no URLs/);
  });

  test('refuses a sitemap that shrank by more than 20% unless allowed', () => {
    const known = syntheticUrls(100);
    const shrunk = known.slice(0, 79);
    expect(() => planRun({ ...base, current: shrunk, state: makeState({ known }) })).toThrow(
      /--allow-shrink/
    );
    expect(() =>
      planRun({ ...base, current: known.slice(0, 80), state: makeState({ known }) })
    ).not.toThrow();
    expect(() =>
      planRun({ ...base, current: shrunk, state: makeState({ known }), allowShrink: true })
    ).not.toThrow();
  });
});

describe('finalizing a run', () => {
  const finalizeOptions = {
    host: HOST,
    now: NOW,
    trigger: 'schedule',
    deployment: 'abc1234',
    statuses: [200],
  };

  test('remembers the whole sitemap and advances the cursor when everything was accepted', () => {
    const current = SMALL_SITE.map(url);
    const plan = planRun({
      current,
      state: null,
      mode: 'daily',
      reason: 'schedule',
      budgets: config.budgets,
      now: NOW,
    });
    const next = finalizeRun(plan, { ...finalizeOptions, current, accepted: 3 });
    expect(next.known).toEqual([...current].sort());
    expect(next.cycle?.cursor).toBe(url('/get-started/'));
    expect(next.lastRun).toMatchObject({ coldStart: true, submitted: 3, windowUrls: 3 });
    expect(next.deployment).toBe('abc1234');
  });

  test('completes the cycle once the window reaches the end of the sitemap', () => {
    const current = SMALL_SITE.map(url);
    const plan = planRun({
      current,
      state: makeState({
        known: current,
        cycle: {
          kind: 'release',
          reason: 'release/13.6',
          startedAt: '',
          cursor: url('/reference/api/typescript/c/'),
          skip: [],
        },
      }),
      mode: 'daily',
      reason: 'schedule',
      budgets: config.budgets,
      now: NOW,
    });
    expect(plan.window).toEqual(LOCALIZED.map(url));
    expect(plan.windowComplete).toBe(true);
    expect(finalizeRun(plan, { ...finalizeOptions, current, accepted: 3 }).cycle).toBeNull();
    // A partly accepted window leaves the cycle open at the last accepted URL.
    const partial = finalizeRun(plan, { ...finalizeOptions, current, accepted: 2 });
    expect(partial.cycle?.cursor).toBe(url('/de/app-host/'));
  });

  test('keeps URLs that were not accepted pending', () => {
    const known = SMALL_SITE.map(url);
    const created = [url('/aaa/'), url('/aab/')];
    const current = [...known.filter((entry) => entry !== url('/ja/')), ...created];
    const plan = planRun({
      current,
      state: makeState({ known }),
      mode: 'daily',
      reason: 'schedule',
      budgets: config.budgets,
      now: NOW,
    });
    expect(plan.removed).toEqual([url('/ja/')]);
    expect(plan.fresh).toEqual(created);

    const partial = finalizeRun(plan, { ...finalizeOptions, current, accepted: 2 });
    expect(partial.known).not.toContain(url('/ja/'));
    expect(partial.known).toContain(created[0]);
    expect(partial.known).not.toContain(created[1]);

    const none = finalizeRun(plan, { ...finalizeOptions, current, accepted: 0 });
    expect(none.known).toContain(url('/ja/'));
    expect(none.known).not.toContain(created[0]);
    expect(none.known).not.toContain(created[1]);
  });

  test('a new page the release cycle covers stays known, whether or not anything was accepted', () => {
    const known = SMALL_SITE.map(url);
    const covered = url('/reference/api/csharp/ab/');
    const current = [...known, covered];
    const plan = planRun({
      current,
      state: makeState({ known }),
      mode: 'flush',
      reason: 'release/13.6',
      budgets: config.budgets,
      now: NOW,
    });
    expect(plan.fresh).toEqual([]);
    const none = finalizeRun(plan, { ...finalizeOptions, current, accepted: 0 });
    expect(none.known).toContain(covered);
    expect(none.cycle).toMatchObject({ cursor: null, skip: [], updated: [covered] });
  });

  test('forgets skipped URLs once the cursor has passed them', () => {
    const known = SMALL_SITE.map(url);
    const created = url('/reference/api/csharp/ab/');
    const current = [...known, created];
    const cycle = {
      kind: 'rotation' as const,
      reason: 'schedule',
      startedAt: '',
      cursor: url('/get-started/'),
      skip: [],
    };
    const plan = planRun({
      current,
      state: makeState({ known, cycle }),
      mode: 'daily',
      reason: 'schedule',
      budgets: config.budgets,
      limit: 2,
      now: NOW,
    });
    expect(plan.window).toEqual([url('/whats-new/aspire-13-6/')]);
    const day = finalizeRun(plan, {
      ...finalizeOptions,
      current,
      accepted: 1 + plan.window.length,
    });
    expect(day.cycle?.skip).toEqual([created]);

    const nextPlan = planRun({
      current,
      state: day,
      mode: 'daily',
      reason: 'schedule',
      budgets: config.budgets,
      limit: 4,
      now: NOW,
    });
    expect(nextPlan.window).toEqual(
      [
        '/reference/api/csharp/a/',
        '/reference/api/csharp/b/',
        '/reference/api/typescript/c/',
        '/de/',
      ].map(url)
    );
    const nextDay = finalizeRun(nextPlan, {
      ...finalizeOptions,
      current,
      accepted: nextPlan.window.length,
    });
    expect(nextDay.cycle?.skip).toEqual([]);
  });

  test('ranks the skip list the same way as the cycle, so updated pages do not hide skipped ones', () => {
    const known = SMALL_SITE.map(url);
    const updated = [url('/reference/api/csharp/b/')];
    const cycle = {
      kind: 'release' as const,
      reason: 'release/13.6',
      startedAt: '',
      cursor: url('/reference/api/csharp/b/'),
      skip: [url('/get-started/')],
      updated,
    };
    const plan = planRun({
      current: known,
      state: makeState({ known, cycle }),
      mode: 'daily',
      reason: 'schedule',
      budgets: config.budgets,
      limit: 1,
      now: NOW,
    });
    // /get-started/ is an English page, so it sorts before the API page by tier, but it ranks after
    // it because it was not updated. It is still ahead of the cursor and must stay skipped.
    const next = finalizeRun(plan, { ...finalizeOptions, current: known, accepted: 0 });
    expect(next.cycle?.cursor).toBe(cycle.cursor);
    expect(next.cycle?.skip).toEqual([url('/get-started/')]);
    expect(next.cycle?.updated).toEqual(updated);
  });

  test('a release burst sends the updated pages of a sitemap shaped like aspire.dev first, and each URL once', () => {
    const docs = syntheticUrls(611, '/docs/page-');
    const api = syntheticUrls(24_207);
    const localized = syntheticUrls(7_518, '/de/page-');
    const current = [...localized, ...api, ...docs];
    const budgets = { release: 10_000, rotation: 1_000 };
    // 150 updated docs, 3,000 updated API pages and 20 updated localized pages.
    const updated = [
      ...docs.slice(100, 250),
      ...api.slice(5_000, 8_000),
      ...localized.slice(0, 20),
    ];

    let state: IndexNowState = makeState({ known: current });
    const sizes: number[] = [];
    const seen = new Set<string>();
    for (let day = 0; day < 10; day++) {
      const plan = planRun({
        current,
        state,
        mode: day === 0 ? 'flush' : 'daily',
        reason: 'release/13.6',
        budgets,
        updatedUrls: day === 0 ? updated : undefined,
        now: NOW,
      });
      if (day === 0) {
        // Updated pages first, in tier order, and only then the other pages.
        expect(plan.window.slice(0, 150)).toEqual(docs.slice(100, 250));
        expect(plan.window.slice(150, 3_150)).toEqual(api.slice(5_000, 8_000));
        expect(plan.window.slice(3_150, 3_170)).toEqual(localized.slice(0, 20));
        expect(plan.window[3_170]).toBe(docs[0]);
      }
      for (const entry of plan.window) {
        expect(seen.has(entry)).toBe(false);
        seen.add(entry);
      }
      sizes.push(plan.window.length);
      state = finalizeRun(plan, { ...finalizeOptions, current, accepted: plan.window.length });
      if (state.cycle === null) break;
    }
    expect(sizes).toEqual([10_000, 10_000, 10_000, 2_336]);
    expect(seen.size).toBe(current.length);
  });

  test('a release that adds more API pages than the budget covers them across runs, each once', () => {
    const docs = syntheticUrls(50, '/docs/page-');
    const known = [...docs, ...syntheticUrls(200)];
    const created = syntheticUrls(120, '/reference/api/csharp/new-');
    const current = [...known, ...created];
    const budgets = { release: 100, rotation: 10 };
    const updated = docs.slice(10, 20);

    let state: IndexNowState = makeState({ known });
    const sizes: number[] = [];
    const seen = new Set<string>();
    for (let day = 0; day < 10; day++) {
      const plan = planRun({
        current,
        state,
        mode: day === 0 ? 'flush' : 'daily',
        reason: 'release/13.6',
        budgets,
        updatedUrls: day === 0 ? updated : undefined,
        now: NOW,
      });
      // The new pages are covered by the cycle, so none of them jumps ahead of the updated docs.
      expect(plan.fresh).toEqual([]);
      if (day === 0) {
        expect(plan.window.slice(0, 10)).toEqual(updated);
        expect(plan.window.slice(10)).toEqual(created.slice(0, 90));
      }
      for (const entry of plan.window) {
        expect(seen.has(entry)).toBe(false);
        seen.add(entry);
      }
      sizes.push(plan.window.length);
      state = finalizeRun(plan, { ...finalizeOptions, current, accepted: plan.window.length });
      expect(state.known).toEqual([...current].sort());
      if (state.cycle === null) break;
    }
    expect(sizes).toEqual([100, 100, 100, 70]);
    expect(seen.size).toBe(current.length);
  });

  test('a release burst over a sitemap shaped like aspire.dev takes four runs and sends each URL once', () => {
    const docs = syntheticUrls(611, '/docs/page-');
    const api = syntheticUrls(24_207);
    const localized = syntheticUrls(7_518, '/de/page-');
    const current = [...localized, ...api, ...docs];
    const budgets = { release: 10_000, rotation: 1_000 };

    let state: IndexNowState = makeState({ known: current });
    const sizes: number[] = [];
    const seen = new Set<string>();
    for (let day = 0; day < 10; day++) {
      const plan = planRun({
        current,
        state,
        mode: day === 0 ? 'flush' : 'daily',
        reason: 'release/13.6',
        budgets,
        now: NOW,
      });
      if (day === 0) expect(plan.window.slice(0, 611)).toEqual(docs);
      for (const entry of plan.window) {
        expect(seen.has(entry)).toBe(false);
        seen.add(entry);
      }
      sizes.push(plan.window.length);
      state = finalizeRun(plan, {
        ...finalizeOptions,
        current,
        accepted: plan.window.length,
      });
      if (state.cycle === null) break;
    }
    expect(sizes).toEqual([10_000, 10_000, 10_000, 2_336]);
    expect(seen.size).toBe(current.length);

    // The next run starts a slow rotation cycle from the top.
    const after = planRun({ current, state, mode: 'daily', reason: 'schedule', budgets, now: NOW });
    expect(after.cycle.kind).toBe('rotation');
    expect(after.window).toHaveLength(1_000);
    expect(after.window[0]).toBe(docs[0]);
  });
});

describe('state on disk', () => {
  const state = makeState({
    deployment: 'abc1234',
    known: SMALL_SITE.map(url),
    cycle: {
      kind: 'release',
      reason: 'release/13.6',
      startedAt: '2026-10-13T06:43:00.000Z',
      cursor: url('/get-started/'),
      skip: [url('/reference/api/csharp/ab/')],
      updated: [url('/de/'), url('/get-started/')],
    },
    lastRun: {
      at: '2026-10-13T06:43:00.000Z',
      trigger: 'pull_request',
      mode: 'flush',
      coldStart: false,
      newUrls: 1,
      removedUrls: 2,
      windowUrls: 3,
      submitted: 6,
      statuses: [200],
    },
  });

  test('round-trips and leaves no staging files behind', async () => {
    await saveState(stateDir, state);
    expect((await readdir(stateDir)).sort()).toEqual(['known-urls.txt.gz', 'state.json']);
    expect(await loadState(stateDir, HOST, createLogger())).toEqual(state);
  });

  test('a missing state is a cold start without a warning', async () => {
    const log = createLogger();
    expect(await loadState(path.join(stateDir, 'missing'), HOST, log)).toBeNull();
    expect(log.warn).not.toHaveBeenCalled();
  });

  test.each([
    ['unreadable JSON', async () => writeFile(path.join(stateDir, 'state.json'), '{nope')],
    [
      'a different schema version',
      async () => {
        await saveState(stateDir, state);
        const file = path.join(stateDir, 'state.json');
        const parsed = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
        await writeFile(file, JSON.stringify({ ...parsed, schemaVersion: 99 }));
      },
    ],
    [
      'another host',
      async () => {
        await saveState(stateDir, { ...state, host: 'example.com' });
      },
    ],
    [
      'a known list that does not match its count',
      async () => {
        await saveState(stateDir, state);
        await writeFile(
          path.join(stateDir, 'known-urls.txt.gz'),
          gzipSync('https://aspire.dev/\n')
        );
      },
    ],
    [
      'a truncated known list',
      async () => {
        await saveState(stateDir, state);
        await writeFile(path.join(stateDir, 'known-urls.txt.gz'), 'not gzip');
      },
    ],
  ])('falls back to a cold start for %s', async (_name, arrange) => {
    await arrange();
    const log = createLogger();
    expect(await loadState(stateDir, HOST, log)).toBeNull();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('starting cold'));
  });
});

describe('state read from an artifact', () => {
  const cycle = {
    kind: 'release' as const,
    reason: 'release/13.6',
    startedAt: '2026-10-13T06:43:00.000Z',
    cursor: url('/get-started/'),
    skip: [],
    updated: [],
  };

  test('loads states saved before cycles tracked updated pages', async () => {
    await saveState(stateDir, makeState({ known: SMALL_SITE.map(url), cycle }));
    const file = path.join(stateDir, 'state.json');
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { cycle: Record<string, unknown> };
    delete parsed.cycle.updated;
    await writeFile(file, JSON.stringify(parsed));
    expect((await loadState(stateDir, HOST, createLogger()))?.cycle?.updated).toEqual([]);
  });

  test.each([
    ['an http URL', { known: [url('/'), 'http://aspire.dev/insecure/'] }],
    ['another host', { known: [url('/'), 'https://evil.example/spam/'] }],
    ['something that is not a URL', { known: [url('/'), 'javascript:alert(1)'] }],
    ['a duplicate', { known: [url('/'), url('/')] }],
    ['a URL with a fragment', { known: [url('/'), url('/a/#top')] }],
    ['an empty known list', { known: [] }],
    ['a cursor that is not a URL', { known: [url('/')], cycle: { ...cycle, cursor: 'not a url' } }],
    [
      'a skip list with another host',
      { known: [url('/')], cycle: { ...cycle, skip: ['https://evil.example/'] } },
    ],
    [
      'an updated list with another host',
      { known: [url('/')], cycle: { ...cycle, updated: ['https://evil.example/'] } },
    ],
  ])('starts cold instead of trusting %s', async (_name, overrides) => {
    await saveState(stateDir, makeState(overrides));
    const log = createLogger();
    expect(await loadState(stateDir, HOST, log)).toBeNull();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('starting cold'));
  });
});

describe('submitting URLs', () => {
  function fetchWith(...responses: (Response | Error)[]) {
    const fetch = vi.fn<typeof fetchWithProxy>();
    for (const response of responses) {
      if (response instanceof Error) fetch.mockRejectedValueOnce(response);
      else fetch.mockResolvedValueOnce(response);
    }
    return fetch;
  }

  const urls = syntheticUrls(3);

  test('POSTs the documented payload', async () => {
    const fetch = fetchWith(new Response('', { status: 200 }));
    const result = await submitUrls({
      config,
      urls,
      fetch,
      sleep: createClock().sleep,
      log: createLogger(),
    });
    expect(result).toEqual({
      accepted: 3,
      chunks: [{ size: 3, status: 200, attempts: 1 }],
      stop: null,
    });

    const [target, init] = fetch.mock.calls[0];
    expect(String(target)).toBe(config.endpoint);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json; charset=utf-8' });
    expect(postBody(init)).toEqual({
      host: HOST,
      key: KEY,
      keyLocation: `https://${HOST}/${KEY}.txt`,
      urlList: urls,
    });
  });

  test('accepts 202 for a key that is still being verified', async () => {
    const fetch = fetchWith(new Response('', { status: 202 }));
    const result = await submitUrls({
      config,
      urls,
      fetch,
      sleep: createClock().sleep,
      log: createLogger(),
    });
    expect(result.accepted).toBe(3);
    expect(result.stop).toBeNull();
  });

  test('splits large lists into chunks of at most 10,000 and pauses between them', async () => {
    const many = syntheticUrls(25_000);
    const fetch = fetchWith(
      new Response('', { status: 200 }),
      new Response('', { status: 200 }),
      new Response('', { status: 200 })
    );
    const clock = createClock();
    const result = await submitUrls({
      config,
      urls: many,
      fetch,
      sleep: clock.sleep,
      log: createLogger(),
    });
    expect(result.chunks.map((chunk) => chunk.size)).toEqual([10_000, 10_000, 5_000]);
    expect(result.accepted).toBe(25_000);
    expect(MAX_URLS_PER_REQUEST).toBe(10_000);
    expect(clock.sleep).toHaveBeenCalledTimes(2);
    const sent = fetch.mock.calls.flatMap(([, init]) => postBody(init).urlList);
    expect(sent).toEqual(many);
  });

  test('waits for a short Retry-After on 429 and then succeeds', async () => {
    const fetch = fetchWith(
      new Response('', { status: 429, headers: { 'retry-after': '2' } }),
      new Response('', { status: 200 })
    );
    const clock = createClock();
    const result = await submitUrls({
      config,
      urls,
      fetch,
      sleep: clock.sleep,
      log: createLogger(),
    });
    expect(clock.sleep).toHaveBeenCalledWith(2_000);
    expect(result.chunks).toEqual([{ size: 3, status: 200, attempts: 2 }]);
  });

  test('stops at once on a 429 without a usable Retry-After and keeps earlier progress', async () => {
    const many = syntheticUrls(15_000);
    const fetch = fetchWith(
      new Response('', { status: 200 }),
      new Response('slow down', { status: 429 })
    );
    const clock = createClock();
    const result = await submitUrls({
      config,
      urls: many,
      fetch,
      sleep: clock.sleep,
      log: createLogger(),
    });
    expect(result.accepted).toBe(10_000);
    expect(result.stop).toEqual({ reason: 'rate-limited', status: 429, detail: 'slow down' });
    expect(fetch).toHaveBeenCalledTimes(2);

    const tooLong = fetchWith(
      new Response('', { status: 429, headers: { 'retry-after': '3600' } })
    );
    const stopped = await submitUrls({
      config,
      urls,
      fetch: tooLong,
      sleep: clock.sleep,
      log: createLogger(),
    });
    expect(stopped.stop?.reason).toBe('rate-limited');
    expect(tooLong).toHaveBeenCalledTimes(1);
  });

  test('retries server errors with back-off and then gives up', async () => {
    const fetch = fetchWith(
      new Response('', { status: 503 }),
      new Response('', { status: 503 }),
      new Response('', { status: 503 }),
      new Response('unavailable', { status: 503 })
    );
    const clock = createClock();
    const result = await submitUrls({
      config,
      urls,
      fetch,
      sleep: clock.sleep,
      log: createLogger(),
    });
    expect(clock.sleep.mock.calls.map(([ms]) => ms)).toEqual([5_000, 30_000, 120_000]);
    expect(result.accepted).toBe(0);
    expect(result.chunks).toEqual([{ size: 3, status: 503, attempts: 4 }]);
    expect(result.stop).toEqual({ reason: 'failed', status: 503, detail: 'unavailable' });
  });

  test('treats network errors like server errors', async () => {
    const boom = new Error('socket hang up');
    const fetch = fetchWith(boom, boom, boom, boom);
    const result = await submitUrls({
      config,
      urls,
      fetch,
      sleep: createClock().sleep,
      log: createLogger(),
    });
    expect(result.stop).toEqual({ reason: 'failed', status: 0, detail: 'socket hang up' });
  });

  test.each([400, 403, 422])('does not retry HTTP %s', async (status) => {
    const fetch = fetchWith(new Response('bad key', { status }));
    const clock = createClock();
    const result = await submitUrls({
      config,
      urls,
      fetch,
      sleep: clock.sleep,
      log: createLogger(),
    });
    expect(result.stop).toEqual({ reason: 'failed', status, detail: 'bad key' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  test('reads Retry-After as seconds or as an HTTP date', () => {
    expect(parseRetryAfter('120', 0)).toBe(120_000);
    expect(
      parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT', Date.parse('Wed, 21 Oct 2026 07:27:00 GMT'))
    ).toBe(60_000);
    expect(
      parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT', Date.parse('Wed, 21 Oct 2026 07:29:00 GMT'))
    ).toBe(0);
    expect(parseRetryAfter('soon', 0)).toBeUndefined();
    expect(parseRetryAfter(null, 0)).toBeUndefined();
  });
});

describe('live-site checks', () => {
  test('verifies that the key file contains the key', async () => {
    const site = createSite([]);
    expect(await verifyKeyFile(config, site.fetch)).toEqual({ ok: true });

    site.keyLive = false;
    expect(await verifyKeyFile(config, site.fetch)).toEqual({
      ok: false,
      detail: `GET https://aspire.dev/${KEY}.txt returned HTTP 404`,
    });

    const wrong = vi.fn<typeof fetchWithProxy>().mockResolvedValue(new Response('another-key'));
    expect(await verifyKeyFile(config, wrong)).toMatchObject({
      ok: false,
      detail: expect.stringContaining('does not contain'),
    });

    const down = vi.fn<typeof fetchWithProxy>().mockRejectedValue(new Error('offline'));
    expect(await verifyKeyFile(config, down)).toMatchObject({
      ok: false,
      detail: expect.stringContaining('offline'),
    });
  });

  test("derives the What's new page of a release", () => {
    expect(whatsNewPath('13.6')).toBe('/whats-new/aspire-13-6/');
    expect(whatsNewPath('9.5')).toBe('/whats-new/aspire-9-5/');
    expect(whatsNewPath('14.0')).toBe('/whats-new/aspire-14/');
    expect(() => whatsNewPath('13')).toThrow();
    expect(() => whatsNewPath('13.6.1')).toThrow();
  });

  test('waits until the release page is served', async () => {
    const site = createSite([]);
    const clock = createClock();
    let polls = 0;
    clock.sleep.mockImplementation(() => {
      if (++polls === 2) site.liveReleases.add('13.6');
      return Promise.resolve();
    });
    const ready = await waitForRelease({
      host: HOST,
      version: '13.6',
      fetch: site.fetch,
      sleep: clock.sleep,
      timeoutMs: 600_000,
      intervalMs: 60_000,
      log: createLogger(),
    });
    expect(ready).toBe(true);
    expect(clock.sleep).toHaveBeenCalledTimes(2);
    expect(site.fetch.mock.calls.every(([, init]) => init?.method === 'HEAD')).toBe(true);
  });

  test('gives up when the release page never appears', async () => {
    const site = createSite([]);
    const clock = createClock();
    const start = clock.now().getTime();
    const ready = await waitForRelease({
      host: HOST,
      version: '13.6',
      fetch: site.fetch,
      sleep: clock.sleep,
      now: () => clock.now().getTime(),
      timeoutMs: 180_000,
      intervalMs: 60_000,
      log: createLogger(),
    });
    expect(ready).toBe(false);
    expect(clock.now().getTime() - start).toBeLessThanOrEqual(180_000);
    expect(await isReleaseLive(HOST, '13.6', site.fetch)).toBe(false);
  });

  test('reads the deployment identity and tolerates failures', async () => {
    const site = createSite([]);
    expect(await readDeployment(HOST, site.fetch)).toBe('deadbeefcafe0123456789');
    const down = vi.fn<typeof fetchWithProxy>().mockRejectedValue(new Error('offline'));
    expect(await readDeployment(HOST, down)).toBe('');
    const missing = vi.fn<typeof fetchWithProxy>().mockResolvedValue(new Response('<html></html>'));
    expect(await readDeployment(HOST, missing)).toBe('');
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

  test('recognizes a merged release/X.Y pull request', () => {
    expect(detectReleaseMerge(pullRequest())).toEqual({ version: '13.6', reason: 'release/13.6' });
    expect(detectReleaseMerge(pullRequest({}, { ref: 'release/14.0' }))).toEqual({
      version: '14.0',
      reason: 'release/14.0',
    });
  });

  test('recognizes the "Merge release/X.Y into main" repair pull request', () => {
    const event = pullRequest(
      { title: 'Merge release/13.4 into main' },
      { ref: 'joperezr/merge-release-13-4-into-main' }
    );
    expect(detectReleaseMerge(event)).toEqual({ version: '13.4', reason: 'release/13.4' });
  });

  test.each([
    ['an unmerged pull request', pullRequest({ merged: false })],
    [
      'a fork whose branch is named release/13.6',
      pullRequest({}, { repo: { full_name: 'someone/aspire.dev' } }),
    ],
    ['a head without a repository', pullRequest({}, { repo: null })],
    [
      'a branch that is not a release branch',
      pullRequest({ title: 'Fix typo' }, { ref: 'release-notes' }),
    ],
    ['a patch release branch', pullRequest({ title: 'Fix typo' }, { ref: 'release/13.6.1' })],
    ['an event without a pull request', { action: 'closed' }],
    ['a non-object payload', 'closed'],
    ['a missing payload', undefined],
  ])('ignores %s', (_name, event) => {
    expect(detectReleaseMerge(event)).toBeNull();
  });

  const cli = (overrides: Partial<ReturnType<typeof parseCli>> = {}) => ({
    ...parseCli(['--state-dir', stateDir]),
    ...overrides,
  });

  test('a release merge flushes and gates on the release', () => {
    expect(resolveRun(cli({ trigger: 'pull_request' }), pullRequest())).toEqual({
      mode: 'flush',
      release: '13.6',
      reason: 'release/13.6',
    });
  });

  test('a pull request that is not a release merge is skipped', () => {
    const resolved = resolveRun(cli({ trigger: 'pull_request' }), pullRequest({ merged: false }));
    expect(resolved.skip).toMatch(/not a merged release/);
  });

  test('describes scheduled and manual runs', () => {
    expect(resolveRun(cli({ trigger: 'schedule' }), undefined)).toEqual({
      mode: 'daily',
      release: undefined,
      reason: 'schedule',
    });
    expect(resolveRun(cli({ trigger: 'workflow_dispatch', mode: 'flush' }), undefined).reason).toBe(
      'manual flush'
    );
    expect(
      resolveRun(cli({ trigger: 'workflow_dispatch', mode: 'flush', release: '13.6' }), undefined)
    ).toEqual({
      mode: 'flush',
      release: '13.6',
      reason: 'release/13.6',
    });
    expect(resolveRun(cli({ trigger: 'workflow_dispatch' }), undefined).reason).toBe('manual');
  });

  test('parses command-line options', () => {
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
        '--state-dir',
        stateDir,
        '--mode',
        'flush',
        '--limit',
        '250',
        '--release',
        '13.6',
        '--trigger',
        'workflow_dispatch',
        '--dry-run',
        '--allow-shrink',
      ])
    ).toMatchObject({
      mode: 'flush',
      limit: 250,
      release: '13.6',
      dryRun: true,
      allowShrink: true,
    });
  });

  test('reads the changed files option as an absolute path', () => {
    expect(
      parseCli(['--state-dir', stateDir, '--changed-files', 'changes.jsonl']).changedFiles
    ).toBe(path.resolve('changes.jsonl'));
    expect(parseCli(['--state-dir', stateDir]).changedFiles).toBeUndefined();
  });

  test.each([
    ['no state directory', []],
    ['an unknown mode', ['--state-dir', 'x', '--mode', 'weekly']],
    ['a zero limit', ['--state-dir', 'x', '--limit', '0']],
    ['a limit above the maximum', ['--state-dir', 'x', '--limit', '50001']],
    ['a fractional limit', ['--state-dir', 'x', '--limit', '1.5']],
    ['a non-numeric limit', ['--state-dir', 'x', '--limit', 'many']],
    ['a malformed release', ['--state-dir', 'x', '--release', '13']],
    ['an unknown flag', ['--state-dir', 'x', '--force']],
  ])('rejects %s', (_name, argv) => {
    expect(() => parseCli(argv)).toThrow();
  });
});

describe('running end to end', () => {
  let site: Site;
  let log: ReturnType<typeof createLogger>;
  let clock: ReturnType<typeof createClock>;

  beforeEach(() => {
    site = createSite(SMALL_SITE);
    log = createLogger();
    clock = createClock();
  });

  const runDay = (overrides: Partial<RunOptions> = {}) => {
    site.posts.length = 0;
    return run({
      config,
      stateDir,
      mode: 'daily',
      trigger: 'schedule',
      reason: 'schedule',
      fetch: site.fetch,
      sleep: clock.sleep,
      now: clock.now,
      log,
      ...overrides,
    });
  };
  const submitted = () => site.posts.flatMap((post) => post.urlList);
  const sent = (paths: string[]) => paths.map(url);

  test('a cold start submits the first window and seeds the state', async () => {
    const result = await runDay();
    expect(result.report).toMatchObject({
      outcome: 'completed',
      coldStart: true,
      submitted: 3,
      totalUrls: 10,
      deployment: 'deadbeefcafe0123456789',
    });
    expect(result.stateChanged).toBe(true);
    expect(submitted()).toEqual(sent(['/', '/app-host/', '/get-started/']));

    const saved = await loadState(stateDir, HOST, log);
    expect(saved?.known).toHaveLength(10);
    expect(saved?.cycle?.cursor).toBe(url('/get-started/'));
  });

  test('daily runs walk the sitemap without repeating a URL and then start over', async () => {
    const days: string[][] = [];
    for (let day = 0; day < 5; day++) {
      await runDay();
      days.push(submitted());
    }
    expect(days).toEqual([
      sent(['/', '/app-host/', '/get-started/']),
      sent(['/whats-new/aspire-13-6/', '/reference/api/csharp/a/', '/reference/api/csharp/b/']),
      sent(['/reference/api/typescript/c/', '/de/', '/de/app-host/']),
      sent(['/ja/']),
      sent(['/', '/app-host/', '/get-started/']),
    ]);
  });

  test('new and removed URLs are sent first and nothing is sent twice within a cycle', async () => {
    await runDay();
    const day1 = submitted();

    site.paths = [
      ...site.paths.filter((entry) => entry !== '/ja/'),
      '/aaa/',
      '/reference/api/csharp/ab/',
    ];
    const day2Result = await runDay();
    const day2 = submitted();
    expect(day2.slice(0, 3)).toEqual(sent(['/ja/', '/aaa/', '/reference/api/csharp/ab/']));
    expect(day2Result.report).toMatchObject({ newUrls: 2, removedUrls: 1, submitted: 3 });

    await runDay();
    const day3 = submitted();
    await runDay();
    const day4 = submitted();

    const cycle = [...day1, ...day2, ...day3, ...day4];
    expect(new Set(cycle).size).toBe(cycle.length);
    expect(new Set(cycle)).toEqual(new Set([...site.paths.map(url), url('/ja/')]));
  });

  test('a flush restarts from the top at the release budget and then returns to the slow rotation', async () => {
    await runDay();
    const flush = await runDay({ mode: 'flush', reason: 'release/13.6' });
    expect(submitted()).toEqual(sent([...DOCS, '/reference/api/csharp/a/']));
    expect(flush.report.cycleKind).toBe('release');

    await runDay();
    expect(submitted()).toEqual(
      sent(['/reference/api/csharp/b/', '/reference/api/typescript/c/', ...LOCALIZED])
    );
    const saved = await loadState(stateDir, HOST, log);
    expect(saved?.cycle).toBeNull();

    await runDay();
    expect(submitted()).toEqual(sent(['/', '/app-host/', '/get-started/']));
  });

  test('a second pull request for a release whose cycle is running continues it instead of starting over', async () => {
    await runDay();
    const release = { mode: 'flush', trigger: 'pull_request', reason: 'release/13.6' } as const;
    const first = await runDay(release);
    expect(first.report).toMatchObject({ mode: 'flush', cycleKind: 'release' });
    expect(submitted()).toEqual(sent([...DOCS, '/reference/api/csharp/a/']));

    const second = await runDay(release);
    expect(second.report).toMatchObject({ mode: 'daily', cycleKind: 'release' });
    expect(second.report.note).toMatch(/already running/);
    expect(submitted()).toEqual(
      sent(['/reference/api/csharp/b/', '/reference/api/typescript/c/', ...LOCALIZED])
    );
    expect((await loadState(stateDir, HOST, log))?.cycle).toBeNull();
  });

  test('a pull request for another release, and a manual flush, still start the burst over', async () => {
    await runDay();
    await runDay({ mode: 'flush', trigger: 'pull_request', reason: 'release/13.6' });

    const other = await runDay({ mode: 'flush', trigger: 'pull_request', reason: 'release/13.7' });
    expect(other.report.mode).toBe('flush');
    expect(submitted()).toEqual(sent([...DOCS, '/reference/api/csharp/a/']));

    const manual = await runDay({
      mode: 'flush',
      trigger: 'workflow_dispatch',
      reason: 'release/13.7',
    });
    expect(manual.report.mode).toBe('flush');
    expect(submitted()).toEqual(sent([...DOCS, '/reference/api/csharp/a/']));
  });

  test('reports the new URLs that did not fit in the run as deferred', async () => {
    await runDay();
    site.paths = [...site.paths, '/aaa/', '/aab/', '/aac/'];
    const limited = await runDay({ limit: 2 });
    expect(limited.report).toMatchObject({ newUrls: 3, deferred: 1 });
  });

  test('a flush defers none of its new URLs, because the cycle it starts covers them', async () => {
    await runDay();
    site.paths = [...site.paths, '/aaa/', '/aab/', '/aac/'];
    const flush = await runDay({ mode: 'flush', reason: 'release/13.6', limit: 2 });
    expect(flush.report).toMatchObject({ newUrls: 3, deferred: 0 });
  });

  test('a cold start that fails to submit still seeds the state', async () => {
    site.responses = [422];
    const result = await runDay();
    expect(result.report.outcome).toBe('failed');
    expect(result.stateChanged).toBe(true);
    const saved = await loadState(stateDir, HOST, log);
    expect(saved?.known).toHaveLength(SMALL_SITE.length);
    expect(saved?.cycle?.cursor).toBeNull();
  });

  test('skips a cold start while the key file is not live yet', async () => {
    site.keyLive = false;
    const result = await runDay();
    expect(result.report.outcome).toBe('skipped');
    expect(result.stateChanged).toBe(false);
    expect(site.posts).toHaveLength(0);
    expect(log.warn).toHaveBeenCalled();
  });

  test('fails when the key file disappears after the first successful run', async () => {
    await runDay();
    site.keyLive = false;
    await expect(runDay()).rejects.toThrow(/key file is not reachable/);
  });

  test('a dry run plans without submitting or saving', async () => {
    const result = await runDay({ dryRun: true });
    expect(result.report).toMatchObject({ outcome: 'dry-run', submitted: 3, totalUrls: 10 });
    expect(result.stateChanged).toBe(false);
    expect(site.posts).toHaveLength(0);
    expect(await readdir(stateDir)).toEqual([]);
  });

  test('a dry run still plans while the key file is missing', async () => {
    site.keyLive = false;
    const result = await runDay({ dryRun: true });
    expect(result.report.outcome).toBe('dry-run');
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('key file is live'));
  });

  test('waits for the release page before submitting', async () => {
    let polls = 0;
    clock.sleep.mockImplementation(() => {
      if (++polls === 2) site.liveReleases.add('13.6');
      return Promise.resolve();
    });
    const result = await runDay({ mode: 'flush', release: '13.6', reason: 'release/13.6' });
    expect(result.report.outcome).toBe('completed');
    expect(polls).toBe(2);
    expect(site.posts).toHaveLength(1);
  });

  test('does not submit when the release page never goes live', async () => {
    await expect(
      runDay({
        mode: 'flush',
        release: '13.6',
        reason: 'release/13.6',
        gate: { timeoutMs: 120_000, intervalMs: 60_000 },
      })
    ).rejects.toThrow(/did not go live/);
    expect(site.posts).toHaveLength(0);
    expect(await readdir(stateDir)).toEqual([]);
  });

  test('keeps the progress made before a 429 and resumes from it', async () => {
    site.paths = ['/', ...syntheticUrls(12_000).map((entry) => new URL(entry).pathname)];
    site.responses = [200, 429];
    const limited = await runDay({ limit: 12_001 });
    expect(limited.report.outcome).toBe('rate-limited');
    expect(limited.report.submitted).toBe(10_000);
    expect(limited.failure).toBeUndefined();
    expect(limited.stateChanged).toBe(true);
    const firstBatch = site.posts[0].urlList;

    const resumed = await runDay({ limit: 3 });
    expect(resumed.report.outcome).toBe('completed');
    expect(submitted()).toEqual(
      [...site.paths.map(url)].sort((a, b) => compareUrls(a, b)).slice(10_000, 10_003)
    );
    expect(firstBatch).toHaveLength(10_000);
  });

  test('keeps the progress made before a rejected chunk and reports the failure', async () => {
    site.paths = ['/', ...syntheticUrls(12_000).map((entry) => new URL(entry).pathname)];
    site.responses = [200, 422];
    const failed = await runDay({ limit: 12_001 });
    expect(failed.report.outcome).toBe('failed');
    expect(failed.failure).toMatch(/HTTP 422/);
    expect(failed.stateChanged).toBe(true);
    expect((await loadState(stateDir, HOST, log))?.cycle?.cursor).not.toBeNull();
  });

  test('a rejection of the first chunk leaves an existing state untouched', async () => {
    await runDay();
    const before = await readFile(path.join(stateDir, 'state.json'), 'utf8');
    site.responses = [403];
    const failed = await runDay();
    expect(failed.failure).toMatch(/HTTP 403/);
    expect(failed.stateChanged).toBe(false);
    expect(await readFile(path.join(stateDir, 'state.json'), 'utf8')).toBe(before);
  });

  test('refuses a sitemap that suddenly lost most of its pages and keeps the state', async () => {
    await runDay();
    const before = await readFile(path.join(stateDir, 'state.json'), 'utf8');
    site.paths = site.paths.slice(0, 5);
    await expect(runDay()).rejects.toThrow(/--allow-shrink/);
    expect(await readFile(path.join(stateDir, 'state.json'), 'utf8')).toBe(before);
  });

  const releaseFiles: ChangedFile[] = [
    {
      status: 'added',
      filename: 'src/frontend/src/content/docs/get-started/new-page.mdx',
      changes: 40,
      patch: null,
    },
    {
      status: 'modified',
      filename: 'src/frontend/src/content/docs/whats-new/aspire-13-6.mdx',
      changes: 6,
      patch: null,
    },
    {
      status: 'renamed',
      filename: 'src/frontend/src/data/pkgs/A.13.6.0.json',
      changes: 9,
      patch: '@@ -9 +9 @@\n+          "name": "AsExpress",',
    },
    {
      // Only moved to the new version, so its pages did not change.
      status: 'renamed',
      filename: 'src/frontend/src/data/pkgs/B.13.6.0.json',
      changes: 4,
      patch: '@@ -4 +4 @@\n-    "version": "13.5.4",\n+    "version": "13.6.0",',
    },
  ];

  test('a release flush submits its new and updated pages in tier order, then the rest, and sends nothing twice', async () => {
    await runDay();
    site.paths = [...site.paths, '/get-started/new-page/'];

    const flush = await runDay({
      mode: 'flush',
      reason: 'release/13.6',
      changedFiles: releaseFiles,
    });
    expect(flush.report).toMatchObject({ newUrls: 1, updatedUrls: 3, cycleKind: 'release' });
    expect(submitted()).toEqual(
      sent([
        '/get-started/new-page/', // new docs page
        '/whats-new/aspire-13-6/', // updated docs page
        '/reference/api/csharp/a/', // updated API package (B only moved to the new version)
        '/', // then everything else, in the usual order
        '/app-host/',
      ])
    );

    // The updated pages are remembered, so the next runs finish the rest without repeating them.
    const days = [submitted()];
    for (let day = 0; day < 2; day++) {
      await runDay();
      days.push(submitted());
    }
    expect(days[1]).toEqual(
      sent([
        '/get-started/',
        '/reference/api/csharp/b/',
        '/reference/api/typescript/c/',
        '/de/',
        '/de/app-host/',
      ])
    );
    expect(days[2]).toEqual(sent(['/ja/']));
    const everything = days.flat();
    expect(new Set(everything).size).toBe(everything.length);
    expect(new Set(everything)).toEqual(new Set(site.paths.map(url)));
    expect((await loadState(stateDir, HOST, log))?.cycle).toBeNull();
  });

  test('a release flush puts new generated API pages after the updated docs, not before them', async () => {
    await runDay();
    site.paths = [...site.paths, '/reference/api/csharp/ab/', '/reference/api/csharp/ac/'];

    const flush = await runDay({
      mode: 'flush',
      reason: 'release/13.6',
      changedFiles: [releaseFiles[1]],
    });
    expect(flush.report).toMatchObject({ newUrls: 2, updatedUrls: 3, cycleKind: 'release' });
    expect(submitted()).toEqual(
      sent([
        '/whats-new/aspire-13-6/', // updated docs
        '/reference/api/csharp/ab/', // new API pages, ordered with the updated pages
        '/reference/api/csharp/ac/',
        '/', // then everything else, in the usual order
        '/app-host/',
      ])
    );

    const days = [submitted()];
    for (let day = 0; day < 2; day++) {
      await runDay();
      days.push(submitted());
    }
    const everything = days.flat();
    expect(new Set(everything).size).toBe(everything.length);
    expect(new Set(everything)).toEqual(new Set(site.paths.map(url)));
    expect((await loadState(stateDir, HOST, log))?.cycle).toBeNull();
  });

  test('a flush that is rate limited before anything is accepted still starts the release cycle', async () => {
    await runDay();
    site.responses = [429];
    const limited = await runDay({ mode: 'flush', reason: 'release/13.6' });
    expect(limited.report.outcome).toBe('rate-limited');
    expect(limited.failure).toMatch(/before accepting any URL.*release cycle/);
    expect(limited.stateChanged).toBe(true);
    expect((await loadState(stateDir, HOST, log))?.cycle).toMatchObject({
      kind: 'release',
      reason: 'release/13.6',
      cursor: null,
    });

    // The next scheduled run carries on with the release burst from the top.
    await runDay();
    expect(submitted()).toEqual(sent([...DOCS, '/reference/api/csharp/a/']));
  });

  test('a rate-limited daily run that accepts nothing fails and leaves the state untouched', async () => {
    await runDay();
    const before = await readFile(path.join(stateDir, 'state.json'), 'utf8');
    site.responses = [429];
    const limited = await runDay();
    expect(limited.failure).toMatch(/429/);
    expect(limited.stateChanged).toBe(false);
    expect(await readFile(path.join(stateDir, 'state.json'), 'utf8')).toBe(before);
  });

  test('replaces a poisoned state instead of submitting what it lists', async () => {
    await saveState(
      stateDir,
      makeState({ known: [url('/'), 'https://evil.example/spam/', 'http://aspire.dev/insecure/'] })
    );
    const result = await runDay();
    expect(result.report.coldStart).toBe(true);
    expect(submitted().every((entry) => entry.startsWith('https://aspire.dev/'))).toBe(true);
    expect((await loadState(stateDir, HOST, log))?.known).toEqual(SMALL_SITE.map(url).sort());
  });
});

describe('summary and command line', () => {
  test('renders a readable summary', () => {
    const summary = renderSummary(
      emptyReport({
        outcome: 'completed',
        trigger: 'schedule',
        host: HOST,
        mode: 'daily',
        reason: 'schedule',
        deployment: '32f2d1c895952771c0d58924ef8c9115a37b3a0a',
        budget: 1_000,
        totalUrls: 32_336,
        newUrls: 2,
        removedUrls: 1,
        updatedUrls: 3_150,
        windowUrls: 997,
        submitted: 1_000,
        cycleKind: 'rotation',
        cycleCovered: 1_000,
        chunks: [{ size: 1_000, status: 200, attempts: 1 }],
        firstWindowUrl: url('/'),
        lastWindowUrl: url('/app-host/'),
      })
    );
    expect(summary).toContain('## IndexNow submission for aspire.dev');
    expect(summary).toContain('| Sitemap URLs | 32,336 |');
    expect(summary).toContain('| New / removed | 2 / 1 |');
    expect(summary).toContain(
      '| Prioritized pages | 3,150 new or updated by the release, ahead of the rest |'
    );
    expect(summary).toContain('| Submitted | 1,000 of a 1,000 URL budget |');
    expect(summary).toContain('| Cycle | rotation: 1,000 of 32,336 URLs (3%) |');
    expect(summary).toContain('HTTP 200 for 1,000 URLs');
    expect(summary).toContain('`32f2d1c`');
  });

  async function runMain(argv: string[], event?: unknown, overrides = {}) {
    const files = {
      GITHUB_EVENT_PATH: path.join(stateDir, 'event.json'),
      GITHUB_STEP_SUMMARY: path.join(stateDir, 'summary.md'),
      GITHUB_OUTPUT: path.join(stateDir, 'output.txt'),
    };
    if (event !== undefined) await writeFile(files.GITHUB_EVENT_PATH, JSON.stringify(event));
    const log = createLogger();
    const code = await main(
      ['--state-dir', path.join(stateDir, 'state'), ...argv],
      files,
      log,
      overrides
    );
    const read = (file: string) => readFile(file, 'utf8').catch(() => '');
    return {
      code,
      log,
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
    const { code, output, summary } = await runMain(
      ['--trigger', 'pull_request'],
      pullRequest('Fix a typo', 'someone/typo')
    );
    expect(code).toBe(0);
    expect(output).toContain('state_changed=false');
    expect(output).toContain('outcome=skipped');
    expect(summary).toContain('not a merged release');
  });

  test('a merged release pull request waits for the release page and flushes', async () => {
    const real = await loadConfig();
    const site = createSite(SMALL_SITE, real.key);
    site.liveReleases.add('13.6');
    const clock = createClock();
    const { code, output, summary } = await runMain(
      ['--trigger', 'pull_request'],
      pullRequest('Content for release: 13.6', 'release/13.6'),
      { fetch: site.fetch, sleep: clock.sleep, now: clock.now }
    );
    expect(code).toBe(0);
    expect(output).toContain('state_changed=true');
    expect(output).toContain(`submitted=${SMALL_SITE.length}`);
    expect(summary).toContain('release/13.6');
    expect(site.posts).toHaveLength(1);
    expect(site.posts[0]).toMatchObject({ host: real.host, key: real.key });
    expect(site.posts[0].urlList).toEqual(SMALL_SITE.map(url));
  });

  test('a release pull request sends the pages its files changed first', async () => {
    const real = await loadConfig();
    const site = createSite(SMALL_SITE, real.key);
    site.liveReleases.add('13.6');
    const clock = createClock();
    const changedFiles = path.join(stateDir, 'changes.jsonl');
    await writeFile(
      changedFiles,
      [
        {
          status: 'modified',
          filename: 'src/frontend/src/content/docs/get-started/index.mdx',
          changes: 3,
        },
        {
          status: 'renamed',
          filename: 'src/frontend/src/data/pkgs/A.13.6.0.json',
          changes: 8,
          patch: '@@ -9 +9 @@\n+          "name": "AsExpress",',
        },
        { status: 'modified', filename: 'src/frontend/src/components/Header.astro', changes: 2 },
      ]
        .map((entry) => JSON.stringify(entry))
        .join('\n')
    );
    const { code, summary } = await runMain(
      ['--trigger', 'pull_request', '--changed-files', changedFiles],
      pullRequest('Content for release: 13.6', 'release/13.6'),
      { fetch: site.fetch, sleep: clock.sleep, now: clock.now }
    );
    expect(code).toBe(0);
    expect(summary).toContain(
      '| Prioritized pages | 2 new or updated by the release, ahead of the rest |'
    );
    expect(site.posts[0].urlList.slice(0, 3)).toEqual(
      ['/get-started/', '/reference/api/csharp/a/', '/'].map(url)
    );
    expect(site.posts[0].urlList).toHaveLength(SMALL_SITE.length);
  });

  test('fails when the changed files cannot be read', async () => {
    const { code, log } = await runMain(['--changed-files', path.join(stateDir, 'missing.jsonl')]);
    expect(code).toBe(1);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('missing.jsonl'));
  });

  test('reports a failed run and returns a failing exit code', async () => {
    const real = await loadConfig();
    const site = createSite(SMALL_SITE, real.key);
    const clock = createClock();
    // A first run seeds the state; the key then disappears, which is a hard failure.
    await runMain([], undefined, { fetch: site.fetch, sleep: clock.sleep, now: clock.now });
    site.keyLive = false;
    const { code, log, summary, output } = await runMain([], undefined, {
      fetch: site.fetch,
      sleep: clock.sleep,
      now: clock.now,
    });
    expect(code).toBe(1);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('key file is not reachable'));
    expect(summary).toContain('failed');
    expect(output).toContain('state_changed=false');
  });

  test('rejects invalid arguments', async () => {
    const { code, log } = await runMain(['--mode', 'weekly']);
    expect(code).toBe(1);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('--mode'));
  });
});
