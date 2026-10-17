import { afterEach, describe, expect, it, vi } from 'vitest';
import { ogCacheKey } from '../../src/utils/og-build-cache';
import { getStaticPaths as docsPaths } from '../../src/pages/og/[...slug]';
import { getStaticPaths as samplePaths } from '../../src/pages/og/reference/samples/[sample].png';

const fixture = vi.hoisted(() => ({
  docs: [
    { id: 'app-host/cache-probe', data: { title: 'Cache probe', description: 'Description' } },
    { id: 'community/cache-probe', data: { title: 'Community \u{1f91d}', description: 'Hello' } },
    { id: 'fr/app-host/cache-probe', data: { title: 'French title' } },
  ],
  samples: [
    {
      name: 'local-image',
      title: 'Image \u{1f91d}',
      description: null,
      thumbnail: { light: '~/assets/light.png', dark: '~/assets/dark.png' },
    },
    {
      name: 'fallback',
      title: 'Fallback',
      description: 'First line\nSecond line',
      thumbnail: null,
    },
    { name: 'emoji', title: 'Fallback \u{1f91d}', description: null, thumbnail: null },
  ],
  topic: { id: 'test', label: 'Test topic', iconName: 'test', iconSvg: '<path/>' },
}));

vi.mock('astro:content', () => ({ getCollection: () => fixture.docs }));
vi.mock('@data/samples.json', () => ({ default: fixture.samples }));
vi.mock('@utils/topic-resolver', () => ({ getTopicForEntry: () => fixture.topic }));

afterEach(() => vi.unstubAllEnvs());

function enable() {
  vi.stubEnv('PROD', true);
  vi.stubEnv('ASPIRE_INCREMENTAL_BUILD', '1');
}

describe('OG route caching', () => {
  it('does not affect ordinary builds or dev, including inherited opt-in environments', () => {
    vi.stubEnv('ASPIRE_INCREMENTAL_BUILD', '0');
    expect(ogCacheKey({}, 'Title')).toBeUndefined();
    vi.stubEnv('ASPIRE_INCREMENTAL_BUILD', '1');
    vi.stubEnv('PROD', false);
    expect(ogCacheKey({}, 'Title')).toBeUndefined();
  });

  it('keys all card data without memoizing mutable props', () => {
    enable();
    const data = { title: 'Title', description: 'Description', topic: fixture.topic };
    const before = ogCacheKey(data, data.title);
    expect(before).toMatch(/^[a-f\d]{64}$/);
    expect(ogCacheKey(structuredClone(data), data.title)).toBe(before);
    for (const change of [
      { title: 'Changed' },
      { description: 'Changed' },
      { topic: { ...fixture.topic, iconSvg: '<changed/>' } },
    ]) {
      expect(ogCacheKey({ ...data, ...change }, 'Title')).not.toBe(before);
    }
    data.title = 'Mutated';
    expect(ogCacheKey(data, data.title)).not.toBe(before);
    expect(ogCacheKey({}, 'Version 13.5 + C#')).toMatch(/^[a-f\d]{64}$/);
  });

  it.each([
    '\u{1f91d}',
    '\u{1f1fa}\u{1f1f8}',
    '1\ufe0f\u20e3',
    '\u{1f469}\u200d\u{1f4bb}',
    '\u00a9',
  ])('leaves external emoji input %s uncached', (emoji) => {
    enable();
    expect(ogCacheKey({}, `Title ${emoji}`)).toBeUndefined();
  });

  it('wires default-locale documentation routes without changing their props or inventory', async () => {
    vi.stubEnv('ASPIRE_INCREMENTAL_BUILD', '0');
    const normal = await docsPaths();
    enable();
    const cached = await docsPaths();
    expect(cached.map(({ params, props }) => ({ params, props }))).toEqual(
      normal.map(({ params, props }) => ({ params, props }))
    );
    expect(cached.map(({ params }) => params.slug)).toEqual([
      'app-host/cache-probe.png',
      'community/cache-probe.png',
    ]);
    expect(cached[0].cacheKey).toMatch(/^[a-f\d]{64}$/);
    expect(cached[1].cacheKey).toBeUndefined();
    expect(normal.every(({ cacheKey }) => cacheKey === undefined)).toBe(true);
  });

  it('caches local sample thumbnails even with emoji titles but not emoji-rendered fallbacks', () => {
    vi.stubEnv('ASPIRE_INCREMENTAL_BUILD', '0');
    const normal = samplePaths();
    enable();
    const cached = samplePaths();
    expect(cached.map(({ params, props }) => ({ params, props }))).toEqual(
      normal.map(({ params, props }) => ({ params, props }))
    );
    expect(cached[0].cacheKey).toMatch(/^[a-f\d]{64}$/);
    expect(cached[1].cacheKey).toMatch(/^[a-f\d]{64}$/);
    expect(cached[2].cacheKey).toBeUndefined();
  });
});
