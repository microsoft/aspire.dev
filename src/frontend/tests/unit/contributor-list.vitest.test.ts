import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContributorList from '@components/ContributorList.astro';
import contributorData from '@data/github-contributors.json';
import {
  REPOS,
  type FetchLike,
  canonicalRepository,
  fetchRepositoryContributors,
  hasNextPage,
} from '../../scripts/update-contributors';
import { renderComponent } from './astro-test-utils';

const data = contributorData as Record<string, { id: number; login: string }[]>;
const frontendRoot = fileURLToPath(new URL('../../', import.meta.url));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ContributorList', () => {
  it('renders ordered, lazy avatars from the committed data without network access', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const [first, second] = data['microsoft/dcp'];
    const html = await renderComponent(ContributorList, {
      props: { githubRepo: 'microsoft/dcp', focusColor: '#663399' },
    });
    expect(html).toMatch(/class="avatar-list(?:\s|")/);
    expect(html).toContain('--avatar-focus-color:#663399');
    expect(html).toContain(`href="https://github.com/${first.login}"`);
    expect(html).toContain(`src="https://avatars.githubusercontent.com/u/${first.id}?s=64"`);
    expect(html.indexOf(`alt="${first.login}"`)).toBeLessThan(html.indexOf(`alt="${second.login}"`));
    expect(html.match(/loading="lazy"/g)).toHaveLength(data['microsoft/dcp'].length);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('applies the ignore list and matches repository names case-insensitively', async () => {
    const [ignored, kept] = data['communitytoolkit/aspire'];
    const html = await renderComponent(ContributorList, {
      props: { githubRepo: 'CommunityToolkit/Aspire', ignore: [ignored.login] },
    });
    expect(html).not.toContain(`alt="${ignored.login}"`);
    expect(html).toContain(`alt="${kept.login}"`);
  });

  it('fails the build for a repository with no committed data', async () => {
    await expect(
      renderComponent(ContributorList, { props: { githubRepo: 'microsoft/not-a-repo' } }),
    ).rejects.toThrow(/pnpm update:contributors/);
  });

  it('retains wrapped 3rem avatars, overlap, forced-color boundaries, and visible keyboard focus', () => {
    const source = readFileSync(new URL('../../src/components/ContributorList.astro', import.meta.url), 'utf8');
    expect(source).toContain('--avatar-size: 3rem');
    expect(source).toContain('--avatar-overlap: -0.125em');
    expect(source).toContain('flex-wrap: wrap');
    expect(source).toContain('border-radius: 50%');
    expect(source).toContain('outline: 1px solid transparent');
    expect(source).toContain('.avatar-list li:has(:focus-visible)');
    expect(source).toContain('transform: scale(1.1)');
    expect(source).toMatch(/\.avatar-list a:focus-visible\s*\{\s*outline: 2px solid var\(--local-accent\)/);
  });
});

describe('committed github-contributors.json', () => {
  it('has a non-empty, well-formed list for every configured repository', () => {
    expect(Object.keys(data).sort()).toEqual(REPOS.map(canonicalRepository).sort());
    for (const [repo, contributors] of Object.entries(data)) {
      expect(contributors.length, repo).toBeGreaterThan(0);
      for (const { id, login } of contributors) {
        expect(Number.isSafeInteger(id) && id > 0, `${repo}: ${login}`).toBe(true);
        expect(login, repo).toMatch(/^[a-z0-9][a-z0-9-]*(?:\[bot\])?$/i);
      }
    }
  });
});

describe('update-contributors script', () => {
  const endpoint = 'https://api.github.com/repos/microsoft/aspire/contributors';

  function response(body: unknown, init: { status?: number; link?: string } = {}) {
    const status = init.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => (name === 'link' ? init.link ?? null : null) },
      json: () => Promise.resolve(body),
    };
  }

  it('follows validated pagination and forwards the token', async () => {
    const fetch = vi.fn<FetchLike>()
      .mockResolvedValueOnce(response([{ id: 1, login: 'ada' }], {
        link: `<${endpoint}?per_page=100&page=2>; rel="next"`,
      }))
      .mockResolvedValueOnce(response([{ id: 2, login: 'grace' }]));
    const contributors = await fetchRepositoryContributors('Microsoft/Aspire', fetch, 'secret');
    expect(contributors).toEqual([{ id: 1, login: 'ada' }, { id: 2, login: 'grace' }]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe(`${endpoint}?per_page=100&page=2`);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer secret');
  });

  it('fails instead of returning a partial or empty list', async () => {
    const fetch = vi.fn<FetchLike>().mockResolvedValue(response(null, { status: 403 }));
    await expect(fetchRepositoryContributors('microsoft/aspire', fetch)).rejects.toThrow(/HTTP 403/);
  });

  it('rejects next-page links that point elsewhere', () => {
    expect(() => hasNextPage('<https://evil.example/x?per_page=100&page=2>; rel="next"', endpoint, 1))
      .toThrow();
    expect(hasNextPage(null, endpoint, 1)).toBe(false);
  });
});

describe('build-time network guard', () => {

  const roots = ['src', 'config', 'astro.config.mjs', 'uno.config.ts'];
  const skipped = new Set(['src/data']);

  function* sourceFiles(path: string): Generator<string> {
    const rel = relative(frontendRoot, path).split('\\').join('/');
    if (skipped.has(rel)) return;
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path)) yield* sourceFiles(join(path, entry));
    } else if (/\.(?:astro|mdx?|[cm]?[jt]sx?)$/.test(path)) {
      yield rel;
    }
  }

  it('has no api.github.com requests outside scripts/', () => {
    const offenders = roots
      .flatMap((root) => [...sourceFiles(join(frontendRoot, root))])
      .filter((file) => readFileSync(join(frontendRoot, file), 'utf8').includes('api.github.com'));
    expect(offenders).toEqual([]);
  });
});
