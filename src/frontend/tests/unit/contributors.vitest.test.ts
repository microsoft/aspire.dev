import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import proxyFetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  contributorCacheIntegration,
  createContributorCache,
  getContributors,
} from '../../src/utils/contributors';

vi.mock('node-fetch', () => ({ default: vi.fn() }));

const ada = { id: 1, login: 'ada' };
const grace = { id: 2, login: 'grace' };
const endpoint = 'https://api.github.com/repos/microsoft/aspire/contributors';

function page(contributors: unknown, next?: string): Response {
  return new Response(JSON.stringify(contributors), {
    headers: next ? { link: `<${next}>; rel="next"` } : {},
  });
}

function lifecycle(name: keyof ReturnType<typeof contributorCacheIntegration>['hooks']) {
  const hook = contributorCacheIntegration().hooks[name];
  if (!hook) throw new Error(`Missing ${name} hook`);
  return Reflect.apply(hook, undefined, [{}]);
}

beforeEach(() => {
  vi.stubEnv('GITHUB_TOKEN', '');
  vi.stubEnv('BUILD_TIMING', '');
  for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
    vi.stubEnv(name, '');
  }
  vi.mocked(proxyFetch).mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  lifecycle('astro:config:setup');
});

afterEach(() => {
  lifecycle('astro:config:setup');
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('complete contributor lists', () => {
  it('publishes one promise immediately and reuses it after completion for canonical repositories', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(page([ada]));
    vi.stubGlobal('fetch', fetchMock);
    const cache = createContributorCache();
    const first = cache.get(' Microsoft/Aspire ');
    const concurrent = cache.get('microsoft/aspire');

    expect(concurrent).toBe(first);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await first).toEqual({ status: 'available', contributors: [ada] });
    expect(cache.get('MICROSOFT/ASPIRE')).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.diagnostics()).toEqual({ repositories: 1, requests: 1, cacheHits: 2, unavailable: 0 });
  });

  it('keeps repositories isolated', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page([ada]))
      .mockResolvedValueOnce(page([grace]));
    vi.stubGlobal('fetch', fetchMock);
    const cache = createContributorCache();
    const results = await Promise.all([cache.get('microsoft/aspire'), cache.get('microsoft/dcp')]);
    expect(results.map((result) => result.status === 'available' && result.contributors))
      .toEqual([[ada], [grace]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves API order across pages and shares the entire pagination operation', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page([grace], `${endpoint}?per_page=100&page=2`))
      .mockResolvedValueOnce(page([ada]));
    vi.stubGlobal('fetch', fetchMock);
    const cache = createContributorCache();
    const [first, second] = await Promise.all([
      cache.get('microsoft/aspire'),
      cache.get('Microsoft/Aspire'),
    ]);
    expect(first).toBe(second);
    expect(first).toEqual({ status: 'available', contributors: [grace, ada] });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${endpoint}?per_page=100&page=1`,
      `${endpoint}?per_page=100&page=2`,
    ]);
    expect(await cache.get('microsoft/aspire')).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    if (first.status === 'available') {
      expect(Object.isFrozen(first.contributors)).toBe(true);
      expect(Object.isFrozen(first.contributors[0])).toBe(true);
      expect(first.contributors.filter(({ login }) => login !== 'grace')).toEqual([ada]);
      expect(first.contributors).toEqual([grace, ada]);
    }
  });

  it('accepts GitHub numeric repository Link aliases while requesting the authored repository', async () => {
    const firstPage = new Response(JSON.stringify([grace]), {
      headers: {
        link: '<https://api.github.com/repositories/696529789/contributors?per_page=100&page=2>; rel="next", <https://api.github.com/repositories/696529789/contributors?per_page=100&page=5>; rel="last"',
      },
    });
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(page([ada]));
    vi.stubGlobal('fetch', fetchMock);
    const cache = createContributorCache();
    const result = await cache.get('microsoft/aspire');
    expect(result).toEqual({ status: 'available', contributors: [grace, ada] });
    expect(await cache.get('microsoft/aspire')).toBe(result);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${endpoint}?per_page=100&page=1`,
      `${endpoint}?per_page=100&page=2`,
    ]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([new Response('[]'), new Response(null, { status: 204 })])(
    'distinguishes a legitimate empty list from an unavailable result',
    async (response) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      const cache = createContributorCache();
      expect(await cache.get('microsoft/aspire')).toEqual({ status: 'available', contributors: [] });
      expect(console.warn).not.toHaveBeenCalled();
    },
  );

  it('uses only the optional server token and never places credentials in URLs or diagnostics', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'server-secret');
    vi.stubEnv('PUBLIC_GITHUB_TOKEN', 'public-secret');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(page([ada]));
    vi.stubGlobal('fetch', fetchMock);
    const cache = createContributorCache();
    await cache.get('microsoft/aspire');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${endpoint}?per_page=100&page=1`);
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer server-secret' });
    expect(JSON.stringify(cache.diagnostics())).not.toContain('secret');
    expect(options?.redirect).toBe('error');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('supports public requests without consuming PUBLIC_GITHUB_TOKEN', async () => {
    vi.stubEnv('PUBLIC_GITHUB_TOKEN', 'public-secret');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(page([ada]));
    vi.stubGlobal('fetch', fetchMock);
    await createContributorCache().get('microsoft/aspire');
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
  });

  it('preserves HTTPS_PROXY routing without replacing global fetch or exposing proxy credentials', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy-user:proxy-secret@127.0.0.1:3128');
    vi.stubEnv('GITHUB_TOKEN', 'server-secret');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(proxyFetch).mockResolvedValue({
      ok: false,
      status: 403,
    } as Awaited<ReturnType<typeof proxyFetch>>);
    const destroy = vi.spyOn(HttpsProxyAgent.prototype, 'destroy');
    const cache = createContributorCache();
    expect(await cache.get('microsoft/aspire'))
      .toEqual({ status: 'unavailable', reason: 'http', httpStatus: 403 });
    await cache.get('microsoft/aspire');
    expect(proxyFetch).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(globalThis.fetch).toBe(fetchMock);
    const [url, options] = vi.mocked(proxyFetch).mock.calls[0];
    expect(url).toBe(`${endpoint}?per_page=100&page=1`);
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer server-secret' });
    expect(options?.agent).toBeInstanceOf(HttpsProxyAgent);
    expect(destroy).toHaveBeenCalledTimes(1);
    const warning = vi.mocked(console.warn).mock.calls.flat().join(' ');
    expect(warning).not.toContain('secret');
    expect(warning).not.toContain('proxy-user');
  });

  it.each(['https_proxy', 'HTTP_PROXY', 'http_proxy'])('supports existing proxy fallback %s', async (name) => {
    for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
      vi.stubEnv(key, undefined);
    }
    vi.stubEnv(name, 'http://127.0.0.1:3128');
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(proxyFetch).mockResolvedValue({
      ok: true,
      status: 204,
    } as Awaited<ReturnType<typeof proxyFetch>>);
    expect(await createContributorCache().get('microsoft/aspire'))
      .toEqual({ status: 'available', contributors: [] });
    expect(proxyFetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('bounded unavailable outcomes', () => {
  it.each([401, 403, 404, 429])('does not retry HTTP %i, and warns once per repository', async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('private error', { status }));
    vi.stubGlobal('fetch', fetchMock);
    const cache = createContributorCache();
    const first = await cache.get('microsoft/aspire');
    expect(first).toEqual({ status: 'unavailable', reason: 'http', httpStatus: status });
    expect(await cache.get('Microsoft/Aspire')).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls.flat().join(' ')).not.toContain('private error');
  });

  it('retries a transient error once, then retains a complete success', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(page([ada]));
    vi.stubGlobal('fetch', fetchMock);
    const cache = createContributorCache();
    expect(await cache.get('microsoft/aspire')).toEqual({ status: 'available', contributors: [ada] });
    await cache.get('microsoft/aspire');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('exhausts the server-error retry budget and retains an unavailable outcome', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const cache = createContributorCache();
    const unavailable = await cache.get('microsoft/aspire');
    expect(unavailable).toEqual({ status: 'unavailable', reason: 'http', httpStatus: 503 });
    expect(await cache.get('microsoft/aspire')).toBe(unavailable);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('exhausts the network retry budget without logging the thrown error or token', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'server-secret');
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('server-secret with private data'));
    vi.stubGlobal('fetch', fetchMock);
    const cache = createContributorCache();
    expect(await cache.get('microsoft/aspire')).toEqual({ status: 'unavailable', reason: 'network' });
    await cache.get('microsoft/aspire');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      '[contributors] microsoft/aspire: unavailable (network); using the GitHub contributors link.',
    );
  });

  it('never returns partial pages when a later page fails', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page([ada], `${endpoint}?per_page=100&page=2`))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const cache = createContributorCache();
    const result = await cache.get('microsoft/aspire');
    expect(result).toEqual({ status: 'unavailable', reason: 'http', httpStatus: 403 });
    expect(result).not.toHaveProperty('contributors');
    expect(await cache.get('microsoft/aspire')).toBe(result);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('restarts pagination atomically on a transient later-page failure', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page([ada], `${endpoint}?per_page=100&page=2`))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(page([grace]));
    vi.stubGlobal('fetch', fetchMock);
    expect(await createContributorCache().get('microsoft/aspire'))
      .toEqual({ status: 'available', contributors: [grace] });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${endpoint}?per_page=100&page=1`,
      `${endpoint}?per_page=100&page=2`,
      `${endpoint}?per_page=100&page=1`,
    ]);
  });

  it.each([
    {}, [{ id: 1 }], [{ id: -1, login: 'ada' }], [{ id: 1, login: '../unsafe' }],
    [{ id: 1, login: 'ada' }, null],
  ])('rejects malformed contributor data without caching a partial success: %j', async (data) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(page(data));
    vi.stubGlobal('fetch', fetchMock);
    expect(await createContributorCache().get('microsoft/aspire'))
      .toEqual({ status: 'unavailable', reason: 'invalid-response' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{not json'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await createContributorCache().get('microsoft/aspire'))
      .toEqual({ status: 'unavailable', reason: 'invalid-response' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    'https://example.com/?per_page=100&page=2',
    'https://example.com/repositories/696529789/contributors?per_page=100&page=2',
    'https://api.github.com/repositories/not-numeric/contributors?per_page=100&page=2',
    'https://api.github.com/repos/another/repository/contributors?per_page=100&page=2',
    `${endpoint}?per_page=100&page=1`,
    `${endpoint}?per_page=100&page=2&token=secret`,
  ])('rejects unsafe or looping pagination links: %s', async (next) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(page([ada], next));
    vi.stubGlobal('fetch', fetchMock);
    expect(await createContributorCache().get('microsoft/aspire'))
      .toEqual({ status: 'unavailable', reason: 'invalid-response' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bounds hung fetches to two 10-second attempts and retains the unavailable result', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_url, options) => {
      signals.push(options!.signal!);
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal('fetch', fetchMock);
    const cache = createContributorCache();
    const pending = cache.get('microsoft/aspire');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toEqual({ status: 'unavailable', reason: 'timeout' });
    expect(await cache.get('microsoft/aspire')).toBe(await pending);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also bounds stalled body reads', async () => {
    vi.useFakeTimers();
    const response = page([ada]);
    vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const pending = createContributorCache().get('microsoft/aspire');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toEqual({ status: 'unavailable', reason: 'timeout' });
  });

  it('does not continue pagination if a timed-out fetch eventually resolves', async () => {
    vi.useFakeTimers();
    let finishFirst: (response: Response) => void = () => {};
    const fetchMock = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce(page([grace]));
    vi.stubGlobal('fetch', fetchMock);
    const pending = createContributorCache().get('microsoft/aspire');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ status: 'available', contributors: [grace] });
    finishFirst(page([ada], `${endpoint}?per_page=100&page=2`));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats the pagination safety limit as unavailable rather than a truncated success', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((url) => {
      const currentPage = Number(new URL(url instanceof Request ? url.url : url).searchParams.get('page'));
      return Promise.resolve(page([ada], `${endpoint}?per_page=100&page=${currentPage + 1}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await createContributorCache().get('microsoft/aspire'))
      .toEqual({ status: 'unavailable', reason: 'invalid-response' });
    expect(fetchMock).toHaveBeenCalledTimes(100);
  });

  it('rejects invalid repository input before I/O', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(() => createContributorCache().get('microsoft/aspire?token=secret')).toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Astro build lifetime', () => {
  it('shares production data across separately evaluated config and prerender modules', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(page([ada]));
    vi.stubGlobal('fetch', fetchMock);
    lifecycle('astro:build:start');
    const original = getContributors('microsoft/aspire');
    vi.resetModules();
    const prerenderCopy = await import('../../src/utils/contributors');
    expect(prerenderCopy.getContributors('microsoft/aspire')).toBe(original);
    await original;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries failed repositories in the next build, not on every render', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(page([ada]));
    vi.stubGlobal('fetch', fetchMock);
    lifecycle('astro:build:start');
    expect((await getContributors('microsoft/aspire')).status).toBe('unavailable');
    expect((await getContributors('microsoft/aspire')).status).toBe('unavailable');
    lifecycle('astro:build:done');
    lifecycle('astro:build:start');
    expect(await getContributors('microsoft/aspire')).toEqual({ status: 'available', contributors: [ada] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not reuse successful results across builds, development requests, or failed-build restarts', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page([ada]))
      .mockResolvedValueOnce(page([grace]))
      .mockResolvedValueOnce(page([ada]))
      .mockResolvedValueOnce(page([grace]));
    vi.stubGlobal('fetch', fetchMock);
    lifecycle('astro:build:start');
    expect(await getContributors('microsoft/aspire')).toMatchObject({ contributors: [ada] });
    lifecycle('astro:build:start');
    expect(await getContributors('microsoft/aspire')).toMatchObject({ contributors: [grace] });
    lifecycle('astro:config:setup');
    expect(await getContributors('microsoft/aspire')).toMatchObject({ contributors: [ada] });
    expect(await getContributors('microsoft/aspire')).toMatchObject({ contributors: [grace] });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('emits only cache counters when build timing is enabled', async () => {
    vi.stubEnv('BUILD_TIMING', '1');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(page([ada])));
    lifecycle('astro:build:start');
    await getContributors('microsoft/aspire');
    await getContributors('microsoft/aspire');
    lifecycle('astro:build:done');
    expect(console.info).toHaveBeenCalledExactlyOnceWith(
      '[contributors] {"repositories":1,"requests":1,"cacheHits":1,"unavailable":0}',
    );
  });
});
