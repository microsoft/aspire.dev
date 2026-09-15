import { execSync } from 'child_process';
import fs from 'fs';

import { fetchWithProxy as fetch } from './fetch-with-proxy';
import { extractHandles, isBot } from './release-notes-parser';
import { coreTeamHandles } from '../src/data/core-team';

/**
 * Generates the per-release community contributor list rendered by
 * `ReleaseCommunity.astro` in every "What's new" page.
 *
 * For each documented release, this queries GitHub's automatic release-notes
 * endpoint for the tag range and collects every contributor (PR authors and
 * co-authors) credited in that range. Bots and current core team members are
 * removed — core team members are credited separately in the hand-maintained
 * roster (`src/data/core-team.ts`).
 *
 * Requires a GitHub token with read access. Resolution order:
 *   1. `GITHUB_TOKEN` / `GH_TOKEN` environment variables.
 *   2. `gh auth token` (the GitHub CLI's stored credential).
 *
 * Run with: `pnpm update:release-contributors`
 */

const REPO = 'microsoft/aspire';
const OUTPUT_PATH = './src/data/release-contributors.json';

interface Release {
  /** Version key used by `<ReleaseCommunity version="..." />` in the MDX docs. */
  version: string;
  /** The release tag that closed this cycle. */
  tag: string;
  /** The previous release tag; contributors are collected for `previousTag..tag`. */
  previousTag: string;
}

// Ordered newest-first. `previousTag` bridges the 9.x → 13.x version jump and
// anchors the initial 9.0 doc to the last 8.x GA so it credits the whole cycle.
const RELEASES: readonly Release[] = [
  { version: '13.5', tag: 'v13.5.0', previousTag: 'v13.4.0' },
  { version: '13.4', tag: 'v13.4.0', previousTag: 'v13.3.0' },
  { version: '13.3', tag: 'v13.3.0', previousTag: 'v13.2.0' },
  { version: '13.2', tag: 'v13.2.0', previousTag: 'v13.1.0' },
  { version: '13.1', tag: 'v13.1.0', previousTag: 'v13.0.0' },
  { version: '13.0', tag: 'v13.0.0', previousTag: 'v9.5.0' },
  { version: '9.5', tag: 'v9.5.0', previousTag: 'v9.4.0' },
  { version: '9.4', tag: 'v9.4.0', previousTag: 'v9.3.0' },
  { version: '9.3', tag: 'v9.3.0', previousTag: 'v9.2.0' },
  { version: '9.2', tag: 'v9.2.0', previousTag: 'v9.1.0' },
  { version: '9.1', tag: 'v9.1.0', previousTag: 'v9.0.0' },
  { version: '9.0', tag: 'v9.0.0', previousTag: 'v8.2.2' },
];

interface GenerateNotesResponse {
  body: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveToken(): string {
  const envToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (envToken && envToken.trim().length > 0) {
    return envToken.trim();
  }

  try {
    const cliToken = execSync('gh auth token', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (cliToken.length > 0) {
      return cliToken;
    }
  } catch {
    // Fall through to the error below.
  }

  throw new Error(
    'No GitHub token found. Set GITHUB_TOKEN (or GH_TOKEN), or sign in with `gh auth login`.'
  );
}

async function fetchReleaseContributors(token: string, release: Release): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/generate-notes`, {
    method: 'POST',
    headers: {
      'User-Agent': 'aspire-release-contributors-script',
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tag_name: release.tag,
      previous_tag_name: release.previousTag,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Failed to generate notes for ${release.tag} (from ${release.previousTag}): ${res.status} ${res.statusText}`
    );
  }

  const data = (await res.json()) as GenerateNotesResponse;

  const contributors = extractHandles(data.body)
    .filter((handle) => !isBot(handle))
    .filter((handle) => !coreTeamHandles.has(handle.toLowerCase()));

  // De-duplicate case-insensitively while preserving GitHub's casing, then sort.
  const unique = new Map<string, string>();
  for (const handle of contributors) {
    const key = handle.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, handle);
    }
  }

  return [...unique.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

async function updateReleaseContributors(): Promise<void> {
  const token = resolveToken();
  const result: Record<string, string[]> = {};

  for (const release of RELEASES) {
    const contributors = await fetchReleaseContributors(token, release);
    result[release.version] = contributors;
    console.log(`✅ Aspire ${release.version}: ${contributors.length} community contributors`);
  }

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\n📝 Saved contributor lists for ${RELEASES.length} releases to ${OUTPUT_PATH}`);
}

updateReleaseContributors().catch((error: unknown) => {
  console.error('❌ Failed to update release contributors', getErrorMessage(error));
  process.exitCode = 1;
});
