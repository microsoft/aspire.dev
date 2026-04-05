import { execFileSync } from 'child_process';

export const NUGET_ORG_SERVICE_INDEX = 'https://api.nuget.org/v3/index.json';

const RELEASE_BRANCH_PREFIX = 'release/';
const AZURE_ARTIFACTS_PACKAGING_BASE =
  'https://pkgs.dev.azure.com/dnceng/public/_packaging';
const ASPIRE_REPO_CANDIDATES = [
  process.env.ASPIRE_GITHUB_REPO_URL,
  'https://github.com/microsoft/aspire',
].filter((value): value is string => Boolean(value));

interface ExplicitReleaseFeed {
  serviceIndex: string;
  feedName: string | null;
  resolution: string;
  sourceCommit?: string;
}

interface ReleaseBranchCommit {
  repoUrl: string;
  commit: string;
}

export interface OfficialAspirePackageSource {
  branchName: string;
  isReleaseBranch: boolean;
  serviceIndex: string;
  feedName: string | null;
  displayName: string;
  resolution: string;
  sourceCommit?: string | null;
  sourceRepository?: string;
}

function tryExecFile(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function normalizeBranchName(branchName: string | undefined | null): string {
  if (!branchName) {
    return '';
  }

  return branchName.replace(/^refs\/heads\//i, '').trim();
}

function getReleaseFeedNameFromCommit(commit: string | undefined | null): string | null {
  const normalizedCommit = commit?.trim();
  if (!normalizedCommit) {
    return null;
  }

  return `darc-pub-dotnet-aspire-${normalizedCommit.slice(0, 8)}`;
}

function buildReleaseFeedServiceIndex(feedName: string): string {
  return `${AZURE_ARTIFACTS_PACKAGING_BASE}/${feedName}/nuget/v3/index.json`;
}

function getFeedNameFromInput(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const artifactsMatch = trimmed.match(/\/_artifacts\/feed\/([^/?#]+)/i);
    if (artifactsMatch) {
      return artifactsMatch[1];
    }

    const packagingMatch = trimmed.match(/\/_packaging\/([^/?#]+)/i);
    if (packagingMatch) {
      return packagingMatch[1];
    }

    return null;
  }

  return /^[a-z0-9][a-z0-9._-]*$/i.test(trimmed) ? trimmed : null;
}

function getServiceIndexFromInput(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed) && /\/nuget\/v3\/index\.json\/?$/i.test(trimmed)) {
    return trimmed.replace(/\/+$/, '');
  }

  const feedName = getFeedNameFromInput(trimmed);
  return feedName ? buildReleaseFeedServiceIndex(feedName) : null;
}

function resolveExplicitReleaseFeed(): ExplicitReleaseFeed | null {
  const explicitServiceIndex = getServiceIndexFromInput(process.env.ASPIRE_RELEASE_FEED_URL);
  if (explicitServiceIndex) {
    return {
      serviceIndex: explicitServiceIndex,
      feedName: getFeedNameFromInput(process.env.ASPIRE_RELEASE_FEED_URL),
      resolution: 'ASPIRE_RELEASE_FEED_URL',
    };
  }

  const explicitFeedName = getFeedNameFromInput(process.env.ASPIRE_RELEASE_FEED_NAME);
  if (explicitFeedName) {
    return {
      serviceIndex: buildReleaseFeedServiceIndex(explicitFeedName),
      feedName: explicitFeedName,
      resolution: 'ASPIRE_RELEASE_FEED_NAME',
    };
  }

  const explicitCommit =
    process.env.ASPIRE_RELEASE_COMMIT ??
    process.env.ASPIRE_RELEASE_COMMIT_SHA ??
    process.env.ASPIRE_RELEASE_SOURCE_COMMIT;
  const derivedFeedName = getReleaseFeedNameFromCommit(explicitCommit);
  if (derivedFeedName) {
    return {
      serviceIndex: buildReleaseFeedServiceIndex(derivedFeedName),
      feedName: derivedFeedName,
      resolution: 'ASPIRE_RELEASE_COMMIT',
      sourceCommit: explicitCommit?.trim(),
    };
  }

  return null;
}

function resolveReleaseBranchCommit(branchName: string): ReleaseBranchCommit | null {
  for (const repoUrl of ASPIRE_REPO_CANDIDATES) {
    const output = tryExecFile('git', ['ls-remote', repoUrl, `refs/heads/${branchName}`]);
    const match = output?.match(/^([0-9a-f]{40})\s+/im);
    if (match) {
      return {
        repoUrl,
        commit: match[1],
      };
    }
  }

  return null;
}

export function getCurrentBranchName(): string {
  return (
    normalizeBranchName(process.env.BUILD_SOURCEBRANCH) ||
    normalizeBranchName(process.env.GITHUB_HEAD_REF) ||
    normalizeBranchName(process.env.GITHUB_REF_NAME) ||
    normalizeBranchName(tryExecFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'])) ||
    ''
  );
}

export function isOfficialAspirePackage(packageId: string): boolean {
  return packageId.toLowerCase().startsWith('aspire.');
}

export function isReleaseBranch(branchName: string): boolean {
  return branchName.toLowerCase().startsWith(RELEASE_BRANCH_PREFIX);
}

export function resolveOfficialAspirePackageSource(): OfficialAspirePackageSource {
  const branchName = getCurrentBranchName();

  if (!isReleaseBranch(branchName)) {
    return {
      branchName,
      isReleaseBranch: false,
      serviceIndex: NUGET_ORG_SERVICE_INDEX,
      feedName: null,
      displayName: 'nuget.org',
      resolution: 'default',
    };
  }

  const explicitFeed = resolveExplicitReleaseFeed();
  if (explicitFeed) {
    return {
      branchName,
      isReleaseBranch: true,
      serviceIndex: explicitFeed.serviceIndex,
      feedName: explicitFeed.feedName,
      displayName: explicitFeed.feedName ?? explicitFeed.serviceIndex,
      resolution: explicitFeed.resolution,
      sourceCommit: explicitFeed.sourceCommit ?? null,
    };
  }

  const branchCommit = resolveReleaseBranchCommit(branchName);
  if (!branchCommit) {
    throw new Error(
      `Unable to resolve the official Aspire release feed for branch "${branchName}". ` +
        'Set ASPIRE_RELEASE_FEED_URL, ASPIRE_RELEASE_FEED_NAME, or ASPIRE_RELEASE_COMMIT to override the feed while microsoft/aspire is the active source repo.'
    );
  }

  const feedName = getReleaseFeedNameFromCommit(branchCommit.commit);
  if (!feedName) {
    throw new Error(`Unable to derive a release feed name from commit ${branchCommit.commit}.`);
  }

  return {
    branchName,
    isReleaseBranch: true,
    serviceIndex: buildReleaseFeedServiceIndex(feedName),
    feedName,
    displayName: feedName,
    resolution: 'branch head',
    sourceCommit: branchCommit.commit,
    sourceRepository: branchCommit.repoUrl,
  };
}