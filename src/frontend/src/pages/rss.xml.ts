import type { APIContext } from 'astro';
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { isDefaultLocaleEntry } from '@utils/page-metadata';

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

// Preserve build-time fallback dates unless a reproducible-build clock is supplied.
function toDate(value: Date | string | number | null | undefined): Date {
  if (value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!isNaN(date.getTime())) return date;
  }
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch === undefined) return new Date();
  const fallback = new Date(Number(epoch) * 1000);
  if (!/^\d+$/.test(epoch) || isNaN(fallback.getTime())) {
    throw new Error('SOURCE_DATE_EPOCH must be a valid Unix timestamp in whole seconds.');
  }
  return fallback;
}

export async function GET(context: APIContext) {
  const docs = await getCollection('docs');

  const feedDocs = docs.filter((doc) => {
    const data = doc.data as FeedDocData;

    if (data.draft) return false;
    if (!data.description) return false;
    if (data.title === '404') return false;
    if (!isDefaultLocaleEntry(doc.id)) return false;

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
