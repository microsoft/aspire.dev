import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

// Helper: coerce many date formats into a JS Date; fall back to `new Date()` when invalid
function toDate(value) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? new Date() : d;
}

export async function GET(context) {
  const docs = await getCollection('docs');

  const feedDocs = docs.filter((doc) => {
    if (doc.data?.draft) return false;
    if (!doc.data?.description) return false;
    if (doc.data.title === '404') return false;

    return true;
  });

  const items = feedDocs.map((doc) => {
    const title = doc.data?.title ? String(doc.data.title) : String(doc.slug ?? '');
    const description = doc.data.description;

    const rawDate =
      doc.data?.lastUpdated ?? doc.data?.date ?? doc.data?.published ?? doc.data?.created;
    const pubDate = toDate(rawDate);

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
    site: context.site,
    trailingSlash: false,
    stylesheet: '/rss.xsl',
    items,
  });
}
