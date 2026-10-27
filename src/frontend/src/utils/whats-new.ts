/**
 * Helpers for the "What's new in Aspire N.N" release-notes pages.
 *
 * A single source of truth for turning a page's route path into the Aspire
 * release it documents, so the release-date badge and the GitHub release-tag
 * link rendered by `components/starlight/MarkdownContent.astro` stay in sync.
 */

/**
 * Matches a versioned What's New route path, capturing the major and (optional)
 * minor version. Anchored to the end so it also matches locale-prefixed ids
 * (e.g. `ja/whats-new/aspire-13-3`) and ignores unversioned pages such as
 * `whats-new/upgrade-aspire`.
 */
const WHATS_NEW_RELEASE_PATTERN = /whats-new\/aspire-(\d+)(?:-(\d+))?$/i;

export interface WhatsNewRelease {
  /** Display version, e.g. `13.5` (minor defaults to `0` for the `.0` GA page). */
  version: string;
  /** GitHub release tag in `microsoft/aspire`, e.g. `v13.5.0`. */
  tag: string;
  /** Absolute URL to the GitHub release notes for this release. */
  releaseNotesUrl: string;
}

/**
 * Resolve the Aspire release a What's New page documents from its route path,
 * or `undefined` when the path isn't a versioned What's New release-notes page.
 *
 * The route path may include a locale prefix, a leading/trailing slash, and a
 * `.md`/`.mdx` extension — all are tolerated. The GitHub release tag for a
 * "What's new in Aspire X.Y" page is the GA tag `vX.Y.0`.
 */
export function getWhatsNewRelease(routePath: string | undefined | null): WhatsNewRelease | undefined {
  if (!routePath) {
    return undefined;
  }

  const normalized = routePath
    .replace(/\\/g, '/')
    .replace(/\/$/, '')
    .replace(/\.mdx?$/i, '');

  const match = WHATS_NEW_RELEASE_PATTERN.exec(normalized);
  if (!match) {
    return undefined;
  }

  const major = match[1];
  const minor = match[2] ?? '0';
  const version = `${major}.${minor}`;
  const tag = `v${version}.0`;

  return {
    version,
    tag,
    releaseNotesUrl: `https://github.com/microsoft/aspire/releases/tag/${tag}`,
  };
}
