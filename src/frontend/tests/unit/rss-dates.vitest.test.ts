import type { APIContext } from 'astro';
import { afterEach, expect, it, vi } from 'vitest';
import { GET } from '../../src/pages/rss.xml';

vi.mock('astro:content', () => ({
  getCollection: () =>
    Promise.resolve([
      { id: 'undated', data: { title: 'Undated', description: 'No explicit publication date.' } },
      {
        id: 'dated',
        data: { title: 'Dated', description: 'Explicit date.', lastUpdated: '2026-01-02' },
      },
    ]),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function feed() {
  return (await GET({ site: new URL('https://aspire.dev') } as APIContext)).text();
}

it('preserves current-time fallback and explicit RSS dates in ordinary builds', async () => {
  vi.stubEnv('SOURCE_DATE_EPOCH', undefined);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-18T14:00:00Z'));
  const xml = await feed();
  expect(xml).toContain('<pubDate>Fri, 18 Sep 2026 14:00:00 GMT</pubDate>');
  expect(xml).toContain('<pubDate>Fri, 02 Jan 2026 00:00:00 GMT</pubDate>');
});

it('makes only fallback dates reproducible when SOURCE_DATE_EPOCH is supplied', async () => {
  vi.stubEnv('SOURCE_DATE_EPOCH', String(Date.parse('2026-09-18T14:00:00Z') / 1000));
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
  const first = await feed();
  vi.setSystemTime(new Date('2026-10-02T00:00:00Z'));
  expect(await feed()).toBe(first);
  expect(first).toContain('<pubDate>Fri, 18 Sep 2026 14:00:00 GMT</pubDate>');
  expect(first).toContain('<pubDate>Fri, 02 Jan 2026 00:00:00 GMT</pubDate>');
});

it.each(['', '-1', 'not-a-date', '1.5', '999999999999999999999'])(
  'rejects invalid reproducible-build timestamps: %s',
  async (epoch) => {
    vi.stubEnv('SOURCE_DATE_EPOCH', epoch);
    await expect(feed()).rejects.toThrow('SOURCE_DATE_EPOCH');
  }
);
