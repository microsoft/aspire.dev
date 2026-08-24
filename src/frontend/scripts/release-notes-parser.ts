/**
 * Pure helpers for turning a GitHub auto-generated release-notes body into a
 * list of contributor handles.
 *
 * These are separated from `update-release-contributors.ts` so they can be
 * unit-tested without running the network-bound generator.
 */

// Automation accounts that should never be credited as community contributors.
export const IGNORED_HANDLES: ReadonlySet<string> = new Set(
  [
    'Copilot',
    'copilot-swe-agent',
    'github-actions',
    'dependabot',
    'dotnet-maestro',
    'dotnet-bot',
    'microsoftopensource',
    'azure-sdk',
  ].map((handle) => handle.toLowerCase())
);

/**
 * Determines whether a handle belongs to an automation account. App accounts
 * carry a `[bot]` suffix in their login (e.g. `renovate[bot]`), so callers must
 * pass the full handle — including that suffix — for this to catch bots that
 * aren't in {@link IGNORED_HANDLES}.
 */
export function isBot(handle: string): boolean {
  const lower = handle.toLowerCase();
  return lower.endsWith('-bot') || lower.includes('[bot]') || IGNORED_HANDLES.has(lower);
}

// A GitHub login (alphanumeric, internal hyphens), optionally suffixed with
// `[bot]` for app accounts. Capturing the suffix lets `isBot` recognize bots.
const HANDLE = String.raw`@[A-Za-z\d](?:[A-Za-z\d-]{0,38})(?:\[bot\])?`;

// The attribution GitHub appends to each changelog entry:
//   ` by @author[ with @coauthor][ and @coauthor] in https://github.com/<owner>/<repo>/pull|commit/<id>`
// Anchoring on the trailing PR/commit URL means an `@mention` inside the PR
// title is never mistaken for the author.
const ATTRIBUTION_PATTERN = new RegExp(
  String.raw`\sby\s(${HANDLE}(?:\s(?:with|and)\s${HANDLE})*)\sin\shttps://github\.com/\S+/(?:pull|commit)/`
);

const MENTION_PATTERN = /@([A-Za-z\d](?:[A-Za-z\d-]{0,38})(?:\[bot\])?)/g;

// "New Contributors" entries: `* @handle made their first contribution in #123`.
const NEW_CONTRIBUTOR_PATTERN = /^\*\s(@[A-Za-z\d][\w-]*(?:\[bot\])?)\smade\stheir\sfirst\b/;

/**
 * Extracts every contributor handle (PR authors and co-authors) credited in an
 * auto-generated release-notes body. Handles retain their original casing and
 * any `[bot]` suffix; de-duplication and filtering are left to the caller.
 */
export function extractHandles(body: string): string[] {
  const handles = new Set<string>();

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('* ')) {
      continue;
    }

    const attribution = line.match(ATTRIBUTION_PATTERN);
    const newContributor = attribution ? null : line.match(NEW_CONTRIBUTOR_PATTERN);
    const segment = attribution?.[1] ?? newContributor?.[1];
    if (!segment) {
      continue;
    }

    for (const match of segment.matchAll(MENTION_PATTERN)) {
      handles.add(match[1]);
    }
  }

  return [...handles];
}
