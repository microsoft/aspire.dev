import process from 'node:process';
import type { AstroIntegration } from 'astro';
import proxyFetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface Contributor {
  readonly id: number;
  readonly login: string;
}

type UnavailableReason = 'http' | 'network' | 'timeout' | 'invalid-response';

export type ContributorsResult =
  | { readonly status: 'available'; readonly contributors: readonly Contributor[] }
  | { readonly status: 'unavailable'; readonly reason: UnavailableReason; readonly httpStatus?: number };

const requestTimeoutMs = 10_000;
const maxPages = 100;
const pageSize = 100;

class ContributorRequestError extends Error {
  constructor(
    readonly reason: UnavailableReason,
    readonly retryable = false,
    readonly httpStatus?: number,
  ) {
    super(reason);
  }
}

function canonicalRepository(repository: string): string {
  const canonical = repository.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\/[a-z0-9._-]+$/.test(canonical)) {
    throw new TypeError('Expected a GitHub owner/repository name.');
  }
  return canonical;
}

function parseContributors(value: unknown): readonly Contributor[] {
  if (!Array.isArray(value) || value.length > pageSize) {
    throw new ContributorRequestError('invalid-response');
  }
  return value.map((item: unknown) => {
    if (
      typeof item !== 'object' || item === null ||
      !('id' in item) || typeof item.id !== 'number' ||
      !Number.isSafeInteger(item.id) || item.id <= 0 ||
      !('login' in item) || typeof item.login !== 'string' ||
      !/^[a-z0-9][a-z0-9-]*(?:\[bot\])?$/i.test(item.login)
    ) {
      throw new ContributorRequestError('invalid-response');
    }
    return Object.freeze({ id: item.id, login: item.login });
  });
}

function hasNextPage(link: string | null, endpoint: string, page: number): boolean {
  const next = link?.split(',').find((part) => /;\s*rel="next"/.test(part));
  if (!next) return false;

  // Do not follow arbitrary URLs from response headers, especially with a token.
  const match = /^\s*<([^>]+)>/.exec(next);
  if (!match) throw new ContributorRequestError('invalid-response');
  let url: URL;
  try {
    url = new URL(match[1], endpoint);
  } catch {
    throw new ContributorRequestError('invalid-response');
  }
  const expected = new URL(endpoint);
  if (
    url.origin !== expected.origin ||
    (
      url.pathname !== expected.pathname &&
      !/^\/repositories\/[1-9]\d*\/contributors$/.test(url.pathname)
    ) ||
    url.username || url.password || url.hash ||
    url.searchParams.get('page') !== String(page + 1) ||
    url.searchParams.get('per_page') !== String(pageSize) ||
    [...url.searchParams.keys()].some((key) => key !== 'page' && key !== 'per_page')
  ) {
    throw new ContributorRequestError('invalid-response');
  }
  return true;
}

/** An isolated run: only complete lists or explicit unavailable outcomes are retained. */
export function createContributorCache() {
  const entries = new Map<string, Promise<ContributorsResult>>();
  const diagnostics = { repositories: 0, requests: 0, cacheHits: 0, unavailable: 0 };

  async function loadPages(
    repository: string,
    signal: AbortSignal,
    agent?: HttpsProxyAgent<string>,
  ): Promise<readonly Contributor[]> {
    const endpoint = `https://api.github.com/repos/${repository}/contributors`;
    const contributors: Contributor[] = [];
    const token = process.env.GITHUB_TOKEN;
    for (let page = 1; page <= maxPages; page++) {
      signal.throwIfAborted();
      diagnostics.requests++;
      const url = `${endpoint}?per_page=${pageSize}&page=${page}`;
      const options = {
        signal,
        redirect: 'error' as const,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      };
      const response = agent
        ? await proxyFetch(url, { ...options, agent })
        : await fetch(url, options);
      if (!response.ok) {
        throw new ContributorRequestError(
          'http',
          response.status === 408 || response.status >= 500,
          response.status,
        );
      }
      if (response.status === 204) return Object.freeze(contributors);

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new ContributorRequestError('invalid-response');
      }
      signal.throwIfAborted();
      contributors.push(...parseContributors(data));
      if (!hasNextPage(response.headers.get('link'), endpoint, page)) {
        return Object.freeze(contributors);
      }
    }
    throw new ContributorRequestError('invalid-response');
  }

  async function attempt(repository: string): Promise<readonly Contributor[]> {
    // Match scripts/fetch-with-proxy.ts without changing the process-wide fetch.
    const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy ??
      process.env.HTTP_PROXY ?? process.env.http_proxy;
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Bound the whole paginated attempt, including body reads, not just the headers.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new ContributorRequestError('timeout', true));
        controller.abort();
      }, requestTimeoutMs);
    });
    try {
      return await Promise.race([loadPages(repository, controller.signal, agent), timeout]);
    } finally {
      clearTimeout(timer);
      controller.abort();
      agent?.destroy();
    }
  }

  async function load(repository: string): Promise<ContributorsResult> {
    for (let attemptNumber = 0; ; attemptNumber++) {
      try {
        return Object.freeze({ status: 'available', contributors: await attempt(repository) });
      } catch (error) {
        const failure = error instanceof ContributorRequestError
          ? error
          : new ContributorRequestError('network', true);
        if (attemptNumber === 0 && failure.retryable) continue;

        diagnostics.unavailable++;
        // Never print response bodies, credentials, or arbitrary error messages.
        console.warn(
          `[contributors] ${repository}: unavailable (${failure.reason}${failure.httpStatus ? ` ${failure.httpStatus}` : ''}); using the GitHub contributors link.`,
        );
        return Object.freeze({
          status: 'unavailable',
          reason: failure.reason,
          ...(failure.httpStatus ? { httpStatus: failure.httpStatus } : {}),
        });
      }
    }
  }

  return {
    get(repository: string): Promise<ContributorsResult> {
      const key = canonicalRepository(repository);
      const cached = entries.get(key);
      if (cached) {
        diagnostics.cacheHits++;
        return cached;
      }
      diagnostics.repositories++;
      // Publish the promise before starting any I/O, including concurrent prerenders.
      const pending = Promise.resolve().then(() => load(key));
      entries.set(key, pending);
      return pending;
    },
    diagnostics: () => ({ ...diagnostics }),
  };
}

// Astro's config and bundled prerender graph can evaluate different module copies.
// A process symbol bridges those copies; integration hooks own the run's lifetime.
const cacheKey = Symbol.for('aspire.dev.contributors.build-cache');
const server = globalThis as typeof globalThis & {
  [cacheKey]?: ReturnType<typeof createContributorCache>;
};

export function getContributors(repository: string): Promise<ContributorsResult> {
  if (typeof window !== 'undefined') {
    throw new Error('Contributor data is server-only.');
  }
  // Development deliberately does not retain results across requests or HMR edits.
  return (server[cacheKey] ?? createContributorCache()).get(repository);
}

export function contributorCacheIntegration(): AstroIntegration {
  return {
    name: 'aspire-contributor-cache',
    hooks: {
      'astro:config:setup': () => {
        delete server[cacheKey];
      },
      'astro:build:start': () => {
        server[cacheKey] = createContributorCache();
      },
      'astro:build:done': () => {
        if (process.env.BUILD_TIMING === '1' && server[cacheKey]) {
          console.info(`[contributors] ${JSON.stringify(server[cacheKey].diagnostics())}`);
        }
        delete server[cacheKey];
      },
    },
  };
}
