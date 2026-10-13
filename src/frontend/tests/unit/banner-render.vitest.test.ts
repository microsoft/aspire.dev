import vm from 'node:vm';

import { describe, expect, test } from 'vitest';

import Banner from '@components/starlight/Banner.astro';
import { MS_PER_DAY, parseFirstSeen, resolveBannerVisibility } from '@utils/banner-expiry';

import { renderComponent, type StarlightRoute } from './astro-test-utils';

const CONTENT = '<strong>Aspire 13.4 is here!</strong> <a href="/whats-new/aspire-13-4/">See what\'s new</a>';

function starlightRouteWith(data: Record<string, unknown>): StarlightRoute {
  return {
    editUrl:
      'https://github.com/microsoft/aspire.dev/edit/main/src/frontend/src/content/docs/test.mdx',
    entry: {
      id: 'docs/test',
      slug: 'test',
      filePath: 'src/content/docs/test.mdx',
      data,
    },
  };
}

function render(data: Record<string, unknown>): Promise<string> {
  return renderComponent(Banner, { locals: { starlightRoute: starlightRouteWith(data) } });
}

describe('Banner.astro rendered output', () => {
  test('carries top-level expiry metadata through to the client controller', async () => {
    // Regression: previously these lived nested under `banner:` and were dropped
    // by Starlight's built-in banner schema, reaching the component as `null`.
    const expiresOn = new Date('2999-01-01T00:00:00.000Z');
    const html = await render({
      banner: { content: CONTENT },
      bannerExpiresOn: expiresOn,
      bannerAutoDismissAfterDays: 14,
    });

    expect(html).toContain('data-aspire-banner');
    expect(html).toContain(`data-expires-on="${expiresOn.getTime()}"`);
    expect(html).toContain('data-auto-dismiss-days="14"');
    // The dismiss/first-seen storage keys are derived from the content only, so
    // they stay stable when expiry values change.
    expect(html).toMatch(/data-first-seen-key="aspire\.dev\.banner\.firstSeen\.[0-9a-f]{12}"/);
  });

  test('renders with empty expiry attributes when no expiry is configured', async () => {
    const html = await render({ banner: { content: CONTENT } });

    expect(html).toContain('data-aspire-banner');
    // Astro serializes an empty-string attribute value as a bare attribute
    // (`data-expires-on`), not `data-expires-on=""`. The client reads it back as
    // `dataset.expiresOn === ''` and treats it as "no expiry configured".
    expect(html).toMatch(/\sdata-expires-on(?=[\s>])/);
    expect(html).toMatch(/\sdata-auto-dismiss-days(?=[\s>])/);
  });

  test('is not rendered once the absolute sunset has already passed at build time', async () => {
    const html = await render({
      banner: { content: CONTENT },
      bannerExpiresOn: new Date('2000-01-01T00:00:00.000Z'),
    });

    expect(html).not.toContain('data-aspire-banner');
    expect(html).not.toContain('Aspire 13.4 is here');
  });

  test('is visible in the server-rendered markup so revealing it cannot shift the page', async () => {
    const html = await render({ banner: { content: CONTENT } });
    const opening = html.match(/<div[^>]*data-aspire-banner[^>]*>/)?.[0] ?? '';

    expect(opening).not.toBe('');
    expect(opening).not.toMatch(/\shidden(?=[\s>=])/);
    expect(opening).toContain('data-banner-state="open"');
  });
});

describe('Banner.astro pre-paint script', () => {
  const NOW = Date.UTC(2026, 9, 6, 12);
  const FAR_FUTURE = new Date('2999-01-01T00:00:00.000Z');

  function datasetOf(html: string): Record<string, string> {
    const opening = html.match(/<div[^>]*data-aspire-banner[^>]*>/)?.[0] ?? '';
    const dataset: Record<string, string> = {};
    for (const [, name, value] of opening.matchAll(/\sdata-([a-z-]+)(?:="([^"]*)")?/g)) {
      const key = name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      dataset[key] = value ?? '';
    }
    return dataset;
  }

  /** Runs the emitted script as a browser would, against fake storage and time. */
  function runPrepaint(html: string, storage: Record<string, string>, nowMs: number) {
    const script = html.match(/<script[^>]*data-banner-prepaint[^>]*>([\s\S]*?)<\/script>/)?.[1];
    expect(script, 'the pre-paint script must be rendered with the banner').toBeTruthy();

    const banner = { dataset: datasetOf(html), hidden: false };
    vm.runInNewContext(script as string, {
      Date: { now: () => nowMs },
      document: { querySelector: (selector: string) => (selector === '[data-aspire-banner]' ? banner : null) },
      window: { localStorage: { getItem: (key: string) => storage[key] ?? null } },
    });
    return banner;
  }

  /** The visibility the bundled controller computes for the same inputs. */
  function controllerVisible(html: string, storage: Record<string, string>, nowMs: number) {
    const { dismissKey, firstSeenKey, expiresOn, autoDismissDays } = datasetOf(html);
    return resolveBannerVisibility({
      nowMs,
      expiresOnMs: expiresOn ? Number(expiresOn) : null,
      autoDismissAfterDays: autoDismissDays ? Number(autoDismissDays) : null,
      firstSeenMs: parseFirstSeen(storage[firstSeenKey] ?? null, nowMs),
      dismissed: storage[dismissKey] === 'true',
    }).visible;
  }

  test('agrees with resolveBannerVisibility for dismiss, sunset and auto-dismiss state', async () => {
    const plain = await render({ banner: { content: CONTENT } });
    const sunset = await render({ banner: { content: CONTENT }, bannerExpiresOn: FAR_FUTURE });
    const auto = await render({ banner: { content: CONTENT }, bannerAutoDismissAfterDays: 14 });
    const { dismissKey, firstSeenKey } = datasetOf(plain);

    const seen = (daysAgo: number) => ({ [firstSeenKey]: String(NOW - daysAgo * MS_PER_DAY) });
    const scenarios: Array<[string, string, Record<string, string>, number]> = [
      ['nothing stored', plain, {}, NOW],
      ['dismissed', plain, { [dismissKey]: 'true' }, NOW],
      ['dismiss flag is not "true"', plain, { [dismissKey]: 'false' }, NOW],
      ['before the sunset', sunset, {}, NOW],
      ['after the sunset', sunset, {}, FAR_FUTURE.getTime() + 1],
      ['dismissed before the sunset', sunset, { [dismissKey]: 'true' }, NOW],
      ['first view (nothing stored)', auto, {}, NOW],
      ['inside the auto-dismiss window', auto, seen(13), NOW],
      ['exactly at the auto-dismiss boundary', auto, seen(14), NOW],
      ['past the auto-dismiss window', auto, seen(30), NOW],
      ['junk first-seen value', auto, { [firstSeenKey]: '12abc' }, NOW],
      ['negative first-seen value', auto, { [firstSeenKey]: '-5' }, NOW],
      ['zero first-seen value', auto, { [firstSeenKey]: '0' }, NOW],
      ['first-seen in the future', auto, { [firstSeenKey]: String(NOW + MS_PER_DAY) }, NOW],
      ['dismissed and past the window', auto, { ...seen(30), [dismissKey]: 'true' }, NOW],
    ];

    for (const [name, html, storage, nowMs] of scenarios) {
      const banner = runPrepaint(html, storage, nowMs);
      expect(!banner.hidden, name).toBe(controllerVisible(html, storage, nowMs));
      expect(banner.dataset.bannerState ?? 'open', name).toBe(banner.hidden ? 'closed' : 'open');
    }
  });

  test('leaves the banner visible when storage is unavailable', async () => {
    const html = await render({ banner: { content: CONTENT }, bannerAutoDismissAfterDays: 14 });
    const script = html.match(/<script[^>]*data-banner-prepaint[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '';
    const banner = { dataset: datasetOf(html), hidden: false };

    vm.runInNewContext(script, {
      Date: { now: () => NOW },
      document: { querySelector: () => banner },
      window: {
        get localStorage() {
          throw new Error('storage blocked');
        },
      },
    });

    expect(banner.hidden).toBe(false);
  });
});
