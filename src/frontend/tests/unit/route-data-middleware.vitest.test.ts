import { describe, expect, it, vi } from 'vitest';

vi.mock('@astrojs/starlight/route-data', () => ({
  defineRouteMiddleware: (handler: unknown) => handler,
}));

const { onRequest } = await import('../../src/route-data-middleware');

interface HeadEntry {
  tag: string;
  attrs?: Record<string, string | boolean | undefined>;
  content?: string;
}

interface RouteOptions {
  entryId: string;
  title: string;
  template?: 'doc' | 'splash';
  locale?: string;
}

// Mirrors the Open Graph entries Starlight's `getHead()` adds to route data.
function createStarlightHead(title: string): HeadEntry[] {
  return [
    { tag: 'meta', attrs: { property: 'og:title', content: title } },
    { tag: 'meta', attrs: { property: 'og:type', content: 'article' } },
    { tag: 'meta', attrs: { property: 'og:url', content: 'https://aspire.dev/' } },
    { tag: 'meta', attrs: { property: 'og:locale', content: 'en' } },
    { tag: 'meta', attrs: { property: 'og:description', content: 'Description.' } },
  ];
}

function createContext({ entryId, title, template, locale }: RouteOptions) {
  const head = createStarlightHead(title);
  const starlightRoute = {
    entry: {
      id: entryId,
      filePath: `src/content/docs/${entryId}`,
      data: { title, description: 'Description.', template },
    },
    entryMeta: { lang: locale ?? 'en', dir: 'ltr', locale },
    head,
    lang: locale ?? 'en',
    locale,
    pagination: { prev: undefined, next: undefined },
    sidebar: [],
  };

  return {
    context: {
      locals: { starlightRoute },
      url: new URL(`https://aspire.dev/${entryId.replace(/(index)?\.mdx?$/, '')}`),
      site: new URL('https://aspire.dev/'),
    },
    head,
  };
}

function ogTypeEntries(head: HeadEntry[]): HeadEntry[] {
  return head.filter((entry) => entry.tag === 'meta' && entry.attrs?.property === 'og:type');
}

async function runMiddleware(options: RouteOptions): Promise<HeadEntry[]> {
  const { context, head } = createContext(options);
  const handler = onRequest as unknown as (
    context: unknown,
    next: () => Promise<void>
  ) => Promise<void> | void;
  await handler(context, async () => {});
  return head;
}

describe('route data middleware Open Graph type', () => {
  it('replaces Starlight og:type with website on the splash home page', async () => {
    const head = await runMiddleware({ entryId: 'index.mdx', title: 'Aspire', template: 'splash' });

    expect(ogTypeEntries(head)).toEqual([
      { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
    ]);
  });

  it('uses website for localized home pages', async () => {
    const head = await runMiddleware({
      entryId: 'de/index.mdx',
      title: 'Aspire',
      template: 'splash',
      locale: 'de',
    });

    expect(ogTypeEntries(head)).toEqual([
      { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
    ]);
  });

  it('uses website for other splash landing pages', async () => {
    const head = await runMiddleware({
      entryId: 'support.mdx',
      title: 'Support',
      template: 'splash',
    });

    expect(ogTypeEntries(head)).toEqual([
      { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
    ]);
  });

  it('keeps article for documentation pages', async () => {
    const head = await runMiddleware({
      entryId: 'get-started/what-is-aspire.mdx',
      title: 'What is Aspire?',
    });

    expect(ogTypeEntries(head)).toEqual([
      { tag: 'meta', attrs: { property: 'og:type', content: 'article' } },
    ]);
  });
});
