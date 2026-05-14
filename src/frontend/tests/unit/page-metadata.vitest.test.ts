import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OG_IMAGE_HEIGHT,
  DEFAULT_OG_IMAGE_WIDTH,
  FALLBACK_DESCRIPTION,
  getContentBasePath,
  getOgMetadata,
  isDefaultLocaleEntry,
  resolveCanonicalUrl,
  resolveOgDescription,
  resolveOgImage,
  resolveOgTitle,
  resolveOgType,
  resolveSiteUrl,
  shouldSkipDynamicOgImage,
} from '@utils/page-metadata';

type Route = Parameters<typeof getOgMetadata>[0];

interface RouteOverrides {
  entryId?: string;
  title?: string;
  description?: string;
  locale?: string;
  lang?: string;
  head?: Route['head'];
  category?: string;
  template?: string;
  ogImage?: string;
  og?: boolean;
}

function createRoute(overrides: RouteOverrides = {}): Route {
  const {
    entryId = 'dashboard/enable-browser-telemetry.mdx',
    title = 'Enable browser telemetry',
    locale,
    lang = 'en',
    head = [],
    category,
    template,
    ogImage,
    og,
  } = overrides;

  const description =
    'description' in overrides
      ? overrides.description
      : 'Learn how to enable browser telemetry in the Aspire dashboard.';

  return {
    entry: {
      id: entryId,
      slug: entryId.replace(/\.mdx?$/i, ''),
      filePath: `src/content/docs/${entryId}`,
      body: '',
      data: {
        title,
        description,
        category,
        template,
        ogImage,
        og,
      },
    },
    entryMeta: { lang, dir: 'ltr', locale },
    head,
    lang,
    locale,
  } as unknown as Route;
}

const site = new URL('https://aspire.dev/');

describe('getContentBasePath', () => {
  it('strips the .mdx extension', () => {
    expect(getContentBasePath(createRoute({ entryId: 'foo/bar.mdx' }))).toBe('foo/bar');
  });

  it('strips a locale prefix when locale is set', () => {
    expect(
      getContentBasePath(createRoute({ entryId: 'de/foo/bar.mdx', locale: 'de' }))
    ).toBe('foo/bar');
  });

  it('returns the index path for the home page', () => {
    expect(getContentBasePath(createRoute({ entryId: 'index.mdx' }))).toBe('index');
  });

  it('normalizes windows-style backslashes', () => {
    expect(getContentBasePath(createRoute({ entryId: 'dashboard\\overview.mdx' }))).toBe(
      'dashboard/overview'
    );
  });
});

describe('resolveCanonicalUrl', () => {
  it('prefers an explicit <link rel="canonical"> in head', () => {
    const route = createRoute({
      head: [
        {
          tag: 'link',
          attrs: { rel: 'canonical', href: 'https://aspire.dev/custom/' },
        },
      ],
    });
    const url = resolveCanonicalUrl(
      route,
      new URL('https://aspire.dev/dashboard/enable-browser-telemetry/'),
      site
    );
    expect(url).toBe('https://aspire.dev/custom/');
  });

  it('falls back to currentUrl pathname with trailing slash', () => {
    const route = createRoute();
    const url = resolveCanonicalUrl(
      route,
      new URL('https://aspire.dev/dashboard/enable-browser-telemetry/'),
      site
    );
    expect(url).toBe('https://aspire.dev/dashboard/enable-browser-telemetry/');
  });

  it('adds a trailing slash if missing', () => {
    const route = createRoute();
    const url = resolveCanonicalUrl(
      route,
      new URL('https://aspire.dev/dashboard/enable-browser-telemetry'),
      site
    );
    expect(url).toBe('https://aspire.dev/dashboard/enable-browser-telemetry/');
  });

  it('respects a string site argument', () => {
    const route = createRoute();
    const url = resolveCanonicalUrl(
      route,
      new URL('https://aspire.dev/dashboard/'),
      'https://aspire.dev/'
    );
    expect(url).toBe('https://aspire.dev/dashboard/');
  });
});

describe('resolveOgTitle', () => {
  it('appends the site name to non-home pages', () => {
    const route = createRoute({ title: 'Enable browser telemetry' });
    expect(resolveOgTitle(route, 'dashboard/enable-browser-telemetry')).toBe(
      'Enable browser telemetry · Aspire'
    );
  });

  it('returns the bare title for the home page', () => {
    const route = createRoute({ entryId: 'index.mdx', title: 'Aspire' });
    expect(resolveOgTitle(route, 'index')).toBe('Aspire');
  });

  it('returns the bare title for splash templates', () => {
    const route = createRoute({ template: 'splash', title: 'Get started' });
    expect(resolveOgTitle(route, 'get-started/index')).toBe('Get started');
  });

  it('does not duplicate the site name', () => {
    const route = createRoute({ title: 'Aspire' });
    expect(resolveOgTitle(route, 'whatever')).toBe('Aspire');
  });
});

describe('resolveOgDescription', () => {
  it('uses the entry description when present', () => {
    const route = createRoute({ description: 'A page-specific description.' });
    expect(resolveOgDescription(route)).toBe('A page-specific description.');
  });

  it('falls back to the marketing description when missing', () => {
    const route = createRoute({ description: undefined });
    expect(resolveOgDescription(route)).toBe(FALLBACK_DESCRIPTION);
  });

  it('truncates descriptions longer than 200 chars with an ellipsis', () => {
    const long = 'A'.repeat(250);
    const route = createRoute({ description: long });
    const out = resolveOgDescription(route);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith('…')).toBe(true);
  });

  it('trims trailing punctuation before the ellipsis', () => {
    const route = createRoute({ description: `${'a'.repeat(195)}, more stuff after the cutoff.` });
    const out = resolveOgDescription(route);
    expect(out.endsWith(',…')).toBe(false);
  });
});

describe('resolveOgType', () => {
  it('returns website for the home page', () => {
    const route = createRoute({ entryId: 'index.mdx', template: 'splash' });
    expect(resolveOgType(route, 'index')).toBe('website');
  });

  it('returns website for splash templates', () => {
    const route = createRoute({ template: 'splash' });
    expect(resolveOgType(route, 'community/index')).toBe('website');
  });

  it('returns article for whats-new release notes', () => {
    const route = createRoute({ entryId: 'whats-new/aspire-13-2.mdx' });
    expect(resolveOgType(route, 'whats-new/aspire-13-2')).toBe('article');
  });

  it('returns article for blog category', () => {
    const route = createRoute({ category: 'blog' });
    expect(resolveOgType(route, 'whatever')).toBe('article');
  });

  it('returns article by default', () => {
    const route = createRoute();
    expect(resolveOgType(route, 'dashboard/enable-browser-telemetry')).toBe('article');
  });
});

describe('resolveOgImage', () => {
  const siteUrl = 'https://aspire.dev';

  it('respects an explicit absolute ogImage override', () => {
    const route = createRoute({ ogImage: 'https://example.com/custom.png' });
    expect(resolveOgImage(route, 'whatever', siteUrl, true)).toBe('https://example.com/custom.png');
  });

  it('resolves a relative ogImage override against the site URL', () => {
    const route = createRoute({ ogImage: '/custom.png' });
    expect(resolveOgImage(route, 'whatever', siteUrl, true)).toBe('https://aspire.dev/custom.png');
  });

  it('falls back to the global image when og is false', () => {
    const route = createRoute({ og: false });
    expect(resolveOgImage(route, 'foo/bar', siteUrl, true)).toBe(
      'https://aspire.dev/og-image.png'
    );
  });

  it('falls back to the global image for non-default locales', () => {
    const route = createRoute({ locale: 'de' });
    expect(resolveOgImage(route, 'foo/bar', siteUrl, false)).toBe(
      'https://aspire.dev/og-image.png'
    );
  });

  it('falls back to the global image for splash pages', () => {
    const route = createRoute({ template: 'splash' });
    expect(resolveOgImage(route, 'community/index', siteUrl, true)).toBe(
      'https://aspire.dev/og-image.png'
    );
  });

  it('falls back to the global image for the home page', () => {
    const route = createRoute({ entryId: 'index.mdx' });
    expect(resolveOgImage(route, 'index', siteUrl, true)).toBe('https://aspire.dev/og-image.png');
  });

  it('falls back to the global image for the 404 page', () => {
    const route = createRoute({ entryId: '404.mdx' });
    expect(resolveOgImage(route, '404', siteUrl, true)).toBe('https://aspire.dev/og-image.png');
  });

  it('emits a per-page URL for normal default-locale pages', () => {
    const route = createRoute();
    expect(resolveOgImage(route, 'dashboard/enable-browser-telemetry', siteUrl, true)).toBe(
      'https://aspire.dev/og/dashboard/enable-browser-telemetry.png'
    );
  });
});

describe('shouldSkipDynamicOgImage', () => {
  it('skips splash pages', () => {
    const route = createRoute({ template: 'splash' });
    expect(shouldSkipDynamicOgImage(route, 'community/index')).toBe(true);
  });

  it('skips the home page', () => {
    const route = createRoute({ entryId: 'index.mdx' });
    expect(shouldSkipDynamicOgImage(route, 'index')).toBe(true);
  });

  it('skips 404', () => {
    const route = createRoute({ entryId: '404.mdx' });
    expect(shouldSkipDynamicOgImage(route, '404')).toBe(true);
  });

  it('skips entries with og: false', () => {
    const route = createRoute({ og: false });
    expect(shouldSkipDynamicOgImage(route, 'whatever')).toBe(true);
  });

  it('keeps normal pages', () => {
    const route = createRoute();
    expect(shouldSkipDynamicOgImage(route, 'dashboard/enable-browser-telemetry')).toBe(false);
  });
});

describe('isDefaultLocaleEntry', () => {
  it('detects default locale entries', () => {
    expect(isDefaultLocaleEntry('dashboard/overview.mdx')).toBe(true);
    expect(isDefaultLocaleEntry('whats-new/aspire-13-2.mdx')).toBe(true);
    expect(isDefaultLocaleEntry('index.mdx')).toBe(true);
  });

  it('detects non-default locale entries', () => {
    expect(isDefaultLocaleEntry('de/dashboard/overview.mdx')).toBe(false);
    expect(isDefaultLocaleEntry('zh-cn/dashboard/overview.mdx')).toBe(false);
    expect(isDefaultLocaleEntry('pt-br/index.mdx')).toBe(false);
  });

  it('normalizes windows backslashes', () => {
    expect(isDefaultLocaleEntry('de\\foo.mdx')).toBe(false);
  });
});

describe('resolveSiteUrl', () => {
  it('returns the URL stripped of its trailing slash', () => {
    expect(resolveSiteUrl(new URL('https://aspire.dev/'), new URL('https://x/'))).toBe(
      'https://aspire.dev'
    );
  });

  it('accepts a string', () => {
    expect(resolveSiteUrl('https://aspire.dev/', new URL('https://x/'))).toBe('https://aspire.dev');
  });

  it('falls back to the current URL origin when site is undefined', () => {
    expect(resolveSiteUrl(undefined, new URL('https://example.com/foo'))).toBe(
      'https://example.com'
    );
  });
});

describe('getOgMetadata', () => {
  it('returns page-specific OG metadata for a default-locale article', () => {
    const route = createRoute();
    const meta = getOgMetadata(
      route,
      new URL('https://aspire.dev/dashboard/enable-browser-telemetry/'),
      site
    );

    expect(meta.title).toBe('Enable browser telemetry');
    expect(meta.ogTitle).toBe('Enable browser telemetry · Aspire');
    expect(meta.description).toBe('Learn how to enable browser telemetry in the Aspire dashboard.');
    expect(meta.url).toBe('https://aspire.dev/dashboard/enable-browser-telemetry/');
    expect(meta.type).toBe('article');
    expect(meta.image).toBe('https://aspire.dev/og/dashboard/enable-browser-telemetry.png');
    expect(meta.imageAlt).toBe('Enable browser telemetry');
    expect(meta.imageWidth).toBe(DEFAULT_OG_IMAGE_WIDTH);
    expect(meta.imageHeight).toBe(DEFAULT_OG_IMAGE_HEIGHT);
    expect(meta.isDefaultLocale).toBe(true);
    expect(meta.contentBasePath).toBe('dashboard/enable-browser-telemetry');
  });

  it('falls back to the static image for non-default-locale articles but keeps title/description', () => {
    const route = createRoute({
      entryId: 'de/dashboard/enable-browser-telemetry.mdx',
      title: 'Browser-Telemetrie aktivieren',
      description: 'Lernen Sie, wie Sie Browser-Telemetrie aktivieren.',
      locale: 'de',
      lang: 'de',
    });
    const meta = getOgMetadata(
      route,
      new URL('https://aspire.dev/de/dashboard/enable-browser-telemetry/'),
      site
    );

    expect(meta.ogTitle).toBe('Browser-Telemetrie aktivieren · Aspire');
    expect(meta.description).toBe('Lernen Sie, wie Sie Browser-Telemetrie aktivieren.');
    expect(meta.image).toBe('https://aspire.dev/og-image.png');
    expect(meta.isDefaultLocale).toBe(false);
  });

  it('honours the og: false opt-out flag for images while keeping per-page text', () => {
    const route = createRoute({ og: false });
    const meta = getOgMetadata(
      route,
      new URL('https://aspire.dev/dashboard/enable-browser-telemetry/'),
      site
    );

    expect(meta.image).toBe('https://aspire.dev/og-image.png');
    expect(meta.ogTitle).toBe('Enable browser telemetry · Aspire');
  });

  it('honours an explicit ogImage override', () => {
    const route = createRoute({ ogImage: '/custom-image.png' });
    const meta = getOgMetadata(
      route,
      new URL('https://aspire.dev/dashboard/enable-browser-telemetry/'),
      site
    );

    expect(meta.image).toBe('https://aspire.dev/custom-image.png');
  });

  it('returns website type for the splash home page', () => {
    const route = createRoute({
      entryId: 'index.mdx',
      title: 'Aspire',
      description: 'Add Aspire to your stack.',
      template: 'splash',
    });
    const meta = getOgMetadata(route, new URL('https://aspire.dev/'), site);

    expect(meta.type).toBe('website');
    expect(meta.ogTitle).toBe('Aspire');
    expect(meta.image).toBe('https://aspire.dev/og-image.png');
  });
});
