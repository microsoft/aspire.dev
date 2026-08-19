import { describe, expect, it } from 'vitest';

import { coreTeamHandles } from '@data/core-team';
import releaseContributorsData from '@data/release-contributors.json';
import { extractHandles, isBot } from '../../scripts/release-notes-parser';

const releaseContributors = releaseContributorsData as Record<string, string[]>;

describe('release-notes contributor parser', () => {
  it('credits the PR author and co-authors, not @mentions inside the title', () => {
    const body = [
      "## What's Changed",
      '* Fix docs by @alice by @bob in https://github.com/microsoft/aspire/pull/1',
      '* New feature by @carol with @dave in https://github.com/microsoft/aspire/pull/2',
    ].join('\n');

    const handles = extractHandles(body);

    // @alice appears only in the PR title, so it must not be credited.
    expect(handles).not.toContain('alice');
    expect(handles).toEqual(expect.arrayContaining(['bob', 'carol', 'dave']));
  });

  it('detects bot accounts that are not in the ignore list', () => {
    const body = [
      '* Bump dependency by @renovate[bot] in https://github.com/microsoft/aspire/pull/3',
      '* Real change by @octocat in https://github.com/microsoft/aspire/pull/4',
    ].join('\n');

    // The `[bot]` suffix must survive extraction so `isBot` can catch it.
    expect(extractHandles(body)).toContain('renovate[bot]');
    expect(isBot('renovate[bot]')).toBe(true);

    const contributors = extractHandles(body).filter((handle) => !isBot(handle));
    expect(contributors).toEqual(['octocat']);
  });

  it('captures "New Contributors" entries', () => {
    const body =
      '* @firsttimer made their first contribution in https://github.com/microsoft/aspire/pull/5';
    expect(extractHandles(body)).toContain('firsttimer');
  });
});

describe('committed release-contributors.json', () => {
  it('never lists a core team member (they are credited in the roster)', () => {
    for (const [version, handles] of Object.entries(releaseContributors)) {
      for (const handle of handles) {
        expect(
          coreTeamHandles.has(handle.toLowerCase()),
          `@${handle} is a core team member and must not appear in the Aspire ${version} contributor list`
        ).toBe(false);
      }
    }
  });

  it('contains no bots or duplicate handles within a release', () => {
    for (const [version, handles] of Object.entries(releaseContributors)) {
      const lower = handles.map((handle) => handle.toLowerCase());
      expect(new Set(lower).size, `Aspire ${version} has duplicate handles`).toBe(lower.length);
      for (const handle of handles) {
        expect(isBot(handle), `@${handle} (Aspire ${version}) is a bot`).toBe(false);
      }
    }
  });
});
