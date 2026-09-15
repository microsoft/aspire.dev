import { describe, expect, it } from 'vitest';

import { getWhatsNewRelease } from '@utils/whats-new';

describe('getWhatsNewRelease', () => {
  it('resolves a minor release page to its version, tag, and release-notes URL', () => {
    expect(getWhatsNewRelease('whats-new/aspire-13-5')).toEqual({
      version: '13.5',
      tag: 'v13.5.0',
      releaseNotesUrl: 'https://github.com/microsoft/aspire/releases/tag/v13.5.0',
    });
  });

  it('treats a major-only page as the .0 GA release', () => {
    expect(getWhatsNewRelease('whats-new/aspire-13')).toEqual({
      version: '13.0',
      tag: 'v13.0.0',
      releaseNotesUrl: 'https://github.com/microsoft/aspire/releases/tag/v13.0.0',
    });
  });

  it('tolerates a locale prefix, a .mdx extension, and a trailing slash', () => {
    expect(getWhatsNewRelease('ja/whats-new/aspire-13-3.mdx')?.version).toBe('13.3');
    expect(getWhatsNewRelease('whats-new/aspire-9-5/')?.tag).toBe('v9.5.0');
    expect(getWhatsNewRelease('whats-new\\aspire-13-4.mdx')?.version).toBe('13.4');
  });

  it('returns undefined for non-versioned or non-release pages', () => {
    expect(getWhatsNewRelease('whats-new/upgrade-aspire')).toBeUndefined();
    expect(getWhatsNewRelease('get-started/install-cli')).toBeUndefined();
    expect(getWhatsNewRelease(undefined)).toBeUndefined();
    expect(getWhatsNewRelease('')).toBeUndefined();
  });
});
