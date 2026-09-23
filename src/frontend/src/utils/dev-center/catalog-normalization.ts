import { locales } from '../../../config/locales';
import { sampleDescriptionText, sampleDetailHref, type SampleThumbnail } from '@utils/samples';
import { glossaryHref } from '@utils/dev-center/glossary';
import { topicIds, type TopicId } from '@utils/dev-center/topics';
import type { DevResource, ResourceType } from '@utils/dev-center/resource-types';
import type { CommunityVideo } from '@data/community-videos';
import { createDocLanguageResolver } from './resource-languages';

export interface CatalogDoc {
  id: string;
  filePath?: string;
  body?: string;
  data: {
    title: string;
    description?: string;
    slug?: string;
    category?: string;
    topic?: string;
    draft?: boolean;
    unlisted?: boolean;
    hidden?: boolean;
    redirect?: string;
    sidebar?: { hidden?: boolean };
    head?: { tag: string; attrs?: Record<string, unknown> }[];
    publishDate?: Date | string;
    resourceImage?: SampleThumbnail;
    ogImage?: string;
  };
}

export interface CatalogSources {
  docs: readonly CatalogDoc[];
  glossary: readonly {
    id: string;
    data: { title: string; description: string; aliases: string[]; topics: TopicId[] };
  }[];
  samples: readonly {
    name: string; title: string; description: string | null; tags: string[];
    thumbnail: SampleThumbnail; appHost?: string | null;
  }[];
  integrations: readonly {
    title: string; href: string; description: string; tags?: string[]; icon?: string;
  }[];
  integrationDocs: readonly { match: string; href: string }[];
  videos: readonly CommunityVideo[];
  blogs: readonly { title: string; description: string; href: string; date?: string; image?: string }[];
  channels?: readonly { platform: 'youtube' | 'twitch'; title: string; description: string; href: string }[];
  redirectPaths?: readonly string[];
}

const localizedPrefixes = new Set(
  Object.entries(locales).filter(([key]) => key !== 'root').flatMap(([key, value]) => [key, value.lang.toLowerCase()]),
);
const nonResourcePaths = new Set([
  '', '404', 'support', 'community/thanks', 'community/contributors',
]);
const pathTopics: Record<string, TopicId> = {
  docs: 'foundations', 'get-started': 'foundations', 'app-host': 'foundations',
  architecture: 'foundations', fundamentals: 'foundations', extensibility: 'foundations',
  testing: 'foundations', 'languages-and-runtimes': 'foundations',
  integrations: 'integrations', dashboard: 'dashboard', deployment: 'deployment',
  diagnostics: 'reference', reference: 'reference', 'whats-new': 'reference',
  community: 'community', blog: 'community',
};
const languageTags = new Set(['csharp', 'typescript', 'javascript', 'python', 'go', 'java', 'rust']);
const providerTags = new Set(['azure', 'aws', 'kubernetes', 'gcp']);
const sampleTopicTags: Partial<Record<TopicId, string[]>> = {
  integrations: ['databases', 'redis', 'rabbitmq', 'orleans', 'ef-core'],
  dashboard: ['dashboard', 'metrics', 'grafana', 'prometheus', 'health-checks'],
  deployment: ['azure', 'aws', 'kubernetes', 'gcp'],
};

function routePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/(^|\/)index$/, '').replace(/\/$/, '');
}

export function isEnglishResourcePath(value: string): boolean {
  return !localizedPrefixes.has(routePath(value).split('/')[0].toLowerCase());
}

/** Starlight's content ID already includes a frontmatter slug override. */
export function docHref(doc: CatalogDoc): string {
  const slug = doc.data.slug ?? doc.id;
  const path = routePath(slug);
  return path ? `/${path}/` : '/';
}

export function classifyDoc(doc: CatalogDoc): ResourceType {
  const path = routePath(docHref(doc));
  const category = doc.data.category;
  if (category === 'conceptual') return 'guide';
  if (['quickstart', 'tutorial', 'blog', 'reference', 'sample', 'how-to'].includes(category ?? '')) {
    return category as ResourceType;
  }
  if (path.startsWith('diagnostics/')) return 'diagnostic';
  if (/^whats-new\/aspire-\d/.test(path)) return 'release-notes';
  if (path.startsWith('reference/')) return 'reference';
  if (path.startsWith('integrations/')) return 'integration';
  if (path === 'get-started/first-app') return 'quickstart';
  if (path === 'get-started/deploy-first-app' || path.startsWith('tutorials/')) return 'tutorial';
  if (path === 'get-started/add-aspire-existing-app' || path.startsWith('how-to/')) return 'how-to';
  if (path.startsWith('blog/')) return 'blog';
  return 'guide';
}

export function docTopics(doc: CatalogDoc): TopicId[] {
  if (topicIds.includes(doc.data.topic as TopicId)) return [doc.data.topic as TopicId];
  const topic = pathTopics[routePath(docHref(doc)).split('/')[0]];
  return topic ? [topic] : [];
}

export function youtubeId(href: string): string | undefined {
  const url = new URL(href);
  if (url.hostname === 'youtu.be') return url.pathname.split('/')[1] || undefined;
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    return url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
  }
  return undefined;
}

/** Canonical identity, not a replacement for timestamped/shared destination links. */
export function canonicalDestination(href: string): string {
  if (!href.startsWith('/') && !/^https?:\/\//.test(href)) throw new Error(`Invalid resource URL: ${href}`);
  if (href.startsWith('//')) throw new Error(`Invalid resource URL: ${href}`);
  const url = new URL(href, 'https://aspire.dev');
  if (url.username || url.password) throw new Error(`Invalid resource URL: ${href}`);
  if (url.hostname === 'aspire.dev' || url.hostname === 'www.aspire.dev') {
    const path = routePath(url.pathname);
    return path ? `/${path}/` : '/';
  }
  const videoId = youtubeId(href);
  if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || key === 'si' || key === 'feature') url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (['nuget.org', 'www.nuget.org'].includes(url.hostname)) {
    url.hostname = 'www.nuget.org';
    url.pathname = url.pathname.toLowerCase();
  }
  return url.toString();
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en'));
}

function summary(description: string | null | undefined): string {
  const text = sampleDescriptionText(description ?? null) ?? '';
  return text.length > 280 ? `${text.slice(0, 277).trimEnd()}…` : text;
}

function image(value: SampleThumbnail | undefined): DevResource['image'] {
  if (!value) return undefined;
  return typeof value === 'string' ? { light: value, dark: value } : { light: value.light, dark: value.dark };
}

function resource(
  id: string, title: string, description: string | null | undefined,
  href: string, type: ResourceType, topics: TopicId[], tags: readonly string[] = [],
): DevResource {
  if (!id.trim() || !title.trim()) throw new Error(`Missing resource identity: ${id}`);
  canonicalDestination(href);
  return { id, title, description: summary(description), href, type, topics: unique(topics), tags: unique(tags), languages: [], providers: [] };
}

export function buildResourceCatalog(sources: CatalogSources): DevResource[] {
  const byDestination = new Map<string, DevResource>();
  const byId = new Map<string, string>();
  const add = (entry: DevResource, merge: 'package' | 'video' | 'blog' | false = false) => {
    const destination = canonicalDestination(entry.href);
    const priorDestination = byId.get(entry.id);
    if (priorDestination && priorDestination !== destination) throw new Error(`Conflicting resource ID: ${entry.id}`);
    const existing = byDestination.get(destination);
    if (existing) {
      if (!merge || ((merge === 'video' || merge === 'blog') && existing.type !== merge)) {
        throw new Error(`Conflicting resource destination: ${entry.href} (${existing.id}, ${entry.id})`);
      }
      existing.tags = unique([...existing.tags, ...entry.tags, entry.title]);
      existing.topics = unique([...existing.topics, ...entry.topics]);
      existing.languages = unique([...existing.languages, ...entry.languages]);
      existing.providers = unique([...existing.providers, ...entry.providers]);
      existing.image ??= entry.image;
    } else {
      byDestination.set(destination, entry);
    }
    byId.set(entry.id, destination);
  };
  const redirects = new Set((sources.redirectPaths ?? []).map(canonicalDestination));
  const eligibleDocs = sources.docs.filter((doc) => {
    const href = docHref(doc);
    const path = routePath(href);
    const sourcePath = doc.filePath?.replace(/\\/g, '/').split('/content/docs/')[1];
    return isEnglishResourcePath(doc.id) && isEnglishResourcePath(path)
      && (!sourcePath || isEnglishResourcePath(sourcePath))
      && [path, routePath(doc.id), routePath(sourcePath ?? '')].every((value) => !value.split('/').includes('includes'))
      && !nonResourcePaths.has(path) && !path.startsWith('aspireconf/')
      && path !== 'aspireconf' && !path.startsWith('reference/api/')
      && !path.split('/').some((part) => part.startsWith('_'))
      && !redirects.has(canonicalDestination(href))
      && !doc.data.draft && !doc.data.hidden && !doc.data.unlisted && !doc.data.redirect
      && !doc.data.sidebar?.hidden
      && !doc.data.head?.some(({ tag, attrs }) => tag === 'meta'
        && attrs?.name === 'robots' && /\bnoindex\b/i.test(String(attrs.content)));
  });
  const docsByPath = new Map<string, string>();
  const docIds = new Set<string>();
  const docLanguages = createDocLanguageResolver(sources.docs);
  for (const doc of eligibleDocs) {
    if (docIds.has(doc.id)) throw new Error(`Conflicting resource ID: ${doc.id}`);
    docIds.add(doc.id);
    const href = docHref(doc);
    const entry = resource(`doc:${routePath(href)}`, doc.data.title, doc.data.description, href, classifyDoc(doc), docTopics(doc));
    const path = routePath(href);
    entry.tags = unique(path.split('/'));
    entry.image = image(doc.data.resourceImage ?? doc.data.ogImage);
    entry.providers = path.split('/').filter((segment) => providerTags.has(segment));
    const framework = path.match(/^integrations\/frameworks\/([^/]+)/)?.[1];
    entry.languages = unique([
      ...docLanguages(doc.id),
      ...(framework && languageTags.has(framework) ? [framework] : []),
    ]);
    if (doc.data.publishDate) entry.date = new Date(doc.data.publishDate).toISOString().slice(0, 10);
    add(entry);
    docsByPath.set(canonicalDestination(href), href);
    if (doc.filePath) {
      const sourcePath = doc.filePath.replace(/\\/g, '/').split('/content/docs/')[1]?.replace(/\.mdx?$/, '');
      if (sourcePath) docsByPath.set(canonicalDestination(`/${sourcePath}/`), href);
    }
  }
  for (const term of sources.glossary) {
    if (!isEnglishResourcePath(term.id)) continue;
    add(resource(`glossary:${term.id}`, term.data.title, term.data.description, glossaryHref(term.id), 'glossary', term.data.topics, term.data.aliases));
  }
  for (const sample of sources.samples) {
    const topics: TopicId[] = ['foundations', ...topicIds.filter((topic) =>
      sampleTopicTags[topic]?.some((tag) => sample.tags.includes(tag)))];
    const entry = resource(`sample:${sample.name}`, sample.title, sample.description, sampleDetailHref('', sample.name), 'sample', topics, sample.tags);
    entry.languages = unique([
      ...sample.tags.filter((tag) => languageTags.has(tag)),
      ...(sample.appHost === 'typescript' ? ['typescript'] : []),
      ...(['csproj', 'file-based'].includes(sample.appHost ?? '') ? ['csharp'] : []),
    ]);
    entry.providers = sample.tags.filter((tag) => providerTags.has(tag));
    entry.image = image(sample.thumbnail);
    add(entry);
  }
  const mappings = new Map<string, string>();
  for (const mapping of sources.integrationDocs) {
    const key = mapping.match.toLowerCase();
    if (mappings.has(key)) throw new Error(`Duplicate integration documentation mapping: ${mapping.match}`);
    mappings.set(key, mapping.href);
  }
  const packageIds = new Set<string>();
  for (const integration of sources.integrations) {
    const key = integration.title.toLowerCase();
    if (packageIds.has(key)) throw new Error(`Duplicate integration package: ${integration.title}`);
    packageIds.add(key);
    const mapped = mappings.get(key);
    // A missing/unlisted local doc must never turn an otherwise valid package into a broken link.
    const mappedDestination = mapped ? canonicalDestination(mapped) : undefined;
    const href = mappedDestination
      ? (mappedDestination.startsWith('/') ? docsByPath.get(mappedDestination) : mapped) ?? integration.href
      : integration.href;
    const entry = resource(`integration:${key}`, integration.title, integration.description, href, 'integration', ['integrations'], [...(integration.tags ?? []), integration.title]);
    entry.providers = (integration.tags ?? []).filter((tag) => providerTags.has(tag));
    entry.languages = (integration.tags ?? []).filter((tag) => languageTags.has(tag));
    entry.image = image(key === 'aspire.hosting.aws'
      ? { light: '~/assets/icons/aws-light-icon.png', dark: '~/assets/icons/aws-icon.png' }
      : integration.icon);
    if (entry.image) entry.image.kind = 'logo';
    add(entry, 'package');
  }
  for (const video of sources.videos) {
    const id = youtubeId(video.href);
    if (!id) throw new Error(`Invalid YouTube resource: ${video.href}`);
    const entry = resource(`video:${id}`, video.title, video.description, video.href, 'video', ['community'], video.tags);
    entry.image = image(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    entry.platform = 'youtube';
    add(entry, 'video');
  }
  for (const channel of sources.channels ?? []) {
    const entry = resource(`channel:${channel.platform}`, channel.title, channel.description, channel.href, 'video', ['community'], ['Official', 'Live streams', channel.platform]);
    entry.platform = channel.platform;
    add(entry);
  }
  for (const blog of sources.blogs) {
    const entry = resource(`blog:${canonicalDestination(blog.href)}`, blog.title, blog.description, blog.href, 'blog', ['community']);
    entry.image = image(blog.image);
    entry.date = blog.date;
    add(entry, 'blog');
  }
  return [...byDestination.values()].sort((a, b) => a.title.localeCompare(b.title, 'en') || a.id.localeCompare(b.id, 'en'));
}
