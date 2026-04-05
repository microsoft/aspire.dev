import fs from 'fs';

import { fetchWithProxy as fetch } from './fetch-with-proxy';

const REPOS = [
  'microsoft/aspire',
  'microsoft/aspire-samples',
  'CommunityToolkit/Aspire',
  'microsoft/aspire.dev',
  'microsoft/dcp',
] as const;
const OUTPUT_PATH = './src/data/github-stats.json';

interface GitHubLicense {
  spdx_id?: string | null;
  name?: string | null;
  url?: string | null;
}

interface GitHubRepoResponse {
  full_name: string;
  stargazers_count: number;
  description?: string | null;
  license?: GitHubLicense | null;
  default_branch: string;
  html_url: string;
}

interface GitHubRepoStat {
  name: string;
  stars: number;
  description: string | null;
  license: string | null;
  licenseName: string | null;
  repo: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchRepoStats(repo: string): Promise<GitHubRepoStat> {
  const url = `https://api.github.com/repos/${repo}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'aspire-stats-script' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${repo}: ${res.statusText}`);
  }

  const data = (await res.json()) as GitHubRepoResponse;
  let licenseUrl: string | null = null;
  if (data.license?.spdx_id) {
    const base = `https://github.com/${repo}/blob/${data.default_branch}/`;
    const licenseFiles = ['LICENSE', 'LICENSE.TXT', 'LICENSE.md', 'LICENSE.txt', 'LICENSE.md'];
    for (const file of licenseFiles) {
      const fileUrl = `${base}${file}`;
      const licenseResponse = await fetch(fileUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': 'aspire-stats-script' },
      });
      if (licenseResponse.ok) {
        licenseUrl = fileUrl;
        break;
      }
    }

    if (!licenseUrl) {
      licenseUrl = data.license?.url ?? null;
    }
  } else {
    licenseUrl = data.license?.url ?? null;
  }

  return {
    name: data.full_name,
    stars: data.stargazers_count,
    description: data.description ?? null,
    license: licenseUrl,
    licenseName: data.license?.name ?? null,
    repo: data.html_url,
  };
}

async function fetchAllStats(): Promise<void> {
  const stats = await Promise.all(REPOS.map((repo) => fetchRepoStats(repo)));
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(stats, null, 2));
  console.log(`✅ Saved stats for ${stats.length} repos to ${OUTPUT_PATH}`);
}

fetchAllStats().catch((error: unknown) => {
  console.error('❌ Failed to fetch GitHub stats', getErrorMessage(error));
  process.exitCode = 1;
});
