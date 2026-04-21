import type { APIContext } from 'astro';
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

type FeedDocData = Record<string, unknown>;

function toText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${value}`;
  }

  return undefined;
}

function isDateInput(value: unknown): value is Date | string | number | null | undefined {
  return (
    value == null || value instanceof Date || typeof value === 'string' || typeof value === 'number'
  );
}

// Helper: coerce many date formats into a JS Date; fall back to `new Date()` when invalid
function toDate(value: Date | string | number | null | undefined): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? new Date() : d;
}

export async function GET(context: APIContext) {
  const docs = await getCollection('docs');

  const feedDocs = docs.filter((doc) => {
    const data = doc.data as FeedDocData;

    if (data.draft) return false;
    if (!data.description) return false;
    if (data.title === '404') return false;

    return true;
  });

  const items = feedDocs.map((doc) => {
    const data = doc.data as FeedDocData;
    const title = toText(data.title) ?? String(doc.id ?? '');
    const description = toText(data.description);

    const rawDate = data.lastUpdated ?? data.date ?? data.published ?? data.created;
    const pubDate = toDate(isDateInput(rawDate) ? rawDate : undefined);

    const id = doc.id === 'index' ? '' : doc.id;

    return {
      title,
      ...(description ? { description } : {}),
      pubDate,
      link: `/${id}/`,
    };
  });

  return rss({
    title: 'Aspire Docs',
    description: 'Latest updates to the documentation',
    site: context.site ?? 'https://aspire.dev',
    trailingSlash: false,
    stylesheet: '/rss.xsl',
    items,
  });
}
