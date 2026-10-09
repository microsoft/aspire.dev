import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]));
  }
  return value;
}

export async function createOutputNormalizer(frontend, { buildWindow, authoredDates = new Set() } = {}) {
  const require = createRequire(join(frontend, 'package.json'));
  const load = (name) => import(pathToFileURL(require.resolve(name)).href);
  const [{ unified }, { default: rehypeParse }, { toHtml }] = await Promise.all([
    load('unified'), load('rehype-parse'), load('hast-util-to-html'),
  ]);
  const rssRequire = createRequire(require.resolve('@astrojs/rss'));
  const { XMLParser } = rssRequire('fast-xml-parser');
  const html = unified().use(rehypeParse);
  const xml = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    commentPropName: '#comment',
    cdataPropName: '#cdata',
  });

  return {
    isCandidate: (path) => path.endsWith('.html') || path === 'rss.xml' || path === 'pagefind/pagefind-entry.json',
    /** @returns {{ content: string, rules: string[] }} */
    normalize(path, content) {
      if (path === 'pagefind/pagefind-entry.json') {
        return { content: JSON.stringify(ordered(JSON.parse(content))), rules: ['pagefind-json-object-order'] };
      }
      if (path === 'rss.xml' && buildWindow) {
        const tree = xml.parse(content);
        let changed = false;
        const visit = (nodes) => {
          for (const node of nodes) {
            if (Array.isArray(node.pubDate)) {
              for (const text of node.pubDate) {
                const date = Date.parse(text['#text']);
                if (!authoredDates.has(date) && date >= buildWindow.start && date <= buildWindow.end) {
                  text['#text'] = 'GENERATED_PUBLICATION_TIME';
                  changed = true;
                }
              }
            }
            for (const value of Object.values(node)) if (Array.isArray(value)) visit(value);
          }
        };
        visit(tree);
        return changed
          ? { content: JSON.stringify(ordered(tree)), rules: ['rss-generated-publication-times'] }
          : { content, rules: [] };
      }
      if (!path.endsWith('.html') || !content.includes('data-looping-')) return { content, rules: [] };
      const tree = html.parse(content);
      const identities = new Map();
      let changed = false;
      const visit = (node) => {
        for (const kind of ['Image', 'Video']) {
          const property = `dataLooping${kind}Id`;
          const value = node.properties?.[property];
          if (typeof value !== 'string' || !uuid.test(value)) continue;
          const key = `${kind}:${value}`;
          if (!identities.has(key)) identities.set(key, identities.size);
          node.properties[property] = `media-instance-${identities.get(key)}`;
          changed = true;
        }
        for (const child of node.children ?? []) visit(child);
      };
      visit(tree);
      return changed
        ? { content: toHtml(tree), rules: ['looping-media-instance-identities'] }
        : { content, rules: [] };
    },
  };
}

/** Protect authored publication dates, even if one coincides with the build window. */
export async function readAuthoredPublicationDates(frontend) {
  const require = createRequire(join(frontend, 'package.json'));
  const astroRequire = createRequire(require.resolve('astro'));
  const { parse } = astroRequire('yaml');
  const dates = new Set();
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) {
        const content = await readFile(path, 'utf8');
        const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1];
        if (!frontmatter) continue;
        const data = parse(frontmatter);
        const value = data?.lastUpdated ?? data?.date ?? data?.published ?? data?.created;
        if (!value || (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date))) continue;
        const date = new Date(value).getTime();
        if (Number.isFinite(date)) dates.add(Math.floor(date / 1000) * 1000);
      }
    }
  }
  await walk(join(frontend, 'src', 'content', 'docs'));
  return dates;
}
