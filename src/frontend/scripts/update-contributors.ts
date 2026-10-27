import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { aspireProject } from '../src/data/aspire-project';
import { fetchWithProxy } from './fetch-with-proxy';

export const REPOS = [
  aspireProject.name,
  'microsoft/aspire-samples',
  'CommunityToolkit/Aspire',
  'microsoft/aspire.dev',
  'microsoft/dcp',
] as const;

const OUTPUT_PATH = './src/data/github-contributors.json';
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const REQUEST_TIMEOUT_MS = 30_000;

export interface Contributor {
  id: number;
  login: string;
}

export type FetchLike = (
  url: string,
  init: {
    headers: Record<string, string>; redirect: 'error';
    signal: AbortSignal
  },
) => Promise<{
  ok: boolean;
  status: number;
  headers: {
    get(name: string): string | null
  };
  json(): Promise<unknown>;
}>;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function canonicalRepository(repository: string): string {
  const canonical = repository.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\/[a-z0-9._-]+$/.test(canonical)) {
    throw new TypeError(`Expected a GitHub owner/repository name, got "${repository}".`);
  }
  return canonical;
}

export function parseContributors(value: unknown): Contributor[] {
  if (!Array.isArray(value) || value.length > PAGE_SIZE) {
    throw new Error('Unexpected contributors response shape.');
  }
  return value.map((item: unknown) => {
    if (
      typeof item !== 'object' || item === null ||
      !('id' in item) || typeof item.id !== 'number' ||
      !Number.isSafeInteger(item.id) || item.id <= 0 ||
      !('login' in item) || typeof item.login !== 'string' ||
      !/^[a-z0-9][a-z0-9-]*(?:\[bot\])?$/i.test(item.login)
    ) {
      throw new Error('Unexpected contributor entry in response.');
    }
    return { id: item.id, login: item.login };
  });
}

export function hasNextPage(link: string | null, endpoint: string, page: number): boolean {
  const next = link?.split(',').find((part) => /;\s*rel="next"/.test(part));
  if (!next) return false;

  const match = /^\s*<([^>]+)>/.exec(next);
  if (!match) throw new Error('Malformed Link header.');
  const url = new URL(match[1], endpoint);
  const expected = new URL(endpoint);
  if (
    url.origin !== expected.origin ||
    (
      url.pathname !== expected.pathname &&
      !/^\/repositories\/[1-9]\d*\/contributors$/.test(url.pathname)
    ) ||
    url.username || url.password || url.hash ||
    url.searchParams.get('page') !== String(page + 1) ||
    url.searchParams.get('per_page') !== String(PAGE_SIZE) ||
    [...url.searchParams.keys()].some((key) => key !== 'page' && key !== 'per_page')
  ) {
    throw new Error('Unexpected next-page URL in Link header.');
  }
  return true;
}

export async function fetchRepositoryContributors(
  repository: string,
  fetch: FetchLike,
  token?: string,
): Promise<Contributor[]> {
  const endpoint = `https://api.github.com/repos/${canonicalRepository(repository)}/contributors`;
  const contributors: Contributor[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await fetch(`${endpoint}?per_page=${PAGE_SIZE}&page=${page}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'User-Agent': 'aspire-contributors-script',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch contributors for ${repository} (page ${page}): HTTP ${response.status}`);
    }
    if (response.status === 204) return contributors;

    contributors.push(...parseContributors(await response.json()));
    if (!hasNextPage(response.headers.get('link'), endpoint, page)) {
      return contributors;
    }
  }
  throw new Error(`Contributors for ${repository} exceeded ${MAX_PAGES} pages.`);
}

async function main(): Promise<void> {
  const token = (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN)?.trim() || undefined;
  if (!token) {
    console.warn('⚠️  No GITHUB_TOKEN/GH_TOKEN set; using anonymous GitHub API requests.');
  }

  const result: Record<string, Contributor[]> = {};
  for (const repo of REPOS) {
    const contributors = await fetchRepositoryContributors(repo, fetchWithProxy, token);
    result[canonicalRepository(repo)] = contributors;
    console.log(`✅ ${repo}: ${contributors.length} contributors`);
  }

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\n📝 Saved contributors for ${REPOS.length} repos to ${OUTPUT_PATH}`);
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  void main().catch((error: unknown) => {
    console.error('❌ Failed to update contributors', getErrorMessage(error));
    process.exitCode = 1;
  });
}
